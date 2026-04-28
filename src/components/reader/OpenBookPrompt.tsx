// src/components/reader/OpenBookPrompt.tsx
// Shown before opening a book — lets user choose to resume a bookmark or start fresh

import React, { useEffect, useState } from 'react';
import { getBookmarks, BookmarkData } from '@/lib/bookmarks';

interface OpenBookPromptProps {
  bookId: string;
  bookTitle: string;
  userId: string;
  onOpen: (page: number) => void;
  onCancel: () => void;
}

export default function OpenBookPrompt({ bookId, bookTitle, userId, onOpen, onCancel }: OpenBookPromptProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBookmarks(userId, bookId)
      .then(bms => {
        setBookmarks(bms);
        setLoading(false);
        if (bms.length === 0) onOpen(1);
      })
      .catch(() => { setLoading(false); onOpen(1); });
  }, [bookId, userId]);

  if (loading) return (
    <div style={overlay}>
      <div style={{ color: '#C8A84B', fontFamily: "'Cinzel',serif", fontSize: 14 }}>🕯️ Opening...</div>
    </div>
  );

  // No bookmarks → already called onOpen(1) above
  if (bookmarks.length === 0) return null;

  // Most recent bookmark = highest page number
  const lastBookmark = [...bookmarks].sort((a, b) => b.pageNumber - a.pageNumber)[0];

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2 style={titleS}>📖 Continue Reading?</h2>
        <p style={subtitleS}>{bookTitle}</p>

        {/* Resume last position */}
        <button style={primaryBtn} onClick={() => onOpen(lastBookmark.pageNumber)}>
          <span style={{ fontSize: 16 }}>🔖</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Resume at Page {lastBookmark.pageNumber}</div>
            {lastBookmark.note && (
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{lastBookmark.note}</div>
            )}
          </div>
        </button>

        {/* Other bookmarks if more than 1 */}
        {bookmarks.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 10, color: 'rgba(200,168,75,0.5)', letterSpacing: '0.1em', fontFamily: "'Cinzel',serif", marginBottom: 6 }}>
              OTHER BOOKMARKS
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
              {bookmarks
                .filter(b => b.id !== lastBookmark.id)
                .map(bm => (
                  <button key={bm.id} style={secondaryBtn} onClick={() => onOpen(bm.pageNumber)}>
                    <span style={{ color: '#C8A84B', fontFamily: "'Cinzel',serif", fontSize: 12 }}>Page {bm.pageNumber}</span>
                    {bm.note && <span style={{ fontSize: 11, color: 'rgba(212,196,160,0.45)', marginLeft: 8 }}>{bm.note}</span>}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Start from beginning */}
        <button style={startFreshBtn} onClick={() => onOpen(1)}>
          Start from Beginning
        </button>

        <button style={cancelBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 190, background: 'rgba(10,5,2,0.9)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modal: React.CSSProperties = { background: 'linear-gradient(160deg,#2C1A0E,#1A0E06)', border: '1px solid rgba(200,168,75,0.35)', borderRadius: 8, padding: '28px 24px', maxWidth: 380, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', gap: 10 };
const titleS: React.CSSProperties = { fontFamily: "'Cinzel',serif", fontSize: 18, color: '#C8A84B', margin: 0, textAlign: 'center' };
const subtitleS: React.CSSProperties = { fontSize: 13, color: 'rgba(212,196,160,0.45)', textAlign: 'center', margin: 0, fontStyle: 'italic' };
const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(200,168,75,0.12)', border: '1px solid rgba(200,168,75,0.35)', borderRadius: 6, padding: '12px 14px', cursor: 'pointer', color: '#F4E8C1', fontFamily: "'Crimson Text',serif", width: '100%', textAlign: 'left', marginTop: 4 };
const secondaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(200,168,75,0.12)', borderRadius: 4, padding: '8px 12px', cursor: 'pointer', width: '100%', textAlign: 'left' };
const startFreshBtn: React.CSSProperties = { background: 'transparent', border: '1px solid rgba(200,168,75,0.2)', borderRadius: 4, padding: '10px', color: 'rgba(212,196,160,0.55)', fontFamily: "'Crimson Text',serif", fontSize: 13, cursor: 'pointer', marginTop: 4 };
const cancelBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'rgba(212,196,160,0.3)', fontSize: 12, cursor: 'pointer', fontFamily: "'Crimson Text',serif", padding: '4px 0' };
