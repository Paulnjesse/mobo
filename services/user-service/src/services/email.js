/**
 * MOBO Email Service — user-service
 * Sends transactional emails via nodemailer (SMTP).
 * Gracefully no-ops when SMTP credentials are not configured.
 */

const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Transporter setup
// ---------------------------------------------------------------------------

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@mobo.app';

function isConfigured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

let transporter = null;

if (isConfigured()) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
} else {
  console.log('[MOBO Email] SMTP credentials not configured — emails will be logged to console.');
}

// ---------------------------------------------------------------------------
// Brand colours
// ---------------------------------------------------------------------------
const COLORS = {
  primary: '#FF00BF',
  dark: '#1A1A2E',
  bg: '#F8F8FB',
  text: '#1A1A2E',
  muted: '#6B7280',
  white: '#FFFFFF'
};

// ---------------------------------------------------------------------------
// HTML wrapper
// ---------------------------------------------------------------------------
function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:${COLORS.bg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .wrapper { max-width:560px; margin:32px auto; background:${COLORS.white}; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
    .header { background:${COLORS.dark}; padding:28px 32px; text-align:center; }
    .header .logo { color:${COLORS.primary}; font-size:28px; font-weight:900; letter-spacing:2px; }
    .header .tagline { color:rgba(255,255,255,0.6); font-size:13px; margin-top:4px; }
    .body { padding:32px; color:${COLORS.text}; line-height:1.65; }
    .body h1 { margin:0 0 16px; font-size:22px; font-weight:800; }
    .body p { margin:0 0 16px; font-size:15px; color:#374151; }
    .otp-box { background:rgba(255,0,191,0.07); border:2px solid rgba(255,0,191,0.25); border-radius:12px; text-align:center; padding:24px; margin:24px 0; }
    .otp-box .otp-code { font-size:40px; font-weight:900; color:${COLORS.primary}; letter-spacing:8px; }
    .otp-box .otp-note { font-size:13px; color:${COLORS.muted}; margin-top:8px; }
    .btn { display:inline-block; background:${COLORS.primary}; color:${COLORS.white}; padding:14px 32px; border-radius:100px; text-decoration:none; font-weight:700; font-size:15px; margin:16px 0; }
    .info-row { display:flex; justify-content:space-between; border-top:1px solid #E5E7EB; padding:10px 0; font-size:14px; }
    .footer { background:${COLORS.bg}; padding:20px 32px; text-align:center; font-size:12px; color:${COLORS.muted}; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">MOBO</div>
      <div class="tagline">Your ride, your way</div>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} MOBO. All rights reserved.<br/>
      <a href="https://mobo.app/privacy" style="color:${COLORS.muted}">Privacy Policy</a> &middot;
      <a href="https://mobo.app/terms" style="color:${COLORS.muted}">Terms</a>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Internal send helper
// ---------------------------------------------------------------------------
async function _sendEmail({ to, subject, html, text }) {
  if (!transporter) {
    console.log(`[MOBO Email] DEV mode — to: ${to} | subject: ${subject}`);
    if (text) console.log(`[MOBO Email] Body: ${text}`);
    return { success: true, mock: true };
  }

  try {
    const info = await transporter.sendMail({
      from: `"MOBO" <${FROM_EMAIL}>`,
      to,
      subject,
      text: text || subject,
      html
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[MOBO Email] Send error:', err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Greeting helpers per language
// ---------------------------------------------------------------------------
const GREETINGS = {
  en: (name) => `Hello ${name},`,
  fr: (name) => `Bonjour ${name},`,
  sw: (name) => `Habari ${name},`
};

function greeting(name, language) {
  const fn = GREETINGS[language] || GREETINGS.en;
  return fn(name);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * sendVerificationEmail(email, otp, fullName, language)
 */
async function sendVerificationEmail(email, otp, fullName, language = 'en') {
  const subjects = {
    en: 'Verify your MOBO account',
    fr: 'Vérifiez votre compte MOBO',
    sw: 'Thibitisha akaunti yako ya MOBO'
  };

  const bodies = {
    en: `<h1>Verify your account</h1>
         <p>${greeting(fullName, language)}</p>
         <p>Use the code below to verify your MOBO account. This code expires in <strong>10 minutes</strong>.</p>
         <div class="otp-box">
           <div class="otp-code">${otp}</div>
           <div class="otp-note">Never share this code with anyone.</div>
         </div>
         <p>If you didn't request this, you can safely ignore this email.</p>`,
    fr: `<h1>Vérifiez votre compte</h1>
         <p>${greeting(fullName, language)}</p>
         <p>Utilisez le code ci-dessous pour vérifier votre compte MOBO. Ce code expire dans <strong>10 minutes</strong>.</p>
         <div class="otp-box">
           <div class="otp-code">${otp}</div>
           <div class="otp-note">Ne partagez jamais ce code avec quiconque.</div>
         </div>
         <p>Si vous n'avez pas demandé cela, vous pouvez ignorer cet email.</p>`,
    sw: `<h1>Thibitisha akaunti yako</h1>
         <p>${greeting(fullName, language)}</p>
         <p>Tumia nambari hii kuthibitisha akaunti yako ya MOBO. Nambari hii itaisha baada ya <strong>dakika 10</strong>.</p>
         <div class="otp-box">
           <div class="otp-code">${otp}</div>
           <div class="otp-note">Usishiriki nambari hii na mtu yeyote.</div>
         </div>`
  };

  const lang = subjects[language] ? language : 'en';
  return _sendEmail({
    to: email,
    subject: subjects[lang],
    html: wrapHtml(subjects[lang], bodies[lang]),
    text: `Your MOBO verification code is: ${otp}. Valid for 10 minutes.`
  });
}

/**
 * sendWelcomeEmail(email, fullName, language)
 */
async function sendWelcomeEmail(email, fullName, language = 'en') {
  const subjects = {
    en: 'Welcome to MOBO!',
    fr: 'Bienvenue sur MOBO!',
    sw: 'Karibu MOBO!'
  };

  const bodies = {
    en: `<h1>Welcome to MOBO!</h1>
         <p>${greeting(fullName, language)}</p>
         <p>Your account has been verified. You're ready to start booking rides across Cameroon and beyond.</p>
         <p>You've been credited <strong>50 bonus loyalty points</strong> to get you started.</p>
         <a href="https://mobo.app" class="btn">Open MOBO</a>`,
    fr: `<h1>Bienvenue sur MOBO!</h1>
         <p>${greeting(fullName, language)}</p>
         <p>Votre compte a été vérifié. Vous êtes prêt(e) à réserver des courses.</p>
         <p>Nous vous avons crédité <strong>50 points de fidélité bonus</strong> pour commencer.</p>
         <a href="https://mobo.app" class="btn">Ouvrir MOBO</a>`,
    sw: `<h1>Karibu MOBO!</h1>
         <p>${greeting(fullName, language)}</p>
         <p>Akaunti yako imethibitishwa. Uko tayari kuanza kupanga safari.</p>
         <p>Umepewa <strong>pointi 50 za uaminifu</strong> kuanzisha.</p>
         <a href="https://mobo.app" class="btn">Fungua MOBO</a>`
  };

  const lang = subjects[language] ? language : 'en';
  return _sendEmail({
    to: email,
    subject: subjects[lang],
    html: wrapHtml(subjects[lang], bodies[lang]),
    text: `Welcome to MOBO, ${fullName}! Your account is now active.`
  });
}

/**
 * sendPasswordResetEmail(email, resetLink, language)
 */
async function sendPasswordResetEmail(email, resetLink, language = 'en') {
  const subjects = {
    en: 'Reset your MOBO password',
    fr: 'Réinitialisez votre mot de passe MOBO',
    sw: 'Weka upya nenosiri lako la MOBO'
  };

  const bodies = {
    en: `<h1>Password Reset</h1>
         <p>We received a request to reset your MOBO account password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
         <a href="${resetLink}" class="btn">Reset Password</a>
         <p>If you didn't request this, you can safely ignore this email. Your password will not change.</p>`,
    fr: `<h1>Réinitialisation du mot de passe</h1>
         <p>Nous avons reçu une demande de réinitialisation de votre mot de passe MOBO. Cliquez ci-dessous. Ce lien expire dans <strong>1 heure</strong>.</p>
         <a href="${resetLink}" class="btn">Réinitialiser le mot de passe</a>`,
    sw: `<h1>Weka Upya Nenosiri</h1>
         <p>Tulipokea ombi la kuweka upya nenosiri lako la MOBO. Bonyeza kiungo hapa chini. Kiungo hiki kitaisha baada ya <strong>saa 1</strong>.</p>
         <a href="${resetLink}" class="btn">Weka Upya Nenosiri</a>`
  };

  const lang = subjects[language] ? language : 'en';
  return _sendEmail({
    to: email,
    subject: subjects[lang],
    html: wrapHtml(subjects[lang], bodies[lang]),
    text: `Reset your MOBO password: ${resetLink}`
  });
}

/**
 * sendRideReceiptEmail(email, rideDetails)
 * rideDetails: { rider_name, pickup_address, dropoff_address, distance_km,
 *               duration_minutes, fare, currency, ride_type, driver_name,
 *               completed_at, receipt_id, language }
 */
async function sendRideReceiptEmail(email, rideDetails) {
  const {
    rider_name = 'Rider',
    pickup_address = '–',
    dropoff_address = '–',
    distance_km = 0,
    duration_minutes = 0,
    fare = 0,
    currency = 'XAF',
    ride_type = 'standard',
    driver_name = '–',
    completed_at,
    receipt_id = '',
    language = 'en'
  } = rideDetails;

  const dateStr = completed_at
    ? new Date(completed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString();

  const subject = language === 'fr'
    ? `Reçu MOBO — ${fare.toLocaleString()} ${currency}`
    : language === 'sw'
    ? `Risiti ya MOBO — ${fare.toLocaleString()} ${currency}`
    : `MOBO Receipt — ${fare.toLocaleString()} ${currency}`;

  const bodyHtml = `
    <h1>${language === 'fr' ? 'Reçu de course' : language === 'sw' ? 'Risiti ya Safari' : 'Ride Receipt'}</h1>
    <p>${greeting(rider_name, language)}</p>
    <p>${language === 'fr' ? 'Votre course est terminée. Voici votre reçu.' : language === 'sw' ? 'Safari yako imekamilika. Hii ni risiti yako.' : 'Your ride has been completed. Here is your receipt.'}</p>
    <div style="background:#F9FAFB;border-radius:12px;padding:20px;margin:20px 0;">
      <div class="info-row"><span style="color:#6B7280">From</span><span>${pickup_address}</span></div>
      <div class="info-row"><span style="color:#6B7280">To</span><span>${dropoff_address}</span></div>
      <div class="info-row"><span style="color:#6B7280">Driver</span><span>${driver_name}</span></div>
      <div class="info-row"><span style="color:#6B7280">Type</span><span style="text-transform:capitalize">${ride_type}</span></div>
      <div class="info-row"><span style="color:#6B7280">Distance</span><span>${distance_km} km</span></div>
      <div class="info-row"><span style="color:#6B7280">Duration</span><span>${duration_minutes} min</span></div>
      <div class="info-row"><span style="color:#6B7280">Date</span><span>${dateStr}</span></div>
      <div class="info-row" style="border-top:2px solid #E5E7EB;margin-top:8px;padding-top:12px;">
        <span style="font-weight:700;font-size:16px;">Total</span>
        <span style="font-weight:900;font-size:18px;color:#FF00BF">${fare.toLocaleString()} ${currency}</span>
      </div>
    </div>
    ${receipt_id ? `<p style="font-size:12px;color:#9CA3AF">Receipt ID: ${receipt_id}</p>` : ''}
  `;

  return _sendEmail({
    to: email,
    subject,
    html: wrapHtml(subject, bodyHtml),
    text: `MOBO Receipt: ${fare.toLocaleString()} ${currency}. From: ${pickup_address} → To: ${dropoff_address}. Distance: ${distance_km} km.`
  });
}

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendRideReceiptEmail
};
