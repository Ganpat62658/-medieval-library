'use client';
// src/components/search/SearchBar.tsx
// Normal search: title, author, pages, row/col — instant fuzzy results

import React, { useState, useRef, useCallback } from 'react';
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [confirm, setConfirm] = useState<SearchMatch | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
      // Skip dialog — open directly
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
    <div style={{ position: 'relative', maxWidth: 540, width: '100%' }}>
      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'rgba(200,168,75,0.4)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
          <input
            style={{ ...inputS, paddingLeft: 34 }}
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => results.length > 0 && setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            placeholder="Search title, author, pages, row-col (e.g. 2-5)..."
          />
          {isSearching && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(200,168,75,0.5)', fontSize: 11 }}>⌛</span>
          )}
        </div>
        <button onClick={onAdvancedToggle} style={advBtn} title="Advanced full-text search">
          ⚗ Search Inside
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#1A0E06', border: '1px solid rgba(200,168,75,0.25)', borderRadius: 5, boxShadow: '0 8px 28px rgba(0,0,0,0.7)', zIndex: 50, overflow: 'hidden' }}>
          {results.slice(0, 8).map(r => (
            <button key={r.bookId} onMouseDown={() => handleSelect(r)} style={dropRow}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,168,75,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#F4E8C1', fontFamily: "'Crimson Text',serif" }}>{r.title}</div>
              <div style={{ fontSize: 11, color: 'rgba(200,168,75,0.55)', marginTop: 2 }}>
                {r.author && `${r.author} · `}
                Row {r.rowIndex + 1} ({r.rowName}) · Col {r.colIndex + 1}
                <span style={{ marginLeft: 6, color: 'rgba(200,168,75,0.35)' }}>— {r.matchReasons.join(', ')}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <div style={overlayS}>
          <div style={dialogS}>
            <p style={dialogTitle}>Found it!</p>
            <p style={dialogBook}>{confirm.title}</p>
            <p style={dialogMeta}>Row {confirm.rowIndex + 1} ({confirm.rowName}) · Column {confirm.colIndex + 1}</p>
            <p style={{ fontSize: 12, color: 'rgba(212,196,160,0.4)', margin: '0 0 18px', fontStyle: 'italic' }}>
              Matched: {confirm.matchReasons.join(', ')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={goldBtn} onClick={() => handleConfirm('open')}>📖 Open Book</button>
              <button style={outlineBtn} onClick={() => handleConfirm('scroll')}>✦ Show on Shelf</button>
            </div>
            <button style={cancelBtn} onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputS: React.CSSProperties = { background: 'rgba(10,5,2,0.6)', border: '1px solid rgba(200,168,75,0.25)', borderRadius: 4, color: '#F4E8C1', fontFamily: "'Crimson Text',Georgia,serif", fontSize: 14, padding: '9px 14px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const advBtn: React.CSSProperties = { background: 'transparent', border: '1px solid rgba(200,168,75,0.25)', color: 'rgba(200,168,75,0.7)', fontFamily: "'Cinzel',serif", fontSize: 11, padding: '0 14px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 };
const dropRow: React.CSSProperties = { display: 'block', width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(200,168,75,0.07)', textAlign: 'left', cursor: 'pointer', transition: 'background 0.1s' };
const overlayS: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,5,2,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const dialogS: React.CSSProperties = { background: 'linear-gradient(160deg,#2C1A0E,#1A0E06)', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 8, padding: '28px 24px', maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 };
const dialogTitle: React.CSSProperties = { fontFamily: "'Cinzel',serif", fontSize: 18, color: '#C8A84B', margin: 0 };
const dialogBook: React.CSSProperties = { fontSize: 15, color: '#F4E8C1', fontFamily: "'Crimson Text',serif", fontWeight: 600, margin: '6px 0 2px', textAlign: 'center' };
const dialogMeta: React.CSSProperties = { fontSize: 12, color: 'rgba(200,168,75,0.5)', margin: '0 0 4px' };
const goldBtn: React.CSSProperties = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', color: '#1A0E06', fontFamily: "'Cinzel',serif", fontSize: 12, fontWeight: 700, padding: '10px 20px', border: 'none', borderRadius: 4, cursor: 'pointer' };
const outlineBtn: React.CSSProperties = { background: 'transparent', color: 'rgba(212,196,160,0.6)', fontFamily: "'Crimson Text',serif", fontSize: 13, padding: '10px 16px', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 4, cursor: 'pointer' };
const cancelBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'rgba(212,196,160,0.3)', fontSize: 12, cursor: 'pointer', marginTop: 6, fontFamily: "'Crimson Text',serif" };