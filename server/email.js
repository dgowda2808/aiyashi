/**
 * server/email.js — Nodemailer transporter + send helpers
 */
'use strict';
const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
  const port = parseInt(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER || 'info@aiyashi.vip';
  const pass = process.env.SMTP_PASS || '';

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,   // true for 465, false for 587
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    rateDelta: 1000,        // 1 s between sends
    rateLimit: 3,           // max 3 mails/s
  });

  return _transporter;
}

/**
 * Send a single email
 * @param {object} opts - { to, subject, html, text? }
 */
async function sendMail({ to, subject, html, text }) {
  const from = `"Aiyashi" <${process.env.SMTP_USER || 'info@aiyashi.vip'}>`;
  return getTransporter().sendMail({ from, to, subject, html, text });
}

/**
 * Send campaign to a list of emails.
 * Calls onProgress(sent, failed, total) after each send.
 * Returns { sent, failed }
 */
async function sendCampaign({ subject, html, emails, onProgress }) {
  let sent = 0, failed = 0;
  const total = emails.length;

  for (const email of emails) {
    try {
      await sendMail({ to: email, subject, html });
      sent++;
    } catch (err) {
      console.error(`[campaign] failed to send to ${email}:`, err.message);
      failed++;
    }
    if (onProgress) onProgress(sent, failed, total);
    // Small delay to be polite to the SMTP server
    await new Promise(r => setTimeout(r, 300));
  }

  return { sent, failed };
}

module.exports = { sendMail, sendCampaign };
