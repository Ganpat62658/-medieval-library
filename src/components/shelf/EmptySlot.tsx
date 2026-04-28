'use client';
// src/components/shelf/EmptySlot.tsx

import React from 'react';

interface EmptySlotProps {
  onClick: () => void;
}

const EmptySlot: React.FC<EmptySlotProps> = ({ onClick }) => {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Empty slot — click to upload a book"
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

export default EmptySlot;
