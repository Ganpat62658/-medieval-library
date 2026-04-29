// src/components/reader/BookmarkModal.tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { saveBookmark, getBookmarks, deleteBookmark, BookmarkData } from '@/lib/bookmarks';
import { Book } from '@/lib/types';

interface BookmarkModalProps {
  book: Book;
  currentPage: number;
  userId: string;
  libraryId: string;
  onClose: () => void;
  onJumpTo: (page: number) => void;
}

export default function BookmarkModal({ book, currentPage, userId, libraryId, onClose, onJumpTo }: BookmarkModalProps) {
  const [tab, setTab] = useState<'save' | 'list'>('save');
  const [page, setPage] = useState(currentPage);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [bookmarks, setBookmarks] = useState<BookmarkData[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Keep page in sync if user navigates while modal is open
  useEffect(() => { setPage(currentPage); }, [currentPage]);

  const loadBookmarks = () => {
    setLoadingList(true);
    getBookmarks(userId, book.id)
      .then(bms => { setBookmarks(bms); setLoadingList(false); })
      .catch(err => { console.error('Load bookmarks:', err); setLoadingList(false); });
  };

  useEffect(() => {
    if (tab === 'list') loadBookmarks();
  }, [tab]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await saveBookmark(userId, book.id, libraryId, book.title, page, note.trim() || null);
      setSaved(true);
      setNote('');
      setTimeout(() => {
        setSaved(false);
        setTab('list');
        loadBookmarks();
      }, 700);
    } catch (err: any) {
      console.error('Save bookmark error:', err);
      setSaveError(err?.message ?? 'Failed to save. Check Firestore rules.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBookmark(id);
      setBookmarks(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error('Delete bookmark error:', err);
    }
  };

  const handleJump = (p: number) => {
    onJumpTo(p);
    onClose();
  };

  return createPortal(
    <div style={overlay} onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      <div style={modal}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={titleS}>🔖 Bookmarks</h2>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(212,196,160,0.4)', margin: '0 0 14px', fontStyle: 'italic' }}>
          {book.title} · saved to your account
        </p>

        {/* Tabs */}
        <div style={tabRow}>
          <button style={{ ...tabBtn, ...(tab === 'save' ? tabActive : {}) }} onClick={() => setTab('save')}>
            + Save Page
          </button>
          <button style={{ ...tabBtn, ...(tab === 'list' ? tabActive : {}) }} onClick={() => setTab('list')}>
            📋 My Bookmarks
          </button>
        </div>

        {/* ── Save tab ── */}
        {tab === 'save' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelS}>PAGE NUMBER</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <input
                  type="number" min={1} value={page}
                  onChange={e => setPage(parseInt(e.target.value) || currentPage)}
                  style={{ ...inputS, width: 80, textAlign: 'center' }}
                />
                <span style={{ fontSize: 11, color: 'rgba(212,196,160,0.35)' }}>
                  current page: {currentPage}
                </span>
              </div>
            </div>
            <div>
              <label style={labelS}>NOTE (OPTIONAL)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. The battle scene begins here..."
                rows={3}
                style={{ ...inputS, resize: 'none', marginTop: 6 }}
              />
            </div>
            {saveError && (
              <p style={{ color: '#E57373', fontSize: 12, textAlign: 'center', margin: 0 }}>{saveError}</p>
            )}
            {saved
              ? <p style={{ color: '#81C784', textAlign: 'center', fontSize: 14, margin: 0 }}>✓ Saved to your account!</p>
              : <button style={goldBtn} onClick={handleSave} disabled={saving}>
                  {saving ? '⌛ Saving...' : '🔖 Save Bookmark'}
                </button>
            }
          </div>
        )}

        {/* ── List tab ── */}
        {tab === 'list' && (
          <div>
            {loadingList ? (
              <p style={{ textAlign: 'center', color: 'rgba(212,196,160,0.35)', padding: '24px 0', fontSize: 13 }}>
                Loading your bookmarks...
              </p>
            ) : bookmarks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ fontSize: 13, color: 'rgba(212,196,160,0.35)', fontStyle: 'italic', marginBottom: 12 }}>
                  No bookmarks saved for this book yet.
                </p>
                <button style={{ ...goldBtn, fontSize: 11 }} onClick={() => setTab('save')}>
                  + Save Your First Bookmark
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {bookmarks.map(bm => (
                  <div key={bm.id} style={bmRow}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: '#C8A84B' }}>
                        Page {bm.pageNumber}
                      </span>
                      {bm.note && (
                        <p style={{ fontSize: 12, color: 'rgba(212,196,160,0.5)', margin: '3px 0 0', lineHeight: 1.5 }}>
                          {bm.note}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      <button onClick={() => handleJump(bm.pageNumber)} style={jumpBtn}>Open</button>
                      <button onClick={() => handleDelete(bm.id)} style={deleteBtn} title="Delete">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  , document.body);
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(10,5,2,0.9)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, touchAction: 'none' };
const modal: React.CSSProperties = { background: 'linear-gradient(160deg,#2C1A0E,#1A0E06)', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 8, padding: '22px 20px', maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.85)', maxHeight: '88vh', overflowY: 'auto' };
const titleS: React.CSSProperties = { fontFamily: "'Cinzel',serif", fontSize: 17, color: '#C8A84B', margin: 0 };
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'rgba(212,196,160,0.4)', fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 };
const tabRow: React.CSSProperties = { display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(200,168,75,0.2)', marginBottom: 16 };
const tabBtn: React.CSSProperties = { flex: 1, padding: '9px', background: 'transparent', border: 'none', color: 'rgba(212,196,160,0.4)', cursor: 'pointer', fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: '0.05em' };
const tabActive: React.CSSProperties = { background: 'rgba(200,168,75,0.12)', color: '#C8A84B' };
const labelS: React.CSSProperties = { fontSize: 10, color: '#C8A84B', letterSpacing: '0.12em', fontFamily: "'Cinzel',serif", display: 'block' };
const inputS: React.CSSProperties = { background: 'rgba(10,5,2,0.6)', border: '1px solid rgba(200,168,75,0.25)', borderRadius: 4, color: '#F4E8C1', fontFamily: "'Crimson Text',Georgia,serif", fontSize: 14, padding: '9px 12px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const goldBtn: React.CSSProperties = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', color: '#1A0E06', fontFamily: "'Cinzel',serif", fontSize: 12, fontWeight: 700, padding: '11px', border: 'none', borderRadius: 4, cursor: 'pointer', width: '100%' };
const bmRow: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(200,168,75,0.1)', borderRadius: 4 };
const jumpBtn: React.CSSProperties = { background: 'rgba(200,168,75,0.15)', border: '1px solid rgba(200,168,75,0.3)', color: '#C8A84B', fontFamily: "'Cinzel',serif", fontSize: 10, padding: '5px 10px', borderRadius: 3, cursor: 'pointer' };
const deleteBtn: React.CSSProperties = { background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(229,115,115,0.15)', color: '#E57373', fontSize: 11, padding: '5px 8px', borderRadius: 3, cursor: 'pointer' };