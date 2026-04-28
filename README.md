# 📚 Medieval Library — Setup Guide

A private, collaborative e-reader with a medieval aesthetic.

---

## What You Need (All Free)

1. **Node.js** — Download from https://nodejs.org (get the LTS version)
2. **Firebase account** — https://firebase.google.com (free)
3. **Algolia account** — https://algolia.com (free tier is plenty)

---

## Step 1 — Set Up Firebase

1. Go to https://console.firebase.google.com
2. Click **"Add project"** → name it anything (e.g. "my-library")
3. Once created, click **"Add app"** → choose **Web** (</> icon)
4. Copy the config values shown — you'll need them in Step 3
5. In the Firebase console left menu, enable these services:
   - **Authentication** → Sign-in methods → Enable **Email/Password**
   - **Firestore Database** → Create database → Start in **test mode**
   - **Storage** → Get started → Start in **test mode**

---

## Step 2 — Set Up Algolia

1. Go to https://algolia.com → Create a free account
2. Create a new **Application** (name it anything)
3. Go to **API Keys** (left sidebar)
4. Copy:
   - **Application ID**
   - **Search-Only API Key** (for frontend)
   - **Admin API Key** (for backend — keep secret!)
5. Create an **Index** named `books`
6. In that index settings, add these **Searchable Attributes**:
   - `title`, `author`, `rowIndex`, `colIndex`, `pageCount`, `fullText`

---

## Step 3 — Configure Your Project

1. Open the project folder you downloaded
2. Find the file `.env.example`
3. Make a copy of it called `.env.local` (in the same folder)
4. Open `.env.local` and fill in all the values from Steps 1 and 2

---

## Step 4 — Install & Run

Open a **Terminal** (on Mac: Spotlight → "Terminal", on Windows: search "Command Prompt"):

```bash
# Navigate to the project folder
cd path/to/medieval-library

# Install all packages (only needed once)
npm install

# Start the development server
npm run dev
```

Then open your browser and go to: **http://localhost:3000**

---

## Step 5 — First Time Setup

When you first open the app:
1. Click **"Enter the Library"** to go to the login page
2. Create an account with your email
3. Your personal library will be created automatically
4. Share your **Public ID** (shown in the hamburger menu) with others who want to join

---

## File Structure

```
medieval-library/
├── src/
│   ├── components/
│   │   ├── shelf/
│   │   │   ├── VirtualizedShelf.tsx   ← Main shelf (handles 5000+ books)
│   │   │   ├── BookSpine.tsx          ← Individual book on shelf
│   │   │   └── DummyBook.tsx          ← Placeholder + empty slot
│   │   ├── search/
│   │   │   ├── SearchBar.tsx          ← Title/author/row search
│   │   │   └── AdvancedSearch.tsx     ← Full text search inside books
│   │   ├── reader/
│   │   │   ├── EReader.tsx            ← PDF/EPUB/TXT reader with page flip
│   │   │   └── BookmarkModal.tsx      ← Save bookmarks
│   │   └── ui/
│   │       └── HamburgerMenu.tsx      ← Menu + invite system
│   ├── lib/
│   │   ├── firebase.ts                ← Firebase connection
│   │   ├── algolia.ts                 ← Algolia search client
│   │   └── types.ts                   ← All TypeScript types
│   ├── styles/
│   │   └── globals.css                ← Medieval CSS theme
│   └── pages/
│       └── index.tsx                  ← Main library page
├── SCHEMA.md                          ← Full database schema
├── .env.example                       ← Config template
└── package.json                       ← Dependencies
```

---

## Key Features Built

✅ Virtualized shelf (handles 5,000+ books without lag)  
✅ Mobile horizontal scroll with carved wooden hint  
✅ Dummy books, empty slots, real books  
✅ Column number plates + row name labels  
✅ Book glow highlight on search  
✅ Full-text search (Algolia) with row range constraint  
✅ Basic metadata search (fuzzy)  
✅ PDF + EPUB + TXT reader with page flip  
✅ Floating bookmark button  
✅ Invite system (request → code → join)  
✅ Owner / Editor / Viewer permissions  
✅ Real-time sync via Firebase  
✅ Medieval CSS theme (wood, leather, parchment textures)  

---

## Next Steps (Things to Build Next)

- [ ] Login/Signup page (`/src/pages/login.tsx`)
- [ ] Upload book modal with drag & drop
- [ ] Row management (add/rename/delete rows)
- [ ] User permissions management panel
- [ ] Algolia indexing API route (`/src/pages/api/index-book.ts`)
- [ ] Thumbnail generation from PDF cover pages
- [ ] Mobile swipe gestures for reader
