import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import newsletterRoutes from './routes/newsletter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/newsletter', newsletterRoutes);

// ─── Serve frontend ───────────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✉️  ASN Newsletter Tool running at http://localhost:${PORT}\n`);
});
