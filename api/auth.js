// ─── Auth Endpoint ────────────────────────────────────────────────────────────

export default function handler(req, res) {
  // ── Login ──
  if (req.method === 'POST') {
    const { password } = req.body || {};
    const APP_PASSWORD = process.env.APP_PASSWORD;

    if (!APP_PASSWORD) {
      return res.status(500).json({ error: 'APP_PASSWORD environment variable is not set.' });
    }

    if (password === APP_PASSWORD) {
      const maxAge = 60 * 60 * 24 * 14; // 14 days
      res.setHeader(
        'Set-Cookie',
        `asn_auth=authorized; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
      );
      return res.status(200).json({ success: true });
    }

    return res.status(401).json({ error: 'Incorrect password.' });
  }

  // ── Logout ──
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'asn_auth=; Path=/; HttpOnly; Max-Age=0');
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
