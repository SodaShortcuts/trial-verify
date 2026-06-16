require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

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

// ========== CONNECT TO MONGODB ==========
mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 10 })
  .then(() => console.log('[Verify] MongoDB connected'))
  .catch(err => console.error('[Verify] MongoDB error:', err));

// ========== VERIFICATION ENDPOINT ==========
app.get('/verify-trial', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing token.');

  const verification = await TrialVerification.findOne({ token, verified: false });
  if (!verification) {
    return res.status(400).send('Invalid or expired token. Please run /trial again.');
  }

  const userId = verification.userId;

  // Get real IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const cleanIp = ip.replace(/^::ffff:/, '').split(',')[0].trim();

  // Check if this IP was used by another user in the last 30 days
  const existing = await UsedIP.findOne({
    ip: cleanIp,
    userId: { $ne: userId },
    createdAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  if (existing) {
    return res.status(403).send('This IP address has already been used for a trial by another user.');
  }

  // VPN/proxy detection
  let isProxy = false;
  try {
    const info = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,proxy,hosting`);
    if (info.data.status === 'success' && (info.data.proxy || info.data.hosting)) {
      isProxy = true;
    }
  } catch (err) { /* ignore */ }

  if (isProxy) {
    return res.status(403).send('VPN or proxy detected. Please disable and try again.');
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

  // Record IP
  await UsedIP.create({ userId, ip: cleanIp });

  // Mark verification done
  verification.verified = true;
  await verification.save();

  res.send(`
    <html><body>
      <h1>✅ Trial Activated!</h1>
      <p>Your 48‑hour free trial is now active. Go back to Discord and use <code>/start</code>.</p>
    </body></html>
  `);
});

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[Verify] Server on port ${PORT}`));