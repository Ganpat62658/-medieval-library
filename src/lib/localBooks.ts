// src/lib/localBooks.ts
// Stores book file data locally in IndexedDB using the browser's built-in storage.
// This is completely free, works offline, and has no size limits (beyond device storage).

const DB_NAME = 'medieval-library-books';
const DB_VERSION = 1;
const STORE_NAME = 'books';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'bookId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Save a book file locally
export async function saveBookLocally(bookId: string, file: File): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      bookId,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      file, // Store the actual File object (Blob)
      savedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Get a book file from local storage — returns null if not found
export async function getLocalBook(bookId: string): Promise<File | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(bookId);
      req.onsuccess = () => {
        const record = req.result;
        if (!record) { resolve(null); return; }
        // Reconstruct File from stored Blob
        const file = new File([record.file], record.fileName, { type: record.fileType });
        resolve(file);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// Check if a book exists locally without loading the full file
export async function hasLocalBook(bookId: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count(bookId);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

// Delete a book from local storage
export async function deleteLocalBook(bookId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(bookId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Get a local object URL for a book (for use in readers)
export async function getLocalBookURL(bookId: string): Promise<string | null> {
  const file = await getLocalBook(bookId);
  if (!file) return null;
  return URL.createObjectURL(file);
}

// List all locally stored book IDs
export async function listLocalBooks(): Promise<string[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

// Get storage usage info
export async function getLocalStorageInfo(): Promise<{ books: number; estimatedMB: number }> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const records = req.result ?? [];
        const totalBytes = records.reduce((sum: number, r: any) => sum + (r.fileSize ?? 0), 0);
        resolve({ books: records.length, estimatedMB: Math.round(totalBytes / 1024 / 1024) });
      };
      req.onerror = () => resolve({ books: 0, estimatedMB: 0 });
    });
  } catch {
    return { books: 0, estimatedMB: 0 };
  }
}
