// src/pages/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ShelfRow, Book, UserProfile, SlotType } from '@/lib/types';
import VirtualizedShelf, { VirtualizedShelfHandle } from '@/components/shelf/VirtualizedShelf';
import SearchBar from '@/components/search/SearchBar';
import AdvancedSearch from '@/components/search/AdvancedSearch';
import EReader from '@/components/reader/EReader';
import HamburgerMenu from '@/components/ui/HamburgerMenu';
import AddRowModal from '@/components/shelf/AddRowModal';
import UploadBookModal from '@/components/shelf/UploadBookModal';
import EditRowModal from '@/components/shelf/EditRowModal';
import { SearchMatch } from '@/lib/search';
import { playSparkle } from '@/lib/sparkle';
import OpenBookPrompt from '@/components/reader/OpenBookPrompt';

interface SlotTarget { rowIndex: number; colIndex: number; rowId: string; }

export default function LibraryPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [rows, setRows] = useState<ShelfRow[]>([]);
  const [books, setBooks] = useState<Record<string, Book>>({});
  const [highlightedBookId, setHighlightedBookId] = useState<string | null>(null);
  const [openBook, setOpenBook] = useState<{ book: Book; page?: number } | null>(null);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<SlotTarget | null>(null);
  const [editingRow, setEditingRow] = useState<ShelfRow | null>(null);
  const [promptBook, setPromptBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const shelfRef = React.useRef<VirtualizedShelfHandle>(null);
  const [directOpen, setDirectOpen] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('directOpen') === 'true';
    return false;
  });
  const handleDirectOpenChange = (v: boolean) => {
    setDirectOpen(v);
    localStorage.setItem('directOpen', String(v));
  };
  const [bookmarkPrompt, setBookmarkPrompt] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('bookmarkPrompt') !== 'false';
    return true; // on by default
  });
  const handleBookmarkPromptChange = (v: boolean) => {
    setBookmarkPrompt(v);
    localStorage.setItem('bookmarkPrompt', String(v));
  };

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) router.replace('/login');
      else setAuthUser(user);
    });
  }, [router]);

  useEffect(() => {
    if (!authUser) return;
    return onSnapshot(doc(db, 'users', authUser.uid), (snap) => {
      if (snap.exists()) { setProfileMissing(false); setUserProfile({ uid: snap.id, ...snap.data() } as UserProfile); }
      else { setIsLoading(false); setProfileMissing(true); }
    });
  }, [authUser]);

  useEffect(() => {
    if (!userProfile?.libraryId) return;
    const lid = userProfile.joinedLibraryId ?? userProfile.libraryId;
    return onSnapshot(query(collection(db, 'libraries', lid, 'rows'), orderBy('rowIndex', 'asc')), (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ShelfRow)));
      setIsLoading(false);
    });
  }, [userProfile]);

  useEffect(() => {
    if (!userProfile?.libraryId) return;
    const lid = userProfile.joinedLibraryId ?? userProfile.libraryId;
    return onSnapshot(collection(db, 'libraries', lid, 'books'), (snap) => {
      const map: Record<string, Book> = {};
      snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as Book; });
      setBooks(map);
    });
  }, [userProfile]);

  const handleSearchResult = useCallback((result: SearchMatch, action: 'open' | 'scroll', page?: number) => {
    setShowAdvancedSearch(false);
    const book = Object.values(books).find((b) => b.id === result.bookId);

    if (action === 'open' && book) {
      if (directOpen) {
        // directOpen: skip all prompts, open straight to page
        // If bookmarkPrompt is on AND it's a plain open (no specific page from advanced search),
        // still show bookmark screen so user can resume where they left off
        if (bookmarkPrompt && !page) {
          setPromptBook(book);
        } else {
          setOpenBook({ book, page: page ?? 1 });
        }
      } else {
        setPromptBook(book);
      }
      return; // Don't scroll/sparkle when opening — reader covers the shelf anyway
    }

    // action === 'scroll': scroll to the row AND column, then sparkle
    shelfRef.current?.scrollToColumn(result.rowIndex, result.colIndex);
    setHighlightedBookId(result.bookId);
    setTimeout(() => {
      const el = document.querySelector(`[data-book-id="${result.bookId}"]`) as HTMLElement | null;
      if (el) playSparkle(el);
    }, 700); // slightly longer — wait for both vertical + horizontal scroll
    setTimeout(() => setHighlightedBookId(null), 1800);
  }, [books, directOpen, bookmarkPrompt]);

  const handleSlotClick = useCallback((rowIndex: number, colIndex: number, _: SlotType) => {
    const row = rows.find((r) => r.rowIndex === rowIndex);
    if (!row) return;
    setUploadTarget({ rowIndex, colIndex, rowId: row.id });
  }, [rows]);

  const canEdit = userProfile?.role === 'owner' || userProfile?.role === 'editor';
  const libraryId = userProfile ? (userProfile.joinedLibraryId ?? userProfile.libraryId) : '';

  if (profileMissing) return (
    <div style={centeredPage}>
      <div style={card}>
        <p style={{ fontFamily: "'Cinzel',serif", color: '#C8A84B', fontSize: 18, marginBottom: 12, textAlign: 'center' }}>⚠️ Profile Not Found</p>
        <p style={{ color: 'rgba(212,196,160,0.7)', fontSize: 14, lineHeight: 1.7, marginBottom: 16, textAlign: 'center' }}>
          Set Firestore rules to allow authenticated users, then reload.
        </p>
        <pre style={{ background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 4, fontSize: 11, color: '#81C784', overflowX: 'auto', marginBottom: 20, whiteSpace: 'pre-wrap' }}>
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`}
        </pre>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => window.location.reload()} style={goldBtn}>Retry</button>
          <button onClick={() => signOut(auth)} style={outlineBtn}>Sign Out</button>
        </div>
      </div>
    </div>
  );

  if (isLoading || !userProfile) return (
    <div style={centeredPage}>
      <span style={{ fontSize: 40 }}>🕯️</span>
      <p style={{ fontFamily: "'Crimson Text',serif", color: 'rgba(212,196,160,0.6)', marginTop: 16 }}>Lighting the torches...</p>
      <SlowHint onSignOut={() => signOut(auth)} />
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#1A0E06' }}>
      {/* Top bar — stacks on mobile */}
      <header style={{ background: '#2C1A0E', borderBottom: '1px solid rgba(200,168,75,0.2)', flexShrink: 0, boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
        {/* Row 1: title + hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px 6px', gap: 10 }}>
          <h1 style={{ fontFamily: "'Cinzel',serif", fontSize: 18, color: '#C8A84B', margin: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            📚 The Library
          </h1>
          <button onClick={() => setMenuOpen(true)} style={{ background: 'none', border: 'none', color: '#C8A84B', fontSize: 24, cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>☰</button>
        </div>
        {/* Row 2: search bar — full width */}
        <div style={{ padding: '0 14px 10px' }}>
          <SearchBar libraryId={libraryId} rows={rows} onResultSelect={(m, a) => handleSearchResult(m, a)} onAdvancedToggle={() => setShowAdvancedSearch(v => !v)} directOpen={directOpen} />
        </div>
      </header>

      {/* Shelf */}
      <main style={{ flex: 1, overflow: 'hidden', padding: '16px 8px 8px', position: 'relative' }}>
        {rows.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 20 }}>
            <span style={{ fontSize: 48 }}>📜</span>
            <p style={{ fontFamily: "'Cinzel',serif", color: '#C8A84B', fontSize: 20, margin: 0 }}>The shelves await their tomes.</p>
            <p style={{ color: 'rgba(212,196,160,0.5)', fontSize: 14, margin: 0 }}>Start by adding your first shelf row.</p>
            {canEdit && <button style={{ ...goldBtn, fontSize: 15, padding: '13px 32px', marginTop: 8 }} onClick={() => setShowAddRow(true)}>✚ Add First Row</button>}
          </div>
        ) : (
          <>
            <VirtualizedShelf
              ref={shelfRef}
              rows={rows} books={books} userRole={userProfile.role}
              highlightedBookId={highlightedBookId}
              onBookClick={(book) => setPromptBook(book)}
              onSlotClick={handleSlotClick}
              onEditRow={canEdit ? (row) => setEditingRow(row) : undefined}
            />
            {canEdit && (
              <button onClick={() => setShowAddRow(true)} style={{ position: 'absolute', bottom: 20, right: 20, background: 'linear-gradient(180deg,#C8A84B,#A87830)', color: '#1A0E06', border: 'none', borderRadius: 28, padding: '10px 20px', fontFamily: "'Cinzel',serif", fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
                ✚ Add Row
              </button>
            )}
          </>
        )}
      </main>

      {showAddRow && <AddRowModal libraryId={libraryId} currentRowCount={rows.length} onClose={() => setShowAddRow(false)} />}
      {uploadTarget && <UploadBookModal libraryId={libraryId} rowIndex={uploadTarget.rowIndex} colIndex={uploadTarget.colIndex} rowId={uploadTarget.rowId} userId={authUser!.uid} onClose={() => setUploadTarget(null)} />}
      {editingRow && <EditRowModal libraryId={libraryId} row={editingRow} onClose={() => setEditingRow(null)} />}

      {showAdvancedSearch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,5,2,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AdvancedSearch rows={rows} libraryId={libraryId} onResultSelect={(m, a, p) => handleSearchResult(m, a, p)} onClose={() => setShowAdvancedSearch(false)} />
        </div>
      )}

      {promptBook && (
        <OpenBookPrompt
          bookId={promptBook.id}
          bookTitle={promptBook.title}
          userId={authUser!.uid}
          onOpen={(page) => { setOpenBook({ book: promptBook, page }); setPromptBook(null); }}
          onCancel={() => setPromptBook(null)}
        />
      )}
      {openBook && <EReader book={openBook.book} userId={authUser!.uid} libraryId={libraryId} initialPage={openBook.page} onClose={() => setOpenBook(null)} />}
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} currentUser={userProfile} directOpen={directOpen} onDirectOpenChange={handleDirectOpenChange} bookmarkPrompt={bookmarkPrompt} onBookmarkPromptChange={handleBookmarkPromptChange} />
    </div>
  );
}

function SlowHint({ onSignOut }: { onSignOut: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 4000); return () => clearTimeout(t); }, []);
  if (!show) return null;
  return (
    <div style={{ marginTop: 24, textAlign: 'center', maxWidth: 340, padding: '0 20px' }}>
      <p style={{ color: 'rgba(212,196,160,0.5)', fontSize: 13, lineHeight: 1.6 }}>Stuck? Check your Firestore rules allow authenticated users, then reload.</p>
      <button onClick={onSignOut} style={{ ...outlineBtn, marginTop: 12 }}>Sign Out</button>
    </div>
  );
}

const centeredPage: React.CSSProperties = { minHeight: '100vh', background: '#1A0E06', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Crimson Text',Georgia,serif", padding: 20 };
const card: React.CSSProperties = { background: 'linear-gradient(160deg,#2C1A0E,#1A0E06)', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 8, padding: '32px 28px', maxWidth: 480, width: '100%' };
const goldBtn: React.CSSProperties = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', color: '#1A0E06', fontFamily: "'Cinzel',serif", fontSize: 13, fontWeight: 700, padding: '11px 24px', border: 'none', borderRadius: 4, cursor: 'pointer' };
const outlineBtn: React.CSSProperties = { background: 'transparent', color: 'rgba(212,196,160,0.6)', fontFamily: "'Crimson Text',serif", fontSize: 13, padding: '11px 20px', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 4, cursor: 'pointer' };
