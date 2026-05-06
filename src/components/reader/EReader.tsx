'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Book } from '@/lib/types';
import { getLocalBook } from '@/lib/localBooks';
import { convertDriveLink, isDriveLink } from '@/lib/driveHelper';
import BookmarkModal from './BookmarkModal';
import { createPortal } from 'react-dom';

interface EReaderProps {
  book: Book;
  userId: string;
  libraryId: string;
  initialPage?: number;
  onClose: () => void;
}

type ReaderMode = 'pdf' | 'epub' | 'txt';

const EReader: React.FC<EReaderProps> = ({ book, userId, libraryId, initialPage = 1, onClose }) => {
  const flipContainerRef  = useRef<HTMLDivElement>(null);
  const epubContainerRef  = useRef<HTMLDivElement>(null);
  const pageFlipRef       = useRef<any>(null);
  const epubRenditionRef  = useRef<any>(null);
  const epubBookRef       = useRef<any>(null);
  const [currentPage, setCurrentPage]   = useState(initialPage);
  const [totalPages, setTotalPages]     = useState(0);
  const [status, setStatus]             = useState<'loading' | 'rendering' | 'ready' | 'error'>('loading');
  const [loadMsg, setLoadMsg]           = useState('Opening the tome...');
  const [errorMsg, setErrorMsg]         = useState('');
  const [showBookmark, setShowBookmark] = useState(false);
  const [txtPages, setTxtPages]         = useState<string[]>([]);
  const [readerMode, setReaderMode]     = useState<ReaderMode>('pdf');
  // Flag so EPUB container is mounted before we try to render into it
  const [epubReady, setEpubReady]       = useState(false);
  const isMobileRef = useRef(typeof window !== 'undefined' && window.innerWidth <= 768);

  const fmt = ((book as any).format as string) || 'pdf';

  // ── Fetch file as ArrayBuffer ─────────────────────────────────────────────
  const fetchBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    // 1. Try local IndexedDB
    const local = await getLocalBook(book.id).catch(() => null);
    if (local) return local.arrayBuffer();

    const rawUrl = (book as any).fileUrl as string | null;
    if (!rawUrl) throw new Error('No file attached. Re-add this book with a link.');

    // 2. For Drive links — always use the proxy (Drive blocks direct fetches & converts EPUB to ZIP)
    if (isDriveLink(rawUrl)) {
      const c = convertDriveLink(rawUrl);
      if (!c) throw new Error('Could not parse Google Drive link.');
      const res = await fetch(`/api/fetch-pdf?url=${encodeURIComponent(c.downloadUrl)}`);
      if (!res.ok) throw new Error(`Drive fetch failed (${res.status}). Make sure sharing is set to "Anyone with the link".`);
      return res.arrayBuffer();
    }

    // 3. Direct URL — try as-is, fall back to proxy
    try {
      const res = await fetch(rawUrl);
      if (res.ok) return res.arrayBuffer();
    } catch { /* CORS — fall through */ }

    const res = await fetch(`/api/fetch-pdf?url=${encodeURIComponent(rawUrl)}`);
    if (!res.ok) throw new Error('Could not download file. Make sure the link is public.');
    return res.arrayBuffer();
  }, [book.id, (book as any).fileUrl]);

  // ── Step 1: detect format — epub container is always mounted so no delay needed
  useEffect(() => {
    setReaderMode(fmt as ReaderMode);
    if (fmt === 'epub') {
      // Small delay to ensure ref is attached after render
      setTimeout(() => setEpubReady(true), 50);
    }
  }, [fmt]);

  // ── Step 2: load content once container is ready ──────────────────────────
  useEffect(() => {
    if (fmt === 'epub' && !epubReady) return; // wait for container
    let cancelled = false;
    const blobUrls: string[] = [];

    async function run() {
      try {
        if (fmt === 'pdf')  await loadPdf(cancelled);
        if (fmt === 'epub') await loadEpub(cancelled, blobUrls);
        if (fmt === 'txt')  await loadTxt(cancelled);
      } catch (err: any) {
        if (cancelled) return;
        console.error('EReader error:', err);
        setErrorMsg(err.message ?? 'Could not open this book.');
        setStatus('error');
      }
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    async function loadPdf(cancelled: boolean) {
      setStatus('loading');
      setLoadMsg('Loading PDF engine...');
      const buffer = await fetchBuffer();
      if (cancelled) return;

      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
      if (cancelled) return;

      const numPages = pdf.numPages;
      setTotalPages(numPages);
      setStatus('rendering');

      const isMobile = isMobileRef.current;
      const displayW = isMobile ? window.innerWidth - 16 : Math.min(Math.floor((window.innerWidth - 120) / 2), 700);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pageEls: HTMLElement[] = [];

      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return;
        const page = await pdf.getPage(i);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = (displayW / vp0.width) * dpr;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width  = `${Math.floor(vp.width / dpr)}px`;
        canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#FDFAF0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const w = document.createElement('div');
        w.style.cssText = 'background:#FDFAF0;display:flex;align-items:center;justify-content:center;overflow:hidden;width:100%;height:100%;';
        w.appendChild(canvas);
        pageEls.push(w);
        if (i % 20 === 0 || i === numPages) setLoadMsg(`Rendering pages… ${i}/${numPages}`);
      }

      if (cancelled || !flipContainerRef.current) return;
      flipContainerRef.current.innerHTML = '';
      const { PageFlip } = await import('page-flip');
      if (cancelled) return;

      const fc = pageEls[0]?.firstChild as HTMLCanvasElement | null;
      const pageW = fc ? parseInt(fc.style.width)  || Math.floor(fc.width / dpr)  : displayW;
      const pageH = fc ? parseInt(fc.style.height) || Math.floor(fc.height / dpr) : 800;

      const flip = new PageFlip(flipContainerRef.current, {
        width: pageW, height: pageH, size: 'stretch',
        minWidth: isMobile ? 280 : 320, maxWidth: isMobile ? window.innerWidth : 650,
        minHeight: 350, maxHeight: 950,
        drawShadow: true, flippingTime: 650, usePortrait: isMobile,
        autoSize: true, showCover: false, mobileScrollSupport: false,
        swipeDistance: 20, clickEventForward: true, startZIndex: 0,
      });
      flip.loadFromHTML(pageEls);
      pageFlipRef.current = flip;
      if (initialPage > 1) setTimeout(() => flip.turnToPage(initialPage - 1), 100);
      flip.on('flip', (e: any) => setCurrentPage(e.data + 1));
      if (!cancelled) setStatus('ready');
    }

    // ── EPUB ─────────────────────────────────────────────────────────────────
    async function loadEpub(cancelled: boolean, blobUrls: string[]) {
      setStatus('loading');
      setLoadMsg('Opening the manuscript…');

      const buffer = await fetchBuffer();
      if (cancelled) return;

      // Validate it's actually an EPUB (ZIP magic bytes: PK\x03\x04)
      const magic = new Uint8Array(buffer.slice(0, 4));
      if (magic[0] !== 0x50 || magic[1] !== 0x4B) {
        throw new Error(
          'This file does not appear to be a valid EPUB.\n\n' +
          'If it came from Google Drive, Drive sometimes converts EPUBs to ZIP files when sharing. ' +
          'Instead, download the EPUB to your device first, then upload it using "From My Device".'
        );
      }

      setLoadMsg('Loading chapters…');
      const Epub = (await import('epubjs')).default;
      if (cancelled) return;

      // Create blob URL from buffer — more reliable than passing buffer directly
      const blob = new Blob([buffer], { type: 'application/epub+zip' });
      const blobUrl = URL.createObjectURL(blob);
      blobUrls.push(blobUrl);

      const epubBook = Epub(blobUrl);
      epubBookRef.current = epubBook;

      if (cancelled) return;

      // Container is always in DOM — ref should be available
      const container = epubContainerRef.current;
      if (!container) throw new Error('EPUB container not available. Please close and reopen.');

      const isMobile = isMobileRef.current;
      const rendition = epubBook.renderTo(container, {
        width: '100%',
        height: '100%',
        spread: isMobile ? 'none' : 'always',
        flow: 'paginated',
      });
      epubRenditionRef.current = rendition;

      // Apply parchment theme
      rendition.themes.register('medieval', {
        body: {
          'font-family': "'Crimson Text', Georgia, serif !important",
          'font-size': '1.05em !important',
          'line-height': '1.85 !important',
          'color': '#1A0E05 !important',
          'background': '#FDFAF0 !important',
          'padding': '2em !important',
          'margin': '0 !important',
        },
        'p': { 'margin-bottom': '0.9em !important' },
        'h1,h2,h3,h4': { 'font-family': "'Cinzel', serif !important", 'color': '#4A2C17 !important' },
        'a': { 'color': '#8B4A2A !important' },
      });
      rendition.themes.select('medieval');

      rendition.on('relocated', (loc: any) => {
        const p = loc?.start?.displayed?.page;
        const total = loc?.start?.displayed?.total;
        if (p) setCurrentPage(p);
        if (total) setTotalPages(t => Math.max(t, total));
      });

      await rendition.display();
      if (cancelled) return;
      setStatus('ready');
    }

    // ── TXT ──────────────────────────────────────────────────────────────────
    async function loadTxt(cancelled: boolean) {
      setStatus('loading');
      setLoadMsg('Reading the scroll…');
      const buffer = await fetchBuffer();
      if (cancelled) return;

      // Detect encoding and decode properly
      let text: string;
      try {
        // Try UTF-8 first
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch {
        try {
          // Fall back to Windows-1252 (common for older text files)
          text = new TextDecoder('windows-1252').decode(buffer);
        } catch {
          text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
        }
      }

      // Remove BOM if present
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

      const CHARS = 2800;
      const pages: string[] = [];
      // Split on paragraph boundaries when possible
      const paragraphs = text.split(/\n\n+/);
      let current = '';
      for (const para of paragraphs) {
        if (current.length + para.length > CHARS && current.length > 0) {
          pages.push(current.trim());
          current = para + '\n\n';
        } else {
          current += para + '\n\n';
        }
      }
      if (current.trim()) pages.push(current.trim());

      if (cancelled) return;
      setTxtPages(pages);
      setTotalPages(pages.length);
      setCurrentPage(Math.min(initialPage, pages.length));
      setStatus('ready');
    }

    run();
    return () => {
      cancelled = true;
      blobUrls.forEach(u => URL.revokeObjectURL(u));
      epubRenditionRef.current?.destroy();
      epubBookRef.current?.destroy();
    };
  }, [fmt, epubReady, fetchBuffer, initialPage]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const prevPage = useCallback(() => {
    if (fmt === 'pdf')  pageFlipRef.current?.flipPrev();
    if (fmt === 'epub') epubRenditionRef.current?.prev();
    if (fmt === 'txt')  setCurrentPage(p => Math.max(1, p - 1));
  }, [fmt]);

  const nextPage = useCallback(() => {
    if (fmt === 'pdf')  pageFlipRef.current?.flipNext();
    if (fmt === 'epub') epubRenditionRef.current?.next();
    if (fmt === 'txt')  setCurrentPage(p => Math.min(totalPages, p + 1));
  }, [fmt, totalPages]);

  const jumpToPage = useCallback((p: number) => {
    const n = Math.max(1, Math.min(p, totalPages || p));
    if (fmt === 'pdf')  { pageFlipRef.current?.turnToPage(n - 1); setCurrentPage(n); }
    if (fmt === 'epub') epubRenditionRef.current?.display(`epubcfi(/6/${n * 2}!/4)`);
    if (fmt === 'txt')  setCurrentPage(n);
  }, [fmt, totalPages]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextPage();
      else if (e.key === 'ArrowLeft') prevPage();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nextPage, prevPage, onClose]);

  const reader = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#1A0E06', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ height: 50, background: '#0E0805', borderBottom: '1px solid rgba(200,168,75,0.2)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={toolBtn}>← Close</button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: "'Cinzel',serif", fontSize: 13, color: '#C8A84B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.title}
          {book.author && <span style={{ color: 'rgba(200,168,75,0.4)', fontSize: 11 }}> · {book.author}</span>}
        </div>
        {status === 'ready' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <input type="number" min={1} placeholder="pg" title="Jump to page"
              onKeyDown={(e) => { if (e.key === 'Enter') { const p = parseInt((e.target as HTMLInputElement).value); if (!isNaN(p)) jumpToPage(p); (e.target as HTMLInputElement).value = ''; } }}
              style={{ width: 44, padding: '3px 6px', background: 'rgba(10,5,2,0.6)', border: '1px solid rgba(200,168,75,0.2)', borderRadius: 3, color: '#C8A84B', fontFamily: "'Crimson Text',serif", fontSize: 12, outline: 'none', textAlign: 'center' }}
            />
            <span style={{ fontSize: 11, color: 'rgba(200,168,75,0.45)', fontFamily: "'Crimson Text',serif" }}>
              {currentPage}{totalPages > 0 ? ` / ${totalPages}` : ''}
            </span>
          </div>
        )}
        <button onClick={() => setShowBookmark(true)} style={bookmarkBtnS}>🔖</button>
      </div>

      {/* Reader body */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', background: 'radial-gradient(ellipse at center,#3D2210 0%,#1A0E06 100%)' }}>

        {/* Loading overlay */}
        {(status === 'loading' || status === 'rendering') && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(14,8,5,0.96)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontSize: 36, animation: 'candleFlicker 1.5s ease-in-out infinite' }}>🕯️</div>
            <p style={{ fontFamily: "'Cinzel',serif", color: '#C8A84B', fontSize: 15, margin: 0 }}>{loadMsg}</p>
            <p style={{ fontFamily: "'Crimson Text',serif", color: 'rgba(200,168,75,0.3)', fontSize: 12, margin: 0 }}>Large books may take a moment…</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div style={{ maxWidth: 460, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📜</div>
            <p style={{ fontFamily: "'Cinzel',serif", color: '#C8A84B', fontSize: 16, marginBottom: 12 }}>Could Not Open Book</p>
            <p style={{ fontFamily: "'Crimson Text',serif", color: 'rgba(212,196,160,0.65)', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{errorMsg}</p>
            {(book as any).fileUrl && (
              <a href={(book as any).fileUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: 20, color: '#C8A84B', fontSize: 13 }}>Open original link ↗</a>
            )}
          </div>
        )}

        {/* PDF PageFlip */}
        {fmt === 'pdf' && (
          <>
            {status === 'ready' && <button onClick={prevPage} style={{ ...arrowBtnS, left: 8 }}>‹</button>}
            <div ref={flipContainerRef} style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }} />
            {status === 'ready' && <button onClick={nextPage} style={{ ...arrowBtnS, right: 8 }}>›</button>}
          </>
        )}

        {/* EPUB — always in DOM so ref is available immediately, hidden when not epub */}
        <div style={{ display: fmt === 'epub' ? 'contents' : 'none' }}>
          {status === 'ready' && fmt === 'epub' && <button onClick={prevPage} style={{ ...arrowBtnS, left: 8 }}>‹</button>}
          <div ref={epubContainerRef} style={{ width: '100%', height: '100%', background: '#FDFAF0', visibility: fmt === 'epub' && status === 'ready' ? 'visible' : 'hidden', position: fmt === 'epub' ? 'relative' : 'absolute', pointerEvents: fmt === 'epub' ? 'auto' : 'none' }} />
          {status === 'ready' && fmt === 'epub' && <button onClick={nextPage} style={{ ...arrowBtnS, right: 8 }}>›</button>}
        </div>

        {/* TXT */}
        {fmt === 'txt' && status === 'ready' && (
          <>
            <button onClick={prevPage} style={{ ...arrowBtnS, left: 8 }}>‹</button>
            <div style={{ maxWidth: 680, width: '100%', height: '100%', background: '#FDFAF0', padding: '40px 48px', boxSizing: 'border-box', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
              <p style={{ fontFamily: "'Crimson Text',Georgia,serif", fontSize: 17, lineHeight: 1.85, color: '#1A0E05', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {txtPages[currentPage - 1] ?? ''}
              </p>
            </div>
            <button onClick={nextPage} style={{ ...arrowBtnS, right: 8 }}>›</button>
          </>
        )}

        {status === 'ready' && (
          <p style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: 'rgba(200,168,75,0.2)', fontFamily: "'Crimson Text',serif", whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            ← → arrow keys · click edges to turn
          </p>
        )}
      </div>

      {showBookmark && (
        <BookmarkModal book={book} currentPage={currentPage} userId={userId} libraryId={libraryId} onClose={() => setShowBookmark(false)} onJumpTo={jumpToPage} />
      )}

      <style>{`
        @keyframes candleFlicker { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.97)} }
        .stf__parent { background: transparent !important; }
      `}</style>
    </div>
  );

  return createPortal(reader, document.body);
};

const toolBtn: React.CSSProperties       = { background: 'transparent', border: '1px solid rgba(200,168,75,0.2)', color: 'rgba(212,196,160,0.55)', fontFamily: "'Crimson Text',serif", fontSize: 13, padding: '5px 12px', borderRadius: 3, cursor: 'pointer', flexShrink: 0 };
const bookmarkBtnS: React.CSSProperties  = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 14, cursor: 'pointer', flexShrink: 0 };
const arrowBtnS: React.CSSProperties     = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.2)', color: '#C8A84B', fontSize: 36, width: 44, height: 80, borderRadius: 4, cursor: 'pointer', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' };

export default EReader;