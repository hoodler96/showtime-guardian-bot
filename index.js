require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder
} = require('discord.js');

const riskEngine = require('./utils/riskEngine');
const raidDetection = require('./utils/raidDetection');
const registerCommands = require('./utils/registerCommands');

const Appeal = require('./models/Appeal');
const Report = require('./models/Report');

const app = express();
app.get('/', (_req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Web keep-alive listening on ${PORT}`);
});

/* ----------------------------- ENV / CONFIG ----------------------------- */

const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const MONGO_URI = (process.env.MONGO_URI || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();
const GUILD_ID = (process.env.GUILD_ID || '').trim();
const REPORT_CHANNEL_ID = (process.env.REPORT_CHANNEL_ID || '').trim();
const MOD_LOG_CHANNEL_ID = (process.env.MOD_LOG_CHANNEL_ID || '').trim();
const PREMIUM_EXEMPT_ROLE_IDS = process.env.PREMIUM_EXEMPT_ROLE_IDS || '';
const STAFF_ROLE_IDS = process.env.STAFF_ROLE_IDS || '';
const PROTECTED_NAME_PATTERNS =
  process.env.PROTECTED_NAME_PATTERNS ||
  'showtime247,showtime trades,showtime,admin,moderator,mod,support';
const MIN_ACCOUNT_AGE_DAYS = process.env.MIN_ACCOUNT_AGE_DAYS || '7';
const AUTO_BAN_EXTERNAL_LINKS = process.env.AUTO_BAN_EXTERNAL_LINKS || 'true';
const AUTO_BAN_DISCORD_INVITES = process.env.AUTO_BAN_DISCORD_INVITES || 'true';

const PREMIUM_EXEMPT_ROLES = PREMIUM_EXEMPT_ROLE_IDS
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

const STAFF_ROLES = STAFF_ROLE_IDS
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

const PROTECTED_PATTERNS = PROTECTED_NAME_PATTERNS
  .split(',')
  .map(x => x.trim().toLowerCase())
  .filter(Boolean);

const MIN_ACCOUNT_AGE_MS = Number(MIN_ACCOUNT_AGE_DAYS) * 24 * 60 * 60 * 1000;

/* ----------------------------- STARTUP / DB ----------------------------- */

console.log('Token length:', BOT_TOKEN?.length || 0);
console.log('CLIENT_ID loaded:', CLIENT_ID ? `yes (${CLIENT_ID.length} chars)` : 'no');
console.log('GUILD_ID loaded:', GUILD_ID ? `yes (${GUILD_ID.length} chars)` : 'no');
console.log('REPORT_CHANNEL_ID loaded:', REPORT_CHANNEL_ID ? 'yes' : 'no');
console.log('MOD_LOG_CHANNEL_ID loaded:', MOD_LOG_CHANNEL_ID ? 'yes' : 'no');

if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN');
}

if (!MONGO_URI) {
  console.error('Missing MONGO_URI');
}

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected');
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
  });

mongoose.connection.on('error', (err) => {
  console.error('MongoDB runtime error:', err.message);
});

/* ----------------------------- DISCORD CLIENT ----------------------------- */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember,
    Partials.User
  ]
});

/* ----------------------------- HELPERS ----------------------------- */

function nowIso() {
  return new Date().toISOString();
}

function truncate(text, max = 1000) {
  if (!text) return 'N/A';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function memberHasAnyRole(member, roleIds = []) {
  if (!member || !member.roles?.cache) return false;
  return roleIds.some(roleId => member.roles.cache.has(roleId));
}

function isPremiumExempt(member) {
  return memberHasAnyRole(member, PREMIUM_EXEMPT_ROLES);
}

function isStaff(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  if (member.permissions?.has(PermissionsBitField.Flags.BanMembers)) return true;
  return memberHasAnyRole(member, STAFF_ROLES);
}

function isProtectedName(name = '') {
  const clean = normalizeText(name);
  return PROTECTED_PATTERNS.some(pattern => clean.includes(pattern));
}

function accountAgeMs(user) {
  if (!user?.createdTimestamp) return Number.MAX_SAFE_INTEGER;
  return Date.now() - user.createdTimestamp;
}

function isYoungAccount(user) {
  return accountAgeMs(user) < MIN_ACCOUNT_AGE_MS;
}

function containsDiscordInvite(text = '') {
  return /(discord\.gg\/|discord\.com\/invite\/)/i.test(text);
}

function containsExternalLink(text = '') {
  const hasUrl = /(https?:\/\/|www\.)/i.test(text);
  const isDiscordInvite = containsDiscordInvite(text);
  return hasUrl && !isDiscordInvite;
}

function containsScamKeywords(text = '') {
  const patterns = [
    /guaranteed profit/i,
    /dm me for signals/i,
    /join my server/i,
    /forex mentor/i,
    /crypto recovery/i,
    /double your money/i,
    /investment group/i,
    /100% win rate/i,
    /send me a message/i,
    /limited spots/i,
    /free vip/i,
    /claim your winnings/i,
    /airdrop/i
  ];

  return patterns.some(rx => rx.test(text));
}

async function getTextChannel(channelId) {
  if (!channelId) return null;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return null;
    return channel;
  } catch {
    return null;
  }
}

async function sendModLog({
  guild,
  title,
  color = 0xff0000,
  fields = [],
  description = '',
  footer = 'Showtime Guardian'
}) {
  try {
    if (!guild || !MOD_LOG_CHANNEL_ID) return;

    const channel = await getTextChannel(MOD_LOG_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setTimestamp()
      .setFooter({ text: footer });

    if (description) {
      embed.setDescription(truncate(description, 4096));
    }

    if (fields.length) {
      embed.addFields(fields);
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('sendModLog error:', err.message);
  }
}

async function sendReportEmbed({ guild, reportDoc }) {
  try {
    if (!guild || !REPORT_CHANNEL_ID || !reportDoc) return;

    const channel = await getTextChannel(REPORT_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🚨 New User Report')
      .setColor(0xffa500)
      .addFields(
        {
          name: 'Reporter',
          value: `<@${reportDoc.reporterId}> (${reportDoc.reporterTag})`,
          inline: false
        },
        {
          name: 'Reported User',
          value: `<@${reportDoc.targetId}> (${reportDoc.targetTag})`,
          inline: false
        },
        {
          name: 'Reason',
          value: truncate(reportDoc.reason || 'No reason provided', 1024),
          inline: false
        },
        {
          name: 'Status',
          value: reportDoc.status || 'open',
          inline: true
        }
      )
      .setTimestamp();

    if (reportDoc.messageLink) {
      embed.addFields({
        name: 'Message Link',
        value: reportDoc.messageLink,
        inline: false
      });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('sendReportEmbed error:', err.message);
  }
}

function shouldIgnoreAutomod(message) {
  if (!message?.guild || !message?.member) return true;
  if (message.author?.bot) return true;
  if (isStaff(message.member)) return true;
  if (isPremiumExempt(message.member)) return true;
  return false;
}

function evaluateMessageRisk(message) {
  const content = message.content || '';

  const hasInvite = containsDiscordInvite(content);
  const hasExternal = containsExternalLink(content);
  const hasScamTerms = containsScamKeywords(content);
  const young = isYoungAccount(message.author);

  let action = null;
  let reason = null;

  if (AUTO_BAN_DISCORD_INVITES === 'true' && hasInvite) {
    action = 'ban';
    reason = 'Posted a Discord invite link';
  } else if (AUTO_BAN_EXTERNAL_LINKS === 'true' && hasExternal) {
    action = 'ban';
    reason = 'Posted an external link';
  } else if (young && hasScamTerms) {
    action = 'ban';
    reason = 'Young account posted likely scam/advertising content';
  } else if (hasScamTerms) {
    action = 'delete';
    reason = 'Scam/advertising language detected';
  }

  return {
    action,
    reason,
    meta: {
      hasInvite,
      hasExternal,
      hasScamTerms,
      young
    }
  };
}

async function handleAutomodViolation(message, risk) {
  if (!message?.guild || !risk?.action) return;

  const guild = message.guild;
  const member = message.member;

  try {
    if (message.deletable) {
      await message.delete().catch(() => null);
    }

    if (risk.action === 'ban' && member?.bannable) {
      await member.ban({
        deleteMessageSeconds: 60 * 60,
        reason: `AutoMod: ${risk.reason}`
      });

      await sendModLog({
        guild,
        title: '🔨 Auto-Ban Triggered',
        color: 0xff0000,
        fields: [
          {
            name: 'User',
            value: `${member.user.tag} (${member.id})`,
            inline: false
          },
          {
            name: 'Channel',
            value: `${message.channel}`,
            inline: true
          },
          {
            name: 'Reason',
            value: risk.reason,
            inline: true
          },
          {
            name: 'Message',
            value: truncate(message.content || '[no content]'),
            inline: false
          }
        ]
      });

      console.log(`[AutoMod][BAN] ${member.user.tag} | ${risk.reason}`);
      return;
    }

    await sendModLog({
      guild,
      title: '🧹 Auto-Delete Triggered',
      color: 0xff9900,
      fields: [
        {
          name: 'User',
          value: `${message.author.tag} (${message.author.id})`,
          inline: false
        },
        {
          name: 'Channel',
          value: `${message.channel}`,
          inline: true
        },
        {
          name: 'Reason',
          value: risk.reason,
          inline: true
        },
        {
          name: 'Message',
          value: truncate(message.content || '[no content]'),
          inline: false
        }
      ]
    });

    console.log(`[AutoMod][DELETE] ${message.author.tag} | ${risk.reason}`);
  } catch (err) {
    console.error('handleAutomodViolation error:', err.message);
  }
}

async function runMessageModeration(message) {
  try {
    if (!message?.guild || !message.content) return;
    if (shouldIgnoreAutomod(message)) return;

    const riskResult = evaluateMessageRisk(message);

    let externalRisk = null;
    try {
      if (typeof riskEngine?.analyzeMessage === 'function') {
        externalRisk = await riskEngine.analyzeMessage({
          content: message.content,
          username: message.author?.username,
          displayName: message.member?.displayName,
          accountAgeMs: accountAgeMs(message.author)
        });
      }
    } catch (err) {
      console.error('riskEngine.analyzeMessage error:', err.message);
    }

    if (externalRisk?.action && !riskResult.action) {
      riskResult.action = externalRisk.action;
      riskResult.reason = externalRisk.reason || 'Flagged by risk engine';
    }

    if (riskResult.action) {
      await handleAutomodViolation(message, riskResult);
    }
  } catch (err) {
    console.error('runMessageModeration error:', err.message);
  }
}

async function checkMemberImpersonation(member) {
  if (!member?.guild || !member?.user) return;

  try {
    if (isStaff(member) || isPremiumExempt(member)) return;

    const username = normalizeText(member.user.username);
    const displayName = normalizeText(
      member.displayName || member.user.globalName || member.user.username
    );

    const suspicious =
      isProtectedName(username) ||
      isProtectedName(displayName);

    if (!suspicious) return;

    const young = isYoungAccount(member.user);
    const reason = 'Possible staff/brand impersonation';

    if (young && member.bannable) {
      await member.ban({
        deleteMessageSeconds: 60 * 60,
        reason: `AutoMod: ${reason}`
      });

      await sendModLog({
        guild: member.guild,
        title: '🚫 Impersonation Auto-Ban',
        color: 0xff0000,
        fields: [
          {
            name: 'User',
            value: `${member.user.tag} (${member.id})`,
            inline: false
          },
          {
            name: 'Display Name',
            value: truncate(member.displayName || 'N/A', 256),
            inline: true
          },
          {
            name: 'Username',
            value: truncate(member.user.username || 'N/A', 256),
            inline: true
          },
          {
            name: 'Reason',
            value: reason,
            inline: false
          }
        ]
      });

      return;
    }

    await sendModLog({
      guild: member.guild,
      title: '⚠️ Impersonation Flag',
      color: 0xffcc00,
      fields: [
        {
          name: 'User',
          value: `${member.user.tag} (${member.id})`,
          inline: false
        },
        {
          name: 'Display Name',
          value: truncate(member.displayName || 'N/A', 256),
          inline: true
        },
        {
          name: 'Username',
          value: truncate(member.user.username || 'N/A', 256),
          inline: true
        },
        {
          name: 'Reason',
          value: reason,
          inline: false
        }
      ]
    });
  } catch (err) {
    console.error('checkMemberImpersonation error:', err.message);
  }
}

async function performJoinVetting(member) {
  if (!member?.guild || !member?.user) return;

  try {
    if (isStaff(member) || isPremiumExempt(member)) return;

    const young = isYoungAccount(member.user);
    const suspiciousName =
      isProtectedName(member.displayName) ||
      isProtectedName(member.user.username);

    try {
      if (typeof raidDetection?.trackJoin === 'function') {
        await raidDetection.trackJoin(member.guild.id, member.user.id);
      }
    } catch (err) {
      console.error('raidDetection.trackJoin error:', err.message);
    }

    await sendModLog({
      guild: member.guild,
      title: '👤 Member Joined',
      color: 0x3498db,
      fields: [
        {
          name: 'User',
          value: `${member.user.tag} (${member.id})`,
          inline: false
        },
        {
          name: 'Account Created',
          value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`,
          inline: false
        },
        {
          name: 'Young Account',
          value: young ? 'Yes' : 'No',
          inline: true
        },
        {
          name: 'Protected Name Match',
          value: suspiciousName ? 'Yes' : 'No',
          inline: true
        }
      ]
    });

    if (suspiciousName) {
      await checkMemberImpersonation(member);
    }
  } catch (err) {
    console.error('performJoinVetting error:', err.message);
  }
}

