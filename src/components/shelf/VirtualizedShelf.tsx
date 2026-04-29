'use client';
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { forwardRef, useImperativeHandle } from 'react';
import { ShelfRow, Book, SlotType, UserRole } from '@/lib/types';
import BookSpine from './BookSpine';
import DummyBook from './DummyBook';
import EmptySlot from './EmptySlot';

interface VirtualizedShelfProps {
  rows: ShelfRow[];
  books: Record<string, Book>;
  userRole: UserRole;
  highlightedBookId: string | null;
  onBookClick: (book: Book) => void;
  onSlotClick: (rowIndex: number, colIndex: number, slotType: SlotType) => void;
  onEditRow?: (row: ShelfRow) => void;
}

export interface VirtualizedShelfHandle {
  scrollToRowIndex: (rowIndex: number) => void;
  scrollToColumn: (rowIndex: number, colIndex: number) => void;
}

interface ShelfRowProps {
  row: ShelfRow;
  books: Record<string, Book>;
  userRole: UserRole;
  highlightedBookId: string | null;
  onBookClick: (book: Book) => void;
  onSlotClick: (rowIndex: number, colIndex: number, slotType: SlotType) => void;
  onEditRow?: (row: ShelfRow) => void;
  onScrollRef?: (el: HTMLDivElement | null) => void;
}

const ShelfRowComponent: React.FC<ShelfRowProps> = ({ row, books, userRole, highlightedBookId, onBookClick, onSlotClick, onEditRow, onScrollRef }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Forward ref to parent for programmatic horizontal scrolling
  const setScrollRef = React.useCallback((el: HTMLDivElement | null) => {
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    onScrollRef?.(el);
  }, [onScrollRef]);
  const [showHint, setShowHint] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const canEdit = userRole === 'owner' || userRole === 'editor';

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current && scrollRef.current.scrollLeft > 40) setShowHint(false);
  }, []);

  const slots = Object.entries(row.slots).sort(([a], [b]) => parseInt(a) - parseInt(b));

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Row label with edit button */}
        <div style={{ width: 36, background: '#1A0E06', backgroundImage: 'linear-gradient(90deg,rgba(255,255,255,0.04),transparent)', borderRight: '2px solid rgba(200,168,75,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', gap: 4 }}>
          <span style={{ transform: 'rotate(-90deg)', whiteSpace: 'nowrap', fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 600, color: '#C8A84B', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            {row.name}
          </span>
          {/* Edit row button */}
          {canEdit && onEditRow && (
            <button
              onClick={() => onEditRow(row)}
              title="Edit this row"
              style={{ position: 'absolute', bottom: 4, background: 'none', border: 'none', color: 'rgba(200,168,75,0.4)', fontSize: 10, cursor: 'pointer', padding: 2, lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#C8A84B')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,168,75,0.4)')}
            >
              ✎
            </button>
          )}
        </div>

        {/* Scrollable book slots */}
        <div
          ref={setScrollRef} onScroll={handleScroll}
          style={{ display: 'flex', alignItems: 'flex-end', overflowX: isMobile ? 'auto' : 'visible', overflowY: 'visible', paddingLeft: 8, paddingTop: 8, gap: 6, flexWrap: isMobile ? 'nowrap' : 'wrap', flex: 1, msOverflowStyle: 'none', scrollbarWidth: 'none' }}
        >
          {slots.map(([colKey, slot]) => {
            const colIndex = parseInt(colKey);
            const isHighlighted = slot.type === 'book' && slot.bookId === highlightedBookId;
            const book = slot.type === 'book' && slot.bookId ? books[slot.bookId] : null;

            return (
              <div key={colKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ height: 180, display: 'flex', alignItems: 'flex-end' }}>
                  {slot.type === 'book' && book ? (
                    <BookSpine book={book} isHighlighted={isHighlighted} onClick={() => onBookClick(book)} />
                  ) : slot.type === 'empty' ? (
                    <EmptySlot onClick={() => canEdit && onSlotClick(row.rowIndex, colIndex, 'empty')} />
                  ) : (
                    <DummyBook rowIndex={row.rowIndex} colIndex={colIndex} onClick={() => canEdit && onSlotClick(row.rowIndex, colIndex, 'dummy')} />
                  )}
                </div>
                {/* Shelf plank */}
                <div style={{ width: 48, height: 14, background: '#1A0E06', backgroundImage: 'linear-gradient(180deg,rgba(255,255,255,0.07),transparent 20%,transparent 75%,rgba(0,0,0,0.4))', boxShadow: '0 3px 8px rgba(0,0,0,0.5)', borderRadius: 2 }} />
                {/* Column number */}
                <div style={{ width: 48, height: 13, background: '#0E0805', border: '1px solid rgba(200,168,75,0.2)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: 'rgba(200,168,75,0.5)', fontFamily: "'Crimson Text',serif" }}>
                  {row.rowIndex + 1}-{colIndex + 1}
                </div>
              </div>
            );
          })}

          {/* Mobile scroll hint */}
          {isMobile && showHint && (
            <div style={{ width: 28, height: 180, alignSelf: 'flex-end', background: 'linear-gradient(270deg,#1A0E06,#2C1A0E)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid rgba(200,168,75,0.15)', flexShrink: 0 }}>
              <span style={{ color: 'rgba(200,168,75,0.6)', fontSize: 14, animation: 'pulse 2s infinite' }}>›</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const VirtualizedShelf = forwardRef<VirtualizedShelfHandle, VirtualizedShelfProps>(
  ({ rows, books, userRole, highlightedBookId, onBookClick, onSlotClick, onEditRow }, ref) => {
  const virtuosoRef = React.useRef<VirtuosoHandle>(null);

  const rowScrollRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());

  useImperativeHandle(ref, () => ({
    scrollToRowIndex: (rowIndex: number) => {
      virtuosoRef.current?.scrollToIndex({ index: rowIndex, behavior: 'smooth', align: 'center' });
    },
    scrollToColumn: (rowIndex: number, colIndex: number) => {
      // First scroll the virtuoso list to the row
      virtuosoRef.current?.scrollToIndex({ index: rowIndex, behavior: 'smooth', align: 'center' });
      // Then after the row is rendered, scroll horizontally to the column
      setTimeout(() => {
        const scrollEl = rowScrollRefs.current.get(rowIndex);
        if (!scrollEl) return;
        // Each slot is 48px wide + 6px gap = 54px, plus 36px row label
        const slotWidth = 54;
        const targetScrollLeft = colIndex * slotWidth;
        scrollEl.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      }, 500);
    },
  }));

  return (
    <Virtuoso
      ref={virtuosoRef}
      style={{ height: '100%', width: '100%' }}
      totalCount={rows.length}
      overscan={1}
      itemContent={(index) => {
        const row = rows[index];
        if (!row) return null;
        return (
          <ShelfRowComponent
            key={row.id} row={row} books={books} userRole={userRole}
            highlightedBookId={highlightedBookId}
            onBookClick={onBookClick} onSlotClick={onSlotClick}
            onEditRow={onEditRow}
            onScrollRef={(el) => {
              if (el) rowScrollRefs.current.set(row.rowIndex, el);
              else rowScrollRefs.current.delete(row.rowIndex);
            }}
          />
        );
      }}
    />
  );
});

VirtualizedShelf.displayName = 'VirtualizedShelf';
export default VirtualizedShelf;