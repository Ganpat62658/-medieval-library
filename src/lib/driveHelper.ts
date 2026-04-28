// src/lib/driveHelper.ts
// Converts Google Drive share links into direct embeddable/downloadable URLs

export function convertDriveLink(url: string): { embedUrl: string; downloadUrl: string } | null {
  if (!url) return null;

  try {
    const u = new URL(url);

    // Format: https://drive.google.com/file/d/FILE_ID/view
    const fileMatch = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) {
      const id = fileMatch[1];
      return {
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`,
      };
    }

    // Format: https://drive.google.com/open?id=FILE_ID
    const openId = u.searchParams.get('id');
    if (openId) {
      return {
        embedUrl: `https://drive.google.com/file/d/${openId}/preview`,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${openId}`,
      };
    }

    // Format: https://docs.google.com/... (docs viewer)
    if (u.hostname === 'docs.google.com') {
      const docsMatch = u.pathname.match(/\/d\/([^/]+)/);
      if (docsMatch) {
        const id = docsMatch[1];
        return {
          embedUrl: `https://drive.google.com/file/d/${id}/preview`,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`,
        };
      }
    }

    // Dropbox: change dl=0 to dl=1 and raw=0 to raw=1
    if (u.hostname.includes('dropbox.com')) {
      u.searchParams.set('dl', '1');
      const direct = u.toString();
      return { embedUrl: direct, downloadUrl: direct };
    }

    // Already a direct link — use as-is
    return { embedUrl: url, downloadUrl: url };
  } catch {
    return null;
  }
}

export function isDriveLink(url: string): boolean {
  return url.includes('drive.google.com') || url.includes('docs.google.com');
}
