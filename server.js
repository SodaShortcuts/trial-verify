const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', true);

// ========== ROOT ROUTE ==========
app.get('/', (req, res) => res.send('OK'));

// ========== VERSION ==========
app.get('/version', (req, res) => res.send('v2 - full logging'));

// ========== GET REAL IP ==========
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0].replace(/^::ffff:/, '');
  }
  return req.ip.replace(/^::ffff:/, '');
}

// ========== VPN / PROXY DETECTION ==========
async function isVpnOrProxy(ip) {
  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,proxy,hosting,message`, { timeout: 5000 });
    const data = response.data;
    if (data.status === 'success') {
      return data.proxy === true || data.hosting === true;
    }
    return false;
  } catch (err) {
    console.warn('[VPN check] Failed:', err.message);
    return false;
  }
}

// ========== BOT DETECTION (internal logging) ==========
function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  const botKeywords = ['bot','crawl','spider','scrape','headless','phantom','puppeteer','selenium','curl','wget','python','java','go-http','http-client','axios','fetch','node-fetch','discord','slack','telegram','twitter','facebook','cloudflare','google','bing','yahoo','duckduckgo'];
  return botKeywords.some(kw => ua.includes(kw));
}

// ========== MODELS ==========
const TrialVerificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 600 },
  verified: { type: Boolean, default: false }
});
TrialVerificationSchema.index({ token: 1, verified: 1 });
const TrialVerification = mongoose.model('TrialVerification', TrialVerificationSchema);

const UsedIPSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  ip: { type: String, required: true },
  userAgent: { type: String },
  referer: { type: String },
  acceptLanguage: { type: String },
  isBot: { type: Boolean, default: false },
  isVpn: { type: Boolean, default: false },
  xForwardedFor: { type: String },
  cfConnectingIp: { type: String },
  createdAt: { type: Date, default: Date.now, expires: 2592000 }
});
UsedIPSchema.index({ ip: 1, userId: 1 }, { unique: true });
const UsedIP = mongoose.model('UsedIP', UsedIPSchema);

const SubscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  maxConfigs: { type: Number, default: 3 },
  createdAt: { type: Date, default: Date.now },
  isTrial: { type: Boolean, default: true },
  trialRedeemedAt: { type: Date },
  lastExpiredNotified: { type: Boolean, default: false }
});
const Subscription = mongoose.model('Subscription', SubscriptionSchema);

// ========== WEBHOOK LOG (CLEAN) ==========
async function sendTrialLog(userId) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('⚠️ DISCORD_WEBHOOK_URL not set – skipping log.');
    return;
  }
  try {
    const message = `🎟️ **Trial Redeemed** – <@${userId}> (\`${userId}\`) has activated their 48‑hour trial subscription.`;
    await axios.post(webhookUrl, { content: message });
    console.log(`✅ Trial log sent for user ${userId}`);
  } catch (err) {
    console.error('❌ Failed to send trial log:', err.message);
  }
}

// ========== ROUTES ==========
app.get('/verify-trial', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing token.');

  console.log('[verify-trial] Looking up token...', token);
  try {
    const verification = await TrialVerification.findOne({ token, verified: false }).maxTimeMS(5000);
    if (!verification) {
      return res.status(400).send('Invalid or expired token. Please run /trial again.');
    }
    const clientIP = getClientIP(req);

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirm Trial</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: linear-gradient(145deg, #0f0f1a 0%, #1a1a2e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
          }
          .card {
            background: rgba(255,255,255,0.04);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 24px;
            padding: 48px 40px;
            max-width: 520px;
            width: 100%;
            box-shadow: 0 30px 60px rgba(0,0,0,0.6);
            text-align: center;
          }
          h1 {
            font-size: 28px;
            font-weight: 600;
            color: #57f287;
            margin-bottom: 8px;
          }
          .subtitle {
            color: #b0b0b0;
            font-size: 16px;
            margin-bottom: 24px;
          }
          .info-box {
            background: rgba(255,255,255,0.04);
            border-radius: 12px;
            padding: 16px 20px;
            margin: 20px 0 28px;
            border: 1px solid rgba(255,255,255,0.06);
          }
          .info-box .label {
            color: #9e9e9e;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .info-box .value {
            color: #e0e0e0;
            font-size: 18px;
            font-weight: 500;
            margin-top: 4px;
          }
          button {
            background: #5865f2;
            color: white;
            border: none;
            padding: 14px 32px;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            width: 100%;
            max-width: 280px;
          }
          button:hover {
            background: #4752c4;
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(88,101,242,0.3);
          }
          .footer-note {
            margin-top: 24px;
            color: #72767d;
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🔐 Confirm Activation</h1>
          <p class="subtitle">Click the button below to activate your 48‑hour free trial.</p>
          <div class="info-box">
            <div class="label">Your IP will be recorded</div>
            <div class="value">${clientIP}</div>
          </div>
          <form action="/confirm-trial" method="POST">
            <input type="hidden" name="token" value="${token}">
            <button type="submit">Activate Trial</button>
          </form>
          <div class="footer-note">This link expires in 10 minutes.</div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[verify-trial] DB error:', err);
    return res.status(500).send('An error occurred. Please try again.');
  }
});

