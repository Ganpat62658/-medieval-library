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

type ReaderMode = 'pdf' | 'epub' | 'txt' | null;

const EReader: React.FC<EReaderProps> = ({ book, userId, libraryId, initialPage = 1, onClose }) => {
  const flipContainerRef  = useRef<HTMLDivElement>(null);
  const epubContainerRef  = useRef<HTMLDivElement>(null);
  const pageFlipRef       = useRef<any>(null);
  const epubRenditionRef  = useRef<any>(null);
  const epubBookRef       = useRef<any>(null);
  const [currentPage, setCurrentPage]   = useState(initialPage);
  const [totalPages, setTotalPages]     = useState(0);
  const [status, setStatus]             = useState<'loading'|'rendering'|'ready'|'error'>('loading');
  const [loadMsg, setLoadMsg]           = useState('Opening the tome...');
  const [errorMsg, setErrorMsg]         = useState('');
  const [showBookmark, setShowBookmark] = useState(false);
  const [readerMode, setReaderMode]     = useState<ReaderMode>(null);
  const [txtPages, setTxtPages]         = useState<string[]>([]);
  const [epubReady, setEpubReady]       = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const fmt = (): ReaderMode => {
    const f = (book as any).format as string;
    if (f === 'epub') return 'epub';
    if (f === 'txt')  return 'txt';
    return 'pdf';
  };

  // ── Fetch file bytes ──────────────────────────────────────────────────────
  const getBytes = async (): Promise<ArrayBuffer> => {
    // 1. Try local IndexedDB
    const local = await getLocalBook(book.id).catch(() => null);
    if (local) return local.arrayBuffer();

    const rawUrl = (book as any).fileUrl as string | null;
    if (!rawUrl) throw new Error('No file found. Re-add this book with a valid link.');

    // 2. Google Drive — must use proxy (Drive blocks direct fetch AND converts EPUB to zip)
    if (isDriveLink(rawUrl)) {
      const c = convertDriveLink(rawUrl);
      if (!c) throw new Error('Could not parse Google Drive link.');
      const res = await fetch(`/api/fetch-pdf?url=${encodeURIComponent(c.downloadUrl)}`);
      if (!res.ok) throw new Error(`Could not download file (${res.status}). Make sure the link is set to "Anyone can view".`);
      return res.arrayBuffer();
    }

    // 3. Direct URL — try fetch, fall back to proxy
    try {
      const res = await fetch(rawUrl);
      if (res.ok) return res.arrayBuffer();
    } catch { /* fall through */ }

    const res = await fetch(`/api/fetch-pdf?url=${encodeURIComponent(rawUrl)}`);
    if (!res.ok) throw new Error('Could not download file. Make sure the link is public.');
    return res.arrayBuffer();
  };

  // ── Load PDF ──────────────────────────────────────────────────────────────
  const loadPdf = async (bytes: ArrayBuffer, cancelled: () => boolean) => {
    setLoadMsg('Loading PDF engine...');
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    if (cancelled()) return;

    const numPages = pdf.numPages;
    setTotalPages(numPages);

    const displayW = isMobile
      ? window.innerWidth - 16
      : Math.min(Math.floor((window.innerWidth - 120) / 2), 700);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const pageEls: HTMLElement[] = [];
    for (let i = 1; i <= numPages; i++) {
      if (cancelled()) return;
      if (i % 10 === 0 || i === numPages) setLoadMsg(`Rendering pages... ${i}/${numPages}`);
      const page = await pdf.getPage(i);
      const vp0   = page.getViewport({ scale: 1 });
      const scale = (displayW / vp0.width) * dpr;
      const vp    = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width  = Math.floor(vp.width);
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
    }

    if (cancelled() || !flipContainerRef.current) return;
    setLoadMsg('Binding the book...');
    flipContainerRef.current.innerHTML = '';

    const { PageFlip } = await import('page-flip');
    if (cancelled()) return;

    const fc = pageEls[0]?.firstChild as HTMLCanvasElement | null;
    const pw = fc ? parseInt(fc.style.width)  || Math.floor(fc.width  / dpr) : displayW;
    const ph = fc ? parseInt(fc.style.height) || Math.floor(fc.height / dpr) : 800;

    const flip = new PageFlip(flipContainerRef.current, {
      width: pw, height: ph, size: 'stretch',
      minWidth: isMobile ? 280 : 320, maxWidth: isMobile ? window.innerWidth : 650,
      minHeight: 350, maxHeight: 950,
      drawShadow: true, flippingTime: 650,
      usePortrait: isMobile, autoSize: true,
      showCover: false, mobileScrollSupport: false,
      swipeDistance: 20, clickEventForward: true, startZIndex: 0,
    });
    flip.loadFromHTML(pageEls);
    pageFlipRef.current = flip;
    if (initialPage > 1) setTimeout(() => flip.turnToPage(initialPage - 1), 100);
    flip.on('flip', (e: any) => setCurrentPage(e.data + 1));
    if (!cancelled()) setStatus('ready');
  };

  // ── Load EPUB ─────────────────────────────────────────────────────────────
  // epub.js needs the container to be in the DOM — we use epubReady state
  // to ensure the div is mounted before we try to render into it
  const loadEpub = useCallback(async (bytes: ArrayBuffer, cancelled: () => boolean) => {
    setLoadMsg('Parsing chapters...');

    // Validate it's actually an EPUB (ZIP magic bytes: PK\x03\x04)
    const header = new Uint8Array(bytes.slice(0, 4));
    if (header[0] !== 0x50 || header[1] !== 0x4B) {
      throw new Error(
        'This file does not appear to be a valid EPUB.\n\n' +
        'Google Drive converts EPUB files to ZIP when sharing. ' +
        'Please upload the EPUB file locally instead of using a Drive link.'
      );
    }

    const Epub = (await import('epubjs')).default;
    if (cancelled()) return;

    const blob    = new Blob([bytes], { type: 'application/epub+zip' });
    const blobUrl = URL.createObjectURL(blob);
    const epubBook = Epub(blobUrl);
    epubBookRef.current = epubBook;

    if (!epubContainerRef.current) throw new Error('Reader container not ready.');

    const rendition = epubBook.renderTo(epubContainerRef.current, {
      width:  '100%',
      height: '100%',
      spread: isMobile ? 'none' : 'always',
      flow:   'paginated',
    });
    epubRenditionRef.current = rendition;

    await rendition.display();
    if (cancelled()) { rendition.destroy(); epubBook.destroy(); URL.revokeObjectURL(blobUrl); return; }

    // Jump to initial page after display
    if (initialPage > 1) {
      try { await rendition.display(initialPage); } catch { /* ignore */ }
    }

    rendition.themes.register('medieval', {
      body: {
        'font-family': "'Crimson Text', Georgia, serif !important",
        'font-size': '1.1em !important',
        'line-height': '1.8 !important',
        'color': '#1A0E05 !important',
        'background': '#FDFAF0 !important',
        'padding': '2em !important',
        'max-width': '680px !important',
        'margin': '0 auto !important',
      },
      p:         { 'margin-bottom': '1em !important' },
      'h1,h2,h3':{ 'font-family': "'Cinzel', serif !important", 'color': '#4A2C17 !important' },
    });
    rendition.themes.select('medieval');

    rendition.on('relocated', (loc: any) => {
      const pg = loc?.start?.displayed?.page;
      const total = loc?.start?.displayed?.total;
      if (pg) setCurrentPage(pg);
      if (total) setTotalPages(total);
    });

    if (!cancelled()) setStatus('ready');
    // Cleanup blob URL when book is destroyed
    epubBook.on('destroyed', () => URL.revokeObjectURL(blobUrl));
  }, [isMobile, initialPage]);

  // ── Load TXT ──────────────────────────────────────────────────────────────
  const loadTxt = async (bytes: ArrayBuffer, cancelled: () => boolean) => {
    // Try UTF-8 first, fall back to latin-1 if it has replacement chars
    let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (text.includes('\uFFFD')) {
      text = new TextDecoder('iso-8859-1').decode(bytes);
    }
    // Strip any BOM
    text = text.replace(/^\uFEFF/, '');

    const CHARS = 2500;
    const pages: string[] = [];
    for (let i = 0; i < text.length; i += CHARS) pages.push(text.slice(i, i + CHARS));

    if (cancelled()) return;
    setTxtPages(pages);
    setTotalPages(pages.length);
    setCurrentPage(Math.min(initialPage, pages.length));
    setStatus('ready');
  };

  // ── Main effect — runs on mount ───────────────────────────────────────────
  useEffect(() => {
    let _cancelled = false;
    const cancelled = () => _cancelled;
    const format = fmt();
    setReaderMode(format);

    const run = async () => {
      try {
        setStatus('loading');
        setLoadMsg('Fetching the manuscript...');
        const bytes = await getBytes();
        if (cancelled()) return;

        if (format === 'pdf') {
          setStatus('rendering');
          await loadPdf(bytes, cancelled);
        } else if (format === 'epub') {
          // For EPUB we need the container div in the DOM first
          // setEpubReady triggers a re-render that mounts epubContainerRef
          setEpubReady(true);
          // Store bytes for the second effect to pick up
          (window as any).__epubBytes = bytes;
        } else if (format === 'txt') {
          await loadTxt(bytes, cancelled);
        }
      } catch (err: any) {
        if (cancelled()) return;
        setErrorMsg(err.message ?? 'Unknown error.');
        setStatus('error');
      }
    };

    run();
    return () => {
      _cancelled = true;
      epubRenditionRef.current?.destroy();
      epubBookRef.current?.destroy();
      delete (window as any).__epubBytes;
    };
  }, [book.id]);

  // ── Second effect — runs after epubContainerRef is mounted ───────────────
  useEffect(() => {
    if (!epubReady || !epubContainerRef.current) return;
    let _cancelled = false;
    const cancelled = () => _cancelled;

    const bytes = (window as any).__epubBytes as ArrayBuffer | undefined;
    if (!bytes) return;

    loadEpub(bytes, cancelled).catch((err: any) => {
      if (!_cancelled) { setErrorMsg(err.message ?? 'Could not open EPUB.'); setStatus('error'); }
    });

    return () => { _cancelled = true; };
  }, [epubReady, loadEpub]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const prevPage = useCallback(() => {
    if (readerMode === 'pdf')  pageFlipRef.current?.flipPrev();
    else if (readerMode === 'epub') epubRenditionRef.current?.prev();
    else if (readerMode === 'txt')  setCurrentPage(p => Math.max(1, p - 1));
  }, [readerMode]);

  const nextPage = useCallback(() => {
    if (readerMode === 'pdf')  pageFlipRef.current?.flipNext();
    else if (readerMode === 'epub') epubRenditionRef.current?.next();
    else if (readerMode === 'txt')  setCurrentPage(p => Math.min(totalPages, p + 1));
  }, [readerMode, totalPages]);

  const jumpToPage = useCallback((p: number) => {
    const c = Math.max(1, Math.min(p, totalPages || p));
    if (readerMode === 'pdf') { pageFlipRef.current?.turnToPage(c - 1); setCurrentPage(c); }
    else if (readerMode === 'epub') epubRenditionRef.current?.display(c);
    else if (readerMode === 'txt')  setCurrentPage(c);
  }, [readerMode, totalPages]);

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
              onKeyDown={e => { if (e.key === 'Enter') { const p = parseInt((e.target as HTMLInputElement).value); if (!isNaN(p)) jumpToPage(p); (e.target as HTMLInputElement).value = ''; }}}
              style={{ width: 44, padding: '3px 6px', background: 'rgba(10,5,2,0.6)', border: '1px solid rgba(200,168,75,0.2)', borderRadius: 3, color: '#C8A84B', fontSize: 12, outline: 'none', textAlign: 'center' }}
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

        {(status === 'loading' || status === 'rendering') && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(14,8,5,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontSize: 36, animation: 'candleFlicker 1.5s ease-in-out infinite' }}>🕯️</div>
            <p style={{ fontFamily: "'Cinzel',serif", color: '#C8A84B', fontSize: 15, margin: 0 }}>{loadMsg}</p>
            {readerMode === 'epub' && status === 'loading' && (
              <p style={{ fontFamily: "'Crimson Text',serif", color: 'rgba(200,168,75,0.4)', fontSize: 12, margin: 0, maxWidth: 300, textAlign: 'center' }}>
                Note: EPUB files from Google Drive may not work — use local upload instead.
              </p>
            )}
          </div>
        )}

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

        {/* PDF */}
        {readerMode === 'pdf' && (
          <>
            {status === 'ready' && <button onClick={prevPage} style={{ ...arrowBtnS, left: 8 }}>‹</button>}
            <div ref={flipContainerRef} style={{ visibility: status === 'ready' ? 'visible' : 'hidden', boxShadow: status === 'ready' ? '0 20px 60px rgba(0,0,0,0.8)' : 'none' }} />
            {status === 'ready' && <button onClick={nextPage} style={{ ...arrowBtnS, right: 8 }}>›</button>}
          </>
        )}

        {/* EPUB — always render the container so the ref is available */}
        {readerMode === 'epub' && (
          <>
            {status === 'ready' && <button onClick={prevPage} style={{ ...arrowBtnS, left: 8 }}>‹</button>}
            <div ref={epubContainerRef} style={{ width: '100%', height: '100%', background: '#FDFAF0', visibility: status === 'ready' ? 'visible' : 'hidden' }} />
            {status === 'ready' && <button onClick={nextPage} style={{ ...arrowBtnS, right: 8 }}>›</button>}
          </>
        )}

        {/* TXT */}
        {readerMode === 'txt' && status === 'ready' && (
          <>
            <button onClick={prevPage} style={{ ...arrowBtnS, left: 8 }}>‹</button>
            <div style={{ maxWidth: 680, width: '100%', height: '100%', background: '#FDFAF0', padding: '40px 48px', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', overflow: 'auto' }}>
              <p style={{ fontFamily: "'Crimson Text',Georgia,serif", fontSize: 17, lineHeight: 1.85, color: '#1A0E05', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {txtPages[currentPage - 1] ?? ''}
              </p>
            </div>
            <button onClick={nextPage} style={{ ...arrowBtnS, right: 8 }}>›</button>
          </>
        )}

        {status === 'ready' && (
          <p style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: 'rgba(200,168,75,0.2)', fontFamily: "'Crimson Text',serif", whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            ← → arrow keys · click edges to turn pages
          </p>
        )}
      </div>

      {showBookmark && (
        <BookmarkModal book={book} currentPage={currentPage} userId={userId} libraryId={libraryId}
          onClose={() => setShowBookmark(false)} onJumpTo={jumpToPage} />
      )}

      <style>{`
        @keyframes candleFlicker { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.97)} }
        .stf__parent { background: transparent !important; }
      `}</style>
    </div>
  );

  return createPortal(reader, document.body);
};

const toolBtn: React.CSSProperties = { background: 'transparent', border: '1px solid rgba(200,168,75,0.2)', color: 'rgba(212,196,160,0.55)', fontFamily: "'Crimson Text',serif", fontSize: 13, padding: '5px 12px', borderRadius: 3, cursor: 'pointer', flexShrink: 0 };
const bookmarkBtnS: React.CSSProperties = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 14, cursor: 'pointer', flexShrink: 0 };
const arrowBtnS: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.2)', color: '#C8A84B', fontSize: 36, width: 44, height: 80, borderRadius: 4, cursor: 'pointer', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' };

export default EReader;