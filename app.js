require('dotenv').config();
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const QRCode = require('qrcode');
const basicAuth = require('express-basic-auth');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || 'https://redirects.sweetsmilingsoul.com').replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
const db = new DatabaseSync(path.join(__dirname, 'redirects.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT    UNIQUE NOT NULL,
    destination TEXT    NOT NULL,
    created_at  TEXT    DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS clicks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id    INTEGER NOT NULL,
    clicked_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (link_id) REFERENCES links(id)
  );
`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const QR_DIR = path.join(__dirname, 'qrcodes');
if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR);

const RESERVED_SLUGS = new Set(['admin', 'stats', 'qrcodes', 'favicon.ico', 'robots.txt']);

function normalizeSlug(raw) {
  return raw.replace(/^\/+/, '').trim().toLowerCase();
}

async function generateQR(slug) {
  const url = `${BASE_URL}/${slug}`;
  await QRCode.toFile(path.join(QR_DIR, `${slug}.png`), url, {
    width: 500,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' }
  });
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------
const SHARED_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f4f2; color: #222; }
  .topbar { background: #fff; border-bottom: 1px solid #e0ddd8; padding: 0 32px; display: flex; align-items: center; gap: 24px; height: 52px; }
  .topbar-brand { font-size: 1rem; font-weight: 700; color: #7c4fa0; text-decoration: none; white-space: nowrap; }
  .topbar-brand span { color: #aaa; font-weight: 400; font-size: 0.82rem; margin-left: 6px; }
  .topbar-nav { display: flex; gap: 4px; align-items: center; }
  .nav-link { padding: 6px 14px; border-radius: 6px; font-size: 0.88rem; font-weight: 500; text-decoration: none; color: #555; }
  .nav-link:hover { background: #f0eee9; color: #222; }
  .nav-link.active { background: #f0eee9; color: #7c4fa0; }
  .container { max-width: 960px; margin: 32px auto; padding: 0 24px; }
  .card { background: #fff; border: 1px solid #e0ddd8; border-radius: 10px; padding: 24px; margin-bottom: 24px; }
  .card h2 { font-size: 0.85rem; font-weight: 600; margin-bottom: 20px; color: #888; text-transform: uppercase; letter-spacing: .06em; }
  .form-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .form-group { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 200px; }
  label { font-size: 0.82rem; font-weight: 500; color: #555; }
  input[type=text] { border: 1px solid #d4d0ca; border-radius: 6px; padding: 9px 12px; font-size: 0.9rem; outline: none; width: 100%; }
  input[type=text]:focus { border-color: #a78bcc; box-shadow: 0 0 0 3px rgba(167,139,204,.15); }
  .slug-prefix { display: flex; align-items: center; border: 1px solid #d4d0ca; border-radius: 6px; overflow: hidden; }
  .slug-prefix span { background: #f0eee9; padding: 9px 10px; font-size: 0.82rem; color: #888; white-space: nowrap; border-right: 1px solid #d4d0ca; }
  .slug-prefix input { border: none; border-radius: 0; box-shadow: none; }
  .slug-prefix input:focus { box-shadow: none; border: none; }
  .slug-prefix:focus-within { border-color: #a78bcc; box-shadow: 0 0 0 3px rgba(167,139,204,.15); }
  .btn { display: inline-block; padding: 9px 18px; border-radius: 6px; font-size: 0.88rem; font-weight: 500; cursor: pointer; border: none; text-decoration: none; }
  .btn-primary { background: #7c4fa0; color: #fff; }
  .btn-primary:hover { background: #6a3d8f; }
  .btn-secondary { background: #f0eee9; color: #555; border: 1px solid #d4d0ca; }
  .btn-secondary:hover { background: #e8e5de; }
  .btn-danger { background: #fff; color: #c0392b; border: 1px solid #f5c6c2; font-size: 0.8rem; padding: 5px 10px; }
  .btn-danger:hover { background: #fdf0ef; }
  .btn-sm { font-size: 0.8rem; padding: 5px 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #e8e5de; font-size: 0.78rem; text-transform: uppercase; letter-spacing: .05em; color: #888; }
  td { padding: 11px 12px; border-bottom: 1px solid #f0eee9; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  .slug-cell { font-family: monospace; font-size: 0.88rem; color: #7c4fa0; }
  .dest-cell { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #555; font-size: 0.82rem; }
  .count { font-weight: 600; }
  .count-month { color: #888; font-size: 0.82rem; }
  .actions { display: flex; gap: 6px; align-items: center; }
  .alert { padding: 12px 16px; border-radius: 7px; margin-bottom: 20px; font-size: 0.88rem; }
  .alert-success { background: #f0faf0; border: 1px solid #a8d5a8; color: #2e6b2e; }
  .alert-error { background: #fdf0ef; border: 1px solid #f5c6c2; color: #8b2020; }
  .empty { text-align: center; color: #aaa; padding: 32px; font-size: 0.9rem; }
  .date-cell { color: #aaa; font-size: 0.78rem; }
  textarea { border: 1px solid #d4d0ca; border-radius: 6px; padding: 10px 12px; font-size: 0.88rem; font-family: monospace; outline: none; width: 100%; resize: vertical; }
  textarea:focus { border-color: #a78bcc; box-shadow: 0 0 0 3px rgba(167,139,204,.15); }
  .result-row-ok { color: #2a7a2a; }
  .result-row-skip { color: #888; }
  .result-row-err { color: #b03030; }
`;

function navbar(active) {
  return `
  <nav class="topbar">
    <a href="/admin" class="topbar-brand">Redirect Manager <span>sweetsmilingsoul.com</span></a>
    <div class="topbar-nav">
      <a href="/admin" class="nav-link ${active === 'links' ? 'active' : ''}">Links</a>
      <a href="/stats" class="nav-link ${active === 'stats' ? 'active' : ''}">Stats</a>
    </div>
  </nav>`;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use('/qrcodes', express.static(QR_DIR));

const auth = basicAuth({
  users: { [ADMIN_USER]: ADMIN_PASS },
  challenge: true,
  realm: 'Redirect Admin'
});

// ---------------------------------------------------------------------------
// Admin – list links
// ---------------------------------------------------------------------------
app.get('/admin', auth, (req, res) => {
  const links = db.prepare(`
    SELECT
      l.*,
      COUNT(c.id) AS total_clicks,
      SUM(CASE WHEN strftime('%Y-%m', c.clicked_at) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) AS clicks_this_month
    FROM links l
    LEFT JOIN clicks c ON c.link_id = l.id
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `).all();

  const { error, success } = req.query;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Links · Redirect Manager</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  ${navbar('links')}
  <div class="container">

    ${error === 'duplicate_slug' ? '<div class="alert alert-error">That slug is already taken. Choose a different one.</div>' : ''}
    ${error === 'missing_fields' ? '<div class="alert alert-error">Slug and destination are both required.</div>' : ''}
    ${error === 'reserved' ? '<div class="alert alert-error">That slug is reserved. Please choose another.</div>' : ''}
    ${success ? '<div class="alert alert-success">Link created! QR code is ready to download.</div>' : ''}

    <div class="card">
      <h2>Create new redirect</h2>
      <form method="POST" action="/admin/links">
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label>Slug</label>
            <div class="slug-prefix">
              <span>${BASE_URL}/</span>
              <input type="text" name="slug" placeholder="dollhouse-first-page-section" required autocomplete="off">
            </div>
          </div>
          <div class="form-group" style="flex:2">
            <label>Destination URL</label>
            <input type="text" name="destination" placeholder="https://youtu.be/b90pgHz6mk0?t=863" required autocomplete="off">
          </div>
          <div class="form-group" style="flex:0; justify-content:flex-end">
            <label>&nbsp;</label>
            <div style="display:flex;gap:8px">
              <button type="submit" class="btn btn-primary">Create + QR</button>
              <a href="/admin/bulk" class="btn btn-secondary">Bulk upload</a>
            </div>
          </div>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>All links</h2>
      ${links.length === 0 ? '<p class="empty">No links yet. Create your first one above.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Slug</th>
            <th>Destination</th>
            <th>Total clicks</th>
            <th>This month</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${links.map(l => `
          <tr>
            <td class="slug-cell">/${l.slug}</td>
            <td class="dest-cell" title="${l.destination}">${l.destination}</td>
            <td><span class="count">${l.total_clicks || 0}</span></td>
            <td><span class="count-month">${l.clicks_this_month || 0}</span></td>
            <td class="date-cell">${l.created_at.slice(0, 10)}</td>
            <td class="actions">
              <a href="/qrcodes/${encodeURIComponent(l.slug)}.png" download="${l.slug}.png" class="btn btn-secondary btn-sm">⬇ QR</a>
              <form method="POST" action="/admin/links/${l.id}/delete" style="display:inline" onsubmit="return confirm('Delete /${l.slug}?')">
                <button type="submit" class="btn btn-danger">Delete</button>
              </form>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`}
    </div>

  </div>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Admin – create link
// ---------------------------------------------------------------------------
app.post('/admin/links', auth, async (req, res) => {
  const slug = normalizeSlug(req.body.slug || '');
  const destination = (req.body.destination || '').trim();

  if (!slug || !destination) return res.redirect('/admin?error=missing_fields');
  if (RESERVED_SLUGS.has(slug)) return res.redirect('/admin?error=reserved');

  try {
    db.prepare('INSERT INTO links (slug, destination) VALUES (?, ?)').run(slug, destination);
    await generateQR(slug);
    res.redirect('/admin?success=1');
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      res.redirect('/admin?error=duplicate_slug');
    } else {
      console.error(err);
      res.redirect('/admin?error=unknown');
    }
  }
});

// ---------------------------------------------------------------------------
// Admin – delete link
// ---------------------------------------------------------------------------
app.post('/admin/links/:id/delete', auth, (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (link) {
    db.prepare('DELETE FROM clicks WHERE link_id = ?').run(link.id);
    db.prepare('DELETE FROM links WHERE id = ?').run(link.id);
    const qrFile = path.join(QR_DIR, `${link.slug}.png`);
    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
  }
  res.redirect('/admin');
});

// ---------------------------------------------------------------------------
// Stats page
// ---------------------------------------------------------------------------
app.get('/stats', auth, (req, res) => {
  // KPIs
  const totalClicks = db.prepare('SELECT COUNT(*) AS n FROM clicks').get().n;
  const totalLinks  = db.prepare('SELECT COUNT(*) AS n FROM links').get().n;
  const clicksThisMonth = db.prepare(`
    SELECT COUNT(*) AS n FROM clicks
    WHERE strftime('%Y-%m', clicked_at) = strftime('%Y-%m', 'now')
  `).get().n;
  const clicksLastMonth = db.prepare(`
    SELECT COUNT(*) AS n FROM clicks
    WHERE strftime('%Y-%m', clicked_at) = strftime('%Y-%m', datetime('now', '-1 month'))
  `).get().n;

  // All-links clicks by month (last 13 months for chart)
  const monthlyAll = db.prepare(`
    SELECT strftime('%Y-%m', clicked_at) AS month, COUNT(*) AS clicks
    FROM clicks
    WHERE clicked_at >= datetime('now', '-13 months')
    GROUP BY month
    ORDER BY month ASC
  `).all();

  // Per-link monthly breakdown (last 12 months)
  const perLinkMonthly = db.prepare(`
    SELECT
      l.slug,
      strftime('%Y-%m', c.clicked_at) AS month,
      COUNT(*) AS clicks
    FROM clicks c
    JOIN links l ON l.id = c.link_id
    WHERE c.clicked_at >= datetime('now', '-12 months')
    GROUP BY l.slug, month
    ORDER BY month DESC, clicks DESC
  `).all();

  // Top links all-time
  const topLinks = db.prepare(`
    SELECT l.slug, COUNT(c.id) AS clicks
    FROM links l
    LEFT JOIN clicks c ON c.link_id = l.id
    GROUP BY l.id
    ORDER BY clicks DESC
    LIMIT 10
  `).all();

  // Build monthly breakdown: unique months sorted desc, with per-link columns
  const allMonths = [...new Set(perLinkMonthly.map(r => r.month))].sort().reverse();
  const allSlugs  = [...new Set(perLinkMonthly.map(r => r.slug))];
  const clickMap  = {};
  perLinkMonthly.forEach(r => {
    if (!clickMap[r.month]) clickMap[r.month] = {};
    clickMap[r.month][r.slug] = r.clicks;
  });

  // Chart data — fill gaps with 0
  const chartLabels = monthlyAll.map(r => r.month);
  const chartData   = monthlyAll.map(r => r.clicks);

  const kpiChange = clicksLastMonth > 0
    ? Math.round(((clicksThisMonth - clicksLastMonth) / clicksLastMonth) * 100)
    : null;

  const kpiChangeHtml = kpiChange !== null
    ? `<div class="kpi-change ${kpiChange >= 0 ? 'up' : 'down'}">${kpiChange >= 0 ? '▲' : '▼'} ${Math.abs(kpiChange)}% vs last month</div>`
    : `<div class="kpi-change neutral">No data last month</div>`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stats · Redirect Manager</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
  <style>
    ${SHARED_CSS}
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
    .kpi { background: #fff; border: 1px solid #e0ddd8; border-radius: 10px; padding: 20px 24px; }
    .kpi-label { font-size: 0.78rem; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
    .kpi-value { font-size: 2rem; font-weight: 700; color: #222; line-height: 1; }
    .kpi-change { font-size: 0.78rem; margin-top: 6px; font-weight: 500; }
    .kpi-change.up { color: #2a7a2a; }
    .kpi-change.down { color: #b03030; }
    .kpi-change.neutral { color: #aaa; }
    .chart-wrap { position: relative; height: 280px; }
    .breakdown-month { font-weight: 600; color: #444; }
    .breakdown-total { font-weight: 700; }
    .bar-cell { display: flex; align-items: center; gap: 8px; }
    .bar { height: 8px; border-radius: 4px; background: #c4a8e0; min-width: 2px; }
  </style>
</head>
<body>
  ${navbar('stats')}
  <div class="container">

    <!-- KPIs -->
    <div class="kpi-grid" style="margin-bottom:24px">
      <div class="kpi">
        <div class="kpi-label">Total clicks</div>
        <div class="kpi-value">${totalClicks.toLocaleString()}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">This month</div>
        <div class="kpi-value">${clicksThisMonth.toLocaleString()}</div>
        ${kpiChangeHtml}
      </div>
      <div class="kpi">
        <div class="kpi-label">Last month</div>
        <div class="kpi-value">${clicksLastMonth.toLocaleString()}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Active links</div>
        <div class="kpi-value">${totalLinks.toLocaleString()}</div>
      </div>
    </div>

    <!-- Line chart -->
    <div class="card">
      <h2>Clicks over time</h2>
      ${chartLabels.length === 0
        ? '<p class="empty">No click data yet.</p>'
        : `<div class="chart-wrap"><canvas id="clicksChart"></canvas></div>`}
    </div>

    <!-- Top links -->
    ${topLinks.length > 0 ? `
    <div class="card">
      <h2>Top links</h2>
      <table>
        <thead><tr><th>Slug</th><th style="width:160px">Clicks</th></tr></thead>
        <tbody>
          ${topLinks.map(l => {
            const max = topLinks[0].clicks || 1;
            const pct = Math.round((l.clicks / max) * 100);
            return `<tr>
              <td class="slug-cell">/${l.slug}</td>
              <td>
                <div class="bar-cell">
                  <div class="bar" style="width:${pct}px"></div>
                  <span>${l.clicks}</span>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Monthly breakdown -->
    <div class="card">
      <h2>Monthly breakdown</h2>
      ${allMonths.length === 0
        ? '<p class="empty">No click data yet.</p>'
        : `<table>
          <thead>
            <tr>
              <th>Month</th>
              ${allSlugs.map(s => `<th>/${s}</th>`).join('')}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${allMonths.map(month => {
              const row = clickMap[month] || {};
              const total = allSlugs.reduce((sum, s) => sum + (row[s] || 0), 0);
              return `<tr>
                <td class="breakdown-month">${month}</td>
                ${allSlugs.map(s => `<td>${row[s] || '—'}</td>`).join('')}
                <td class="breakdown-total">${total}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
    </div>

  </div>

  ${chartLabels.length > 0 ? `
  <script>
    const ctx = document.getElementById('clicksChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(chartLabels)},
        datasets: [{
          label: 'Clicks',
          data: ${JSON.stringify(chartData)},
          borderColor: '#7c4fa0',
          backgroundColor: 'rgba(124,79,160,0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#7c4fa0',
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + ctx.parsed.y + ' clicks'
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: '#f0eee9' }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  </script>` : ''}
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Bulk upload – form
// ---------------------------------------------------------------------------
app.get('/admin/bulk', auth, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bulk Upload · Redirect Manager</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  ${navbar('links')}
  <div class="container">
    <div class="card">
      <h2>Bulk upload</h2>
      <ol style="font-size:0.88rem;color:#555;margin-bottom:20px;padding-left:20px;line-height:2">
        <li>Open the spreadsheet: <a href="https://docs.google.com/spreadsheets/d/1ItuGPknEgAU9AP47r6ZTNzgZnz1g5TEUtBt4L7eQb5U/edit?gid=830768781#gid=830768781" target="_blank" style="color:#7c4fa0">Google Sheets ↗</a></li>
        <li>Add your new rows to the <strong>raw</strong> tab</li>
        <li>Go to the <strong>COPY ME</strong> tab and copy the rows, including the header</li>
        <li>Paste into the field below and click import</li>
      </ol>
      <p style="font-size:0.8rem;color:#aaa;margin-bottom:16px">Existing slugs are silently skipped. The <code>product</code> column is ignored.</p>
      <form method="POST" action="/admin/bulk">
        <div class="form-group" style="margin-bottom:16px">
          <label>CSV data</label>
          <textarea name="csv" rows="16" placeholder="product,slug,destination
dollhouse,dollhouse-page-1,https://youtu.be/b90pgHz6mk0?t=863
dollhouse,dollhouse-page-2,https://youtu.be/b90pgHz6mk0?t=920" required></textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary">Import + generate QR codes</button>
          <a href="/admin" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>
  </div>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Bulk upload – process
// ---------------------------------------------------------------------------
app.post('/admin/bulk', auth, async (req, res) => {
  const raw = (req.body.csv || '').trim();
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Strip header row if present
  const dataLines = lines[0].toLowerCase().startsWith('product') ? lines.slice(1) : lines;

  const results = [];
  for (const line of dataLines) {
    const parts = line.split(',');
    if (parts.length < 3) {
      results.push({ line, status: 'err', msg: 'Not enough columns' });
      continue;
    }
    // product is parts[0] (ignored), slug is parts[1], destination is rest joined
    const slug = normalizeSlug(parts[1]);
    const destination = parts.slice(2).join(',').trim();

    if (!slug || !destination) {
      results.push({ line, status: 'err', msg: 'Empty slug or destination' });
      continue;
    }
    if (RESERVED_SLUGS.has(slug)) {
      results.push({ line, status: 'skip', msg: `/${slug} is reserved` });
      continue;
    }

    try {
      db.prepare('INSERT INTO links (slug, destination) VALUES (?, ?)').run(slug, destination);
      await generateQR(slug);
      results.push({ line, status: 'ok', msg: `/${slug} created` });
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        results.push({ line, status: 'skip', msg: `/${slug} already exists` });
      } else {
        results.push({ line, status: 'err', msg: err.message });
      }
    }
  }

  const created = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skip').length;
  const errors  = results.filter(r => r.status === 'err').length;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bulk Upload · Redirect Manager</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  ${navbar('links')}
  <div class="container">
    <div class="card">
      <h2>Import results</h2>
      <div style="display:flex;gap:24px;margin-bottom:24px;font-size:0.9rem">
        <span style="color:#2a7a2a;font-weight:600">✓ ${created} created</span>
        ${skipped ? `<span style="color:#888;font-weight:600">– ${skipped} skipped</span>` : ''}
        ${errors  ? `<span style="color:#b03030;font-weight:600">✗ ${errors} errors</span>` : ''}
      </div>
      <table>
        <thead><tr><th>Status</th><th>Message</th><th>Row</th></tr></thead>
        <tbody>
          ${results.map(r => `
          <tr class="result-row-${r.status}">
            <td>${r.status === 'ok' ? '✓ Created' : r.status === 'skip' ? '– Skipped' : '✗ Error'}</td>
            <td>${r.msg}</td>
            <td style="font-family:monospace;font-size:0.8rem;color:#aaa">${r.line}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:20px;display:flex;gap:8px">
        <a href="/admin" class="btn btn-primary">Back to links</a>
        <a href="/admin/bulk" class="btn btn-secondary">Upload more</a>
      </div>
    </div>
  </div>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Redirect handler
// ---------------------------------------------------------------------------
app.get('/:slug', (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  const link = db.prepare('SELECT * FROM links WHERE slug = ?').get(slug);
  if (!link) return res.status(404).send('Link not found.');
  db.prepare('INSERT INTO clicks (link_id) VALUES (?)').run(link.id);
  res.redirect(302, link.destination);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Redirect app running on port ${PORT}`);
  console.log(`Admin: ${BASE_URL}/admin`);
});
