'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Book } from '@/lib/types';
import { getLocalBook } from '@/lib/localBooks';
import { convertDriveLink, isDriveLink } from '@/lib/driveHelper';
import BookmarkModal from './BookmarkModal';

interface EReaderProps {
  book: Book;
  userId: string;
  libraryId: string;
  initialPage?: number;
  onClose: () => void;
}

const EReader: React.FC<EReaderProps> = ({ book, userId, libraryId, initialPage = 1, onClose }) => {
  const flipContainerRef = useRef<HTMLDivElement>(null);
  const pageFlipRef = useRef<any>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState<'loading' | 'rendering' | 'ready' | 'error'>('loading');
  const [loadMsg, setLoadMsg] = useState('Opening the tome...');
  const [errorMsg, setErrorMsg] = useState('');
  const [showBookmark, setShowBookmark] = useState(false);
  const isMobileRef = useRef(false);

  useEffect(() => {
    isMobileRef.current = window.innerWidth <= 768;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setStatus('loading');
        setLoadMsg('Opening the tome...');

        // ── 1. Get PDF bytes ──────────────────────────────────────────────
        let pdfData: ArrayBuffer;

        const localFile = await getLocalBook(book.id).catch(() => null);
        if (localFile) {
          setLoadMsg('Reading from your device...');
          pdfData = await localFile.arrayBuffer();
        } else {
          const rawUrl = (book as any).fileUrl as string | null;
          if (!rawUrl) throw new Error('No file found. Re-add this book with a link.');

          setLoadMsg('Fetching the manuscript...');
          let fetchUrl = rawUrl;
          if (isDriveLink(rawUrl)) {
            const converted = convertDriveLink(rawUrl);
            if (!converted) throw new Error('Could not parse Google Drive link.');
            fetchUrl = converted.downloadUrl;
          }

          // Try direct fetch first, then proxy
          let res: Response | null = null;
          try {
            res = await fetch(fetchUrl);
            if (!res.ok) throw new Error('bad status');
          } catch {
            setLoadMsg('Routing through the scriptorium...');
            res = await fetch(`/api/fetch-pdf?url=${encodeURIComponent(fetchUrl)}`);
          }
          if (!res || !res.ok) throw new Error('Could not download the PDF. Make sure the link is set to "Anyone can view".');
          pdfData = await res.arrayBuffer();
        }

        if (cancelled) return;
        setStatus('rendering');
        setLoadMsg('Loading PDF engine...');

        // ── 2. Load PDF.js — worker URL built from actual installed version ──
        const pdfjsLib = await import('pdfjs-dist');
        const version = pdfjsLib.version;

        // Try unpkg first (mirrors exact installed version, always available)
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

        const pdf = await pdfjsLib.getDocument({
          data: new Uint8Array(pdfData),
          useSystemFonts: true,
        }).promise;

        if (cancelled) return;
        const numPages = pdf.numPages;
        setTotalPages(numPages);
        setLoadMsg(`Illuminating ${numPages} pages...`);

        // ── 3. Render all pages to canvases ──────────────────────────────
        const isMobile = isMobileRef.current;

        // Display width per page (how big it appears on screen)
        const displayW = isMobile
          ? window.innerWidth - 16
          : Math.min(Math.floor((window.innerWidth - 120) / 2), 700);

        // Render at 2× device pixel ratio for crisp, readable text
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const pageEls: HTMLElement[] = [];

        for (let i = 1; i <= numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const vp0 = page.getViewport({ scale: 1 });

          // Scale to fill the display width, then multiply by DPR for sharpness
          const scale = (displayW / vp0.width) * dpr;
          const vp = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          // Physical canvas size = high-res
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          // CSS display size = normal — browser scales down sharply
          canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
          canvas.style.height = `${Math.floor(vp.height / dpr)}px`;

          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#FDFAF0';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;

          const wrapper = document.createElement('div');
          wrapper.style.cssText = `
            background:#FDFAF0;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;width:100%;height:100%;
          `;
          wrapper.appendChild(canvas);
          pageEls.push(wrapper);

          if (i % 20 === 0 || i === numPages) {
            setLoadMsg(`Illuminating pages... ${i}/${numPages}`);
          }
        }

        if (cancelled || !flipContainerRef.current) return;
        setLoadMsg('Binding the book...');

        // ── 4. Mount PageFlip ─────────────────────────────────────────────
        flipContainerRef.current.innerHTML = '';

        const { PageFlip } = await import('page-flip');
        if (cancelled) return;

        // PageFlip dimensions must use CSS display size (not physical canvas pixels)
        const firstCanvas = pageEls[0]?.firstChild as HTMLCanvasElement | null;
        const pageW = firstCanvas
          ? parseInt(firstCanvas.style.width) || Math.floor(firstCanvas.width / dpr)
          : displayW;
        const pageH = firstCanvas
          ? parseInt(firstCanvas.style.height) || Math.floor(firstCanvas.height / dpr)
          : 800;

        const flipBook = new PageFlip(flipContainerRef.current, {
          width: pageW,
          height: pageH,
          size: 'stretch',
          minWidth: isMobile ? 280 : 320,
          maxWidth: isMobile ? window.innerWidth : 650,
          minHeight: 350,
          maxHeight: 950,
          drawShadow: true,
          flippingTime: 650,
          usePortrait: isMobile,
          autoSize: true,
          showCover: false,
          mobileScrollSupport: false,
          swipeDistance: 20,
          clickEventForward: true,
          startZIndex: 0,
        });

        flipBook.loadFromHTML(pageEls);
        pageFlipRef.current = flipBook;

        if (initialPage > 1) {
          setTimeout(() => flipBook.turnToPage(initialPage - 1), 100);
        }

        flipBook.on('flip', (e: any) => setCurrentPage(e.data + 1));

        if (!cancelled) setStatus('ready');
      } catch (err: any) {
        if (cancelled) return;
        console.error('EReader:', err);
        setErrorMsg(err.message ?? 'Unknown error opening book.');
        setStatus('error');
      }
    }

    run();
    return () => { cancelled = true; };
  }, [book.id, initialPage]);

  const prevPage = useCallback(() => pageFlipRef.current?.flipPrev(), []);
  const nextPage = useCallback(() => pageFlipRef.current?.flipNext(), []);
  const jumpToPage = useCallback((p: number) => {
    if (!pageFlipRef.current) return;
    const idx = Math.max(0, Math.min(p - 1, totalPages - 1));
    pageFlipRef.current.turnToPage(idx);
    setCurrentPage(idx + 1);
  }, [totalPages]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextPage();
      else if (e.key === 'ArrowLeft') prevPage();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nextPage, prevPage, onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#1A0E06', display: 'flex', flexDirection: 'column' }}>

      {/* Toolbar */}
      <div style={{ height: 50, background: '#0E0805', borderBottom: '1px solid rgba(200,168,75,0.2)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={toolBtn}>← Close</button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: "'Cinzel',serif", fontSize: 13, color: '#C8A84B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.title}
          {book.author && <span style={{ color: 'rgba(200,168,75,0.4)', fontSize: 11 }}> · {book.author}</span>}
        </div>
        {status === 'ready' && (
          <span style={{ fontSize: 11, color: 'rgba(200,168,75,0.45)', fontFamily: "'Crimson Text',serif", flexShrink: 0 }}>
            {currentPage} / {totalPages}
          </span>
        )}
        {/* Jump to page */}
        {status === 'ready' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
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
          </div>
        )}
        <button onClick={() => setShowBookmark(true)} style={bookmarkBtnS}>🔖</button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', background: 'radial-gradient(ellipse at center, #3D2210 0%, #1A0E06 100%)' }}>

        {/* Loading */}
        {(status === 'loading' || status === 'rendering') && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(14,8,5,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontSize: 36, animation: 'candleFlicker 1.5s ease-in-out infinite' }}>🕯️</div>
            <p style={{ fontFamily: "'Cinzel',serif", color: '#C8A84B', fontSize: 15, margin: 0 }}>{loadMsg}</p>
            <p style={{ fontFamily: "'Crimson Text',serif", color: 'rgba(200,168,75,0.35)', fontSize: 12, margin: 0 }}>
              Large books may take a moment...
            </p>
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
                style={{ display: 'inline-block', marginTop: 20, color: '#C8A84B', fontSize: 13, textDecoration: 'underline' }}>
                Open original link ↗
              </a>
            )}
          </div>
        )}

        {/* Prev button */}
        {status === 'ready' && (
          <button onClick={prevPage} style={{ ...arrowBtnS, left: 8 }}>‹</button>
        )}

        {/* PageFlip container */}
        <div ref={flipContainerRef} style={{ visibility: status === 'ready' ? 'visible' : 'hidden', boxShadow: status === 'ready' ? '0 20px 60px rgba(0,0,0,0.8)' : 'none' }} />

        {/* Next button */}
        {status === 'ready' && (
          <button onClick={nextPage} style={{ ...arrowBtnS, right: 8 }}>›</button>
        )}

        {status === 'ready' && (
          <p style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: 'rgba(200,168,75,0.25)', fontFamily: "'Crimson Text',serif", whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            ‹ › arrows · click page edges · swipe to turn
          </p>
        )}
      </div>

      {showBookmark && (
        <BookmarkModal
          book={book}
          currentPage={currentPage}
          userId={userId}
          libraryId={libraryId}
          onClose={() => setShowBookmark(false)}
          onJumpTo={jumpToPage}
        />
      )}

      <style>{`
        @keyframes candleFlicker {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.7; transform:scale(0.97); }
        }
        .stf__parent { background: transparent !important; }
      `}</style>
    </div>
  );
};

const toolBtn: React.CSSProperties = { background: 'transparent', border: '1px solid rgba(200,168,75,0.2)', color: 'rgba(212,196,160,0.55)', fontFamily: "'Crimson Text',serif", fontSize: 13, padding: '5px 12px', borderRadius: 3, cursor: 'pointer', flexShrink: 0 };
const bookmarkBtnS: React.CSSProperties = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 14, cursor: 'pointer', flexShrink: 0 };
const arrowBtnS: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.2)', color: '#C8A84B', fontSize: 36, width: 44, height: 80, borderRadius: 4, cursor: 'pointer', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' };

export default EReader;
