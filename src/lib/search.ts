// src/lib/search.ts
// Local search — no external service needed.

import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { ShelfRow, Book } from '@/lib/types';
import { getLocalBook } from '@/lib/localBooks';
import { convertDriveLink, isDriveLink } from '@/lib/driveHelper';

export interface SearchMatch {
  bookId: string;
  title: string;
  author: string | null;
  rowIndex: number;
  colIndex: number;
  rowName: string;
  matchReasons: string[];
  pageMatches?: PageMatch[];
}

export interface PageMatch {
  pageNumber: number;
  snippet: string; // contains [[[highlighted]]] markers
}

export type AdvancedSearchMode = 'phrase' | 'all_words' | 'any_word';

// ── Normalise text for matching ───────────────────────────────────────────────
// PDFs often have broken ligatures, extra spaces, hyphenation etc.
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
    .replace(/-\s+/g, '')        // remove soft-hyphens / line-break hyphens
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim();
}

// Simple fuzzy: exact substring OR 1-char swap for words > 4 chars
function fuzzy(hay: string, needle: string): boolean {
  if (!needle) return false;
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  if (h.includes(n)) return true;
  if (n.length > 4) {
    for (let i = 0; i < n.length - 1; i++) {
      const t = n.slice(0, i) + n[i + 1] + n[i] + n.slice(i + 2);
      if (h.includes(t)) return true;
    }
  }
  return false;
}

// Build a readable snippet with [[[match]]] markers
function buildSnippet(rawText: string, term: string, radius = 90): string {
  const text = rawText.replace(/\s+/g, ' ').trim();
  const lower = normalise(text);
  const termN = normalise(term);
  const idx = lower.indexOf(termN);
  if (idx === -1) return text.slice(0, radius * 2).trim() + '…';
  const start = Math.max(0, idx - radius);
  const end   = Math.min(text.length, idx + term.length + radius);
  let snippet  = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return snippet.replace(re, '[[[$1]]]');
}

// ── Page count matcher ────────────────────────────────────────────────────────
// Supports: "250", "250 pages", ">200", "<300", "~250" (±30), "200-300"
function matchPageCount(pageCount: number | null | undefined, q: string): string | null {
  if (pageCount == null) return null;
  const clean = q.toLowerCase().replace(/\s+/g, '').replace(/pages?/, '').replace(/p$/, '');

  if (/^\d+$/.test(clean) && parseInt(clean) === pageCount) return `${pageCount} pages`;

  const range = clean.match(/^(\d+)-(\d+)$/);
  if (range && pageCount >= parseInt(range[1]) && pageCount <= parseInt(range[2]))
    return `${pageCount} pages (in ${range[1]}–${range[2]})`;

  const gt = clean.match(/^>(\d+)$/);
  if (gt && pageCount > parseInt(gt[1])) return `${pageCount} pages (>${gt[1]})`;

  const lt = clean.match(/^<(\d+)$/);
  if (lt && pageCount < parseInt(lt[1])) return `${pageCount} pages (<${lt[1]})`;

  const approx = clean.match(/^~(\d+)$/);
  if (approx && Math.abs(pageCount - parseInt(approx[1])) <= 30) return `≈${approx[1]} pages`;

  return null;
}

// ── NORMAL SEARCH ─────────────────────────────────────────────────────────────
export async function normalSearch(
  query: string,
  libraryId: string,
  rows: ShelfRow[]
): Promise<SearchMatch[]> {
  if (!query.trim()) return [];
  const q = query.trim();
  const rowMap = new Map(rows.map(r => [r.rowIndex, r.name]));
  const snap = await getDocs(collection(db, 'libraries', libraryId, 'books'));
  const results: SearchMatch[] = [];

  // Row-col shorthand e.g. "2-5" or "2:5"
  const rowColShorthand = q.match(/^(\d+)[-:](\d+)$/);

  snap.docs.forEach(d => {
    const book = { id: d.id, ...d.data() } as Book & { pageCount?: number };
    const reasons: string[] = [];
    const rowName = rowMap.get(book.rowIndex) ?? `Row ${book.rowIndex + 1}`;

    if (fuzzy(book.title, q)) reasons.push('Title');
    if (book.author && fuzzy(book.author, q)) reasons.push('Author');

    // Page count — try both the stored value and query patterns
    const pcReason = matchPageCount((book as any).pageCount, q);
    if (pcReason) reasons.push(pcReason);

    // Row name fuzzy
    if (rowName && fuzzy(rowName, q)) reasons.push('Row name');

    // Row-col shorthand
    if (rowColShorthand) {
      const ri = parseInt(rowColShorthand[1]) - 1;
      const ci = parseInt(rowColShorthand[2]) - 1;
      if (book.rowIndex === ri && book.colIndex === ci) reasons.push('Location');
    }

    // Plain "row X" or "column Y"
    const rowQ = q.match(/^row\s*(\d+)$/i);
    if (rowQ && book.rowIndex === parseInt(rowQ[1]) - 1) reasons.push('Row');
    const colQ = q.match(/^col(?:umn)?\s*(\d+)$/i);
    if (colQ && book.colIndex === parseInt(colQ[1]) - 1) reasons.push('Column');

    if (reasons.length > 0) {
      results.push({ bookId: book.id, title: book.title, author: book.author ?? null, rowIndex: book.rowIndex, colIndex: book.colIndex, rowName, matchReasons: reasons });
    }
  });

  return results.sort((a, b) => {
    const scoreA = (a.matchReasons.includes('Title') ? 3 : 0) + (a.matchReasons.includes('Author') ? 2 : 0) + 1;
    const scoreB = (b.matchReasons.includes('Title') ? 3 : 0) + (b.matchReasons.includes('Author') ? 2 : 0) + 1;
    return scoreB - scoreA;
  });
}

