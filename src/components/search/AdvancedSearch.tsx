'use client';
import React, { useState, useCallback } from 'react';
import { advancedSearch, SearchMatch, AdvancedSearchMode } from '@/lib/search';
import { ShelfRow } from '@/lib/types';

interface AdvancedSearchProps {
  rows: ShelfRow[];
  libraryId: string;
  onResultSelect: (match: SearchMatch, action: 'open' | 'scroll', page?: number) => void;
  onClose: () => void;
}

const MAX_ROWS = 10;

export default function AdvancedSearch({ rows, libraryId, onResultSelect, onClose }: AdvancedSearchProps) {
  const [query, setQuery]     = useState('');
  const [mode, setMode]       = useState<AdvancedSearchMode>('phrase');
  const [rowFrom, setRowFrom] = useState(0);
  const [rowTo, setRowTo]     = useState(Math.min(MAX_ROWS - 1, rows.length - 1));
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError]     = useState('');
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [confirmMatch, setConfirmMatch]   = useState<{ match: SearchMatch; page: number } | null>(null);

  const rangeSize  = rowTo - rowFrom + 1;
  const rangeValid = rowFrom <= rowTo && rangeSize <= MAX_ROWS;

  const handleRowFrom = (v: number) => { setRowFrom(v); if (rowTo - v >= MAX_ROWS) setRowTo(v + MAX_ROWS - 1); };
  const handleRowTo   = (v: number) => { setRowTo(v);   if (v - rowFrom >= MAX_ROWS) setRowFrom(v - MAX_ROWS + 1); };

  const runSearch = useCallback(async () => {
    if (!query.trim() || !rangeValid) return;
    setIsSearching(true); setError(''); setHasSearched(true); setResults([]); setExpandedBooks(new Set());
    try {
      const res = await advancedSearch({ query, libraryId, rows, rowFrom, rowTo, mode, onProgress: setProgressMsg });
      setResults(res);
      // Auto-expand all results if few books found
      if (res.length <= 3) setExpandedBooks(new Set(res.map(r => r.bookId)));
    } catch (err: any) {
      setError(err.message ?? 'Search failed.');
    } finally { setIsSearching(false); setProgressMsg(''); }
  }, [query, libraryId, rows, rowFrom, rowTo, mode, rangeValid]);

  const toggleExpand = (bookId: string) => {
    setExpandedBooks(prev => {
      const next = new Set(prev);
      next.has(bookId) ? next.delete(bookId) : next.add(bookId);
      return next;
    });
  };

  const handlePageClick = (match: SearchMatch, page: number) => {
    setConfirmMatch({ match, page });
  };

  const handleConfirm = (action: 'open' | 'scroll') => {
    if (!confirmMatch) return;
    onResultSelect(confirmMatch.match, action, confirmMatch.page);
    setConfirmMatch(null);
  };

  const renderSnippet = (snippet: string) => {
    const parts = snippet.split(/\[\[\[|\]\]\]/);
    return parts.map((p, i) =>
      i % 2 === 1
        ? <mark key={i} style={{ background: 'rgba(200,168,75,0.35)', color: '#F4E8C1', borderRadius: 2, padding: '0 2px', fontStyle: 'normal' }}>{p}</mark>
        : <span key={i}>{p}</span>
    );
  };

  return (
    <div style={container}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={titleS}>⚗ Search Inside Books</h2>
        <button onClick={onClose} style={closeBtn}>✕</button>
      </div>

      {/* Query */}
      <div style={field}>
        <label style={labelS}>SEARCH QUERY</label>
        <input style={inputS} type="text" value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runSearch()}
          placeholder="Word, phrase, or sentence…" autoFocus />
      </div>

      {/* Mode */}
      <div style={field}>
        <label style={labelS}>SEARCH MODE</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            ['phrase',    '🔍 Exact Phrase', 'Finds the exact wording as typed'],
            ['all_words', '🔗 All Words',    'Page must contain every word (any order)'],
            ['any_word',  '✦ Any Word',      'Page contains at least one of the words'],
          ] as [AdvancedSearchMode, string, string][]).map(([m, label, tip]) => (
            <button key={m} onClick={() => setMode(m)}
              title={tip}
              style={{ ...modeBtn, ...(mode === m ? modeBtnActive : {}) }}>
              {label}
            </button>
          ))}
        </div>
        <p style={hintS}>
          {mode === 'phrase'    && '🔍 Finds the exact phrase as typed — strictest match.'}
          {mode === 'all_words' && '🔗 Every word must appear on the page, in any order.'}
          {mode === 'any_word'  && '✦ At least one word matches — broadest results.'}
        </p>
      </div>

      {/* Row range */}
      <div style={field}>
        <label style={labelS}>SEARCH ROWS (max {MAX_ROWS})</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select style={selectS} value={rowFrom} onChange={e => handleRowFrom(parseInt(e.target.value))}>
            {rows.map(r => <option key={r.id} value={r.rowIndex} style={{ background: '#1A0E06' }}>Row {r.rowIndex + 1}: {r.name}</option>)}
          </select>
          <span style={{ color: '#C8A84B', flexShrink: 0 }}>→</span>
          <select style={selectS} value={rowTo} onChange={e => handleRowTo(parseInt(e.target.value))}>
            {rows.map(r => <option key={r.id} value={r.rowIndex} style={{ background: '#1A0E06' }}>Row {r.rowIndex + 1}: {r.name}</option>)}
          </select>
        </div>
        <p style={{ fontSize: 11, color: rangeValid ? 'rgba(200,168,75,0.4)' : '#E57373', margin: '4px 0 0' }}>
          {rangeValid ? `${rangeSize} row${rangeSize !== 1 ? 's' : ''} selected` : `Too many rows — max ${MAX_ROWS}`}
        </p>
      </div>

      {/* Search button */}
      <button style={{ ...goldBtn, opacity: (!query.trim() || !rangeValid || isSearching) ? 0.5 : 1 }}
        onClick={runSearch} disabled={!query.trim() || !rangeValid || isSearching}>
        {isSearching ? `⌛ ${progressMsg || 'Searching…'}` : '⚗ Search Inside Books'}
      </button>

      {error && <p style={{ color: '#E57373', fontSize: 12, textAlign: 'center', margin: 0 }}>{error}</p>}

      {/* Results */}
      {hasSearched && !isSearching && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.length === 0
            ? <p style={{ textAlign: 'center', color: 'rgba(212,196,160,0.35)', fontStyle: 'italic', padding: '16px 0' }}>No matches found.</p>
            : <>
                <p style={{ fontSize: 11, color: 'rgba(200,168,75,0.45)', margin: 0 }}>
                  Found in {results.length} book{results.length !== 1 ? 's' : ''} — click any page to open
                </p>
                {results.map(match => {
                  const expanded = expandedBooks.has(match.bookId);
                  const pm = match.pageMatches ?? [];
                  const visible = expanded ? pm : pm.slice(0, 3);
                  const hidden  = pm.length - 3;
                  return (
                    <div key={match.bookId} style={resultCard}>
                      {/* Book header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: '#C8A84B' }}>{match.title}</span>
                          {match.author && <span style={{ fontSize: 11, color: 'rgba(200,168,75,0.4)', marginLeft: 6 }}>by {match.author}</span>}
                          <br />
                          <span style={{ fontSize: 10, color: 'rgba(200,168,75,0.3)' }}>
                            Row {match.rowIndex + 1} ({match.rowName}) · Col {match.colIndex + 1} · {pm.length} page{pm.length !== 1 ? 's' : ''} matched
                          </span>
                        </div>
                        <button onClick={() => onResultSelect(match, 'scroll')} style={shelfBtn} title="Highlight on shelf">✦</button>
                      </div>

                      {/* Page matches */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {visible.map(pm => (
                          <button key={pm.pageNumber} onClick={() => handlePageClick(match, pm.pageNumber)}
                            style={pageBtn}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(200,168,75,0.45)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(200,168,75,0.1)')}>
                            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: '#C8A84B', flexShrink: 0 }}>
                              p.{pm.pageNumber}
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(212,196,160,0.55)', lineHeight: 1.6, textAlign: 'left' }}>
                              {renderSnippet(pm.snippet)}
                            </span>
                          </button>
                        ))}

                        {/* Expand / collapse toggle */}
                        {pm.length > 3 && (
                          <button onClick={() => toggleExpand(match.bookId)} style={expandBtn}>
                            {expanded
                              ? `▲ Show fewer`
                              : `▼ Show all ${pm.length} matches (${hidden} more)`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
          }
        </div>
      )}

      {/* Open-to-page confirm */}
      {confirmMatch && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,5,2,0.96)', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12, textAlign: 'center' }}>
          <p style={{ fontFamily: "'Cinzel',serif", color: '#C8A84B', fontSize: 16, margin: 0 }}>Open to this page?</p>
          <p style={{ color: '#F4E8C1', fontSize: 14, margin: 0, fontWeight: 600 }}>{confirmMatch.match.title}</p>
          <p style={{ color: 'rgba(200,168,75,0.5)', fontSize: 13, margin: 0 }}>Page {confirmMatch.page}</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button style={goldBtn} onClick={() => handleConfirm('open')}>📖 Open Book Here</button>
            <button style={outlineBtn} onClick={() => handleConfirm('scroll')}>✦ Show on Shelf</button>
          </div>
          <button style={{ background:'none', border:'none', color:'rgba(212,196,160,0.3)', fontSize:12, cursor:'pointer', fontFamily:"'Crimson Text',serif" }}
            onClick={() => setConfirmMatch(null)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

const container: React.CSSProperties = { background: 'linear-gradient(160deg,#2C1A0E,#1A0E06)', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 6, padding: 22, maxWidth: 600, width: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: 12, color: '#F4E8C1', position: 'relative', overflow: 'hidden' };
const titleS: React.CSSProperties      = { fontFamily:"'Cinzel',serif", fontSize:17, color:'#C8A84B', margin:0 };
const closeBtn: React.CSSProperties   = { background:'none', border:'none', color:'rgba(212,196,160,0.4)', fontSize:18, cursor:'pointer', padding:0 };
const field: React.CSSProperties      = { display:'flex', flexDirection:'column', gap:6 };
const labelS: React.CSSProperties     = { fontSize:10, color:'#C8A84B', letterSpacing:'0.12em', fontFamily:"'Cinzel',serif" };
const inputS: React.CSSProperties     = { background:'rgba(10,5,2,0.6)', border:'1px solid rgba(200,168,75,0.25)', borderRadius:4, color:'#F4E8C1', fontFamily:"'Crimson Text',Georgia,serif", fontSize:14, padding:'9px 14px', outline:'none', width:'100%', boxSizing:'border-box' };
const selectS: React.CSSProperties    = { ...inputS, flex:1, padding:'7px 10px', fontSize:12 } as React.CSSProperties;
const modeBtn: React.CSSProperties    = { background:'transparent', border:'1px solid rgba(200,168,75,0.2)', borderRadius:4, color:'rgba(212,196,160,0.45)', fontFamily:"'Cinzel',serif", fontSize:10, padding:'6px 12px', cursor:'pointer' };
const modeBtnActive: React.CSSProperties = { background:'rgba(200,168,75,0.15)', borderColor:'rgba(200,168,75,0.5)', color:'#C8A84B' };
const hintS: React.CSSProperties      = { fontSize:11, color:'rgba(200,168,75,0.35)', margin:0, fontStyle:'italic' };
const goldBtn: React.CSSProperties    = { background:'linear-gradient(180deg,#C8A84B,#A87830)', color:'#1A0E06', fontFamily:"'Cinzel',serif", fontSize:12, fontWeight:700, padding:'11px', border:'none', borderRadius:4, cursor:'pointer', width:'100%' };
const outlineBtn: React.CSSProperties = { background:'transparent', color:'rgba(212,196,160,0.6)', fontFamily:"'Crimson Text',serif", fontSize:13, padding:'10px 16px', border:'1px solid rgba(200,168,75,0.3)', borderRadius:4, cursor:'pointer' };
const resultCard: React.CSSProperties = { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(200,168,75,0.12)', borderRadius:5, padding:'12px 12px' };
const shelfBtn: React.CSSProperties   = { background:'transparent', border:'1px solid rgba(200,168,75,0.2)', borderRadius:3, color:'rgba(200,168,75,0.6)', fontFamily:"'Cinzel',serif", fontSize:12, padding:'3px 8px', cursor:'pointer', flexShrink:0 };
const pageBtn: React.CSSProperties    = { display:'flex', alignItems:'flex-start', gap:8, background:'rgba(0,0,0,0.2)', border:'1px solid rgba(200,168,75,0.1)', borderRadius:4, padding:'7px 10px', cursor:'pointer', width:'100%', transition:'border-color 0.15s', textAlign:'left' };
const expandBtn: React.CSSProperties  = { background:'transparent', border:'1px dashed rgba(200,168,75,0.2)', borderRadius:3, color:'rgba(200,168,75,0.5)', fontFamily:"'Cinzel',serif", fontSize:10, padding:'6px', cursor:'pointer', width:'100%', marginTop:2 };
