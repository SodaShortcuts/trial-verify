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

// ========== BOT DETECTION ==========
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
const TrialVerification = mongoose.model('TrialVerification', TrialVerificationSchema);

const UsedIPSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  ip: { type: String, required: true },
  userAgent: { type: String },
  referer: { type: String },
  acceptLanguage: { type: String },
  isBot: { type: Boolean, default: false },
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

// ========== WEBHOOK LOG ==========
async function sendTrialLog(userId, expiresAt, ip, userAgent, isBot) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('⚠️ DISCORD_WEBHOOK_URL not set – skipping log.');
    return;
  }
  try {
    const botIcon = isBot ? '🤖' : '👤';
    const message = `${botIcon} **Trial Redeemed** – <@${userId}> (\`${userId}\`) has activated their 48‑hour trial subscription. (IP: \`${ip}\`, UA: \`${userAgent}\`)`;
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

  console.log('[verify-trial] Looking up token...');
  console.log('[verify-trial] Token from URL:', token);
  try {
    const verification = await TrialVerification.findOne({ token, verified: false });
    if (!verification) {
      return res.status(400).send('Invalid or expired token. Please run /trial again.');
    }
    // ... rest of handler (same as before)
  } catch (err) {
    console.error('[verify-trial] DB error:', err);
    return res.status(500).send('Database error. Please try again later.');
  }
});

// ... (copy the rest of your routes from the previous server.js, including /confirm-trial and /health)

// ========== HEALTH ==========
app.get('/health', (req, res) => res.send('OK'));
app.get('/test-db', async (req, res) => {
  try {
    const count = await TrialVerification.countDocuments();
    res.json({ connected: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== START SERVER AFTER DB CONNECTION ==========
const PORT = process.env.PORT || 3000;

// Connect with extended timeout options
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