app.post('/confirm-trial', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Missing token.');

  console.log('[confirm-trial] Received token:', token);

  try {
    const verification = await TrialVerification.findOne({ token, verified: false }).maxTimeMS(5000);
    if (!verification) {
      return res.status(400).send('Invalid or expired token. Please run /trial again.');
    }

    const userId = verification.userId;
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const referer = req.headers['referer'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const xForwardedFor = req.headers['x-forwarded-for'] || '';
    const cfConnectingIp = req.headers['cf-connecting-ip'] || '';

    console.log(`[confirm-trial] IP: ${clientIP}, UA: ${userAgent}`);

    // Check IP already used
    const existing = await UsedIP.findOne({
      ip: clientIP,
      userId: { $ne: userId },
      createdAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).maxTimeMS(5000);
    if (existing) {
      return res.status(403).send('This IP address has already been used for a trial. If you believe this is an error, please contact support.');
    }

    // VPN detection
    const isVpn = await isVpnOrProxy(clientIP);
    if (isVpn) {
      return res.status(403).send('Please disable your VPN or proxy and try again.');
    }

    // Grant trial
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const expiresTimestamp = expiresAt.getTime();

    await Subscription.create({
      userId,
      expiresAt,
      maxConfigs: 3,
      isTrial: true,
      trialRedeemedAt: new Date(),
      lastExpiredNotified: false
    });

    const isBotFlag = isBot(userAgent);
    await UsedIP.create({
      userId,
      ip: clientIP,
      userAgent,
      referer,
      acceptLanguage,
      isBot: isBotFlag,
      isVpn,
      xForwardedFor,
      cfConnectingIp
    });

    verification.verified = true;
    await verification.save();

    // Send clean webhook
    await sendTrialLog(userId);

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Trial Activated</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: linear-gradient(145deg, #0f0f1a 0%, #1a1a2e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
          }
          .card {
            background: rgba(255,255,255,0.04);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 24px;
            padding: 48px 40px;
            max-width: 520px;
            width: 100%;
            box-shadow: 0 30px 60px rgba(0,0,0,0.6);
            text-align: center;
          }
          h1 {
            font-size: 28px;
            font-weight: 600;
            color: #57f287;
            margin-bottom: 8px;
          }
          .subtitle {
            color: #b0b0b0;
            font-size: 16px;
            margin-bottom: 24px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin: 20px 0 28px;
          }
          .info-item {
            background: rgba(255,255,255,0.04);
            border-radius: 12px;
            padding: 12px 16px;
            border: 1px solid rgba(255,255,255,0.06);
          }
          .info-item .label {
            color: #9e9e9e;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .info-item .value {
            color: #e0e0e0;
            font-size: 16px;
            font-weight: 500;
            margin-top: 4px;
          }
          .info-item .value time {
            color: #b0b0b0;
            font-weight: 400;
          }
          .message {
            color: #b0b0b0;
            font-size: 15px;
            margin: 16px 0 20px;
            line-height: 1.6;
          }
          .footer-note {
            margin-top: 24px;
            color: #72767d;
            font-size: 13px;
          }
          @media (max-width: 480px) {
            .card { padding: 32px 20px; }
            .info-grid { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✅ Trial Activated</h1>
          <p class="subtitle">Your 48‑hour free trial is now active.</p>
          <div class="info-grid">
            <div class="info-item">
              <div class="label">Expires</div>
              <div class="value" id="expiryDisplay">—</div>
            </div>
            <div class="info-item">
              <div class="label">Max Configs</div>
              <div class="value">3</div>
            </div>
          </div>
          <p class="message">Go back to Discord and use <code style="background: #1e1e32; padding: 2px 8px; border-radius: 4px; color: #b0b0b0;">/start</code> to begin automation.</p>
          <div class="footer-note">🔒 Your IP has been recorded to prevent abuse.</div>
        </div>
        <script>
          (function() {
            const timestamp = ${expiresTimestamp};
            if (timestamp) {
              const date = new Date(timestamp);
              const formatter = new Intl.DateTimeFormat(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
              });
              document.getElementById('expiryDisplay').textContent = formatter.format(date);
            }
          })();
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[confirm-trial] Error:', err);
    return res.status(500).send('An error occurred. Please try again later.');
  }
});

// ========== HEALTH & TEST ==========
app.get('/health', (req, res) => res.send('OK'));
app.get('/test-db', async (req, res) => {
  try {
    const count = await TrialVerification.countDocuments();
    res.json({ connected: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000
})
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });