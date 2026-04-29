'use client';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { normalSearch, SearchMatch } from '@/lib/search';
import { ShelfRow } from '@/lib/types';

interface SearchBarProps {
  libraryId: string;
  rows: ShelfRow[];
  onResultSelect: (match: SearchMatch, action: 'open' | 'scroll') => void;
  onAdvancedToggle: () => void;
  directOpen?: boolean;
}

export default function SearchBar({ libraryId, rows, onResultSelect, onAdvancedToggle, directOpen = false }: SearchBarProps) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen]     = useState(false);
  const [confirm, setConfirm]   = useState<SearchMatch | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click/tap — works on mobile too
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setIsOpen(false); return; }
    setIsSearching(true);
    try {
      const res = await normalSearch(q, libraryId, rows);
      setResults(res);
      setIsOpen(res.length > 0);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  }, [libraryId, rows]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 300);
  };

  const handleSelect = (match: SearchMatch) => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    if (directOpen) {
      onResultSelect(match, 'open');
    } else {
      setConfirm(match);
    }
  };

  const handleConfirm = (action: 'open' | 'scroll') => {
    if (!confirm) return;
    onResultSelect(confirm, action);
    setConfirm(null);
    setQuery('');
    setResults([]);
  };

  return (
    <>
      {/* Search container */}
      <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Input wrapper */}
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(200,168,75,0.45)', fontSize: 15, pointerEvents: 'none', zIndex: 1 }}>🔍</span>
            <input
              ref={inputRef}
              style={inputS}
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={query}
              onChange={handleChange}
              onFocus={() => results.length > 0 && setIsOpen(true)}
              onKeyDown={e => e.key === 'Enter' && results.length > 0 && handleSelect(results[0])}
              placeholder="Search title, author, pages..."
            />
            {isSearching && (
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(200,168,75,0.5)' }}>⌛</span>
            )}
          </div>

          {/* Advanced button */}
          <button
            onClick={onAdvancedToggle}
            style={advBtn}
            title="Search inside books"
          >
            ⚗
          </button>
        </div>

        {/* Dropdown results */}
        {isOpen && results.length > 0 && (
          <div style={dropdownS}>
            {results.slice(0, 8).map(r => (
              <div
                key={r.bookId}
                // Use onPointerDown so it fires before the input's blur on mobile
                onPointerDown={(e) => { e.preventDefault(); handleSelect(r); }}
                style={dropRow}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: '#F4E8C1', fontFamily: "'Crimson Text',serif", lineHeight: 1.3 }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(200,168,75,0.5)', marginTop: 3 }}>
                  {r.author && `${r.author} · `}
                  Row {r.rowIndex + 1} · Col {r.colIndex + 1}
                  <span style={{ color: 'rgba(200,168,75,0.3)', marginLeft: 4 }}>
                    — {r.matchReasons.join(', ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm dialog — rendered in a portal-like fixed overlay that blocks all touches */}
      {confirm && (
        <ConfirmDialog
          match={confirm}
          onOpen={() => handleConfirm('open')}
          onScroll={() => handleConfirm('scroll')}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// Separate component rendered at body level to escape all stacking contexts
function ConfirmDialog({ match, onOpen, onScroll, onCancel }: {
  match: SearchMatch;
  onOpen: () => void;
  onScroll: () => void;
  onCancel: () => void;
}) {
  // Prevent any touch/click from reaching elements below
  const block = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(10,5,2,0.92)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        // Block ALL pointer events from reaching anything below
        touchAction: 'none',
      }}
      onTouchStart={block}
      onTouchEnd={block}
      onMouseDown={block}
      onClick={block}
    >
      <div
        style={{
          background: 'linear-gradient(160deg,#2C1A0E,#1A0E06)',
          border: '1px solid rgba(200,168,75,0.35)',
          borderRadius: 12, padding: '28px 24px',
          maxWidth: 340, width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.95)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}
        onTouchStart={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontFamily: "'Cinzel',serif", fontSize: 17, color: '#C8A84B', margin: 0 }}>Found it!</p>
        <p style={{ fontSize: 15, color: '#F4E8C1', fontFamily: "'Crimson Text',serif", fontWeight: 600, margin: 0, textAlign: 'center' }}>
          {match.title}
        </p>
        <p style={{ fontSize: 12, color: 'rgba(200,168,75,0.4)', margin: '0 0 8px' }}>
          Row {match.rowIndex + 1} · Col {match.colIndex + 1}
        </p>
        <button
          style={cdGold}
          onPointerUp={() => onOpen()}
          onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
        >
          📖 Open Book
        </button>
        <button
          style={cdOutline}
          onPointerUp={() => onScroll()}
          onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); onScroll(); }}
        >
          ✦ Show on Shelf
        </button>
        <button
          style={cdCancel}
          onPointerUp={() => onCancel()}
          onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); onCancel(); }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const cdGold: React.CSSProperties = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', color: '#1A0E06', fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, padding: '13px 20px', border: 'none', borderRadius: 6, cursor: 'pointer', width: '100%', WebkitTapHighlightColor: 'transparent' };
const cdOutline: React.CSSProperties = { background: 'transparent', color: 'rgba(212,196,160,0.7)', fontFamily: "'Crimson Text',serif", fontSize: 14, padding: '12px 20px', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 6, cursor: 'pointer', width: '100%', WebkitTapHighlightColor: 'transparent' };
const cdCancel: React.CSSProperties = { background: 'none', border: 'none', color: 'rgba(212,196,160,0.3)', fontSize: 13, cursor: 'pointer', fontFamily: "'Crimson Text',serif", padding: '8px', width: '100%', WebkitTapHighlightColor: 'transparent' };

const inputS: React.CSSProperties = {
  background: 'rgba(10,5,2,0.7)',
  border: '1px solid rgba(200,168,75,0.3)',
  borderRadius: 6,
  color: '#F4E8C1',
  fontFamily: "'Crimson Text',Georgia,serif",
  fontSize: 16, // 16px prevents iOS zoom on focus
  padding: '10px 36px 10px 34px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  WebkitAppearance: 'none',
};
const advBtn: React.CSSProperties = {
  background: 'rgba(200,168,75,0.08)',
  border: '1px solid rgba(200,168,75,0.25)',
  color: '#C8A84B',
  fontFamily: "'Cinzel',serif",
  fontSize: 16,
  width: 42, height: 42,
  borderRadius: 6,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const dropdownS: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0, right: 0,
  background: '#1A0E06',
  border: '1px solid rgba(200,168,75,0.25)',
  borderRadius: 6,
  boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
  zIndex: 100,
  overflow: 'hidden',
  maxHeight: '60vh',
  overflowY: 'auto',
};
const dropRow: React.CSSProperties = {
  padding: '12px 14px',
  borderBottom: '1px solid rgba(200,168,75,0.07)',
  cursor: 'pointer',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};
const overlayS: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 300,
  background: 'rgba(10,5,2,0.9)',
  backdropFilter: 'blur(6px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24,
};
const dialogS: React.CSSProperties = {
  background: 'linear-gradient(160deg,#2C1A0E,#1A0E06)',
  border: '1px solid rgba(200,168,75,0.3)',
  borderRadius: 10,
  padding: '28px 24px',
  maxWidth: 360, width: '100%',
  boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
};
const goldBtn: React.CSSProperties = {
  background: 'linear-gradient(180deg,#C8A84B,#A87830)',
  color: '#1A0E06', fontFamily: "'Cinzel',serif",
  fontSize: 14, fontWeight: 700,
  padding: '13px 20px', border: 'none',
  borderRadius: 6, cursor: 'pointer', width: '100%',
};
const outlineBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'rgba(212,196,160,0.6)',
  fontFamily: "'Crimson Text',serif", fontSize: 14,
  padding: '12px 20px',
  border: '1px solid rgba(200,168,75,0.3)',
  borderRadius: 6, cursor: 'pointer', width: '100%',
};
const cancelBtn: React.CSSProperties = {
  background: 'none', border: 'none',
  color: 'rgba(212,196,160,0.3)', fontSize: 13,
  cursor: 'pointer', fontFamily: "'Crimson Text',serif",
  padding: '8px', width: '100%',
};