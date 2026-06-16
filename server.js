const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

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

// Helper to send Discord webhook
async function sendTrialLog(userId, expiresAt) {
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

// Endpoints
app.get('/health', (req, res) => res.send('OK'));

app.get('/verify-trial', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing token.');

  const verification = await TrialVerification.findOne({ token, verified: false });
  if (!verification) {
    return res.status(400).send('Invalid or expired token. Please run /trial again.');
  }

  const userId = verification.userId;
  // Get real IP from x-forwarded-for (Railway/Cloudflare)
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',').shift().trim() : req.socket.remoteAddress;
  const cleanIp = ip.replace(/^::ffff:/, '').trim();

  // Check if IP was used by another user
  const existing = await UsedIP.findOne({
    ip: cleanIp,
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

  await UsedIP.create({ userId, ip: cleanIp });
  verification.verified = true;
  await verification.save();

  // Send Discord log
  await sendTrialLog(userId, expiresAt);

  // Show success page with expiration details
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
          code { background: #202225; padding: 2px 6px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Trial Activated!</h1>
          <p>Your 48‑hour free trial is now active.</p>
          <div class="info">
            <span><strong>Expires:</strong> ${new Date(expiresAt).toLocaleString()}</span>
            <span><strong>Max Configs:</strong> 3</span>
          </div>
          <p>Go back to Discord and use <code>/start</code> to begin automation.</p>
          <div class="footer">🔒 Your IP has been recorded to prevent abuse.</div>
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));