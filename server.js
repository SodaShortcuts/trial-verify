const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== TRUST PROXY ==========
app.set('trust proxy', true);

// ========== HELPER: GET REAL IP ==========
function getClientIP(req) {
  // 1. Check x-forwarded-for (most reliable)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Take the first IP in the list (client's real IP)
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0].replace(/^::ffff:/, '');
  }
  // 2. Fallback to req.ip (if trust proxy is working)
  return req.ip.replace(/^::ffff:/, '');
}
// =========================================

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 10 })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Models
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

// Webhook log
async function sendTrialLog(userId, expiresAt, ip, userAgent) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('⚠️ DISCORD_WEBHOOK_URL not set – skipping log.');
    return;
  }
  try {
    const message = `🎟️ **Trial Redeemed** – <@${userId}> (\`${userId}\`) has activated their 48‑hour trial subscription. (IP: \`${ip}\`, UA: \`${userAgent}\`)`;
    await axios.post(webhookUrl, { content: message });
    console.log(`✅ Trial log sent for user ${userId}`);
  } catch (err) {
    console.error('❌ Failed to send trial log:', err.message);
  }
}

// ========== CONFIRMATION PAGE (GET) ==========
app.get('/verify-trial', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing token.');

  const verification = await TrialVerification.findOne({ token, verified: false });
  if (!verification) {
    return res.status(400).send('Invalid or expired token. Please run /trial again.');
  }

  // Show the confirmation button (preview bots won't click)
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
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔐 Confirm Trial Activation</h1>
          <p>Click the button below to activate your 48‑hour free trial.</p>
          <div class="info">
            <span><strong>Your IP will be recorded:</strong> ${getClientIP(req)}</span>
          </div>
          <form action="/confirm-trial" method="POST">
            <input type="hidden" name="token" value="${token}">
            <button type="submit">✅ Activate Trial</button>
          </form>
          <div class="footer">Only click once – this link expires after 10 minutes.</div>
        </div>
      </body>
    </html>
  `);
});

// ========== CONFIRMATION POST ==========
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

  console.log(`[Verify] Real IP: ${clientIP}, UA: ${userAgent}`);

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

  // Store IP with UA
  await UsedIP.create({ userId, ip: clientIP, userAgent, referer });
  verification.verified = true;
  await verification.save();

  // Send Discord log
  await sendTrialLog(userId, expiresAt, clientIP, userAgent);

  // Success page
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

// Health
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));