// ── ADVANCED SEARCH ───────────────────────────────────────────────────────────
export interface AdvancedSearchOptions {
  query: string;
  libraryId: string;
  rows: ShelfRow[];
  rowFrom: number;
  rowTo: number;
  mode: AdvancedSearchMode;
  onProgress?: (msg: string) => void;
}

export async function advancedSearch(opts: AdvancedSearchOptions): Promise<SearchMatch[]> {
  const { query, libraryId, rows, rowFrom, rowTo, mode, onProgress } = opts;
  if (!query.trim()) return [];

  const rowMap = new Map(rows.map(r => [r.rowIndex, r.name]));
  const snap = await getDocs(collection(db, 'libraries', libraryId, 'books'));
  const booksInRange = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Book))
    .filter(b => b.rowIndex >= rowFrom && b.rowIndex <= rowTo);

  const results: SearchMatch[] = [];
  let done = 0;

  for (const book of booksInRange) {
    onProgress?.(`Searching "${book.title}" (${++done}/${booksInRange.length})…`);
    try {
      const pageTexts = await extractPdfText(book, libraryId);
      if (!pageTexts) continue;
      const pageMatches = searchPages(pageTexts, query, mode);
      if (pageMatches.length > 0) {
        results.push({
          bookId: book.id,
          title: book.title,
          author: book.author ?? null,
          rowIndex: book.rowIndex,
          colIndex: book.colIndex,
          rowName: rowMap.get(book.rowIndex) ?? `Row ${book.rowIndex + 1}`,
          matchReasons: ['Full text'],
          pageMatches,
        });
      }
    } catch (err) {
      console.warn(`Could not search "${book.title}":`, err);
    }
  }

  return results.sort((a, b) => (b.pageMatches?.length ?? 0) - (a.pageMatches?.length ?? 0));
}

// ── PDF text extraction ───────────────────────────────────────────────────────
async function extractPdfText(book: Book, libraryId: string): Promise<Map<number, string> | null> {
  let pdfData: ArrayBuffer | null = null;

  const localFile = await getLocalBook(book.id).catch(() => null);
  if (localFile) {
    pdfData = await localFile.arrayBuffer();
  } else {
    const rawUrl = (book as any).fileUrl as string | null;
    if (!rawUrl) return null;
    let fetchUrl = rawUrl;
    if (isDriveLink(rawUrl)) {
      const c = convertDriveLink(rawUrl);
      if (!c) return null;
      fetchUrl = c.downloadUrl;
    }
    try {
      const res = await fetch(`/api/fetch-pdf?url=${encodeURIComponent(fetchUrl)}`);
      if (!res.ok) return null;
      pdfData = await res.arrayBuffer();
    } catch { return null; }
  }
  if (!pdfData) return null;

  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData), useSystemFonts: true }).promise;
  const pageTexts = new Map<number, string>();

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join items preserving space between words
    const text = content.items
      .map((item: any) => item.str ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pageTexts.set(i, text);
  }

  // Save page count back to Firestore if missing
  if ((book as any).pageCount == null) {
    try {
      await updateDoc(doc(db, 'libraries', libraryId, 'books', book.id), { pageCount: pdf.numPages });
    } catch { /* ignore */ }
  }

  return pageTexts;
}

// ── Page search ───────────────────────────────────────────────────────────────
function searchPages(pageTexts: Map<number, string>, query: string, mode: AdvancedSearchMode): PageMatch[] {
  const matches: PageMatch[] = [];
  const qNorm = normalise(query);
  const words = qNorm.split(/\s+/).filter(Boolean);

  pageTexts.forEach((rawText, pageNum) => {
    const textNorm = normalise(rawText);
    let matched = false;
    let snippetTerm = query;

    if (mode === 'phrase') {
      // Try exact normalised phrase
      matched = textNorm.includes(qNorm);
      // Also try with all spaces collapsed (handles broken PDF spacing)
      if (!matched) {
        const qNoSpace = qNorm.replace(/\s+/g, '');
        const textNoSpace = textNorm.replace(/\s+/g, '');
        matched = textNoSpace.includes(qNoSpace);
      }
      snippetTerm = query;

    } else if (mode === 'all_words') {
      // Every word must appear — checked independently so order doesn't matter
      matched = words.every(w => textNorm.includes(w));
      // Pick the rarest word for snippet context
      snippetTerm = words.reduce((a, b) =>
        (textNorm.split(a).length - 1) < (textNorm.split(b).length - 1) ? a : b
      , words[0] ?? query);

    } else {
      // any_word — at least one word matches
      const hit = words.find(w => textNorm.includes(w));
      matched = !!hit;
      snippetTerm = hit ?? words[0] ?? query;
    }

    if (matched) {
      matches.push({
        pageNumber: pageNum,
        snippet: buildSnippet(rawText, snippetTerm),
      });
    }
  });

  return matches;
}