/* ----------------------------- EVENTS ----------------------------- */

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag} at ${nowIso()}`);

  const runtimeClientId = (process.env.CLIENT_ID || '').trim();
  const runtimeGuildId = (process.env.GUILD_ID || '').trim();

  console.log(
    'Command registration IDs:',
    JSON.stringify({
      clientIdPresent: !!runtimeClientId,
      guildIdPresent: !!runtimeGuildId,
      clientIdLength: runtimeClientId.length,
      guildIdLength: runtimeGuildId.length
    })
  );

  try {
    if (!runtimeClientId || !runtimeGuildId) {
      throw new Error('CLIENT_ID or GUILD_ID missing at runtime');
    }

await registerCommands(runtimeClientId, runtimeGuildId);
    console.log('Slash commands registered');
  } catch (err) {
    console.error('registerCommands failed:', err.message);
  }
});

client.on('guildMemberAdd', async (member) => {
  await performJoinVetting(member);
});

client.on('guildMemberUpdate', async (_oldMember, newMember) => {
  await checkMemberImpersonation(newMember);
});

client.on('messageCreate', async (message) => {
  await runMessageModeration(message);
});

client.on('messageUpdate', async (_oldMessage, newMessage) => {
  try {
    if (newMessage.partial) {
      await newMessage.fetch().catch(() => null);
    }

    await runMessageModeration(newMessage);
  } catch (err) {
    console.error('messageUpdate moderation error:', err.message);
  }
});

/* ----------------------------- INTERACTIONS ----------------------------- */

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'report') {
      const reportedUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      const messageLink = interaction.options.getString('message_link') || null;

      const reportDoc = await Report.create({
        guildId: interaction.guildId,
        reporterId: interaction.user.id,
        reporterTag: interaction.user.tag,
        targetId: reportedUser.id,
        targetTag: reportedUser.tag,
        reason,
        messageLink
      });

      await sendReportEmbed({
        guild: interaction.guild,
        reportDoc
      });

      await sendModLog({
        guild: interaction.guild,
        title: '📨 Report Submitted',
        color: 0x9b59b6,
        fields: [
          {
            name: 'Reporter',
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: false
          },
          {
            name: 'Reported User',
            value: `${reportedUser.tag} (${reportedUser.id})`,
            inline: false
          },
          {
            name: 'Reason',
            value: truncate(reason, 1024),
            inline: false
          }
        ]
      });

      await interaction.reply({
        content: 'Your report has been submitted to the moderation team.',
        flags: 64
      });

      return;
    }

    if (interaction.commandName === 'appeal') {
      const appealText = interaction.options.getString('reason', true);

      await Appeal.create({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        reason: appealText,
        createdAt: new Date()
      });

      await sendModLog({
        guild: interaction.guild,
        title: '📝 Ban Appeal Submitted',
        color: 0x2ecc71,
        fields: [
          {
            name: 'User',
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: false
          },
          {
            name: 'Appeal',
            value: truncate(appealText, 1024),
            inline: false
          }
        ]
      });

      await interaction.reply({
        content: 'Your appeal has been submitted for review.',
        flags: 64
      });

      return;
    }
  } catch (err) {
    console.error('interactionCreate error:', err);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Something went wrong while processing that command.',
        flags: 64
      }).catch(() => null);
    }
  }
});

/* ----------------------------- OPTIONAL MOD LOGGING ----------------------------- */

client.on('guildBanAdd', async (ban) => {
  await sendModLog({
    guild: ban.guild,
    title: '🔨 Member Banned',
    color: 0xe74c3c,
    fields: [
      {
        name: 'User',
        value: `${ban.user.tag} (${ban.user.id})`,
        inline: false
      }
    ]
  });
});

client.on('guildMemberRemove', async (member) => {
  await sendModLog({
    guild: member.guild,
    title: '📤 Member Left',
    color: 0x95a5a6,
    fields: [
      {
        name: 'User',
        value: `${member.user.tag} (${member.id})`,
        inline: false
      }
    ]
  });
});

/* ----------------------------- LOGIN ----------------------------- */

client.login(BOT_TOKEN).catch((err) => {
  console.error('Discord login failed:', err.message);
});
