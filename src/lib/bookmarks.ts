// src/lib/bookmarks.ts
// All bookmark operations — stored in Firestore top-level collection.
// Fully account-based: syncs across all devices automatically.

import { db } from '@/lib/firebase';
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';

export interface BookmarkData {
  id: string;
  bookId: string;
  libraryId: string;
  bookTitle: string;
  pageNumber: number;
  note: string | null;
  userId: string;
  createdAt: any;
}

// Collection path — flat, simple, covered by existing auth rules
const COL = 'bookmarks';

export async function saveBookmark(
  userId: string,
  bookId: string,
  libraryId: string,
  bookTitle: string,
  pageNumber: number,
  note: string | null
): Promise<void> {
  await addDoc(collection(db, COL), {
    userId,
    bookId,
    libraryId,
    bookTitle,
    pageNumber,
    note: note || null,
    createdAt: serverTimestamp(),
  });
}

export async function getBookmarks(userId: string, bookId: string): Promise<BookmarkData[]> {
  const snap = await getDocs(
    query(
      collection(db, COL),
      where('userId', '==', userId),
      where('bookId', '==', bookId),
      orderBy('pageNumber', 'asc')
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BookmarkData));
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  await deleteDoc(doc(db, COL, bookmarkId));
}
