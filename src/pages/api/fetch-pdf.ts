// src/pages/api/fetch-pdf.ts
// Server-side proxy to fetch PDFs from Google Drive / Dropbox without CORS issues.
// The browser can't fetch Drive files directly due to CORS — this runs on the server.

import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    responseLimit: '50mb', // Allow large PDFs
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Only allow Google Drive and Dropbox URLs for security
  const allowed = ['drive.google.com', 'docs.google.com', 'dropbox.com', 'dl.dropboxusercontent.com'];
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Also allow direct PDF URLs
  const isAllowed = allowed.some(d => hostname.includes(d)) || url.endsWith('.pdf');
  if (!isAllowed) {
    return res.status(403).json({ error: 'URL not allowed' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MedievalLibrary/1.0)',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream error: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') ?? 'application/pdf';
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('PDF proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch PDF: ' + (err.message ?? 'unknown error') });
  }
}
