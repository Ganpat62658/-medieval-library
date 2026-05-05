'use client';
// src/components/reader/EReader.tsx
// Handles PDF (page-flip), EPUB (epub.js scrolling), and TXT (paginated text)

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
  const flipContainerRef = useRef<HTMLDivElement>(null);
  const epubContainerRef = useRef<HTMLDivElement>(null);
  const pageFlipRef      = useRef<any>(null);
  const epubRenditionRef = useRef<any>(null);
  const [currentPage, setCurrentPage]   = useState(initialPage);
  const [totalPages, setTotalPages]     = useState(0);
  const [status, setStatus]             = useState<'loading' | 'rendering' | 'ready' | 'error'>('loading');
  const [loadMsg, setLoadMsg]           = useState('Opening the tome...');
  const [errorMsg, setErrorMsg]         = useState('');
  const [showBookmark, setShowBookmark] = useState(false);
  const [readerMode, setReaderMode]     = useState<ReaderMode>(null);
  const [txtPages, setTxtPages]         = useState<string[]>([]);
  const isMobileRef = useRef(false);

  useEffect(() => { isMobileRef.current = window.innerWidth <= 768; }, []);

  // Detect format from book record
  const getFormat = (): ReaderMode => {
    const fmt = (book as any).format as string | undefined;
    if (fmt === 'epub') return 'epub';
    if (fmt === 'txt')  return 'txt';
    return 'pdf'; // default
  };

  // ── Get file as ArrayBuffer or URL ────────────────────────────────────────
  const getFileData = async (): Promise<{ buffer?: ArrayBuffer; url?: string }> => {
    const localFile = await getLocalBook(book.id).catch(() => null);
    if (localFile) return { buffer: await localFile.arrayBuffer(), url: URL.createObjectURL(localFile) };

    const rawUrl = (book as any).fileUrl as string | null;
    if (!rawUrl) throw new Error('No file found. Re-add this book with a link.');

    let fetchUrl = rawUrl;
    if (isDriveLink(rawUrl)) {
      const c = convertDriveLink(rawUrl);
      if (!c) throw new Error('Could not parse Google Drive link.');
      fetchUrl = c.downloadUrl;
    }

    // Try direct fetch first
    try {
      const res = await fetch(fetchUrl);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        return { buffer, url: fetchUrl };
      }
    } catch { /* fall through to proxy */ }

    // Proxy for CORS
    const res = await fetch(`/api/fetch-pdf?url=${encodeURIComponent(fetchUrl)}`);
    if (!res.ok) throw new Error('Could not download the file. Make sure the link is public.');
    const buffer = await res.arrayBuffer();
    return { buffer, url: fetchUrl };
  };

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    async function run() {
      try {
        setStatus('loading');
        const fmt = getFormat();
        setReaderMode(fmt);

        if (fmt === 'pdf') {
          await loadPdf(cancelled, objectUrls);
        } else if (fmt === 'epub') {
          await loadEpub(cancelled, objectUrls);
        } else if (fmt === 'txt') {
          await loadTxt(cancelled);
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error('EReader:', err);
        setErrorMsg(err.message ?? 'Unknown error opening book.');
        setStatus('error');
      }
    }

    // ── PDF loader ──────────────────────────────────────────────────────────
    async function loadPdf(cancelled: boolean, objectUrls: string[]) {
      setLoadMsg('Loading PDF engine...');
      const { buffer } = await getFileData();
      if (!buffer) throw new Error('Could not load PDF data.');

      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
      if (cancelled) return;

      const numPages = pdf.numPages;
      setTotalPages(numPages);
      setLoadMsg(`Illuminating ${numPages} pages...`);

      const isMobile = isMobileRef.current;
      const displayW = isMobile
        ? window.innerWidth - 16
        : Math.min(Math.floor((window.innerWidth - 120) / 2), 700);
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

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'background:#FDFAF0;display:flex;align-items:center;justify-content:center;overflow:hidden;width:100%;height:100%;';
        wrapper.appendChild(canvas);
        pageEls.push(wrapper);

        if (i % 20 === 0 || i === numPages) setLoadMsg(`Illuminating pages... ${i}/${numPages}`);
      }

      if (cancelled || !flipContainerRef.current) return;
      setLoadMsg('Binding the book...');

      flipContainerRef.current.innerHTML = '';
      const { PageFlip } = await import('page-flip');
      if (cancelled) return;

      const firstCanvas = pageEls[0]?.firstChild as HTMLCanvasElement | null;
      const pageW = firstCanvas ? parseInt(firstCanvas.style.width)  || Math.floor(firstCanvas.width / dpr)  : displayW;
      const pageH = firstCanvas ? parseInt(firstCanvas.style.height) || Math.floor(firstCanvas.height / dpr) : 800;

      const flipBook = new PageFlip(flipContainerRef.current, {
        width: pageW, height: pageH,
        size: 'stretch',
        minWidth: isMobile ? 280 : 320, maxWidth: isMobile ? window.innerWidth : 650,
        minHeight: 350, maxHeight: 950,
        drawShadow: true, flippingTime: 650,
        usePortrait: isMobile, autoSize: true,
        showCover: false, mobileScrollSupport: false,
        swipeDistance: 20, clickEventForward: true, startZIndex: 0,
      });

      flipBook.loadFromHTML(pageEls);
      pageFlipRef.current = flipBook;
      if (initialPage > 1) setTimeout(() => flipBook.turnToPage(initialPage - 1), 100);
      flipBook.on('flip', (e: any) => setCurrentPage(e.data + 1));
      if (!cancelled) setStatus('ready');
    }

    // ── EPUB loader ─────────────────────────────────────────────────────────
    async function loadEpub(cancelled: boolean, objectUrls: string[]) {
      setLoadMsg('Opening the manuscript...');

      const { buffer, url } = await getFileData();
      if (cancelled) return;

      const Epub = (await import('epubjs')).default;
      if (cancelled) return;

      // epub.js can load from a URL or ArrayBuffer
      let epubSource: any = url;
      if (buffer && !url?.startsWith('http')) {
        // local file — use blob URL
        const blob = new Blob([buffer], { type: 'application/epub+zip' });
        const blobUrl = URL.createObjectURL(blob);
        objectUrls.push(blobUrl);
        epubSource = blobUrl;
      }

      const epubBook = Epub(epubSource);
      if (cancelled) { epubBook.destroy(); return; }

      setLoadMsg('Loading chapters...');

      if (!epubContainerRef.current) throw new Error('EPUB container not ready.');

      const rendition = epubBook.renderTo(epubContainerRef.current, {
        width: '100%',
        height: '100%',
        spread: isMobileRef.current ? 'none' : 'always',
        flow: 'paginated',
      });

      epubRenditionRef.current = rendition;

      await rendition.display(initialPage > 1 ? `epubcfi(/6/${initialPage * 2}!/4)` : undefined);
      if (cancelled) { rendition.destroy(); epubBook.destroy(); return; }

      // Get total pages after spine is loaded
      epubBook.ready.then(() => {
        epubBook.locations.generate(1024).then(() => {
          setTotalPages((epubBook.locations as any).length() ?? 0);
        });
      });

      rendition.on('relocated', (loc: any) => {
        setCurrentPage(loc.start.displayed.page ?? 1);
        setTotalPages(prev => Math.max(prev, loc.start.displayed.total ?? 0));
      });

      // Apply medieval parchment theme to EPUB content
      rendition.themes.register('medieval', {
        'body': {
          'font-family': "'Crimson Text', Georgia, serif !important",
          'font-size': '1.1em !important',
          'line-height': '1.8 !important',
          'color': '#1A0E05 !important',
          'background': '#FDFAF0 !important',
          'padding': '2em !important',
        },
        'p': { 'margin-bottom': '1em !important' },
        'h1,h2,h3': { 'font-family': "'Cinzel', serif !important", 'color': '#4A2C17 !important' },
      });
      rendition.themes.select('medieval');

      setStatus('ready');
    }

    // ── TXT loader ──────────────────────────────────────────────────────────
    async function loadTxt(cancelled: boolean) {
      setLoadMsg('Reading the scroll...');
      const { buffer } = await getFileData();
      if (!buffer || cancelled) return;

      const text = new TextDecoder().decode(buffer);
      const CHARS = 2500;
      const pages: string[] = [];
      for (let i = 0; i < text.length; i += CHARS) {
        pages.push(text.slice(i, i + CHARS));
      }

      if (cancelled) return;
      setTxtPages(pages);
      setTotalPages(pages.length);
      setCurrentPage(Math.min(initialPage, pages.length));
      setStatus('ready');
    }

    run();
    return () => {
      cancelled = true;
      objectUrls.forEach(u => URL.revokeObjectURL(u));
      epubRenditionRef.current?.destroy();
    };
  }, [book.id, initialPage]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const prevPage = useCallback(() => {
    if (readerMode === 'pdf') pageFlipRef.current?.flipPrev();
    else if (readerMode === 'epub') epubRenditionRef.current?.prev();
    else if (readerMode === 'txt') setCurrentPage(p => Math.max(1, p - 1));
  }, [readerMode]);

  const nextPage = useCallback(() => {
    if (readerMode === 'pdf') pageFlipRef.current?.flipNext();
    else if (readerMode === 'epub') epubRenditionRef.current?.next();
    else if (readerMode === 'txt') setCurrentPage(p => Math.min(totalPages, p + 1));
  }, [readerMode, totalPages]);

  const jumpToPage = useCallback((p: number) => {
    const clamped = Math.max(1, Math.min(p, totalPages || p));
    if (readerMode === 'pdf') {
      pageFlipRef.current?.turnToPage(clamped - 1);
      setCurrentPage(clamped);
    } else if (readerMode === 'epub') {
      epubRenditionRef.current?.display(`epubcfi(/6/${clamped * 2}!/4)`);
    } else if (readerMode === 'txt') {
      setCurrentPage(clamped);
    }
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
            <input
              type="number" min={1}
              placeholder="pg"
              title="Jump to page"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const p = parseInt((e.target as HTMLInputElement).value);
                  if (!isNaN(p)) jumpToPage(p);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
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

        {/* Loading */}
        {(status === 'loading' || status === 'rendering') && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(14,8,5,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontSize: 36, animation: 'candleFlicker 1.5s ease-in-out infinite' }}>🕯️</div>
            <p style={{ fontFamily: "'Cinzel',serif", color: '#C8A84B', fontSize: 15, margin: 0 }}>{loadMsg}</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div style={{ maxWidth: 440, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📜</div>
            <p style={{ fontFamily: "'Cinzel',serif", color: '#C8A84B', fontSize: 16, marginBottom: 12 }}>Could Not Open Book</p>
            <p style={{ fontFamily: "'Crimson Text',serif", color: 'rgba(212,196,160,0.6)', fontSize: 14, lineHeight: 1.8 }}>{errorMsg}</p>
            {(book as any).fileUrl && (
              <a href={(book as any).fileUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: 20, color: '#C8A84B', fontSize: 13 }}>
                Open original link ↗
              </a>
            )}
          </div>
        )}

        {/* PDF — PageFlip canvas */}
        {readerMode === 'pdf' && (
          <>
            {status === 'ready' && <button onClick={prevPage} style={{ ...arrowBtnS, left: 8 }}>‹</button>}
            <div ref={flipContainerRef} style={{ visibility: status === 'ready' ? 'visible' : 'hidden', boxShadow: status === 'ready' ? '0 20px 60px rgba(0,0,0,0.8)' : 'none' }} />
            {status === 'ready' && <button onClick={nextPage} style={{ ...arrowBtnS, right: 8 }}>›</button>}
          </>
        )}

        {/* EPUB — epub.js renders into this div */}
        {readerMode === 'epub' && (
          <>
            {status === 'ready' && <button onClick={prevPage} style={{ ...arrowBtnS, left: 8 }}>‹</button>}
            <div
              ref={epubContainerRef}
              style={{
                width: '100%', height: '100%',
                background: '#FDFAF0',
                visibility: status === 'ready' ? 'visible' : 'hidden',
              }}
            />
            {status === 'ready' && <button onClick={nextPage} style={{ ...arrowBtnS, right: 8 }}>›</button>}
          </>
        )}

        {/* TXT — plain text paginated */}
        {readerMode === 'txt' && status === 'ready' && (
          <>
            <button onClick={prevPage} style={{ ...arrowBtnS, left: 8 }}>‹</button>
            <div style={{
              maxWidth: 680, width: '100%', height: '100%',
              background: '#FDFAF0', overflow: 'hidden',
              padding: '40px 48px', boxSizing: 'border-box',
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
            }}>
              <p style={{
                fontFamily: "'Crimson Text',Georgia,serif",
                fontSize: 17, lineHeight: 1.85,
                color: '#1A0E05', margin: 0,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {txtPages[currentPage - 1] ?? ''}
              </p>
            </div>
            <button onClick={nextPage} style={{ ...arrowBtnS, right: 8 }}>›</button>
          </>
        )}

        {status === 'ready' && (
          <p style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: 'rgba(200,168,75,0.25)', fontFamily: "'Crimson Text',serif", whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            ← → arrow keys · click edges to turn pages
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

const toolBtn: React.CSSProperties = { background: 'transparent', border: '1px solid rgba(200,168,75,0.2)', color: 'rgba(212,196,160,0.55)', fontFamily: "'Crimson Text',serif", fontSize: 13, padding: '5px 12px', borderRadius: 3, cursor: 'pointer', flexShrink: 0 };
const bookmarkBtnS: React.CSSProperties = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 14, cursor: 'pointer', flexShrink: 0 };
const arrowBtnS: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.2)', color: '#C8A84B', fontSize: 36, width: 44, height: 80, borderRadius: 4, cursor: 'pointer', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' };

export default EReader;