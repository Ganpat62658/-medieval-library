// src/components/shelf/UploadBookModal.tsx
// Hybrid storage: saves the file locally (IndexedDB) AND stores a shareable link in Firestore.
// - Owner/uploader: reads from local storage (fast, offline-capable)
// - Other members: reads from the shareable link (Google Drive / Dropbox)

import React, { useState, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { saveBookLocally } from '@/lib/localBooks';

interface UploadBookModalProps {
  libraryId: string;
  rowIndex: number;
  colIndex: number;
  rowId: string;
  userId: string;
  onClose: () => void;
}

type BookFormat = 'pdf' | 'epub' | 'txt';
type Tab = 'local' | 'link';

export default function UploadBookModal({
  libraryId, rowIndex, colIndex, rowId, userId, onClose,
}: UploadBookModalProps) {
  const [tab, setTab] = useState<Tab>('local');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [format, setFormat] = useState<BookFormat>('pdf');
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [shareableLink, setShareableLink] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFormat = (file: File): BookFormat | null => {
    if (file.name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
    if (file.name.endsWith('.epub') || file.type === 'application/epub+zip') return 'epub';
    if (file.name.endsWith('.txt') || file.type === 'text/plain') return 'txt';
    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fmt = getFormat(file);
    if (!fmt) { setError('Only PDF, EPUB, and TXT files are supported.'); return; }
    setError('');
    setBookFile(file);
    setFormat(fmt);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Please enter a title.'); return; }
    if (tab === 'local' && !bookFile) { setError('Please select a book file.'); return; }
    if (tab === 'link' && !shareableLink.trim()) { setError('Please paste a shareable link.'); return; }

    if (tab === 'link') {
      try { new URL(shareableLink.trim()); }
      catch { setError('That doesn\'t look like a valid URL.'); return; }
    }

    setSaving(true);
    setError('');

    try {
      // Generate a temporary ID we'll use for the Firestore doc and local storage
      const tempId = `book_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // 1. If local file — save to IndexedDB first
      if (tab === 'local' && bookFile) {
        await saveBookLocally(tempId, bookFile);
      }

      // 2. Save metadata to Firestore
      const bookRef = await addDoc(collection(db, 'libraries', libraryId, 'books'), {
        title: title.trim(),
        author: author.trim() || null,
        format,
        uploadedBy: userId,
        uploadedAt: serverTimestamp(),

        // The shareable link — used by other members who don't have it locally
        fileUrl: shareableLink.trim() || null,

        // Whether this book has a local copy (only meaningful per-device)
        hasLocalCopy: tab === 'local',
        localStorageKey: tab === 'local' ? tempId : null,

        thumbnailUrl: coverUrl.trim() || null,
        coverUrl: coverUrl.trim() || null,
        backCoverUrl: null,
        spineTextureUrl: null,
        pageCount: null,
        fileSizeBytes: bookFile?.size ?? 0,
        rowIndex,
        colIndex,
        algoliaObjectId: null,
        searchIndexed: false,
      });

      // 3. If we saved locally, re-save with the real Firestore bookId as the key
      // so other parts of the app can look it up by bookId
      if (tab === 'local' && bookFile) {
        await saveBookLocally(bookRef.id, bookFile);
      }

      // 4. Update the shelf slot
      await updateDoc(doc(db, 'libraries', libraryId, 'rows', rowId), {
        [`slots.${colIndex}`]: { type: 'book', bookId: bookRef.id },
      });

      setDone(true);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save. Check your Firestore rules.');
      setSaving(false);
    }
  };

  return (
    <div data-modal="true" style={overlay} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <div style={modal}>
        <h2 style={titleStyle}>📖 Add a Book</h2>
        <p style={subtitleStyle}>Row {rowIndex + 1} · Column {colIndex + 1}</p>

        {done ? (
          <p style={{ textAlign: 'center', color: '#81C784', fontSize: 16, padding: '20px 0' }}>
            ✓ Book added to the shelf!
          </p>
        ) : (
          <>
            {/* Tab switcher */}
            <div style={tabRow}>
              <button style={{ ...tabBtn, ...(tab === 'local' ? tabActive : {}) }} onClick={() => setTab('local')}>
                💾 From My Device
              </button>
              <button style={{ ...tabBtn, ...(tab === 'link' ? tabActive : {}) }} onClick={() => setTab('link')}>
                🔗 From a Link
              </button>
            </div>

            {/* Tab description */}
            <p style={tabHint}>
              {tab === 'local'
                ? 'The file is saved on this device. Add a shareable link below so library members can also read it.'
                : 'Paste a Google Drive or Dropbox link. Anyone in the library can open it.'}
            </p>

            {/* Local file picker */}
            {tab === 'local' && (
              <div style={field}>
                <label style={label}>BOOK FILE *</label>
                <div style={{ ...dropZone, borderColor: bookFile ? 'rgba(200,168,75,0.5)' : 'rgba(200,168,75,0.2)' }}
                  onClick={() => fileInputRef.current?.click()}>
                  {bookFile
                    ? <span style={{ color: '#C8A84B', fontSize: 14 }}>📄 {bookFile.name} ({(bookFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                    : <span style={{ color: 'rgba(212,196,160,0.4)', fontSize: 13 }}>Click to choose · PDF, EPUB, or TXT</span>
                  }
                </div>
                <input ref={fileInputRef} type="file" accept=".pdf,.epub,.txt"
                  style={{ display: 'none' }} onChange={handleFileSelect} />
              </div>
            )}

            {/* Title */}
            <div style={field}>
              <label style={label}>TITLE *</label>
              <input style={input} type="text" placeholder="Book title"
                value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
            </div>

            {/* Author */}
            <div style={field}>
              <label style={label}>AUTHOR (OPTIONAL)</label>
              <input style={input} type="text" placeholder="Author name"
                value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={80} />
            </div>

            {/* Format (only when using link tab) */}
            {tab === 'link' && (
              <div style={field}>
                <label style={label}>FORMAT</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['pdf', 'epub', 'txt'] as BookFormat[]).map((f) => (
                    <button key={f} onClick={() => setFormat(f)} style={{
                      flex: 1, padding: '8px 0',
                      background: format === f ? 'rgba(200,168,75,0.2)' : 'transparent',
                      border: `1px solid ${format === f ? 'rgba(200,168,75,0.6)' : 'rgba(200,168,75,0.2)'}`,
                      borderRadius: 4, color: format === f ? '#C8A84B' : 'rgba(212,196,160,0.4)',
                      fontFamily: "'Cinzel', serif", fontSize: 12, cursor: 'pointer',
                      textTransform: 'uppercase',
                    }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Shareable link — shown in both tabs */}
            <div style={field}>
              <label style={label}>
                {tab === 'local' ? 'SHAREABLE LINK FOR MEMBERS (OPTIONAL BUT RECOMMENDED)' : 'SHAREABLE LINK *'}
              </label>
              <input style={input} type="url"
                placeholder="https://drive.google.com/... or https://dropbox.com/..."
                value={shareableLink} onChange={(e) => setShareableLink(e.target.value)} />
              <div style={hintBox}>
                <p style={hintText}>
                  <strong style={{ color: 'rgba(212,196,160,0.8)' }}>Google Drive:</strong> Open file → Share → "Anyone with the link" → Copy link
                </p>
                <p style={hintText}>
                  <strong style={{ color: 'rgba(212,196,160,0.8)' }}>Dropbox:</strong> Share → Copy link → change <code style={code}>?dl=0</code> → <code style={code}>?dl=1</code>
                </p>
              </div>
            </div>

            {/* Cover image */}
            <div style={field}>
              <label style={label}>COVER IMAGE LINK (OPTIONAL)</label>
              <input style={input} type="url"
                placeholder="https://... (any direct image URL)"
                value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
              {coverUrl && (
                <img src={coverUrl} alt="Cover preview"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                  style={{ marginTop: 8, height: 90, objectFit: 'cover', borderRadius: 3, border: '1px solid rgba(200,168,75,0.2)' }} />
              )}
            </div>

            {error && <p style={errorStyle}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button style={{ ...goldBtn, opacity: saving ? 0.6 : 1 }}
                onClick={handleSave} disabled={saving}>
                {saving ? '💾 Saving...' : '📚 Add to Shelf'}
              </button>
              <button style={outlineBtn} onClick={onClose} disabled={saving}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 99999,
  background: 'rgba(10,5,2,0.9)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const modal: React.CSSProperties = {
  background: 'linear-gradient(160deg, #2C1A0E 0%, #1A0E06 100%)',
  border: '1px solid rgba(200,168,75,0.3)', borderRadius: 8,
  padding: '28px 26px', maxWidth: 480, width: '100%',
  boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
  maxHeight: '92vh', overflowY: 'auto',
};
const titleStyle: React.CSSProperties = { fontFamily: "'Cinzel', serif", fontSize: 20, color: '#C8A84B', margin: '0 0 4px', textAlign: 'center' };
const subtitleStyle: React.CSSProperties = { color: 'rgba(212,196,160,0.4)', fontSize: 12, textAlign: 'center', margin: '0 0 20px' };
const tabRow: React.CSSProperties = { display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(200,168,75,0.2)', marginBottom: 12 };
const tabBtn: React.CSSProperties = { flex: 1, padding: '9px', background: 'transparent', border: 'none', color: 'rgba(212,196,160,0.4)', cursor: 'pointer', fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: '0.05em' };
const tabActive: React.CSSProperties = { background: 'rgba(200,168,75,0.12)', color: '#C8A84B' };
const tabHint: React.CSSProperties = { fontSize: 12, color: 'rgba(212,196,160,0.45)', marginBottom: 18, lineHeight: 1.6, fontStyle: 'italic' };
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 };
const label: React.CSSProperties = { fontSize: 10, color: '#C8A84B', letterSpacing: '0.12em', fontFamily: "'Cinzel', serif" };
const input: React.CSSProperties = { background: 'rgba(10,5,2,0.6)', border: '1px solid rgba(200,168,75,0.25)', borderRadius: 4, color: '#F4E8C1', fontFamily: "'Crimson Text', Georgia, serif", fontSize: 15, padding: '10px 14px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const dropZone: React.CSSProperties = { border: '1px dashed', borderRadius: 4, padding: '14px 16px', cursor: 'pointer', textAlign: 'center', transition: 'border-color 0.15s' };
const hintBox: React.CSSProperties = { background: 'rgba(0,0,0,0.2)', borderRadius: 4, padding: '10px 12px', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 };
const hintText: React.CSSProperties = { fontSize: 11, color: 'rgba(212,196,160,0.45)', margin: 0, lineHeight: 1.6 };
const code: React.CSSProperties = { background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: 2, fontFamily: 'monospace', fontSize: 10, color: '#C8A84B' };
const errorStyle: React.CSSProperties = { color: '#E57373', fontSize: 13, textAlign: 'center', padding: '8px 12px', background: 'rgba(192,57,43,0.1)', borderRadius: 4, margin: '0 0 12px' };
const goldBtn: React.CSSProperties = { background: 'linear-gradient(180deg, #C8A84B 0%, #A87830 100%)', color: '#1A0E06', fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700, padding: '11px 24px', border: 'none', borderRadius: 4, cursor: 'pointer', flex: 1 };
const outlineBtn: React.CSSProperties = { background: 'transparent', color: 'rgba(212,196,160,0.6)', fontFamily: "'Crimson Text', serif", fontSize: 13, padding: '11px 20px', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 4, cursor: 'pointer' };