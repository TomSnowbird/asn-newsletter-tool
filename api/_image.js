// ─── Listing image download ───────────────────────────────────────────────────
// Shared by the Vercel function (api/newsletter.js) and the local Express route
// (src/routes/newsletter.js). Fetches a listing photo server-side so the browser
// can save it as a file; the team then uploads it to Constant Contact.
// The leading underscore keeps Vercel from exposing this file as its own endpoint.

// Our own sites — the photo lives under /img/uploads/ on one of these
const OWN_SITES = [
  'americansnowbird.com', 'floridasnowbird.com', 'arizonasnowbird.com', 'texassnowbird.com',
  'southcarolinasnowbird.com', 'alabamasnowbird.com', 'californiasnowbird.com',
  'mississippisnowbird.com', 'nevadasnowbird.com', 'georgiasnowbird.com',
  'louisianasnowbird.com', 'hawaiisnowbird.com', 'snowbirdmexico.com', 'snowbirdcondo.com',
  'snowbirdrentals.com', 'snowbirdbyowner.com', 'monthlyrentalsbyowner.com',
  'monthlybyowner.com', 'longtermbyowner.com', 'boatfriendly.com',
  'petfriendlybyowner.com', 'advertiserental.com',
];

// Outside hosts that property-manager feeds (Vacasa, Track, NextPax, OwnerRez) use for photos
const PARTNER_HOSTS = ['vacasa-units.imgix.net', 'track-pm.s3.amazonaws.com', 'img.nextpax.com', 'uc.orez.io'];

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/avif': '.avif',
};
const TYPE_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_TYPE).map(([t, e]) => [e, t]));
TYPE_BY_EXT['.jpeg'] = 'image/jpeg';
TYPE_BY_EXT['.jfif'] = 'image/jpeg';

// Vercel caps a function's response at 4.5 MB
const MAX_BYTES = 4 * 1024 * 1024;

export class ImageError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const isOwnSite = host => OWN_SITES.some(d => host === d || host === `www.${d}`);

function checkUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new ImageError(400, 'That is not a valid image URL'); }
  if (!/^https?:$/.test(url.protocol)) throw new ImageError(400, 'Image URL must start with http or https');
  const host = url.hostname.toLowerCase();
  if (!isOwnSite(host) && !PARTNER_HOSTS.includes(host)) {
    throw new ImageError(400, `Images from ${host} can't be downloaded here. Open the image in a new tab and save it from there.`);
  }
  return url;
}

/**
 * Fetch a listing photo. Only our own sites and known partner photo hosts are
 * allowed, so this can't be used to fetch arbitrary URLs.
 * Returns { buffer, contentType, filename }.
 */
export async function fetchListingImage(rawUrl, listingId) {
  let url = checkUrl(rawUrl);
  let res;

  // Follow redirects by hand so every hop is re-checked against the allowed hosts
  for (let hop = 0; ; hop++) {
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; ASN-Newsletter-Tool/1.0)' };
    // Lets the tool past the Cloudflare rule that challenges cloud-hosted traffic.
    // Sent to our own sites only — never to outside photo hosts.
    if (process.env.ASN_TOOL_KEY && isOwnSite(url.hostname.toLowerCase())) {
      headers['X-ASN-Tool-Key'] = process.env.ASN_TOOL_KEY;
    }
    res = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const location = res.status >= 300 && res.status < 400 && res.headers.get('location');
    if (!location) break;
    if (hop >= 3) throw new ImageError(502, 'Image redirected too many times');
    url = checkUrl(new URL(location, url).href);
  }

  if (!res.ok) throw new ImageError(502, `Image host returned HTTP ${res.status}`);

  const urlExt = (url.pathname.match(/\.[a-z0-9]{2,5}$/i)?.[0] || '').toLowerCase();
  let contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  // Some photos (.avif, extensionless partner files) come back with no usable type
  if (!contentType.startsWith('image/')) {
    if (contentType.startsWith('text/') || contentType.includes('html') || contentType.includes('xml') || contentType.includes('json')) {
      throw new ImageError(502, 'The image host sent back a web page, not a photo (it may be blocking the tool)');
    }
    contentType = TYPE_BY_EXT[urlExt] || 'image/jpeg';
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new ImageError(502, 'The image host sent back an empty file');
  if (buffer.length > MAX_BYTES) {
    throw new ImageError(413, 'This photo is too large to download through the tool. Open it in a new tab and save it from there.');
  }

  // Name the file by listing ID so it's easy to match photos to listings
  const safeId = String(listingId || 'listing').replace(/[^\w-]/g, '') || 'listing';
  const ext = EXT_BY_TYPE[contentType] || (TYPE_BY_EXT[urlExt] ? urlExt : '.jpg');
  return { buffer, contentType, filename: `${safeId}${ext}` };
}
