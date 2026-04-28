'use client';
// src/components/shelf/DummyBook.tsx
// Placeholder book shown in empty slots. Medieval leather style with dummy title.

import React from 'react';

// Pre-generated dummy titles/authors for visual variety
const DUMMY_DATA: { title: string; author: string }[] = [
  { title: 'Codex Mysteria', author: 'Anon.' },
  { title: 'De Natura Rerum', author: 'Unknown' },
  { title: 'Liber Secretum', author: 'Magister' },
  { title: 'Chronicon', author: 'Scriptor' },
  { title: 'Tractatus', author: 'Monachus' },
  { title: 'Exempla Varia', author: 'Frater' },
  { title: 'Summula', author: 'Clericus' },
  { title: 'Flores Vitae', author: 'Incertus' },
];

const DUMMY_COLORS = [
  '#4A1C0A', '#1A3A2A', '#0A1A3A', '#3A1A4A',
  '#2A2A1A', '#1A1A3A', '#3A2A1A', '#2A1A3A',
];

interface DummyBookProps {
  rowIndex: number;
  colIndex: number;
  onClick: () => void;
}

const DummyBook: React.FC<DummyBookProps> = ({ rowIndex, colIndex, onClick }) => {
  // Deterministic but varied based on position
  const seed = rowIndex * 17 + colIndex * 31;
  const data = DUMMY_DATA[seed % DUMMY_DATA.length];
  const color = DUMMY_COLORS[seed % DUMMY_COLORS.length];

  return (
    <div
      className="book-spine leather-texture"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Empty slot — click to upload a book`}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      style={{
        backgroundColor: color,
        opacity: 0.75,
        cursor: 'pointer',
      }}
    >
      <div className="spine-ornament" />
      <div className="spine-ornament" />
      <span className="spine-title" style={{ color: 'rgba(200, 168, 75, 0.45)' }}>
        {data.title}
      </span>
      <span className="spine-author" style={{ color: 'rgba(200, 168, 75, 0.25)' }}>
        {data.author}
      </span>
    </div>
  );
};

export default DummyBook;


// ─── EmptySlot ─────────────────────────────────────────────────────────────────
// Rendered when a user explicitly marks a slot as empty (no book shown)
interface EmptySlotProps {
  onClick: () => void;
}

export const EmptySlot: React.FC<EmptySlotProps> = ({ onClick }) => {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Empty slot"
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      style={{
        width: 'var(--book-width)',
        height: 'var(--book-height)',
        border: '1px dashed rgba(200, 168, 75, 0.15)',
        borderRadius: '2px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(200, 168, 75, 0.1)',
        fontSize: '18px',
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(200, 168, 75, 0.35)';
        (e.currentTarget as HTMLDivElement).style.color = 'rgba(200, 168, 75, 0.35)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(200, 168, 75, 0.15)';
        (e.currentTarget as HTMLDivElement).style.color = 'rgba(200, 168, 75, 0.1)';
      }}
    >
      +
    </div>
  );
};
