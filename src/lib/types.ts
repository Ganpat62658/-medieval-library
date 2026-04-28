// src/lib/types.ts

export type UserRole = 'owner' | 'editor' | 'viewer';
export type SlotType = 'dummy' | 'empty' | 'book';
export type BookFormat = 'pdf' | 'epub' | 'txt';
export type InviteStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface LibraryMember {
  role: UserRole;
  joinedAt: Date;
  displayName: string;
}

export interface Library {
  id: string;
  ownerId: string;
  name: string;
  totalRows: number;
  columnsPerRow: number;
  members: Record<string, LibraryMember>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlotData {
  type: SlotType;
  bookId: string | null;
}

export interface ShelfRow {
  id: string;
  rowIndex: number;
  name: string;
  columnsCount: number;
  slots: Record<string, SlotData>;
  createdAt: Date;
}

export interface Book {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  uploadedBy: string;
  uploadedAt: Date;
  fileUrl: string;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  backCoverUrl: string | null;
  spineTextureUrl: string | null;
  pageCount: number | null;
  fileSizeBytes: number;
  rowIndex: number;
  colIndex: number;
  algoliaObjectId: string | null;
  searchIndexed: boolean;
}

export interface Bookmark {
  id: string;
  bookId: string;
  libraryId: string;
  title: string;
  pageNumber: number;
  epubCfi: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InviteRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterPublicId: string;
  targetOwnerId: string;
  status: InviteStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface InviteCode {
  id: string;
  code: string;
  generatedBy: string;
  forRequestId: string;
  forRequesterId: string;
  used: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  publicId: string;
  libraryId: string;
  joinedLibraryId: string | null;
  role: UserRole;
  createdAt: Date;
  avatarUrl: string | null;
}

// Search result types
export interface SearchResult {
  bookId: string;
  title: string;
  author: string | null;
  rowIndex: number;
  rowName: string;
  colIndex: number;
  matchType: 'metadata' | 'fulltext';
  snippet?: string;
  pageNumbers?: number[];
}

export interface AlgoliaBookRecord {
  objectID: string;
  libraryId: string;
  title: string;
  author: string | null;
  pageCount: number | null;
  rowIndex: number;
  colIndex: number;
  rowName: string;
  chunkIndex?: number;
  pageStart?: number;
  pageEnd?: number;
  fullText?: string;
}
