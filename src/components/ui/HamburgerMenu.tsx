'use client';
// src/components/ui/HamburgerMenu.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp, deleteDoc, getDoc, setDoc, getDocs,
} from 'firebase/firestore';
import { UserProfile, InviteRequest } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

interface MemberInfo {
  uid: string;
  displayName: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt?: any;
  canUpload?: boolean;
  canDelete?: boolean;
}

interface BannedUser {
  uid: string;
  displayName: string;
  bannedAt?: any;
  publicId?: string;
}

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  directOpen: boolean;
  onDirectOpenChange: (v: boolean) => void;
  bookmarkPrompt: boolean;
  onBookmarkPromptChange: (v: boolean) => void;
}

export default function HamburgerMenu({
  isOpen, onClose, currentUser,
  directOpen, onDirectOpenChange,
  bookmarkPrompt, onBookmarkPromptChange,
}: HamburgerMenuProps) {
  const [view, setView] = useState<'main' | 'join' | 'requests' | 'members' | 'banned'>('main');
  const [targetPublicId, setTargetPublicId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [pendingRequests, setPendingRequests] = useState<InviteRequest[]>([]);
  const [generatedCodes, setGeneratedCodes] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [blockRequests, setBlockRequests] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const isOwner = currentUser.role === 'owner';
  const libraryId = currentUser.libraryId;

  // ── Real-time pending requests listener ──────────────────────────────────
  useEffect(() => {
    if (!isOwner || !isOpen) return;

    const q = query(
      collection(db, 'libraries', libraryId, 'inviteRequests'),
      where('status', '==', 'pending'),
      where('targetOwnerId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      setPendingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as InviteRequest)));
    });
    return unsub;
  }, [isOpen, isOwner, currentUser.uid, libraryId]);

  // ── Load block requests setting ──────────────────────────────────────────
  useEffect(() => {
    if (!isOwner || !isOpen) return;
    getDoc(doc(db, 'libraries', libraryId)).then(snap => {
      if (snap.exists()) setBlockRequests(snap.data()?.blockRequests ?? false);
    });
  }, [isOpen, isOwner, libraryId]);

  // ── Load members (lazy — only when members view opened) ─────────────────
  const loadMembers = useCallback(async () => {
    if (!isOwner) return;
    const snap = await getDoc(doc(db, 'libraries', libraryId));
    if (!snap.exists()) return;
    const data = snap.data();
    const memberMap: Record<string, any> = data.members ?? {};
    const list: MemberInfo[] = Object.entries(memberMap)
      .filter(([uid]) => uid !== currentUser.uid) // exclude owner
      .map(([uid, info]) => ({
        uid,
        displayName: info.displayName ?? 'Unknown',
        role: info.role ?? 'viewer',
        joinedAt: info.joinedAt,
        canUpload: info.canUpload ?? false,
        canDelete: info.canDelete ?? false,
      }));
    setMembers(list);
  }, [isOwner, libraryId, currentUser.uid]);

  // ── Load banned users ────────────────────────────────────────────────────
  const loadBanned = useCallback(async () => {
    if (!isOwner) return;
    const snap = await getDocs(collection(db, 'libraries', libraryId, 'banned'));
    setBannedUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as BannedUser)));
  }, [isOwner, libraryId]);

  useEffect(() => {
    if (view === 'members') loadMembers();
    if (view === 'banned') loadBanned();
  }, [view, loadMembers, loadBanned]);

  // ── Toggle block requests ────────────────────────────────────────────────
  const handleToggleBlock = async () => {
    const newVal = !blockRequests;
    setBlockRequests(newVal);
    await updateDoc(doc(db, 'libraries', libraryId), { blockRequests: newVal });
  };

  // ── Update member permission ─────────────────────────────────────────────
  const updateMemberPermission = async (uid: string, field: 'canUpload' | 'canDelete', val: boolean) => {
    await updateDoc(doc(db, 'libraries', libraryId), {
      [`members.${uid}.${field}`]: val,
    });
    setMembers(prev => prev.map(m => m.uid === uid ? { ...m, [field]: val } : m));
  };

  // ── Kick member ──────────────────────────────────────────────────────────
  const kickMember = async (uid: string) => {
    await updateDoc(doc(db, 'libraries', libraryId), {
      [`members.${uid}`]: null,
    } as any);
    // Update user profile — remove joinedLibraryId
    await updateDoc(doc(db, 'users', uid), {
      joinedLibraryId: null,
      role: 'owner',
    });
    setMembers(prev => prev.filter(m => m.uid !== uid));
    setExpandedMember(null);
    setMessage({ text: 'Member removed from library.', type: 'success' });
  };

  // ── Ban member ───────────────────────────────────────────────────────────
  const banMember = async (member: MemberInfo) => {
    // Add to banned collection
    await setDoc(doc(db, 'libraries', libraryId, 'banned', member.uid), {
      uid: member.uid,
      displayName: member.displayName,
      bannedAt: serverTimestamp(),
    });
    // Also kick
    await kickMember(member.uid);
    setBannedUsers(prev => [...prev, { uid: member.uid, displayName: member.displayName }]);
    setMessage({ text: `${member.displayName} has been banned.`, type: 'success' });
  };

  // ── Unban user ───────────────────────────────────────────────────────────
  const unbanUser = async (uid: string) => {
    await deleteDoc(doc(db, 'libraries', libraryId, 'banned', uid));
    setBannedUsers(prev => prev.filter(u => u.uid !== uid));
    setMessage({ text: 'User unbanned.', type: 'success' });
  };

  // ── Request to join ──────────────────────────────────────────────────────
  const handleRequestJoin = async () => {
    if (!targetPublicId.trim()) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const usersSnap = await getDocs(query(collection(db, 'users'), where('publicId', '==', targetPublicId.trim().toUpperCase())));
      if (usersSnap.empty) { setMessage({ text: 'No user found with that ID.', type: 'error' }); return; }

      const targetUser = usersSnap.docs[0].data() as UserProfile;
      const targetLibraryId = targetUser.libraryId;

      // Check if owner has blocked requests
      const libSnap = await getDoc(doc(db, 'libraries', targetLibraryId));
      if (libSnap.data()?.blockRequests) {
        setMessage({ text: 'This library is not accepting join requests at this time.', type: 'error' });
        return;
      }

      // Check if requester is banned
      const banSnap = await getDoc(doc(db, 'libraries', targetLibraryId, 'banned', currentUser.uid));
      if (banSnap.exists()) {
        setMessage({ text: 'You have been banned from this library.', type: 'error' });
        return;
      }

      // Check existing pending request
      const existingSnap = await getDocs(query(
        collection(db, 'libraries', targetLibraryId, 'inviteRequests'),
        where('requesterId', '==', currentUser.uid),
        where('status', '==', 'pending')
      ));
      if (!existingSnap.empty) { setMessage({ text: 'You already have a pending request.', type: 'error' }); return; }

      await addDoc(collection(db, 'libraries', targetLibraryId, 'inviteRequests'), {
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
    } catch (err: any) {
      setMessage({ text: err?.message ?? 'Failed to send request.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Enter invite code ────────────────────────────────────────────────────
  const handleEnterCode = async () => {
    if (!inviteCode.trim()) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const code = inviteCode.trim().toUpperCase();
      const codeSnap = await getDocs(query(
        collection(db, 'globalInviteCodes'),
        where('code', '==', code),
        where('forRequesterId', '==', currentUser.uid),
        where('used', '==', false)
      ));
      if (codeSnap.empty) { setMessage({ text: 'Invalid or expired code.', type: 'error' }); return; }

      const codeDoc = codeSnap.docs[0];
      const codeData = codeDoc.data();
      if (codeData.expiresAt.toDate() < new Date()) { setMessage({ text: 'This code has expired.', type: 'error' }); return; }

      await updateDoc(codeDoc.ref, { used: true });
      await updateDoc(doc(db, 'users', currentUser.uid), { joinedLibraryId: codeData.libraryId, role: 'viewer' });
      await updateDoc(doc(db, 'libraries', codeData.libraryId), {
        [`members.${currentUser.uid}`]: {
          role: 'viewer', joinedAt: serverTimestamp(),
          displayName: currentUser.displayName,
          canUpload: false, canDelete: false,
        },
      });
      await updateDoc(doc(db, 'libraries', codeData.libraryId, 'inviteRequests', codeData.forRequestId), {
        status: 'approved', resolvedAt: serverTimestamp(),
      });
      setMessage({ text: '🎉 You joined the library! Reload to see it.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err?.message ?? 'Failed to apply code.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Leave library ────────────────────────────────────────────────────────
  const handleLeave = async () => {
    if (!currentUser.joinedLibraryId) return;
    setIsLoading(true);
    try {
      await updateDoc(doc(db, 'libraries', currentUser.joinedLibraryId), {
        [`members.${currentUser.uid}`]: null,
      } as any);
      await updateDoc(doc(db, 'users', currentUser.uid), { joinedLibraryId: null, role: 'owner' });
      setMessage({ text: 'You have left the library. Reload to return to your own.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err?.message ?? 'Failed to leave.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Generate invite code ─────────────────────────────────────────────────
  const handleGenerateCode = async (request: InviteRequest) => {
    setIsLoading(true);
    try {
      const code = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await addDoc(collection(db, 'globalInviteCodes'), {
        code, generatedBy: currentUser.uid, libraryId,
        forRequestId: request.id, forRequesterId: request.requesterId,
        used: false, createdAt: serverTimestamp(), expiresAt,
      });
      setGeneratedCodes(prev => ({ ...prev, [request.id]: code }));
    } catch (err: any) {
      setMessage({ text: 'Failed to generate code.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Reject request ───────────────────────────────────────────────────────
  const handleRejectRequest = async (request: InviteRequest) => {
    await updateDoc(doc(db, 'libraries', libraryId, 'inviteRequests', request.id), {
      status: 'rejected', resolvedAt: serverTimestamp(),
    });
  };

  const hasJoined = !!currentUser.joinedLibraryId;

  return (
    <>
      {isOpen && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.4)' }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, width: 300, height: '100vh',
        background: 'linear-gradient(180deg,#2C1A0E,#1A0E06)',
        borderLeft: '1px solid rgba(200,168,75,0.2)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease', zIndex: 50,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 30px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid rgba(200,168,75,0.1)' }}>
          <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: 16, color: '#C8A84B', margin: '0 0 4px' }}>☰ Library Menu</h2>
          <p style={{ fontSize: 11, color: 'rgba(212,196,160,0.45)', margin: 0 }}>
            Your ID: <strong style={{ color: '#C8A84B', letterSpacing: '0.1em' }}>{currentUser.publicId}</strong>
          </p>
          <p style={{ fontSize: 11, color: 'rgba(212,196,160,0.35)', margin: '2px 0 0' }}>
            Role: <span style={{ color: currentUser.role === 'owner' ? '#C8A84B' : 'rgba(212,196,160,0.6)' }}>{currentUser.role}</span>
          </p>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>

          {/* ── JOIN / LEAVE ── */}
          {!hasJoined ? (
            <>
              <MenuBtn icon="📖" label="Join a Library" active={view === 'join'} onClick={() => setView(view === 'join' ? 'main' : 'join')} />
              {view === 'join' && (
                <div style={subPanel}>
                  <p style={hintText}>Enter an owner's Public ID to request access, or enter a code if you have one.</p>
                  <label style={miniLabel}>OWNER'S PUBLIC ID</label>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <input className="search-input" value={targetPublicId} onChange={e => setTargetPublicId(e.target.value.toUpperCase())} placeholder="AB12CD34" maxLength={8} style={compactInput} />
                    <button style={smallGoldBtn} onClick={handleRequestJoin} disabled={isLoading}>Request</button>
                  </div>
                  <label style={miniLabel}>ENTER INVITE CODE</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="search-input" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="8-char code" maxLength={8} style={compactInput} />
                    <button style={smallGoldBtn} onClick={handleEnterCode} disabled={isLoading}>Join</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <MenuBtn icon="🚪" label="Leave Library" onClick={handleLeave} danger />
          )}

          {/* ── OWNER TOOLS ── */}
          {isOwner && (
            <>
              <div style={divider} />

              {/* Pending requests — real-time badge */}
              <MenuBtn
                icon="📬"
                label={`Join Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}`}
                active={view === 'requests'}
                onClick={() => setView(view === 'requests' ? 'main' : 'requests')}
                badge={pendingRequests.length}
              />
              {view === 'requests' && (
                <div style={subPanel}>
                  {pendingRequests.length === 0
                    ? <p style={{ ...hintText, textAlign: 'center' }}>No pending requests.</p>
                    : pendingRequests.map(req => (
                      <div key={req.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(200,168,75,0.08)' }}>
                        <p style={{ fontSize: 13, color: '#F4E8C1', margin: '0 0 2px', fontWeight: 600 }}>{req.requesterName}</p>
                        <p style={{ fontSize: 10, color: 'rgba(212,196,160,0.4)', margin: '0 0 8px' }}>ID: {req.requesterPublicId}</p>
                        {generatedCodes[req.id] ? (
                          <div style={{ background: 'rgba(200,168,75,0.08)', borderRadius: 4, padding: '8px 10px', textAlign: 'center' }}>
                            <p style={{ fontSize: 10, color: 'rgba(212,196,160,0.5)', margin: '0 0 4px' }}>Share this code:</p>
                            <p style={{ fontFamily: 'monospace', fontSize: 18, color: '#C8A84B', letterSpacing: '0.2em', margin: 0 }}>{generatedCodes[req.id]}</p>
                            <p style={{ fontSize: 9, color: 'rgba(200,168,75,0.4)', margin: '4px 0 0' }}>Expires in 24 hours</p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={smallGoldBtn} onClick={() => handleGenerateCode(req)}>Generate Code</button>
                            <button style={smallDangerBtn} onClick={() => handleRejectRequest(req)}>Reject</button>
                          </div>
                        )}
                      </div>
                    ))
                  }
                </div>
              )}

              {/* Members list */}
              <MenuBtn icon="👥" label="Library Members" active={view === 'members'} onClick={() => setView(view === 'members' ? 'main' : 'members')} />
              {view === 'members' && (
                <div style={subPanel}>
                  {members.length === 0
                    ? <p style={{ ...hintText, textAlign: 'center' }}>No members have joined yet.</p>
                    : members.map(member => (
                      <div key={member.uid} style={{ borderBottom: '1px solid rgba(200,168,75,0.08)', paddingBottom: 8, marginBottom: 8 }}>
                        <button
                          onClick={() => setExpandedMember(expandedMember === member.uid ? null : member.uid)}
                          style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', padding: '6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <div>
                            <p style={{ fontSize: 13, color: '#F4E8C1', margin: 0, fontWeight: 600 }}>{member.displayName}</p>
                            <p style={{ fontSize: 10, color: 'rgba(212,196,160,0.4)', margin: 0 }}>{member.role}</p>
                          </div>
                          <span style={{ color: '#C8A84B', fontSize: 12 }}>{expandedMember === member.uid ? '▲' : '▼'}</span>
                        </button>

                        {expandedMember === member.uid && (
                          <div style={{ paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Toggle label="Can Upload Books" value={member.canUpload ?? false} onChange={v => updateMemberPermission(member.uid, 'canUpload', v)} />
                            <Toggle label="Can Delete Books" value={member.canDelete ?? false} onChange={v => updateMemberPermission(member.uid, 'canDelete', v)} />
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              <button style={smallDangerBtn} onClick={() => kickMember(member.uid)}>Kick</button>
                              <button style={{ ...smallDangerBtn, background: '#7B241C' }} onClick={() => banMember(member)}>Ban</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  }
                </div>
              )}

              {/* Banned users */}
              <MenuBtn icon="🚫" label="Banned Users" active={view === 'banned'} onClick={() => setView(view === 'banned' ? 'main' : 'banned')} />
              {view === 'banned' && (
                <div style={subPanel}>
                  {bannedUsers.length === 0
                    ? <p style={{ ...hintText, textAlign: 'center' }}>No banned users.</p>
                    : bannedUsers.map(u => (
                      <div key={u.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(200,168,75,0.08)' }}>
                        <p style={{ fontSize: 13, color: '#F4E8C1', margin: 0 }}>{u.displayName}</p>
                        <button style={smallGoldBtn} onClick={() => unbanUser(u.uid)}>Unban</button>
                      </div>
                    ))
                  }
                </div>
              )}

              <div style={divider} />

              {/* Block requests toggle */}
              <div style={{ padding: '8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, color: '#F4E8C1', fontFamily: "'Crimson Text',serif" }}>Block Join Requests</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(212,196,160,0.35)', fontFamily: "'Crimson Text',serif" }}>
                    {blockRequests ? 'Requests are blocked — nobody can send one' : 'Accepting join requests'}
                  </p>
                </div>
                <ToggleSwitch value={blockRequests} onChange={handleToggleBlock} danger />
              </div>
            </>
          )}

          <div style={divider} />

          {/* Settings */}
          <p style={{ fontSize: 10, color: 'rgba(200,168,75,0.4)', letterSpacing: '0.1em', fontFamily: "'Cinzel',serif", margin: '4px 0 0' }}>SETTINGS</p>
          <div style={{ padding: '6px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, color: '#F4E8C1', fontFamily: "'Crimson Text',serif" }}>Quick Open</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(212,196,160,0.35)', fontFamily: "'Crimson Text',serif" }}>Skip confirm when clicking search result</p>
            </div>
            <ToggleSwitch value={directOpen} onChange={onDirectOpenChange} />
          </div>
          <div style={{ padding: '6px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, color: '#F4E8C1', fontFamily: "'Crimson Text',serif" }}>Bookmark Prompt</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(212,196,160,0.35)', fontFamily: "'Crimson Text',serif" }}>Show bookmarks when opening from search</p>
            </div>
            <ToggleSwitch value={bookmarkPrompt} onChange={onBookmarkPromptChange} />
          </div>

          <div style={divider} />
          <MenuBtn icon="🚪" label="Logout" onClick={() => signOut(auth)} danger />
        </div>

        {/* Message */}
        {message && (
          <div style={{ padding: '10px 16px', margin: '0 0 8px', borderRadius: 4, fontSize: 12, background: message.type === 'success' ? 'rgba(46,125,50,0.2)' : 'rgba(192,57,43,0.2)', color: message.type === 'success' ? '#81C784' : '#E57373', border: `1px solid ${message.type === 'success' ? 'rgba(129,199,132,0.3)' : 'rgba(229,115,115,0.3)'}`, margin: '0 16px 12px' }}>
            {message.text}
          </div>
        )}
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MenuBtn({ icon, label, onClick, active, danger, badge }: { icon: string; label: string; onClick: () => void; active?: boolean; danger?: boolean; badge?: number }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 4, border: 'none', background: active ? 'rgba(200,168,75,0.1)' : 'transparent', color: danger ? '#E57373' : active ? '#C8A84B' : '#F4E8C1', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: "'Crimson Text',serif", width: '100%', transition: 'background 0.15s', position: 'relative' }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && badge > 0 ? <span style={{ background: '#C0392B', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px', fontFamily: "'Cinzel',serif" }}>{badge}</span> : null}
    </button>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: 'rgba(212,196,160,0.7)', fontFamily: "'Crimson Text',serif" }}>{label}</span>
      <ToggleSwitch value={value} onChange={() => onChange(!value)} />
    </div>
  );
}

function ToggleSwitch({ value, onChange, danger }: { value: boolean; onChange: () => void; danger?: boolean }) {
  return (
    <button onClick={onChange} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', background: value ? (danger ? 'linear-gradient(90deg,#C0392B,#922B21)' : 'linear-gradient(90deg,#C8A84B,#A87830)') : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: 3, left: value ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
    </button>
  );
}

const subPanel: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '12px 10px', marginTop: 2 };
const divider: React.CSSProperties = { height: 1, background: 'rgba(200,168,75,0.1)', margin: '8px 0' };
const hintText: React.CSSProperties = { fontSize: 12, color: 'rgba(212,196,160,0.45)', marginBottom: 10, lineHeight: 1.6, fontFamily: "'Crimson Text',serif" };
const miniLabel: React.CSSProperties = { fontSize: 10, color: '#C8A84B', letterSpacing: '0.1em', fontFamily: "'Cinzel',serif", display: 'block', marginBottom: 4 };
const compactInput: React.CSSProperties = { flex: 1, background: 'rgba(10,5,2,0.6)', border: '1px solid rgba(200,168,75,0.25)', borderRadius: 4, color: '#F4E8C1', fontFamily: "'Crimson Text',serif", fontSize: 13, padding: '6px 10px', outline: 'none' };
const smallGoldBtn: React.CSSProperties = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', color: '#1A0E06', fontFamily: "'Cinzel',serif", fontSize: 10, fontWeight: 700, padding: '6px 10px', border: 'none', borderRadius: 3, cursor: 'pointer', flexShrink: 0 };
const smallDangerBtn: React.CSSProperties = { background: 'rgba(192,57,43,0.3)', color: '#E57373', fontFamily: "'Cinzel',serif", fontSize: 10, fontWeight: 700, padding: '6px 10px', border: '1px solid rgba(229,115,115,0.3)', borderRadius: 3, cursor: 'pointer', flexShrink: 0 };