'use client';
// src/components/shelf/BookSpine.tsx
// Renders an actual uploaded book's spine on the shelf.
// Uses thumbnailUrl (low-res) for performance. High-res loads only when opened.

import React, { useRef, useEffect } from 'react';
import { Book } from '@/lib/types';

interface BookSpineProps {
  book: Book;
  isHighlighted: boolean;
  onClick: () => void;
}

// Generate a consistent color from a string (for books without custom spine)
function stringToColor(str: string): string {
  const colors = [
    '#4A1C0A', '#1A3A2A', '#0A1A3A', '#3A1A4A',
    '#2A3A0A', '#4A2A0A', '#1A2A4A', '#3A0A1A',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const BookSpine: React.FC<BookSpineProps> = ({ book, isHighlighted, onClick }) => {
  const spineRef = useRef<HTMLDivElement>(null);

  // Trigger the CSS glow animation when highlighted
  useEffect(() => {
    if (isHighlighted && spineRef.current) {
      spineRef.current.classList.add('book-highlighted');
      const timer = setTimeout(() => {
        spineRef.current?.classList.remove('book-highlighted');
      }, 1100);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted]);

  const hasSpineImage = !!book.spineTextureUrl;
  const hasThumbnail = !!book.thumbnailUrl;
  const baseColor = stringToColor(book.title);

  return (
    <div
      ref={spineRef}
      className="book-spine leather-texture"
      onClick={onClick}
      data-book-id={book.id}
      role="button"
      tabIndex={0}
      aria-label={`Open ${book.title}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      style={{
        // Use spine image if provided, otherwise leather texture with color
        backgroundImage: hasSpineImage
          ? `url(${book.spineTextureUrl})`
          : hasThumbnail
          ? `url(${book.thumbnailUrl})`
          : undefined,
        backgroundSize: hasThumbnail && !hasSpineImage ? 'cover' : undefined,
        backgroundColor: !hasSpineImage ? baseColor : undefined,
        backgroundPosition: 'center',
      }}
    >
      {/* Gold ornamental lines */}
      <div className="spine-ornament" />
      <div className="spine-ornament" />

      {/* Title */}
      <span className="spine-title">{book.title}</span>

      {/* Author */}
      {book.author && (
        <span className="spine-author">{book.author}</span>
      )}

      {/* Format badge (tiny, bottom of spine) */}
      <span
        style={{
          position: 'absolute',
          top: '6px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '6px',
          color: 'rgba(200, 168, 75, 0.5)',
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {book.format}
      </span>
    </div>
  );
};

export default BookSpine;
