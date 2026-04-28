# 📚 Firestore Database Schema — Medieval Library

## Collections Overview

```
/users/{userId}
/libraries/{libraryId}
/libraries/{libraryId}/books/{bookId}
/libraries/{libraryId}/rows/{rowId}
/libraries/{libraryId}/inviteCodes/{codeId}
/libraries/{libraryId}/inviteRequests/{requestId}
/bookmarks/{userId}/items/{bookmarkId}
```

---

## `/users/{userId}`
```json
{
  "uid": "string",
  "displayName": "string",
  "email": "string",
  "publicId": "string (unique, 8-char alphanumeric, auto-generated)",
  "libraryId": "string (ref to /libraries/)",
  "joinedLibraryId": "string | null",
  "role": "owner | editor | viewer",
  "createdAt": "Timestamp",
  "avatarUrl": "string | null"
}
```

---

## `/libraries/{libraryId}`
```json
{
  "ownerId": "string (userId)",
  "name": "string",
  "totalRows": "number",
  "columnsPerRow": "number",
  "members": {
    "{userId}": {
      "role": "owner | editor | viewer",
      "joinedAt": "Timestamp",
      "displayName": "string"
    }
  },
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

---

## `/libraries/{libraryId}/rows/{rowId}`
```json
{
  "rowIndex": "number (0-based, for ordering)",
  "name": "string (displayed at 90° angle on shelf)",
  "columnsCount": "number",
  "slots": {
    "0": { "type": "dummy | empty | book", "bookId": "string | null" },
    "1": { "type": "dummy | empty | book", "bookId": "string | null" }
  },
  "createdAt": "Timestamp"
}
```

---

## `/libraries/{libraryId}/books/{bookId}`
```json
{
  "title": "string (required)",
  "author": "string | null",
  "format": "pdf | epub | txt",
  "uploadedBy": "string (userId)",
  "uploadedAt": "Timestamp",

  "fileUrl": "string (Firebase Storage URL - full file)",
  "thumbnailUrl": "string | null (low-res cover for shelf, ≤50KB)",
  "coverUrl": "string | null (high-res front cover)",
  "backCoverUrl": "string | null",
  "spineTextureUrl": "string | null",

  "pageCount": "number | null",
  "fileSizeBytes": "number",

  "rowIndex": "number",
  "colIndex": "number",

  "algoliaObjectId": "string | null (for unlinking from search index)",

  "searchIndexed": "boolean",
  "searchIndexedAt": "Timestamp | null"
}
```

---

## `/libraries/{libraryId}/inviteRequests/{requestId}`
```json
{
  "requestId": "string",
  "requesterId": "string (userId of User A)",
  "requesterName": "string",
  "requesterPublicId": "string",
  "targetOwnerId": "string (userId of User B)",
  "status": "pending | approved | rejected | expired",
  "createdAt": "Timestamp",
  "resolvedAt": "Timestamp | null"
}
```
> **Rule**: Only ONE pending request per `(requesterId, targetOwnerId)` pair. Enforced by Firestore rules.

---

## `/libraries/{libraryId}/inviteCodes/{codeId}`
```json
{
  "code": "string (one-time 8-char code)",
  "generatedBy": "string (ownerId)",
  "forRequestId": "string",
  "forRequesterId": "string (userId allowed to use this code)",
  "used": "boolean",
  "createdAt": "Timestamp",
  "expiresAt": "Timestamp (24hrs after creation)"
}
```

---

## `/bookmarks/{userId}/items/{bookmarkId}`
```json
{
  "bookmarkId": "string",
  "bookId": "string",
  "libraryId": "string",
  "title": "string (book title, denormalized for display)",
  "pageNumber": "number",
  "epubCfi": "string | null (for EPUB location)",
  "note": "string | null",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

---

## Firestore Security Rules Summary

```
- /users/{userId}: read/write only by matching uid
- /libraries/{libraryId}: 
    read: members only
    write: owner only (structure changes)
    books write: owner + editors
    books delete: owner only
- /bookmarks/{userId}/items: read/write only by matching userId
- /inviteRequests: 
    create: any authenticated user
    read/update: owner of target library
- /inviteCodes:
    read: only the specific requester (forRequesterId)
    write/delete: owner only
```

---

## Algolia Index: `books`
```json
{
  "objectID": "bookId",
  "libraryId": "string",
  "title": "string",
  "author": "string | null",
  "pageCount": "number | null",
  "rowIndex": "number",
  "colIndex": "number",
  "rowName": "string",
  "fullText": "string (chunked — use Algolia's 10KB limit per record strategy)"
}
```
> For full-text search, split book content into chunks of ~9KB per Algolia record, each with `chunkIndex` and `pageStart`/`pageEnd` fields.

---

## Storage Structure (Firebase Storage)
```
/libraries/{libraryId}/books/{bookId}/
    original.{pdf|epub|txt}     ← full file
    cover_front.jpg             ← high-res front cover
    cover_back.jpg              ← high-res back cover  
    spine.jpg                   ← spine texture
    thumbnail.jpg               ← low-res shelf thumbnail (≤50KB)
```
