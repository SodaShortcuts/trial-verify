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
const BRAND_ICON = 'https://i.ibb.co/d06qhm5x/2bcropped.png';

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

// ========== PAGE TEMPLATE ==========
function pageTemplate(title, body, options = {}) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <link rel="icon" href="${BRAND_ICON}">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          background: #0c0c1a;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          margin: 0;
          position: relative;
        }
        body::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(ellipse at 50% 30%, #1a1a3a 0%, #0c0c1a 70%);
          z-index: 0;
        }
        .card {
          position: relative;
          z-index: 1;
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 24px;
          padding: 40px 32px;
          max-width: 480px;
          width: 100%;
          box-shadow: 0 30px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset;
          text-align: center;
          transition: opacity 0.4s ease, transform 0.4s ease;
          animation: cardIn 0.6s ease forwards;
        }
        .card.exit { opacity: 0; transform: scale(0.97) translateY(12px); }
        @keyframes cardIn { 0% { opacity: 0; transform: scale(0.97) translateY(20px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        .brand-icon { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; margin-bottom: 16px; border: 2px solid rgba(255,255,255,0.08); box-shadow: 0 8px 20px rgba(0,0,0,0.3); animation: iconPulse 3s ease-in-out infinite; }
        @keyframes iconPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.03); } }
        h1 { font-size: 26px; font-weight: 600; color: ${options.color || '#57f287'}; margin-bottom: 8px; }
        .subtitle { color: #b0b0b0; font-size: 15px; margin-bottom: 24px; }
        .message { color: #d0d0d0; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        .btn {
          display: inline-block;
          background: #5865f2;
          color: white;
          text-decoration: none;
          padding: 12px 28px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 16px;
          transition: all 0.25s ease;
          border: none;
          cursor: pointer;
          text-align: center;
          width: 100%;
          max-width: 280px;
          box-shadow: 0 4px 12px rgba(88,101,242,0.25);
          position: relative;
        }
        .btn:hover { background: #4752c4; transform: translateY(-2px); box-shadow: 0 8px 25px rgba(88,101,242,0.4); }
        .btn:active { transform: scale(0.98) translateY(0); box-shadow: none; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: none; }
        .btn-web { background: #40444b; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .btn-web:hover { background: #4f545c; }
        .btn-group { display: flex; flex-direction: column; gap: 12px; align-items: center; margin: 16px 0; }
        .btn-single { margin: 16px auto; }
        .btn .spinner { display: none; width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid #fff; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 8px; vertical-align: middle; }
        .btn.loading .spinner { display: inline-block; }
        .btn.loading .btn-text { display: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .footer-note { margin-top: 24px; color: #72767d; font-size: 13px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0 28px; }
        .info-item { background: rgba(255,255,255,0.04); border-radius: 12px; padding: 12px 16px; border: 1px solid rgba(255,255,255,0.06); }
        .info-item .label { color: #9e9e9e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .info-item .value { color: #e0e0e0; font-size: 16px; font-weight: 500; margin-top: 4px; }
        .countdown-highlight { color: #57f287; font-weight: 600; }
        @media (max-width: 480px) { .card { padding: 32px 20px; } .info-grid { grid-template-columns: 1fr; } }
      </style>
    </head>
    <body>
      <div class="card" id="card">
        <img src="${BRAND_ICON}" alt="Brand" class="brand-icon">
        ${body}
      </div>
      <script>
        document.addEventListener('click', function(e) {
          const target = e.target.closest('.btn, button[type="submit"]');
          if (!target) return;
          const card = document.getElementById('card');
          card.classList.add('exit');
          if (target.tagName === 'A') {
            setTimeout(() => { window.location.href = target.href; }, 400);
          } else if (target.tagName === 'BUTTON' && target.type === 'submit') {
            e.preventDefault();
            target.classList.add('loading');
            target.disabled = true;
            setTimeout(() => { target.closest('form').submit(); }, 500);
          }
        }, true);
        window.addEventListener('load', function() {
          const card = document.getElementById('card');
          if (card) card.classList.remove('exit');
        });
      </script>
    </body>
    </html>
  `;
}

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
    <div style="font-size:48px; margin-bottom:8px;">${options.icon || '⚠️'}</div>
    <h1 style="color:${options.color || '#ed4245'}">${title}</h1>
    <p class="message">${message}</p>
    ${details ? `<p class="message" style="font-size:14px; color:#a0a0a0;">${details}</p>` : ''}
    ${buttons}
    <div class="footer-note">If you believe this is an error, contact support.</div>
  `, { color: options.color || '#ed4245' });
}

// ========== ROOT ==========
app.get('/', (req, res) => {
  res.send(pageTemplate('Soda Trial Verification', `
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

app.get('/version', (req, res) => res.send('v2 - full logging'));

// ========== HELPERS ==========
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0].replace(/^::ffff:/, '');
  }
  return req.ip.replace(/^::ffff:/, '');
}

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
  fingerprint: { type: String, index: true },
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
UsedIPSchema.index({ fingerprint: 1, userId: 1 }, { unique: true });
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
      return res.send(pageTemplate('Link Expired or Invalid', `
        <div style="font-size:48px; margin-bottom:8px;">⏳</div>
        <h1 style="color:#ed4245">Link Expired or Invalid</h1>
        <p class="message">This link is no longer valid. It may have expired after 10 minutes.</p>
        <div class="btn-single">
          <a href="${DISCORD_APP_TRIAL}" class="btn">Run /trial again</a>
        </div>
        <div class="footer-note">If you believe this is an error, contact support.</div>
      `, { color: '#ed4245' }));
    }
    if (verification.verified) {
      return res.send(pageTemplate('Link Already Used', `
        <div style="font-size:48px; margin-bottom:8px;">🔁</div>
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
      return res.send(pageTemplate('Link Expired', `
        <div style="font-size:48px; margin-bottom:8px;">⏳</div>
        <h1 style="color:#ed4245">Link Expired</h1>
        <p class="message">This link expired after 10 minutes.</p>
        <div class="btn-single">
          <a href="${DISCORD_APP_TRIAL}" class="btn">Run /trial again</a>
        </div>
        <div class="footer-note">If you believe this is an error, contact support.</div>
      `, { color: '#ed4245' }));
    }

    const clientIP = getClientIP(req);
    const totalSeconds = Math.max(0, (10 - diffMinutes) * 60);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const html = pageTemplate('Confirm Trial', `
      <h1 style="color:#57f287">Confirm Activation</h1>
      <p class="subtitle">Click the button below to activate your 48‑hour free trial.</p>
      <div class="info-item" style="margin:20px 0;padding:12px;background:rgba(255,255,255,0.04);border-radius:12px;">
        <div class="label">Your IP will be recorded</div>
        <div class="value">${clientIP}</div>
      </div>
      <form action="/confirm-trial" method="POST" id="trialForm">
        <input type="hidden" name="token" value="${token}">
        <input type="hidden" name="fingerprint" id="fingerprintInput" value="">
        <button type="submit" class="btn" id="submitBtn" style="background:#5865f2;color:white;border:none;padding:12px 28px;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;width:100%;max-width:280px;box-shadow:0 4px 12px rgba(88,101,242,0.25);">
          <span class="btn-text">Activate Trial</span>
          <span class="spinner"></span>
        </button>
      </form>
      <div class="footer-note" id="footerNote">This link expires in <span class="countdown-highlight" id="countdown">${timeString}</span></div>
      <div id="expiredMessage" style="display:none; margin-top:16px; color:#ed4245;">
        ⏳ This link has expired. <a href="${DISCORD_APP_TRIAL}" style="color:#5865f2;text-decoration:none;font-weight:600;">Run /trial again</a>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js"></script>
      <script>
        FingerprintJS.load().then(fp => {
          fp.get().then(result => {
            document.getElementById('fingerprintInput').value = result.visitorId;
          });
        });
        let secondsLeft = ${Math.floor(totalSeconds)};
        const countdownEl = document.getElementById('countdown');
        const submitBtn = document.getElementById('submitBtn');
        const footerNote = document.getElementById('footerNote');
        const expiredMsg = document.getElementById('expiredMessage');
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
  const { token, fingerprint } = req.body;
  if (!token) {
    return res.status(400).send(errorPage('Missing Token', 'No verification token was provided.', 'Please run /trial again to get a fresh link.', { icon: '❌', type: 'trial' }));
  }
  if (!fingerprint) {
    return res.status(400).send(errorPage('Device Fingerprint Missing', 'Please enable JavaScript and allow device fingerprinting.', 'This helps prevent abuse.', { icon: '⚠️', type: 'trial' }));
  }

  console.log('[confirm-trial] Received token:', token);

  try {
    const verification = await TrialVerification.findOne({ token }).maxTimeMS(5000);
    if (!verification) {
      return res.send(pageTemplate('Link Expired or Invalid', `
        <div style="font-size:48px; margin-bottom:8px;">⏳</div>
        <h1 style="color:#ed4245">Link Expired or Invalid</h1>
        <p class="message">This link is no longer valid. It may have expired after 10 minutes.</p>
        <div class="btn-single">
          <a href="${DISCORD_APP_TRIAL}" class="btn">Run /trial again</a>
        </div>
        <div class="footer-note">If you believe this is an error, contact support.</div>
      `, { color: '#ed4245' }));
    }
    if (verification.verified) {
      return res.send(pageTemplate('Link Already Used', `
        <div style="font-size:48px; margin-bottom:8px;">🔁</div>
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

    console.log(`[confirm-trial] IP: ${clientIP}, UA: ${userAgent}, Fingerprint: ${fingerprint}`);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // ---------- 1. IP check against other users ----------
    const ipUsedByOthers = await UsedIP.findOne({
      ip: clientIP,
      userId: { $ne: userId },
      createdAt: { $gt: thirtyDaysAgo }
    }).maxTimeMS(5000);
    if (ipUsedByOthers) {
      return res.status(403).send(errorPage('IP Already Used', 'This IP address has already been used for a trial by another user.', 'If you believe this is an error, contact support.', { icon: '🚫', type: 'redo', token }));
    }

    // ---------- 2. Fingerprint check against other users ----------
    const fpUsedByOthers = await UsedIP.findOne({
      fingerprint,
      userId: { $ne: userId },
      createdAt: { $gt: thirtyDaysAgo }
    }).maxTimeMS(5000);
    if (fpUsedByOthers) {
      return res.status(403).send(errorPage('Alt Account Detected', 'This device has already been used for a trial by another account.', 'If you believe this is an error, contact support.', { icon: '🚫', type: 'redo', token }));
    }

    // ---------- 3. NEW: IP has seen multiple distinct fingerprints ----------
    const distinctFingerprints = await UsedIP.distinct('fingerprint', {
      ip: clientIP,
      createdAt: { $gt: thirtyDaysAgo }
    }).maxTimeMS(5000);
    // If this IP has more than one distinct fingerprint, block any new attempt.
    // This catches: same user switching browsers/devices, and multiple users on same network.
    if (distinctFingerprints.length > 1) {
      // But if the current user already has a record on this IP, we could allow? 
      // The user wants strict blocking, so we block regardless.
      return res.status(403).send(errorPage('Multiple Devices Detected', 'This IP has been used with multiple devices or browsers. To prevent abuse, each IP can only be used from one device.', 'If you believe this is an error, contact support.', { icon: '🚫', type: 'redo', token }));
    }

    // ---------- 4. VPN detection ----------
    const isVpn = await isVpnOrProxy(clientIP);
    if (isVpn) {
      return res.status(403).send(errorPage('VPN/Proxy Detected', 'Please disable your VPN or proxy and try again.', 'For security, we do not allow trial activations through VPNs or proxies.', { icon: '🛡️', type: 'redo', token }));
    }

    // ---------- Grant trial ----------
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
      fingerprint,
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

    res.send(pageTemplate('Trial Activated', `
      <div style="font-size:48px; margin-bottom:8px;">✅</div>
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
      <div class="footer-note">🔒 Your IP and device fingerprint have been recorded.</div>
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

// ========== START ==========
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