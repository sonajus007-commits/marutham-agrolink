const express = require('express');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// In-memory config — resets on server restart.
// Default: ordering window 8 PM (20) to 8 AM (8) IST
let orderingWindow = { open_hour: 20, close_hour: 8 };

// ── GET /config/ordering-window ───────────────────────────────────────────────
router.get('/ordering-window', (req, res) => {
  res.json({ ordering_window: orderingWindow });
});

// ── PUT /config/ordering-window ───────────────────────────────────────────────
router.put('/ordering-window', requireRole('admin'), (req, res) => {
  const { open_hour, close_hour } = req.body;
  if (open_hour === undefined || close_hour === undefined) {
    return res.status(400).json({ error: 'open_hour and close_hour are required (0–23).' });
  }
  const oh = parseInt(open_hour);
  const ch = parseInt(close_hour);
  if (isNaN(oh) || isNaN(ch) || oh < 0 || oh > 23 || ch < 0 || ch > 23) {
    return res.status(400).json({ error: 'open_hour and close_hour must be integers 0–23.' });
  }
  if (oh === ch) {
    return res.status(400).json({ error: 'open_hour and close_hour cannot be the same.' });
  }
  orderingWindow = { open_hour: oh, close_hour: ch };
  res.json({ message: 'Ordering window updated.', ordering_window: orderingWindow });
});

module.exports = router;
