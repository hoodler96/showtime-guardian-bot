const crypto = require('crypto');
const { normalize, similarity } = require('./similarity');
const ScamPattern = require('../models/ScamPattern');

const protectedNames = ["showtime247", "showtime"];

exports.evaluateMember = async function(member) {

  let score = 0;
  let autoBan = false;
  let kick = false;
  let timeout = false;
  let quarantine = false;
  let reason = "Risk threshold met";

  const age = Date.now() - member.user.createdAt;

  if (age < 3 * 86400000) score += 70;
  else if (age < 14 * 86400000) score += 30;

  if (!member.user.avatar) score += 15;

  const normalized = normalize(member.user.username);

  for (let name of protectedNames) {
    const sim = similarity(normalized, name);

    if (sim > 0.93) {
      autoBan = true;
      reason = "Impersonation detected";
      return { autoBan, reason };
    }

    if (sim > 0.85) score += 80;
  }

  const patterns = await ScamPattern.find({});
  for (let p of patterns) {
    if (normalized.includes(p.value)) score += p.severity;
  }

  if (score >= 100) kick = true;
  else if (score >= 80) timeout = true;
  else if (score >= 50) quarantine = true;

  return { autoBan, kick, timeout, quarantine, reason };
};

exports.evaluateMessage = async function(message) {

  const content = message.content.toLowerCase();
  const walletRegex = /0x[a-fA-F0-9]{40}/;
  const telegramRegex = /(t\.me|telegram\.me)/;
  const scamPhrases = ["guaranteed profit", "dm me", "double your investment"];

  if (walletRegex.test(content)) {
    return { timeout: true, reason: "Wallet spam detected" };
  }

  if (telegramRegex.test(content)) {
    return { timeout: true, reason: "Telegram scam link detected" };
  }

  for (let phrase of scamPhrases) {
    if (content.includes(phrase)) {
      return { timeout: true, reason: "Scam phrase detected" };
    }
  }

  const hash = crypto.createHash('sha256').update(content).digest('hex');
  await ScamPattern.updateOne(
    { type: "messageHash", value: hash },
    { $setOnInsert: { severity: 50 } },
    { upsert: true }
  );

  return {};
};
