// src/components/ui/HamburgerMenu.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  doc, serverTimestamp, deleteDoc, getDoc, onSnapshot, writeBatch, deleteField
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

// ── Toggle component ───────────────────────────────────────────────────────────
function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' }}>
      <div>
        <p style={{ margin: 0, fontSize: 13, color: '#F4E8C1', fontFamily: "'Crimson Text',serif" }}>{label}</p>
        {hint && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(212,196,160,0.4)', fontFamily: "'Crimson Text',serif" }}>{hint}</p>}
      </div>
      <button onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: value ? 'linear-gradient(90deg,#C8A84B,#A87830)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
        <span style={{ position: 'absolute', top: 3, left: value ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function HamburgerMenu({ isOpen, onClose, currentUser, directOpen, onDirectOpenChange, bookmarkPrompt, onBookmarkPromptChange }: HamburgerMenuProps) {
  const isOwner = currentUser.role === 'owner';
  const isJoined = !!currentUser.joinedLibraryId;
  const libraryId = currentUser.joinedLibraryId ?? currentUser.libraryId;

  const [view, setView] = useState<'main' | 'join' | 'requests' | 'members' | 'banned' | 'settings'>('main');
  const [targetPublicId, setTargetPublicId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [pendingRequests, setPendingRequests] = useState<InviteRequest[]>([]);
  const [generatedCodes, setGeneratedCodes] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<Array<{ uid: string; displayName: string; role: string; canDelete: boolean; canUpload: boolean }>>([]);
  const [bannedUsers, setBannedUsers] = useState<Array<{ userId: string; displayName: string; publicId: string }>>([]);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [blockRequests, setBlockRequests] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const msg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3500);
  };

  // Load library settings (blockRequests)
  useEffect(() => {
    if (!isOwner || !isOpen) return;
    const unsub = onSnapshot(doc(db, 'libraries', libraryId), snap => {
      if (snap.exists()) setBlockRequests(snap.data()?.blockRequests ?? false);
    });
    return unsub;
  }, [isOwner, isOpen, libraryId]);

  // Load pending requests (real-time) for owner
  useEffect(() => {
    if (!isOwner || !isOpen) return;
    const q = query(
      collection(db, 'libraries', libraryId, 'inviteRequests'),
      where('status', '==', 'pending'),
      where('targetOwnerId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(q, snap => {
      setPendingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as InviteRequest)));
    });
    return unsub;
  }, [isOwner, isOpen, libraryId, currentUser.uid]);

  // Load members for owner
  useEffect(() => {
    if (!isOwner || view !== 'members' || !isOpen) return;
    getDoc(doc(db, 'libraries', libraryId)).then(snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      const mems = Object.entries(data.members ?? {})
        .filter(([uid]) => uid !== currentUser.uid)
        .map(([uid, m]: [string, any]) => ({
          uid, displayName: m.displayName, role: m.role,
          canDelete: m.canDelete ?? false,
          canUpload: m.canUpload ?? false,
        }));
      setMembers(mems);
    });
  }, [isOwner, view, isOpen, libraryId, currentUser.uid]);

  // Load banned users
  useEffect(() => {
    if (!isOwner || view !== 'banned' || !isOpen) return;
    getDocs(collection(db, 'libraries', libraryId, 'bannedUsers')).then(snap => {
      setBannedUsers(snap.docs.map(d => d.data() as any));
    });
  }, [isOwner, view, isOpen, libraryId]);

  // ── Block requests toggle ─────────────────────────────────────────────────
  const handleBlockRequests = async (v: boolean) => {
    setBlockRequests(v);
    await updateDoc(doc(db, 'libraries', libraryId), { blockRequests: v });
    msg(v ? 'Join requests are now blocked.' : 'Join requests are now allowed.');
  };

  // ── Request to join ───────────────────────────────────────────────────────
  const handleRequestJoin = async () => {
    if (!targetPublicId.trim()) return;
    setIsLoading(true);
    try {
      const usersQ = query(collection(db, 'users'), where('publicId', '==', targetPublicId.trim().toUpperCase()));
      const usersSnap = await getDocs(usersQ);
      if (usersSnap.empty) { msg('No user found with that ID.', 'error'); return; }

      const targetUser = usersSnap.docs[0].data() as UserProfile;
      const targetLibId = targetUser.libraryId;

      // Check if target is blocking requests
      const libSnap = await getDoc(doc(db, 'libraries', targetLibId));
      if (libSnap.data()?.blockRequests) {
        msg('This library is not accepting join requests right now.', 'error'); return;
      }

      // Check if requester is banned
      const banSnap = await getDoc(doc(db, 'libraries', targetLibId, 'bannedUsers', currentUser.uid));
      if (banSnap.exists()) {
        msg('You have been banned from this library.', 'error'); return;
      }

      // Check for existing pending request
      const existQ = query(
        collection(db, 'libraries', targetLibId, 'inviteRequests'),
        where('requesterId', '==', currentUser.uid),
        where('status', '==', 'pending')
      );
      const existSnap = await getDocs(existQ);
      if (!existSnap.empty) { msg('You already have a pending request to this library.', 'error'); return; }

      await addDoc(collection(db, 'libraries', targetLibId, 'inviteRequests'), {
        requesterId: currentUser.uid,
        requesterName: currentUser.displayName,
        requesterPublicId: currentUser.publicId,
        targetOwnerId: targetUser.uid,
        status: 'pending',
        createdAt: serverTimestamp(),
        resolvedAt: null,
      });

      msg('Request sent! Wait for the owner to generate your code.');
      setTargetPublicId('');
    } catch (err: any) { msg(err.message ?? 'Failed to send request.', 'error'); }
    finally { setIsLoading(false); }
  };

  // ── Enter invite code ─────────────────────────────────────────────────────
  const handleEnterCode = async () => {
    if (!inviteCode.trim()) return;
    setIsLoading(true);
    try {
      const code = inviteCode.trim().toUpperCase();
      const codeQ = query(collection(db, 'globalInviteCodes'), where('code', '==', code), where('forRequesterId', '==', currentUser.uid), where('used', '==', false));
      const codeSnap = await getDocs(codeQ);
      if (codeSnap.empty) { msg('Invalid or expired code.', 'error'); return; }

      const codeDoc = codeSnap.docs[0];
      const codeData = codeDoc.data();
      if (codeData.expiresAt.toDate() < new Date()) { msg('This code has expired.', 'error'); return; }

      await updateDoc(codeDoc.ref, { used: true });
      await updateDoc(doc(db, 'users', currentUser.uid), { joinedLibraryId: codeData.libraryId, role: 'viewer' });
      await updateDoc(doc(db, 'libraries', codeData.libraryId), {
        [`members.${currentUser.uid}`]: { role: 'viewer', joinedAt: serverTimestamp(), displayName: currentUser.displayName, canDelete: false, canUpload: false },
      });
      await updateDoc(doc(db, 'libraries', codeData.libraryId, 'inviteRequests', codeData.forRequestId), { status: 'approved', resolvedAt: serverTimestamp() });

      msg('🎉 You joined the library! Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) { msg(err.message ?? 'Failed to apply code.', 'error'); }
    finally { setIsLoading(false); }
  };

  // ── Generate code for requester ───────────────────────────────────────────
  const handleGenerateCode = async (request: InviteRequest) => {
    const code = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await addDoc(collection(db, 'globalInviteCodes'), {
      code, generatedBy: currentUser.uid, libraryId,
      forRequestId: request.id, forRequesterId: request.requesterId,
      used: false, createdAt: serverTimestamp(), expiresAt,
    });
    setGeneratedCodes(prev => ({ ...prev, [request.id]: code }));
  };

  const handleRejectRequest = async (request: InviteRequest) => {
    await updateDoc(doc(db, 'libraries', libraryId, 'inviteRequests', request.id), { status: 'rejected', resolvedAt: serverTimestamp() });
  };

  // ── Leave library ─────────────────────────────────────────────────────────
  const handleLeave = async () => {
    if (!isJoined) return;
    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', currentUser.uid), { joinedLibraryId: null, role: 'owner' });
      batch.update(doc(db, 'libraries', libraryId), { [`members.${currentUser.uid}`]: deleteField() });
      await batch.commit();

      msg('Left the library. Reloading...');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) { msg(err.message ?? 'Failed to leave.', 'error'); }
    finally { setIsLoading(false); }
  };

  // ── Update member permission ──────────────────────────────────────────────
  const updateMemberPermission = async (uid: string, field: 'canDelete' | 'canUpload' | 'role', value: any) => {
    await updateDoc(doc(db, 'libraries', libraryId), { [`members.${uid}.${field}`]: value });
    setMembers(prev => prev.map(m => m.uid === uid ? { ...m, [field]: value } : m));
  };

  // ── Kick member ───────────────────────────────────────────────────────────
  const handleKick = async (uid: string, displayName: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { joinedLibraryId: null, role: 'owner' });
      const libSnap = await getDoc(doc(db, 'libraries', libraryId));
      if (libSnap.exists()) {
        const mems = libSnap.data().members ?? {};
        delete mems[uid];
        await updateDoc(doc(db, 'libraries', libraryId), { members: mems });
      }
      setMembers(prev => prev.filter(m => m.uid !== uid));
      setExpandedMember(null);
      msg(`${displayName} has been kicked.`);
    } catch (err: any) { msg(err.message ?? 'Failed to kick.', 'error'); }
  };

  // ── Ban member ────────────────────────────────────────────────────────────
  const handleBan = async (uid: string, displayName: string, publicId: string) => {
    try {
      await handleKick(uid, displayName);
      await updateDoc(doc(db, 'libraries', libraryId, 'bannedUsers', uid), {});
      // Use setDoc instead
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'libraries', libraryId, 'bannedUsers', uid), {
        userId: uid, displayName, publicId, bannedAt: serverTimestamp(), bannedBy: currentUser.uid,
      });
      msg(`${displayName} has been banned.`);
    } catch (err: any) { msg(err.message ?? 'Failed to ban.', 'error'); }
  };

  // ── Unban user ────────────────────────────────────────────────────────────
  const handleUnban = async (userId: string, displayName: string) => {
    try {
      await deleteDoc(doc(db, 'libraries', libraryId, 'bannedUsers', userId));
      setBannedUsers(prev => prev.filter(u => u.userId !== userId));
      msg(`${displayName} has been unbanned.`);
    } catch (err: any) { msg(err.message ?? 'Failed to unban.', 'error'); }
  };

  if (!isOpen) return null;

  const panel = (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.4)' }} />

      {/* Menu panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, width: 300, height: '100vh', background: 'linear-gradient(180deg,#2C1A0E,#1A0E06)', borderLeft: '1px solid rgba(200,168,75,0.25)', zIndex: 50, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 30px rgba(0,0,0,0.6)', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(200,168,75,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: 15, color: '#C8A84B', margin: 0 }}>☰ Library Menu</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(212,196,160,0.4)', fontSize: 20, cursor: 'pointer' }}>✕</button>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(212,196,160,0.4)', margin: '4px 0 0', fontFamily: "'Crimson Text',serif" }}>
            Your ID: <strong style={{ color: '#C8A84B', letterSpacing: '0.1em' }}>{currentUser.publicId}</strong>
          </p>
        </div>

        <div style={{ flex: 1, padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* JOIN SECTION */}
          {!isJoined && (
            <Section label="📖 Join a Library" expanded={view === 'join'} onToggle={() => setView(view === 'join' ? 'main' : 'join')}>
              <p style={hintText}>Enter an owner's Public ID to request access, or enter a code you received.</p>
              <Label>OWNER'S PUBLIC ID</Label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <input style={smallInput} value={targetPublicId} onChange={e => setTargetPublicId(e.target.value.toUpperCase())} placeholder="e.g. AB12CD34" maxLength={8} />
                <button style={goldBtnSm} onClick={handleRequestJoin} disabled={isLoading}>Request</button>
              </div>
              <Label>ENTER INVITE CODE</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={smallInput} value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="8-char code" maxLength={8} />
                <button style={goldBtnSm} onClick={handleEnterCode} disabled={isLoading}>Join</button>
              </div>
            </Section>
          )}

          {/* LEAVE LIBRARY */}
          {isJoined && (
            <MenuBtn icon="🚪" label="Leave Library" onClick={handleLeave} danger />
          )}

          {/* OWNER SECTIONS */}
          {isOwner && (
            <>
              {/* Join Requests */}
              <Section
                label={`📬 Join Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}`}
                expanded={view === 'requests'}
                onToggle={() => setView(view === 'requests' ? 'main' : 'requests')}
              >
                {pendingRequests.length === 0 ? (
                  <p style={hintText}>No pending requests.</p>
                ) : pendingRequests.map(req => (
                  <div key={req.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(200,168,75,0.08)' }}>
                    <p style={{ fontSize: 12, color: '#F4E8C1', margin: '0 0 2px', fontFamily: "'Crimson Text',serif" }}><strong>{req.requesterName}</strong></p>
                    <p style={{ fontSize: 10, color: 'rgba(212,196,160,0.4)', margin: '0 0 8px' }}>ID: {req.requesterPublicId}</p>
                    {generatedCodes[req.id] ? (
                      <div style={{ background: 'rgba(200,168,75,0.08)', borderRadius: 4, padding: '8px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 10, color: 'rgba(212,196,160,0.5)', margin: '0 0 4px' }}>Share this code:</p>
                        <p style={{ fontFamily: 'monospace', fontSize: 18, color: '#C8A84B', letterSpacing: '0.2em', margin: 0 }}>{generatedCodes[req.id]}</p>
                        <p style={{ fontSize: 9, color: 'rgba(200,168,75,0.4)', margin: '4px 0 0' }}>Expires in 24 hours</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={goldBtnSm} onClick={() => handleGenerateCode(req)}>Generate Code</button>
                        <button style={dangerBtnSm} onClick={() => handleRejectRequest(req)}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </Section>

              {/* Members */}
              <Section label="👥 Members" expanded={view === 'members'} onToggle={() => setView(view === 'members' ? 'main' : 'members')}>
                {members.length === 0 ? (
                  <p style={hintText}>No members have joined yet.</p>
                ) : members.map(member => (
                  <div key={member.uid} style={{ borderBottom: '1px solid rgba(200,168,75,0.07)', paddingBottom: 8, marginBottom: 8 }}>
                    <button
                      onClick={() => setExpandedMember(expandedMember === member.uid ? null : member.uid)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}
                    >
                      <span style={{ fontSize: 13, color: '#F4E8C1', fontFamily: "'Crimson Text',serif" }}>{member.displayName}</span>
                      <span style={{ fontSize: 10, color: 'rgba(200,168,75,0.4)' }}>{member.role} {expandedMember === member.uid ? '▲' : '▼'}</span>
                    </button>

                    {expandedMember === member.uid && (
                      <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <MiniToggle label="Can upload books" value={member.canUpload} onChange={v => updateMemberPermission(member.uid, 'canUpload', v)} />
                        <MiniToggle label="Can delete books" value={member.canDelete} onChange={v => updateMemberPermission(member.uid, 'canDelete', v)} />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button style={dangerBtnSm} onClick={() => handleKick(member.uid, member.displayName)}>Kick</button>
                          <button style={{ ...dangerBtnSm, background: 'rgba(120,0,0,0.4)', borderColor: 'rgba(200,50,50,0.4)' }} onClick={() => handleBan(member.uid, member.displayName, '')}>Ban</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </Section>

              {/* Banned Users */}
              <Section label="🚫 Banned Users" expanded={view === 'banned'} onToggle={() => setView(view === 'banned' ? 'main' : 'banned')}>
                {bannedUsers.length === 0 ? (
                  <p style={hintText}>No banned users.</p>
                ) : bannedUsers.map(u => (
                  <div key={u.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(200,168,75,0.07)' }}>
                    <span style={{ fontSize: 12, color: '#F4E8C1', fontFamily: "'Crimson Text',serif" }}>{u.displayName || u.userId.slice(0, 8)}</span>
                    <button style={goldBtnSm} onClick={() => handleUnban(u.userId, u.displayName)}>Unban</button>
                  </div>
                ))}
              </Section>
            </>
          )}

          {/* SETTINGS */}
          <Section label="⚙️ Settings" expanded={view === 'settings'} onToggle={() => setView(view === 'settings' ? 'main' : 'settings')}>
            <Toggle value={directOpen} onChange={onDirectOpenChange} label="Quick Open" hint="Skip confirm dialog when clicking search results" />
            <Toggle value={bookmarkPrompt} onChange={onBookmarkPromptChange} label="Bookmark Prompt" hint="Show saved bookmarks when opening from search" />
            {isOwner && (
              <Toggle value={blockRequests} onChange={handleBlockRequests} label="Block Join Requests" hint="Nobody can send join requests while this is on" />
            )}
          </Section>

          <div style={{ height: 1, background: 'rgba(200,168,75,0.1)', margin: '4px 12px' }} />
          <MenuBtn icon="🚪" label="Sign Out" onClick={() => signOut(auth)} danger />
        </div>

        {message && (
          <div style={{ margin: '0 12px 12px', padding: '10px 12px', borderRadius: 4, fontSize: 12, background: message.type === 'success' ? 'rgba(46,125,50,0.2)' : 'rgba(192,57,43,0.2)', color: message.type === 'success' ? '#81C784' : '#E57373', border: `1px solid ${message.type === 'success' ? 'rgba(129,199,132,0.3)' : 'rgba(229,115,115,0.3)'}` }}>
            {message.text}
          </div>
        )}
      </div>
    </>
  );

  return createPortal(panel, document.body);
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function Section({ label, expanded, onToggle, children }: { label: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: expanded ? 'rgba(200,168,75,0.06)' : 'transparent', border: 'none', borderLeft: expanded ? '2px solid rgba(200,168,75,0.4)' : '2px solid transparent', cursor: 'pointer', color: expanded ? '#C8A84B' : 'rgba(212,196,160,0.7)', fontFamily: "'Crimson Text',serif", fontSize: 13, textAlign: 'left', transition: 'all 0.15s' }}>
        {label}
        <span style={{ fontSize: 10, opacity: 0.6 }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && <div style={{ padding: '8px 16px 12px' }}>{children}</div>}
    </div>
  );
}

function MenuBtn({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'transparent', border: 'none', color: danger ? '#E57373' : 'rgba(212,196,160,0.7)', cursor: 'pointer', fontSize: 13, fontFamily: "'Crimson Text',serif", width: '100%', textAlign: 'left' }}>
      <span>{icon}</span><span>{label}</span>
    </button>
  );
}

function MiniToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: 12, color: 'rgba(212,196,160,0.6)', fontFamily: "'Crimson Text',serif" }}>{label}</span>
      <button onClick={() => onChange(!value)} style={{ width: 36, height: 20, borderRadius: 10, border: 'none', background: value ? 'linear-gradient(90deg,#C8A84B,#A87830)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
        <span style={{ position: 'absolute', top: 2, left: value ? 17 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }} />
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 10, color: '#C8A84B', letterSpacing: '0.1em', fontFamily: "'Cinzel',serif", margin: '0 0 4px' }}>{children}</p>;
}

const hintText: React.CSSProperties = { fontSize: 12, color: 'rgba(212,196,160,0.4)', margin: '0 0 10px', lineHeight: 1.6, fontFamily: "'Crimson Text',serif" };
const smallInput: React.CSSProperties = { flex: 1, background: 'rgba(10,5,2,0.6)', border: '1px solid rgba(200,168,75,0.2)', borderRadius: 4, color: '#F4E8C1', fontFamily: "'Crimson Text',serif", fontSize: 13, padding: '6px 10px', outline: 'none' };
const goldBtnSm: React.CSSProperties = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', color: '#1A0E06', fontFamily: "'Cinzel',serif", fontSize: 10, fontWeight: 700, padding: '6px 12px', border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 };
const dangerBtnSm: React.CSSProperties = { background: 'rgba(192,57,43,0.2)', color: '#E57373', fontFamily: "'Cinzel',serif", fontSize: 10, padding: '6px 12px', border: '1px solid rgba(229,115,115,0.3)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 };