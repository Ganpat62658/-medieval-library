// src/lib/algolia.ts
import algoliasearch from 'algoliasearch';

// 🔍 REPLACE WITH YOUR ALGOLIA CREDENTIALS
// Get them from: https://dashboard.algolia.com → API Keys
const client = algoliasearch(
  process.env.NEXT_PUBLIC_ALGOLIA_APP_ID!,
  process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY! // Search-only key (safe for frontend)
);

// Admin client — only used server-side (API routes) for indexing
export const getAdminClient = () => {
  return algoliasearch(
    process.env.ALGOLIA_APP_ID!,
    process.env.ALGOLIA_ADMIN_KEY! // Never expose this on frontend!
  );
};

export const booksIndex = client.initIndex('books');

export default client;
