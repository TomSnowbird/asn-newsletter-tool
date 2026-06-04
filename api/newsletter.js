// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(str) {
  return str ? str.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim() : '';
}

async function fetchListingPage(id) {
  const url = `https://www.americansnowbird.com/listings/view/id/${id}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ASN-Newsletter-Tool/1.0)' },
    signal: AbortSignal.timeout(8000) // 8s timeout — safe under Vercel's 10s limit
  });
  if (!res.ok) throw new Error(`Listing page returned HTTP ${res.status}`);
  return res.text();
}

function parseListing(id, html) {
  // ── City ─────────────────────────────────────────────────────────────────────
  let city = '';
  const cityLinkMatch = html.match(/Search\[city\]=([^"&]+)/);
  if (cityLinkMatch) city = decodeURIComponent(cityLinkMatch[1].replace(/\+/g, ' '));

  // ── State ─────────────────────────────────────────────────────────────────────
  let state = '';
  const metaDescMatch = html.match(/name="description"\s+content="([^"]+)"/i);
  if (metaDescMatch) {
    const cityStateMatch = metaDescMatch[1].match(/([A-Za-z\s]+),\s*([A-Za-z\s]+)/);
    if (cityStateMatch) {
      if (!state) state = cityStateMatch[2].trim();
      if (!city)  city  = cityStateMatch[1].trim();
    }
  }

  // ── Property Type ─────────────────────────────────────────────────────────────
  let propertytype = 'Home';
  const pageTitleMatch = html.match(/class="page-title"[^>]*>([^<]+)</);
  if (pageTitleMatch) {
    const t = pageTitleMatch[1];
    if (/condo/i.test(t))                    propertytype = 'Condo';
    else if (/apartment/i.test(t))           propertytype = 'Apartment';
    else if (/villa/i.test(t))               propertytype = 'Villa';
    else if (/townhome|townhouse/i.test(t))  propertytype = 'Townhome';
    else if (/cabin/i.test(t))              propertytype = 'Cabin';
  }

  // ── Beds / Sleeps ─────────────────────────────────────────────────────────────
  const bedsMatch = html.match(/icon-bedrooms"><\/i>\s*(\d+)\s*(?:\(Sleeps\s*(\d+)\))?/);
  const beds = bedsMatch ? parseInt(bedsMatch[1]) : 0;
  let tenants = bedsMatch && bedsMatch[2] ? parseInt(bedsMatch[2]) : 0;
  if (!tenants) {
    const sleepsMatch = html.match(/Sleeps\s+(\d+)/i);
    if (sleepsMatch) tenants = parseInt(sleepsMatch[1]);
  }

  // ── Baths ─────────────────────────────────────────────────────────────────────
  const bathsMatch = html.match(/icon-bathrooms"><\/i>\s*([\d]+(?:\s+1\/2)?)/);
  let baths = 0;
  if (bathsMatch) {
    const b = bathsMatch[1].trim();
    baths = b.includes('1/2')
      ? parseFloat(b.replace('1/2', '').trim() || '0') + 0.5
      : parseFloat(b) || 0;
  }

  // ── Description ───────────────────────────────────────────────────────────────
  const descMatch = html.match(/id="collapseOne"[\s\S]*?<div class="panel-body">([\s\S]*?)<\/div>\s*<\/div>/);
  const amenities_desc = descMatch ? stripHtml(descMatch[1]) : '';

  // ── Rates ─────────────────────────────────────────────────────────────────────
  const rates = [];
  const rateRowPattern = /<tr>\s*<td class="textright">([\d\/]+)\s*-\s*[\d\/]+<\/td>\s*<td[^>]*>.*?<\/td>\s*<td[^>]*>.*?<\/td>\s*<td class="textright">\$?([\d,\.]+)<\/td>/g;
  let rateMatch;
  while ((rateMatch = rateRowPattern.exec(html)) !== null) {
    const parts = rateMatch[1].split('/');
    const monthly = parseFloat(rateMatch[2].replace(',', ''));
    if (parts.length === 3 && monthly) {
      rates.push({ year: parts[2], month: parts[0], monthly });
    }
  }

  // ── Fallback single price ─────────────────────────────────────────────────────
  let price = null;
  if (rates.length === 0) {
    const priceMatch = html.match(/\$\s*([\d,]+)\s*\/[Mm]o/);
    if (priceMatch) price = parseFloat(priceMatch[1].replace(',', ''));
  }

  // ── Main photo ────────────────────────────────────────────────────────────────
  const imgMatch = html.match(/id="property-detail-large"[\s\S]*?<img src='([^']+)'[^>]*alt='main photo'/);
  const mainImageUrl = imgMatch ? imgMatch[1] : null;

  const listing = { id, city, state, propertytype, beds, baths, tenants, amenities_desc, price };
  return { listing, rates, mainImageUrl };
}

// ─── Serverless Handler ───────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Extract listing ID from the URL: /api/newsletter/12345
  const parts = req.url.split('/').filter(Boolean);
  const id = parts[parts.length - 1];

  if (!id || id === 'newsletter') {
    return res.status(400).json({ error: 'Missing listing ID. Use /api/newsletter/{id}' });
  }

  try {
    const html = await fetchListingPage(id);
    const { listing, rates, mainImageUrl } = parseListing(id, html);
    return res.status(200).json({ listing, rates, mainImageUrl });
  } catch (err) {
    console.error(`[Newsletter] Failed to fetch listing ${id}:`, err.message);
    const status = err.name === 'TimeoutError' ? 504 : 404;
    return res.status(status).json({ error: `Could not load listing ${id}: ${err.message}` });
  }
}
