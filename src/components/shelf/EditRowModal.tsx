// src/components/shelf/EditRowModal.tsx
// Lets owners edit a row: rename it, add/remove columns, and set any slot to dummy/empty

import React, { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ShelfRow, SlotType } from '@/lib/types';

interface EditRowModalProps {
  libraryId: string;
  row: ShelfRow;
  onClose: () => void;
}

export default function EditRowModal({ libraryId, row, onClose }: EditRowModalProps) {
  const [rowName, setRowName] = useState(row.name);
  const [slots, setSlots] = useState<Record<string, { type: SlotType; bookId: string | null }>>(
    // Deep copy slots, only keep non-book slots editable (books stay as books)
    Object.fromEntries(
      Object.entries(row.slots).map(([k, v]) => [k, { type: v.type, bookId: v.bookId }])
    )
  );
  const [columnCount, setColumnCount] = useState(row.columnsCount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const currentCount = Object.keys(slots).length;

  // Add columns
  const addColumns = (n: number) => {
    const newSlots = { ...slots };
    const current = Object.keys(newSlots).length;
    for (let i = current; i < current + n; i++) {
      newSlots[String(i)] = { type: 'dummy', bookId: null };
    }
    setSlots(newSlots);
    setColumnCount(current + n);
  };

  // Remove last N columns (only if they're not books)
  const removeColumns = (n: number) => {
    const keys = Object.keys(slots).map(Number).sort((a, b) => b - a);
    const newSlots = { ...slots };
    let removed = 0;
    for (const k of keys) {
      if (removed >= n) break;
      if (newSlots[String(k)].type !== 'book') {
        delete newSlots[String(k)];
        removed++;
      }
    }
    if (removed < n) {
      setError(`Can't remove ${n} columns — some contain books. Remove the books first.`);
      return;
    }
    setError('');
    setSlots(newSlots);
    setColumnCount(Object.keys(newSlots).length);
  };

  // Toggle a single slot between dummy and empty
  const toggleSlot = (key: string) => {
    const current = slots[key];
    if (current.type === 'book') return; // Can't toggle book slots here
    setSlots(prev => ({
      ...prev,
      [key]: { ...current, type: current.type === 'dummy' ? 'empty' : 'dummy' },
    }));
  };

  const handleSave = async () => {
    if (!rowName.trim()) { setError('Row name cannot be empty.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateDoc(doc(db, 'libraries', libraryId, 'rows', row.id), {
        name: rowName.trim(),
        columnsCount: Object.keys(slots).length,
        slots,
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save.');
      setSaving(false);
    }
  };

  const slotEntries = Object.entries(slots).sort(([a], [b]) => parseInt(a) - parseInt(b));

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2 style={titleStyle}>✏️ Edit Row</h2>

        {/* Row name */}
        <div style={field}>
          <label style={label}>ROW NAME</label>
          <input style={input} type="text" value={rowName}
            onChange={(e) => setRowName(e.target.value)} maxLength={40} />
        </div>

        {/* Column count adjuster */}
        <div style={field}>
          <label style={label}>COLUMNS ({Object.keys(slots).length} total)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={smallBtn} onClick={() => removeColumns(5)}>− 5</button>
            <button style={smallBtn} onClick={() => removeColumns(1)}>− 1</button>
            <span style={{ color: '#C8A84B', fontFamily: "'Cinzel', serif", fontSize: 16, minWidth: 30, textAlign: 'center' }}>
              {Object.keys(slots).length}
            </span>
            <button style={smallBtn} onClick={() => addColumns(1)}>+ 1</button>
            <button style={smallBtn} onClick={() => addColumns(5)}>+ 5</button>
          </div>
        </div>

        {/* Slot grid — click to toggle dummy/empty */}
        <div style={field}>
          <label style={label}>SLOT TYPES — click to toggle empty ↔ dummy</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 220, overflowY: 'auto', padding: 4 }}>
            {slotEntries.map(([key, slot]) => (
              <button
                key={key}
                onClick={() => toggleSlot(key)}
                disabled={slot.type === 'book'}
                title={
                  slot.type === 'book' ? 'Contains a book — cannot change'
                  : slot.type === 'dummy' ? 'Click to make empty'
                  : 'Click to add dummy book'
                }
                style={{
                  width: 36, height: 60, borderRadius: 2,
                  border: `1px solid ${
                    slot.type === 'book' ? 'rgba(200,168,75,0.6)'
                    : slot.type === 'empty' ? 'rgba(200,168,75,0.2)'
                    : 'rgba(200,168,75,0.3)'
                  }`,
                  background:
                    slot.type === 'book' ? 'rgba(200,168,75,0.25)'
                    : slot.type === 'empty' ? 'transparent'
                    : 'rgba(74,28,10,0.4)',
                  cursor: slot.type === 'book' ? 'default' : 'pointer',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 2,
                  transition: 'all 0.15s',
                  fontSize: 10,
                }}
              >
                <span style={{ fontSize: 14 }}>
                  {slot.type === 'book' ? '📖' : slot.type === 'empty' ? '·' : '▬'}
                </span>
                <span style={{ fontSize: 7, color: 'rgba(200,168,75,0.5)', fontFamily: 'monospace' }}>
                  {parseInt(key) + 1}
                </span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(212,196,160,0.35)', marginTop: 6 }}>
            📖 = has a book &nbsp;·&nbsp; ▬ = dummy book &nbsp;·&nbsp; · = empty space
          </p>
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button style={{ ...goldBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? '💾 Saving...' : '✓ Save Changes'}
          </button>
          <button style={outlineBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,5,2,0.9)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modal: React.CSSProperties = { background: 'linear-gradient(160deg, #2C1A0E 0%, #1A0E06 100%)', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 8, padding: '28px 26px', maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', maxHeight: '90vh', overflowY: 'auto' };
const titleStyle: React.CSSProperties = { fontFamily: "'Cinzel', serif", fontSize: 20, color: '#C8A84B', margin: '0 0 20px', textAlign: 'center' };
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 };
const label: React.CSSProperties = { fontSize: 10, color: '#C8A84B', letterSpacing: '0.12em', fontFamily: "'Cinzel', serif" };
const input: React.CSSProperties = { background: 'rgba(10,5,2,0.6)', border: '1px solid rgba(200,168,75,0.25)', borderRadius: 4, color: '#F4E8C1', fontFamily: "'Crimson Text', Georgia, serif", fontSize: 15, padding: '10px 14px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const smallBtn: React.CSSProperties = { background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.3)', color: '#C8A84B', fontFamily: "'Cinzel', serif", fontSize: 13, padding: '6px 14px', borderRadius: 4, cursor: 'pointer' };
const errorStyle: React.CSSProperties = { color: '#E57373', fontSize: 13, textAlign: 'center', padding: '8px 12px', background: 'rgba(192,57,43,0.1)', borderRadius: 4, margin: '0 0 12px' };
const goldBtn: React.CSSProperties = { background: 'linear-gradient(180deg, #C8A84B 0%, #A87830 100%)', color: '#1A0E06', fontFamily: "'Cinzel', serif", fontSize: 13, fontWeight: 700, padding: '11px 24px', border: 'none', borderRadius: 4, cursor: 'pointer', flex: 1 };
const outlineBtn: React.CSSProperties = { background: 'transparent', color: 'rgba(212,196,160,0.6)', fontFamily: "'Crimson Text', serif", fontSize: 13, padding: '11px 20px', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 4, cursor: 'pointer' };
