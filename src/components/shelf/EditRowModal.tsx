// src/components/shelf/EditRowModal.tsx
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '@/lib/firebase';
import { doc, updateDoc, deleteDoc, serverTimestamp, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { ShelfRow, SlotType, UserRole } from '@/lib/types';

interface EditRowModalProps {
  libraryId: string;
  row: ShelfRow;
  userRole: UserRole;
  onClose: () => void;
}

export default function EditRowModal({ libraryId, row, userRole, onClose }: EditRowModalProps) {
  const isOwner = userRole === 'owner';

  const [rowName, setRowName] = useState(row.name);
  const [slots, setSlots] = useState<Record<string, { type: SlotType; bookId: string | null }>>(
    Object.fromEntries(
      Object.entries(row.slots).map(([k, v]) => [k, { type: v.type, bookId: v.bookId ?? null }])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set()); // colKeys of selected book slots
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const slotEntries = Object.entries(slots).sort(([a], [b]) => parseInt(a) - parseInt(b));

  // Add columns
  const addColumns = (n: number) => {
    const newSlots = { ...slots };
    const current = Object.keys(newSlots).length;
    for (let i = current; i < current + n; i++) {
      newSlots[String(i)] = { type: 'dummy', bookId: null };
    }
    setSlots(newSlots);
  };

  // Remove last N non-book columns
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
    if (removed < n) { setError(`Can't remove — some columns have books.`); return; }
    setError('');
    setSlots(newSlots);
  };

  // Toggle empty/dummy OR select/deselect book for deletion
  const handleSlotClick = (key: string) => {
    const slot = slots[key];
    if (slot.type === 'book') {
      if (!isOwner) return;
      setSelectedCols(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    } else {
      setSlots(prev => ({
        ...prev,
        [key]: { ...slot, type: slot.type === 'dummy' ? 'empty' : 'dummy' },
      }));
    }
  };

  // Delete selected books + their bookmarks
  const handleDeleteSelected = async () => {
    if (selectedCols.size === 0) return;
    setIsDeleting(true);
    setError('');
    try {
      const batch = writeBatch(db);
      const newSlots = { ...slots };

      for (const colKey of selectedCols) {
        const slot = slots[colKey];
        if (!slot?.bookId) continue;
        const bookId = slot.bookId;

        // Delete book doc
        batch.delete(doc(db, 'libraries', libraryId, 'books', bookId));

        // Delete all bookmarks for this book
        try {
          const bmSnap = await getDocs(query(collection(db, 'bookmarks'), where('bookId', '==', bookId)));
          bmSnap.docs.forEach(d => batch.delete(d.ref));
        } catch { /* bookmarks might not exist */ }

        // Reset slot to dummy
        newSlots[colKey] = { type: 'dummy', bookId: null };
      }

      await batch.commit();
      setSlots(newSlots);
      setSelectedCols(new Set());
      setShowDeleteConfirm(false);
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete.');
    } finally {
      setIsDeleting(false);
    }
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

  const modal = (
    <div style={overlay}>
      <div style={modalStyle}>
        <h2 style={titleStyle}>✏️ Edit Row</h2>

        {/* Owner badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '6px 10px', background: isOwner ? 'rgba(200,168,75,0.08)' : 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(200,168,75,0.15)' }}>
          <span style={{ fontSize: 12, color: isOwner ? '#C8A84B' : 'rgba(212,196,160,0.4)', fontFamily: "'Cinzel',serif" }}>
            {isOwner ? '👑 Owner — can delete books' : `${userRole} — cannot delete books`}
          </span>
        </div>

        {/* Row name */}
        <div style={field}>
          <label style={label}>ROW NAME</label>
          <input style={input} type="text" value={rowName} onChange={e => setRowName(e.target.value)} maxLength={40} />
        </div>

        {/* Column count */}
        <div style={field}>
          <label style={label}>COLUMNS ({Object.keys(slots).length} total)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={smallBtn} onClick={() => removeColumns(5)}>− 5</button>
            <button style={smallBtn} onClick={() => removeColumns(1)}>− 1</button>
            <span style={{ color: '#C8A84B', fontFamily: "'Cinzel',serif", fontSize: 16, minWidth: 30, textAlign: 'center' }}>
              {Object.keys(slots).length}
            </span>
            <button style={smallBtn} onClick={() => addColumns(1)}>+ 1</button>
            <button style={smallBtn} onClick={() => addColumns(5)}>+ 5</button>
          </div>
        </div>

        {/* Slot grid */}
        <div style={field}>
          <label style={label}>
            {isOwner
              ? 'SLOTS — tap book slots to select for deletion, tap others to toggle empty ↔ dummy'
              : 'SLOTS — tap to toggle empty ↔ dummy (books locked)'}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 220, overflowY: 'auto', padding: 4 }}>
            {slotEntries.map(([key, slot]) => {
              const isBook = slot.type === 'book';
              const isSelected = selectedCols.has(key);
              return (
                <button
                  key={key}
                  onClick={() => handleSlotClick(key)}
                  disabled={isBook && !isOwner}
                  style={{
                    width: 36, height: 60, borderRadius: 3, flexShrink: 0,
                    border: isSelected
                      ? '2px solid #E57373'
                      : isBook
                      ? (isOwner ? '1px solid rgba(229,115,115,0.5)' : '1px solid rgba(200,168,75,0.5)')
                      : slot.type === 'empty'
                      ? '1px dashed rgba(200,168,75,0.2)'
                      : '1px solid rgba(200,168,75,0.25)',
                    background: isSelected
                      ? 'rgba(192,57,43,0.3)'
                      : isBook
                      ? (isOwner ? 'rgba(192,57,43,0.15)' : 'rgba(200,168,75,0.2)')
                      : slot.type === 'empty' ? 'transparent' : 'rgba(74,28,10,0.4)',
                    cursor: (isBook && !isOwner) ? 'not-allowed' : 'pointer',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 2,
                    transition: 'all 0.12s',
                    opacity: isDeleting && isSelected ? 0.4 : 1,
                  }}
                  title={
                    isBook
                      ? (isOwner ? (isSelected ? 'Click to deselect' : 'Click to select for deletion') : 'Only owner can delete books')
                      : slot.type === 'dummy' ? 'Click to make empty' : 'Click to make dummy book'
                  }
                >
                  <span style={{ fontSize: 13 }}>
                    {isSelected ? '✓' : isBook ? (isOwner ? '🗑️' : '📖') : slot.type === 'empty' ? '·' : '▬'}
                  </span>
                  <span style={{ fontSize: 7, color: isSelected ? '#E57373' : 'rgba(200,168,75,0.5)', fontFamily: 'monospace' }}>
                    {parseInt(key) + 1}
                  </span>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(212,196,160,0.35)', marginTop: 6 }}>
            {isOwner
              ? '🗑️ = book (tap to select) · ▬ = dummy · · = empty'
              : '📖 = book (locked) · ▬ = dummy · · = empty'}
          </p>
        </div>

        {/* Selection action bar */}
        {isOwner && selectedCols.size > 0 && !showDeleteConfirm && (
          <div style={{ background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(229,115,115,0.35)', borderRadius: 6, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ color: '#E57373', fontSize: 13, margin: 0, fontFamily: "'Cinzel',serif", fontWeight: 700 }}>
              🗑️ {selectedCols.size} book{selectedCols.size !== 1 ? 's' : ''} selected
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ background: '#C0392B', border: 'none', borderRadius: 4, color: '#fff', fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 700, padding: '7px 14px', cursor: 'pointer' }} onClick={() => setShowDeleteConfirm(true)}>
                Delete Selected
              </button>
              <button style={{ background: 'transparent', border: '1px solid rgba(200,168,75,0.2)', borderRadius: 4, color: 'rgba(212,196,160,0.5)', fontFamily: "'Crimson Text',serif", fontSize: 12, padding: '7px 12px', cursor: 'pointer' }} onClick={() => setSelectedCols(new Set())}>
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Final delete confirmation */}
        {showDeleteConfirm && (
          <div style={{ background: 'rgba(192,57,43,0.18)', border: '1px solid rgba(229,115,115,0.5)', borderRadius: 6, padding: '14px 16px' }}>
            <p style={{ color: '#E57373', fontSize: 14, fontFamily: "'Cinzel',serif", margin: '0 0 6px', fontWeight: 700 }}>
              ⚠️ Delete {selectedCols.size} book{selectedCols.size !== 1 ? 's' : ''} permanently?
            </p>
            <p style={{ fontSize: 12, color: 'rgba(212,196,160,0.6)', margin: '0 0 14px', lineHeight: 1.6 }}>
              All saved bookmarks for {selectedCols.size !== 1 ? 'these books' : 'this book'} will also be deleted. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ background: '#C0392B', border: 'none', borderRadius: 4, color: '#fff', fontFamily: "'Cinzel',serif", fontSize: 12, fontWeight: 700, padding: '9px 18px', cursor: 'pointer', opacity: isDeleting ? 0.6 : 1 }} onClick={handleDeleteSelected} disabled={isDeleting}>
                {isDeleting ? '🗑️ Deleting...' : 'Yes, Delete Forever'}
              </button>
              <button style={{ background: 'transparent', border: '1px solid rgba(200,168,75,0.2)', borderRadius: 4, color: 'rgba(212,196,160,0.5)', fontFamily: "'Crimson Text',serif", fontSize: 12, padding: '9px 14px', cursor: 'pointer' }} onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

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

  return createPortal(modal, document.body);
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(10,5,2,0.9)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, touchAction: 'none' };
const modalStyle: React.CSSProperties = { background: 'linear-gradient(160deg,#2C1A0E,#1A0E06)', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 8, padding: '28px 26px', maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 };
const titleStyle: React.CSSProperties = { fontFamily: "'Cinzel',serif", fontSize: 20, color: '#C8A84B', margin: 0, textAlign: 'center' };
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const label: React.CSSProperties = { fontSize: 10, color: '#C8A84B', letterSpacing: '0.12em', fontFamily: "'Cinzel',serif" };
const input: React.CSSProperties = { background: 'rgba(10,5,2,0.6)', border: '1px solid rgba(200,168,75,0.25)', borderRadius: 4, color: '#F4E8C1', fontFamily: "'Crimson Text',Georgia,serif", fontSize: 15, padding: '10px 14px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const smallBtn: React.CSSProperties = { background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.3)', color: '#C8A84B', fontFamily: "'Cinzel',serif", fontSize: 13, padding: '6px 14px', borderRadius: 4, cursor: 'pointer' };
const errorStyle: React.CSSProperties = { color: '#E57373', fontSize: 13, textAlign: 'center', padding: '8px 12px', background: 'rgba(192,57,43,0.1)', borderRadius: 4, margin: 0 };
const goldBtn: React.CSSProperties = { background: 'linear-gradient(180deg,#C8A84B,#A87830)', color: '#1A0E06', fontFamily: "'Cinzel',serif", fontSize: 13, fontWeight: 700, padding: '11px 24px', border: 'none', borderRadius: 4, cursor: 'pointer', flex: 1 };
const outlineBtn: React.CSSProperties = { background: 'transparent', color: 'rgba(212,196,160,0.6)', fontFamily: "'Crimson Text',serif", fontSize: 13, padding: '11px 20px', border: '1px solid rgba(200,168,75,0.3)', borderRadius: 4, cursor: 'pointer' };