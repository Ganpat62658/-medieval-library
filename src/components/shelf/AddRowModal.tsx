// src/components/shelf/AddRowModal.tsx
import React, { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';

interface AddRowModalProps {
  libraryId: string;
  currentRowCount: number;
  onClose: () => void;
}

export default function AddRowModal({ libraryId, currentRowCount, onClose }: AddRowModalProps) {
  const [rowName, setRowName] = useState('');
  const [columnCount, setColumnCount] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!rowName.trim()) { setError('Please enter a row name.'); return; }
    if (columnCount < 1 || columnCount > 50) { setError('Columns must be between 1 and 50.'); return; }

    setSaving(true);
    setError('');
    try {
      // Build the slots object: all start as 'dummy'
      const slots: Record<string, { type: string; bookId: null }> = {};
      for (let i = 0; i < columnCount; i++) {
        slots[String(i)] = { type: 'dummy', bookId: null };
      }

      // Add the row document
      await addDoc(collection(db, 'libraries', libraryId, 'rows'), {
        rowIndex: currentRowCount,
        name: rowName.trim(),
        columnsCount: columnCount,
        slots,
        createdAt: serverTimestamp(),
      });

      // Update totalRows on the library
      await updateDoc(doc(db, 'libraries', libraryId), {
        totalRows: increment(1),
        updatedAt: serverTimestamp(),
      });

      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to add row. Check Firestore rules.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-modal="true" style={overlay} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <div style={modal}>
        <h2 style={title}>📚 Add a New Shelf Row</h2>
        <p style={subtitle}>Each row holds a set of columns (book slots).</p>

        <div style={field}>
          <label style={label}>ROW NAME</label>
          <input
            style={input}
            type="text"
            placeholder="e.g. Ancient Scrolls, Fiction, Volume I"
            value={rowName}
            onChange={(e) => setRowName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            autoFocus
            maxLength={40}
          />
        </div>

        <div style={field}>
          <label style={label}>NUMBER OF COLUMNS (BOOK SLOTS)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              style={{ ...input, width: 80, textAlign: 'center' }}
              type="number"
              min={1}
              max={50}
              value={columnCount}
              onChange={(e) => setColumnCount(parseInt(e.target.value) || 1)}
            />
            <span style={{ color: 'rgba(212,196,160,0.5)', fontSize: 13 }}>
              = {columnCount} book slot{columnCount !== 1 ? 's' : ''} in this row
            </span>
          </div>
          {/* Visual preview of slots */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 10 }}>
            {Array.from({ length: Math.min(columnCount, 30) }).map((_, i) => (
              <div key={i} style={{
                width: 14, height: 40,
                background: 'rgba(200,168,75,0.2)',
                borderRadius: 2,
                border: '1px solid rgba(200,168,75,0.15)',
              }} />
            ))}
            {columnCount > 30 && (
              <span style={{ color: 'rgba(212,196,160,0.4)', fontSize: 11, alignSelf: 'center' }}>
                +{columnCount - 30} more
              </span>
            )}
          </div>
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button style={goldBtn} onClick={handleAdd} disabled={saving}>
            {saving ? '⌛ Adding...' : '✚ Add Row'}
          </button>
          <button style={outlineBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 99999,
  background: 'rgba(10,5,2,0.88)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
};
const modal: React.CSSProperties = {
  background: 'linear-gradient(160deg, #2C1A0E 0%, #1A0E06 100%)',
  border: '1px solid rgba(200,168,75,0.3)',
  borderRadius: 8, padding: '32px 28px',
  maxWidth: 460, width: '100%',
  boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
};
const title: React.CSSProperties = {
  fontFamily: "'Cinzel', serif", fontSize: 20,
  color: '#C8A84B', margin: '0 0 6px', textAlign: 'center',
};
const subtitle: React.CSSProperties = {
  color: 'rgba(212,196,160,0.5)', fontSize: 13,
  textAlign: 'center', margin: '0 0 24px', fontStyle: 'italic',
};
const field: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18,
};
const label: React.CSSProperties = {
  fontSize: 10, color: '#C8A84B',
  letterSpacing: '0.12em', fontFamily: "'Cinzel', serif",
};
const input: React.CSSProperties = {
  background: 'rgba(10,5,2,0.6)',
  border: '1px solid rgba(200,168,75,0.25)',
  borderRadius: 4, color: '#F4E8C1',
  fontFamily: "'Crimson Text', Georgia, serif",
  fontSize: 15, padding: '10px 14px',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};
const errorStyle: React.CSSProperties = {
  color: '#E57373', fontSize: 13, textAlign: 'center',
  padding: '8px 12px', background: 'rgba(192,57,43,0.1)',
  borderRadius: 4, margin: '0 0 12px',
};
const goldBtn: React.CSSProperties = {
  background: 'linear-gradient(180deg, #C8A84B 0%, #A87830 100%)',
  color: '#1A0E06', fontFamily: "'Cinzel', serif",
  fontSize: 13, fontWeight: 700, padding: '11px 24px',
  border: 'none', borderRadius: 4, cursor: 'pointer', flex: 1,
};
const outlineBtn: React.CSSProperties = {
  background: 'transparent', color: 'rgba(212,196,160,0.6)',
  fontFamily: "'Crimson Text', serif", fontSize: 13,
  padding: '11px 20px', border: '1px solid rgba(200,168,75,0.3)',
  borderRadius: 4, cursor: 'pointer',
};