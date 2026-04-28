'use client';
// src/components/ui/HamburgerMenu.tsx
// Contains: Logout, Join Library (invite system), pending requests (for owners)

import React, { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  doc, serverTimestamp, deleteDoc, getDoc,
} from 'firebase/firestore';
import { UserProfile, InviteRequest } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  directOpen: boolean;
  onDirectOpenChange: (v: boolean) => void;
  bookmarkPrompt: boolean;
  onBookmarkPromptChange: (v: boolean) => void;
}

const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
  isOpen,
  onClose,
  currentUser,
  directOpen,
  onDirectOpenChange,
  bookmarkPrompt,
  onBookmarkPromptChange,
}) => {
  const [view, setView] = useState<'main' | 'join' | 'requests'>('main');
  const [targetPublicId, setTargetPublicId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [pendingRequests, setPendingRequests] = useState<InviteRequest[]>([]);
  const [generatedCodes, setGeneratedCodes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const isOwner = currentUser.role === 'owner';

  // Fetch pending requests for owners
  useEffect(() => {
    if (!isOwner || !isOpen) return;

    const fetchRequests = async () => {
      const q = query(
        collection(db, 'libraries', currentUser.libraryId, 'inviteRequests'),
        where('status', '==', 'pending'),
        where('targetOwnerId', '==', currentUser.uid)
      );
      const snap = await getDocs(q);
      const reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InviteRequest));
      setPendingRequests(reqs);
    };

    fetchRequests();
  }, [isOpen, isOwner, currentUser]);

  // ── Request to join someone's library ─────────────────────────────────────
  const handleRequestJoin = async () => {
    if (!targetPublicId.trim()) return;
    setIsLoading(true);
    setMessage(null);

    try {
      // Find the target user by publicId
      const usersQuery = query(
        collection(db, 'users'),
        where('publicId', '==', targetPublicId.trim().toUpperCase())
      );
      const usersSnap = await getDocs(usersQuery);

      if (usersSnap.empty) {
        setMessage({ text: 'No user found with that ID.', type: 'error' });
        return;
      }

      const targetUser = usersSnap.docs[0].data() as UserProfile;

      // Check if there's already a pending request from this user to that owner
      const existingQ = query(
        collection(db, 'libraries', targetUser.libraryId, 'inviteRequests'),
        where('requesterId', '==', currentUser.uid),
        where('targetOwnerId', '==', targetUser.uid),
        where('status', '==', 'pending')
      );
      const existingSnap = await getDocs(existingQ);

      if (!existingSnap.empty) {
        setMessage({ text: 'You already have a pending request to this library.', type: 'error' });
        return;
      }

      // Create the request
      await addDoc(collection(db, 'libraries', targetUser.libraryId, 'inviteRequests'), {
        requesterId: currentUser.uid,
        requesterName: currentUser.displayName,
        requesterPublicId: currentUser.publicId,
        targetOwnerId: targetUser.uid,
        status: 'pending',
        createdAt: serverTimestamp(),
        resolvedAt: null,
      });

      setMessage({ text: 'Request sent! Wait for the owner to generate your code.', type: 'success' });
      setTargetPublicId('');
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Failed to send request. Try again.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Enter a code to join ───────────────────────────────────────────────────
  const handleEnterCode = async () => {
    if (!inviteCode.trim()) return;
    setIsLoading(true);
    setMessage(null);

    try {
      // Find the code across all libraries (search by code value)
      // In production, you'd use a Cloud Function for security
      const code = inviteCode.trim().toUpperCase();

      // We need to know which library to look in — normally the user knows this
      // or you store a global codes collection. Here we check the user's pending requests.
      // For simplicity, we add a top-level /inviteCodes collection pointing to the library.
      const codeQuery = query(
        collection(db, 'globalInviteCodes'),
        where('code', '==', code),
        where('forRequesterId', '==', currentUser.uid),
        where('used', '==', false)
      );
      const codeSnap = await getDocs(codeQuery);

      if (codeSnap.empty) {
        setMessage({ text: 'Invalid or expired code.', type: 'error' });
        return;
      }

      const codeDoc = codeSnap.docs[0];
      const codeData = codeDoc.data();

      // Check expiry
      if (codeData.expiresAt.toDate() < new Date()) {
        setMessage({ text: 'This code has expired.', type: 'error' });
        return;
      }

      // Mark code as used
      await updateDoc(codeDoc.ref, { used: true });

      // Update the user's profile to join this library as viewer
      await updateDoc(doc(db, 'users', currentUser.uid), {
        joinedLibraryId: codeData.libraryId,
        role: 'viewer',
      });

      // Add user to library members
      await updateDoc(doc(db, 'libraries', codeData.libraryId), {
        [`members.${currentUser.uid}`]: {
          role: 'viewer',
          joinedAt: serverTimestamp(),
          displayName: currentUser.displayName,
        },
      });

      // Mark the request as approved
      await updateDoc(
        doc(db, 'libraries', codeData.libraryId, 'inviteRequests', codeData.forRequestId),
        { status: 'approved', resolvedAt: serverTimestamp() }
      );

      setMessage({ text: '🎉 You joined the library! Reload to see it.', type: 'success' });
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Failed to apply code.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Owner generates a code for a requester ────────────────────────────────
  const handleGenerateCode = async (request: InviteRequest) => {
    setIsLoading(true);
    try {
      const code = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store in a global collection for lookup
      await addDoc(collection(db, 'globalInviteCodes'), {
        code,
        generatedBy: currentUser.uid,
        libraryId: currentUser.libraryId,
        forRequestId: request.id,
        forRequesterId: request.requesterId,
        used: false,
        createdAt: serverTimestamp(),
        expiresAt,
      });

      setGeneratedCodes((prev) => ({ ...prev, [request.id]: code }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Owner rejects a request ───────────────────────────────────────────────
  const handleRejectRequest = async (request: InviteRequest) => {
    try {
      await updateDoc(
        doc(db, 'libraries', currentUser.libraryId, 'inviteRequests', request.id),
        { status: 'rejected', resolvedAt: serverTimestamp() }
      );
      setPendingRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 49,
            background: 'rgba(0,0,0,0.4)',
          }}
        />
      )}

      {/* Menu panel */}
      <div className={`hamburger-menu ${isOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0' }}>
          {/* Header */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '16px',
              color: 'var(--leather-gold)', letterSpacing: '0.1em',
            }}>
              ☰ Library Menu
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--parchment-dark)', marginTop: '4px' }}>
              Your ID: <strong style={{ color: 'var(--leather-gold)' }}>{currentUser.publicId}</strong>
            </p>
          </div>

          {/* Navigation items */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            {/* Join Library */}
            <MenuButton
              icon="📖"
              label="Join a Library"
              onClick={() => setView(view === 'join' ? 'main' : 'join')}
              active={view === 'join'}
            />

            {/* Pending requests (owners only) */}
            {isOwner && (
              <MenuButton
                icon="📬"
                label={`Join Requests ${pendingRequests.length > 0 ? `(${pendingRequests.length})` : ''}`}
                onClick={() => setView(view === 'requests' ? 'main' : 'requests')}
                active={view === 'requests'}
              />
            )}

            {/* Expanded Join view */}
            {view === 'join' && (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '4px', padding: '14px',
                marginTop: '4px',
              }}>
                <p style={{ fontSize: '12px', color: 'var(--parchment-dark)', marginBottom: '12px' }}>
                  Enter owner's public ID to request access, or enter a code if you have one.
                </p>

                {/* Request join */}
                <label style={{ fontSize: '10px', color: 'var(--leather-gold)', letterSpacing: '0.1em', display: 'block', marginBottom: '4px' }}>
                  OWNER'S PUBLIC ID
                </label>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  <input
                    className="search-input"
                    value={targetPublicId}
                    onChange={(e) => setTargetPublicId(e.target.value.toUpperCase())}
                    placeholder="e.g. AB12CD34"
                    maxLength={8}
                    style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }}
                  />
                  <button className="btn-primary" onClick={handleRequestJoin} disabled={isLoading} style={{ fontSize: '11px', padding: '6px 10px' }}>
                    Request
                  </button>
                </div>

                {/* Enter code */}
                <label style={{ fontSize: '10px', color: 'var(--leather-gold)', letterSpacing: '0.1em', display: 'block', marginBottom: '4px' }}>
                  ENTER INVITE CODE
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    className="search-input"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="8-char code"
                    maxLength={8}
                    style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }}
                  />
                  <button className="btn-primary" onClick={handleEnterCode} disabled={isLoading} style={{ fontSize: '11px', padding: '6px 10px' }}>
                    Join
                  </button>
                </div>
              </div>
            )}

            {/* Pending requests (owner view) */}
            {view === 'requests' && isOwner && (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '4px', padding: '14px', marginTop: '4px' }}>
                {pendingRequests.length === 0 ? (
                  <p style={{ fontSize: '12px', color: 'var(--parchment-dark)', textAlign: 'center' }}>
                    No pending requests.
                  </p>
                ) : (
                  pendingRequests.map((req) => (
                    <div key={req.id} style={{
                      padding: '10px 0',
                      borderBottom: '1px solid rgba(200,168,75,0.1)',
                      marginBottom: '8px',
                    }}>
                      <p style={{ fontSize: '12px', color: 'var(--parchment)' }}>
                        <strong>{req.requesterName}</strong>
                      </p>
                      <p style={{ fontSize: '10px', color: 'var(--parchment-dark)' }}>
                        ID: {req.requesterPublicId}
                      </p>

                      {generatedCodes[req.id] ? (
                        <div style={{ marginTop: '6px', padding: '8px', background: 'rgba(200,168,75,0.1)', borderRadius: '3px', textAlign: 'center' }}>
                          <p style={{ fontSize: '10px', color: 'var(--parchment-dark)' }}>Share this code:</p>
                          <p style={{ fontFamily: 'monospace', fontSize: '16px', color: 'var(--leather-gold)', letterSpacing: '0.2em' }}>
                            {generatedCodes[req.id]}
                          </p>
                          <p style={{ fontSize: '9px', color: 'rgba(200,168,75,0.5)' }}>Expires in 24 hours</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                          <button className="btn-primary" onClick={() => handleGenerateCode(req)} style={{ fontSize: '10px', padding: '4px 10px', flex: 1 }}>
                            Generate Code
                          </button>
                          <button className="btn-secondary" onClick={() => handleRejectRequest(req)} style={{ fontSize: '10px', padding: '4px 10px' }}>
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Direct-open toggle */}
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--parchment)', fontFamily: 'var(--font-body)' }}>
                  Quick Open
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(212,196,160,0.4)', fontFamily: 'var(--font-body)' }}>
                  Skip confirm dialog when clicking a search result
                </p>
              </div>
              <button
                onClick={() => onDirectOpenChange(!directOpen)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none',
                  background: directOpen ? 'linear-gradient(90deg,#C8A84B,#A87830)' : 'rgba(255,255,255,0.1)',
                  cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: directOpen ? 22 : 3,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s', display: 'block',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }} />
              </button>
            </div>

            {/* Bookmark prompt toggle */}
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--parchment)', fontFamily: 'var(--font-body)' }}>
                  Bookmark Prompt
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(212,196,160,0.4)', fontFamily: 'var(--font-body)' }}>
                  Show saved bookmarks when opening from search
                </p>
              </div>
              <button
                onClick={() => onBookmarkPromptChange(!bookmarkPrompt)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none',
                  background: bookmarkPrompt ? 'linear-gradient(90deg,#C8A84B,#A87830)' : 'rgba(255,255,255,0.1)',
                  cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: bookmarkPrompt ? 22 : 3,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s', display: 'block',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }} />
              </button>
            </div>

            {/* Separator */}
            <div style={{ height: '1px', background: 'rgba(200,168,75,0.1)', margin: '12px 0' }} />

            {/* Logout */}
            <MenuButton
              icon="🚪"
              label="Logout"
              onClick={() => signOut(auth)}
              danger
            />
          </nav>

          {/* Status message */}
          {message && (
            <div style={{
              padding: '10px 12px', borderRadius: '4px', fontSize: '12px',
              background: message.type === 'success' ? 'rgba(46, 125, 50, 0.2)' : 'rgba(192, 57, 43, 0.2)',
              color: message.type === 'success' ? '#81C784' : '#E57373',
              border: `1px solid ${message.type === 'success' ? 'rgba(129,199,132,0.3)' : 'rgba(229,115,115,0.3)'}`,
            }}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const MenuButton: React.FC<{
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}> = ({ icon, label, onClick, active, danger }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 12px', borderRadius: '4px', border: 'none',
      background: active ? 'rgba(200,168,75,0.1)' : 'transparent',
      color: danger ? '#E57373' : active ? 'var(--leather-gold)' : 'var(--parchment)',
      cursor: 'pointer', textAlign: 'left', fontSize: '14px',
      fontFamily: 'var(--font-body)',
      transition: 'background 0.15s, color 0.15s',
      width: '100%',
    }}
    onMouseEnter={(e) => {
      if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
    }}
    onMouseLeave={(e) => {
      if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
    }}
  >
    <span>{icon}</span>
    <span>{label}</span>
  </button>
);

export default HamburgerMenu;