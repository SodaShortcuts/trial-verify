const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', true);

// ========== ROOT ==========
app.get('/', (req, res) => res.send('OK'));

// ========== DEBUG: Show headers ==========
app.get('/debug-headers', (req, res) => {
  const headers = req.headers;
  const ip = req.ip;
  const forwarded = headers['x-forwarded-for'];
  res.json({
    ip,
    forwarded,
    headers,
    all: req.headers
  });
});

// ========== HELPER: GET REAL IP ==========
function getClientIP(req) {
  // Try x-forwarded-for first
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    const realIP = ips[0].replace(/^::ffff:/, '');
    return realIP;
  }
  // Fallback to req.ip
  return req.ip.replace(/^::ffff:/, '');
}

// ========== GRACEFUL SHUTDOWN ==========
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received – shutting down gracefully...');
  process.exit(0);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 10 })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ========== MODELS ==========
// ... (same models as before, keep them)

// Webhook log function (same)

// ========== ROUTES ==========
app.get('/verify-trial', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing token.');

  const verification = await TrialVerification.findOne({ token, verified: false });
  if (!verification) {
    return res.status(400).send('Invalid or expired token. Please run /trial again.');
  }

  // Log headers for debugging
  console.log('[verify-trial] headers:', req.headers);
  const clientIP = getClientIP(req);
  console.log('[verify-trial] detected IP:', clientIP);

  res.send(`
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Trial</title>
        <style>
          body { font-family: Arial, sans-serif; background: #1e1e2f; color: #dcddde; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .container { background: #2f3136; padding: 40px; border-radius: 16px; text-align: center; max-width: 500px; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
          h1 { color: #57f287; }
          .info { margin: 16px 0; padding: 10px; background: #40444b; border-radius: 8px; }
          button { background: #5865f2; color: white; border: none; padding: 12px 30px; border-radius: 8px; font-size: 18px; cursor: pointer; margin-top: 10px; }
          button:hover { background: #4752c4; }
          .footer { margin-top: 20px; color: #72767d; font-size: 14px; }
          .debug { margin-top: 20px; padding: 10px; background: #202225; border-radius: 8px; font-family: monospace; font-size: 12px; color: #b9bbbe; text-align: left; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔐 Confirm Trial Activation</h1>
          <p>Click the button below to activate your 48‑hour free trial.</p>
          <div class="info">
            <span><strong>Your IP will be recorded:</strong> ${clientIP}</span>
          </div>
          <form action="/confirm-trial" method="POST">
            <input type="hidden" name="token" value="${token}">
            <button type="submit">✅ Activate Trial</button>
          </form>
          <div class="footer">Only click once – this link expires after 10 minutes.</div>
          <div class="debug">
            <strong>Debug:</strong><br>
            req.ip: ${req.ip}<br>
            x-forwarded-for: ${req.headers['x-forwarded-for'] || 'not set'}<br>
            Detected IP: ${clientIP}
          </div>
        </div>
      </body>
    </html>
  `);
});

app.post('/confirm-trial', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Missing token.');

  const verification = await TrialVerification.findOne({ token, verified: false });
  if (!verification) {
    return res.status(400).send('Invalid or expired token. Please run /trial again.');
  }

  const userId = verification.userId;
  const clientIP = getClientIP(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const referer = req.headers['referer'] || '';

  console.log(`[confirm-trial] Detected IP: ${clientIP}, UA: ${userAgent}`);

  // Check if IP was used by another user
  const existing = await UsedIP.findOne({
    ip: clientIP,
    userId: { $ne: userId },
    createdAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  if (existing) {
    return res.status(403).send('This IP address has already been used for a trial.');
  }

  // Grant trial
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await Subscription.create({
    userId,
    expiresAt,
    maxConfigs: 3,
    isTrial: true,
    trialRedeemedAt: new Date(),
    lastExpiredNotified: false
  });

  await UsedIP.create({ userId, ip: clientIP, userAgent, referer });
  verification.verified = true;
  await verification.save();

  await sendTrialLog(userId, expiresAt, clientIP, userAgent);

  res.send(`
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Trial Activated</title>
        <style>
          body { font-family: Arial, sans-serif; background: #1e1e2f; color: #dcddde; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .container { background: #2f3136; padding: 40px; border-radius: 16px; text-align: center; max-width: 500px; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
          h1 { color: #57f287; }
          .info { margin: 16px 0; padding: 10px; background: #40444b; border-radius: 8px; }
          .info span { display: block; margin: 4px 0; }
          .footer { margin-top: 20px; color: #72767d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Trial Activated!</h1>
          <p>Your 48‑hour free trial is now active.</p>
          <div class="info">
            <span><strong>Expires:</strong> ${new Date(expiresAt).toLocaleString()}</span>
            <span><strong>Max Configs:</strong> 3</span>
            <span><strong>IP Logged:</strong> ${clientIP}</span>
          </div>
          <p>Go back to Discord and use <code>/start</code> to begin automation.</p>
          <div class="footer">🔒 Your IP has been recorded to prevent abuse.</div>
        </div>
      </body>
    </html>
  `);
});

// ========== HEALTH ==========
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));