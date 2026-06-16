const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// ========== CONFIGURATION ==========
const GUILD_ID = '1292786100707786763';
const CHANNEL_ID_MAIN = '1497016420893200535';
const CHANNEL_ID_TRIAL = '1294237394765090847';

const DISCORD_APP_MAIN = `discord://discord.com/channels/${GUILD_ID}/${CHANNEL_ID_MAIN}`;
const DISCORD_WEB_MAIN = `https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID_MAIN}`;
const DISCORD_APP_TRIAL = `discord://discord.com/channels/${GUILD_ID}/${CHANNEL_ID_TRIAL}`;

// ========== SECURITY ==========
app.use(helmet({ contentSecurityPolicy: false }));
app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).send(errorPage('Rate Limit Exceeded', 'Too many requests. Please wait a few minutes.', 'Slow down, you\'re making too many requests.', { icon: '⏳', color: '#ed4245', type: 'trial' }));
  }
});
app.use(limiter);

const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many trial attempts. Please wait an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).send(errorPage('Rate Limit Exceeded', 'Too many trial attempts. Please wait an hour before trying again.', 'This helps prevent abuse of the trial system.', { icon: '⏳', color: '#ed4245', type: 'trial' }));
  }
});
app.use('/confirm-trial', strictLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== PAGE TEMPLATE WITH ADVANCED STYLING ==========
function pageTemplate(title, body, options = {}) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          background: #0a0a1a;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          margin: 0;
          overflow: hidden;
          position: relative;
        }
        /* Animated gradient background */
        body::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, #0f0f2a 0%, #1a1a3e 50%, #0f0f2a 100%);
          background-size: 400% 400%;
          animation: gradientMove 12s ease infinite;
          z-index: 0;
        }
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .card {
          position: relative;
          z-index: 1;
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 28px;
          padding: 48px 40px;
          max-width: 520px;
          width: 100%;
          box-shadow: 0 30px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset;
          text-align: center;
          transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          animation: cardEntrance 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .card.exit {
          opacity: 0;
          transform: scale(0.96) translateY(20px);
        }
        @keyframes cardEntrance {
          0% { opacity: 0; transform: scale(0.95) translateY(30px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .icon { font-size: 56px; margin-bottom: 16px; display: inline-block; animation: iconPop 0.8s ease 0.3s both; }
        @keyframes iconPop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        h1 { font-size: 28px; font-weight: 600; color: ${options.color || '#57f287'}; margin-bottom: 8px; animation: fadeUp 0.6s ease 0.2s both; }
        .subtitle { color: #b0b0b0; font-size: 16px; margin-bottom: 24px; animation: fadeUp 0.6s ease 0.3s both; }
        .message { color: #e0e0e0; font-size: 16px; line-height: 1.6; margin-bottom: 24px; animation: fadeUp 0.6s ease 0.4s both; }
        .btn {
          display: inline-block;
          background: #5865f2;
          color: white;
          text-decoration: none;
          padding: 14px 32px;
          border-radius: 14px;
          font-weight: 600;
          font-size: 16px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: none;
          cursor: pointer;
          text-align: center;
          width: 100%;
          max-width: 280px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 15px rgba(88,101,242,0.3);
          animation: fadeUp 0.6s ease 0.5s both;
        }
        .btn::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          transition: width 0.6s, height 0.6s, top 0.6s, left 0.6s;
        }
        .btn:active::after {
          width: 300px;
          height: 300px;
          top: -100px;
          left: -100px;
        }
        .btn:hover { background: #4752c4; transform: translateY(-3px); box-shadow: 0 8px 25px rgba(88,101,242,0.5); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .btn-web { background: #40444b; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
        .btn-web:hover { background: #4f545c; }
        .footer-note { margin-top: 24px; color: #72767d; font-size: 13px; animation: fadeUp 0.6s ease 0.6s both; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0 28px; }
        .info-item { background: rgba(255,255,255,0.04); border-radius: 12px; padding: 12px 16px; border: 1px solid rgba(255,255,255,0.06); transition: background 0.3s; }
        .info-item:hover { background: rgba(255,255,255,0.07); }
        .info-item .label { color: #9e9e9e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .info-item .value { color: #e0e0e0; font-size: 16px; font-weight: 500; margin-top: 4px; }
        .spinner { display: none; margin: 20px auto; width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #57f287; border-radius: 50%; animation: spin 0.8s linear infinite; }
        .spinner.visible { display: block; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .hidden { display: none; }
        .btn-group { display: flex; flex-direction: column; gap: 12px; align-items: center; margin: 16px 0; }
        .btn-single { margin: 16px auto; }
        .btn-loading { position: relative; pointer-events: none; color: transparent !important; }
        .btn-loading::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 24px;
          height: 24px;
          margin: -12px 0 0 -12px;
          border: 3px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes fadeUp {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .card:hover { border-color: rgba(255,255,255,0.12); }
        @media (max-width: 480px) { .card { padding: 32px 20px; } .info-grid { grid-template-columns: 1fr; } }
      </style>
    </head>
    <body>
      <div class="card" id="card">
        ${body}
      </div>
      <script>
        // Smooth exit before navigation
        document.addEventListener('click', function(e) {
          const target = e.target.closest('.btn, button[type="submit"]');
          if (!target) return;
          const card = document.getElementById('card');
          card.classList.add('exit');
          if (target.tagName === 'A') {
            setTimeout(() => { window.location.href = target.href; }, 500);
          } else if (target.tagName === 'BUTTON' && target.type === 'submit') {
            e.preventDefault();
            target.classList.add('btn-loading');
            target.disabled = true;
            setTimeout(() => { target.closest('form').submit(); }, 600);
          }
        }, true);
        // Remove exit class on page load to prevent initial flash
        window.addEventListener('load', function() {
          const card = document.getElementById('card');
          if (card) card.classList.remove('exit');
        });
      </script>
    </body>
    </html>
  `;
}

// ========== ERROR PAGE ==========
function errorPage(title, message, details = '', options = {}) {
  const type = options.type || 'trial';
  let buttons = '';
  if (type === 'redo') {
    const token = options.token || '';
    const redoLink = token ? `/verify-trial?token=${token}` : '/';
    buttons = `<a href="${redoLink}" class="btn">Redo Verification</a>`;
  } else {
    buttons = `<div class="btn-single"><a href="${DISCORD_APP_TRIAL}" class="btn">Run /trial again</a></div>`;
  }
  return pageTemplate(title, `
    <div class="icon">${options.icon || '⚠️'}</div>
    <h1 style="color:${options.color || '#ed4245'}">${title}</h1>
    <p class="message">${message}</p>
    ${details ? `<p class="message" style="font-size:14px;color:#9e9e9e;">${details}</p>` : ''}
    ${buttons}
    <div class="footer-note">If you believe this is an error, contact support.</div>
  `, { color: options.color || '#ed4245' });
}

// ========== ROOT PAGE ==========
app.get('/', (req, res) => {
  res.send(pageTemplate('Soda Trial Verification', `
    <div class="icon">🔐</div>
    <h1>Soda Trial Verification</h1>
    <p class="subtitle">Secure IP verification for free trials</p>
    <p class="message">This page is used to verify your identity before activating a 48‑hour free trial.</p>
    <div class="btn-group">
      <a href="${DISCORD_APP_MAIN}" class="btn">Open Discord App</a>
      <a href="${DISCORD_WEB_MAIN}" class="btn btn-web" target="_blank">Open Discord Web</a>
    </div>
    <div class="footer-note">© Soda's Services — All rights reserved</div>
  `, { color: '#57f287' }));
});

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

// ========== WEBHOOK LOG ==========
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
  if (!token) {
    return res.status(400).send(errorPage('Missing Token', 'No verification token was provided.', 'Please run /trial again to get a fresh link.', { icon: '❌', type: 'trial' }));
  }

  console.log('[verify-trial] Looking up token...', token);
  try {
    const verification = await TrialVerification.findOne({ token }).maxTimeMS(5000);
    if (!verification) {
      return res.status(400).send(errorPage('Invalid Verification Link', 'The link you used is invalid.', 'Please run /trial in Discord and follow the steps to get a new link.', { icon: '❌', type: 'trial' }));
    }
    if (verification.verified) {
      return res.send(pageTemplate('Link Already Used', `
        <div class="icon">🔁</div>
        <h1 style="color:#ed4245">This Link Was Already Used</h1>
        <p class="message">Each verification link can only be used once.</p>
        <div class="btn-single">
          <a href="${DISCORD_APP_TRIAL}" class="btn">Run /trial again</a>
        </div>
        <div class="footer-note">If you believe this is an error, contact support.</div>
      `, { color: '#ed4245' }));
    }
    const createdAt = new Date(verification.createdAt);
    const now = new Date();
    const diffMinutes = (now - createdAt) / (1000 * 60);
    if (diffMinutes > 10) {
      return res.status(400).send(errorPage('Expired Verification Link', 'This link expired after 10 minutes.', 'Run /trial again in Discord to get a fresh link.', { icon: '⏳', type: 'trial' }));
    }

    const clientIP = getClientIP(req);
    const totalSeconds = Math.max(0, (10 - diffMinutes) * 60);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const html = pageTemplate('Confirm Trial', `
      <div class="icon">🔐</div>
      <h1 style="color:#57f287">Confirm Activation</h1>
      <p class="subtitle">Click the button below to activate your 48‑hour free trial.</p>
      <div class="info-item" style="margin:20px 0;padding:12px;background:rgba(255,255,255,0.04);border-radius:12px;">
        <div class="label">Your IP will be recorded</div>
        <div class="value">${clientIP}</div>
      </div>
      <form action="/confirm-trial" method="POST" id="trialForm">
        <input type="hidden" name="token" value="${token}">
        <button type="submit" class="btn" id="submitBtn" style="background:#5865f2;color:white;border:none;padding:14px 32px;border-radius:14px;font-size:18px;font-weight:600;cursor:pointer;width:100%;max-width:280px;box-shadow:0 4px 15px rgba(88,101,242,0.3);">Activate Trial</button>
      </form>
      <div class="footer-note" id="footerNote">This link expires in <span id="countdown">${timeString}</span></div>
      <div id="expiredMessage" style="display:none; margin-top:16px; color:#ed4245; font-weight:500;">
        ⏳ This link has expired. <a href="${DISCORD_APP_TRIAL}" style="color:#5865f2;text-decoration:none;font-weight:600;">Run /trial again</a>
      </div>
      <script>
        let secondsLeft = ${Math.floor(totalSeconds)};
        const countdownEl = document.getElementById('countdown');
        const submitBtn = document.getElementById('submitBtn');
        const footerNote = document.getElementById('footerNote');
        const expiredMsg = document.getElementById('expiredMessage');
        const form = document.getElementById('trialForm');

        function updateCountdown() {
          if (secondsLeft <= 0) {
            countdownEl.textContent = '0s';
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';
            submitBtn.style.cursor = 'not-allowed';
            footerNote.style.display = 'none';
            expiredMsg.style.display = 'block';
            clearInterval(interval);
            return;
          }
          const mins = Math.floor(secondsLeft / 60);
          const secs = Math.floor(secondsLeft % 60);
          let display = '';
          if (mins > 0) display = mins + 'm ';
          display += secs + 's';
          countdownEl.textContent = display;
          secondsLeft--;
        }
        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
      </script>
    `, { color: '#57f287' });
    res.send(html);
  } catch (err) {
    console.error('[verify-trial] DB error:', err);
    return res.status(500).send(errorPage('Database Error', 'We encountered an issue while verifying your trial.', 'Please try again later or contact support.', { icon: '⚠️', type: 'trial' }));
  }
});

app.post('/confirm-trial', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).send(errorPage('Missing Token', 'No verification token was provided.', 'Please run /trial again to get a fresh link.', { icon: '❌', type: 'trial' }));
  }

  console.log('[confirm-trial] Received token:', token);

  try {
    const verification = await TrialVerification.findOne({ token }).maxTimeMS(5000);
    if (!verification) {
      return res.status(400).send(errorPage('Invalid Verification Link', 'The link you used is invalid.', 'Please run /trial in Discord and follow the steps to get a new link.', { icon: '❌', type: 'trial' }));
    }
    if (verification.verified) {
      return res.send(pageTemplate('Link Already Used', `
        <div class="icon">🔁</div>
        <h1 style="color:#ed4245">This Link Was Already Used</h1>
        <p class="message">Each verification link can only be used once.</p>
        <div class="btn-single">
          <a href="${DISCORD_APP_TRIAL}" class="btn">Run /trial again</a>
        </div>
        <div class="footer-note">If you believe this is an error, contact support.</div>
      `, { color: '#ed4245' }));
    }

    const userId = verification.userId;
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const referer = req.headers['referer'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const xForwardedFor = req.headers['x-forwarded-for'] || '';
    const cfConnectingIp = req.headers['cf-connecting-ip'] || '';

    console.log(`[confirm-trial] IP: ${clientIP}, UA: ${userAgent}`);

    const existing = await UsedIP.findOne({
      ip: clientIP,
      userId: { $ne: userId },
      createdAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).maxTimeMS(5000);
    if (existing) {
      return res.status(403).send(errorPage('IP Already Used', 'This IP address has already been used for a trial.', 'If you believe this is an error, please contact support.', { icon: '🚫', type: 'redo', token }));
    }

    const isVpn = await isVpnOrProxy(clientIP);
    if (isVpn) {
      return res.status(403).send(errorPage('VPN/Proxy Detected', 'Please disable your VPN or proxy and try again.', 'For security, we do not allow trial activations through VPNs or proxies.', { icon: '🛡️', type: 'redo', token }));
    }

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

    await sendTrialLog(userId);

    // Success page with nice transition
    res.send(pageTemplate('Trial Activated', `
      <div class="icon">✅</div>
      <h1 style="color:#57f287">Trial Activated</h1>
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
      <p class="message">Go back to Discord and use <code style="background:#1e1e32;padding:2px 8px;border-radius:4px;color:#b0b0b0;">/start</code> to begin automation.</p>
      <div class="btn-group">
        <a href="${DISCORD_APP_MAIN}" class="btn">Open Discord App</a>
        <a href="${DISCORD_WEB_MAIN}" class="btn btn-web" target="_blank">Open Discord Web</a>
      </div>
      <div class="footer-note">🔒 Your IP has been recorded to prevent abuse.</div>
      <script>
        (function() {
          const timestamp = Number('${expiresTimestamp}');
          if (timestamp && !isNaN(timestamp)) {
            const date = new Date(timestamp);
            const formatter = new Intl.DateTimeFormat(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short'
            });
            const el = document.getElementById('expiryDisplay');
            if (el) el.textContent = formatter.format(date);
          }
        })();
      </script>
    `, { color: '#57f287' }));
  } catch (err) {
    console.error('[confirm-trial] Error:', err);
    return res.status(500).send(errorPage('Database Error', 'We encountered an issue while activating your trial.', 'Please try again later or contact support.', { icon: '⚠️', type: 'trial' }));
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