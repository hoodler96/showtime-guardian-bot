require('dotenv').config();
const express = require("express");

const app = express();
app.get("/", (req, res) => res.status(200).send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web keep-alive listening on ${PORT}`));
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');
const riskEngine = require('./utils/riskEngine');
const raidDetection = require('./utils/raidDetection');

mongoose.connect(process.env.MONGO_URI);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const joinTimestamps = [];

client.once('ready', () => {
  console.log(`Guardian Online: ${client.user.tag}`);
});

/* =========================
   JOIN VETTING (NEW USERS ONLY)
========================= */

client.on('guildMemberAdd', async (member) => {

  // Track joins for raid detection
  joinTimestamps.push(Date.now());
  raidDetection.checkRaid(joinTimestamps, member.guild);

  const result = await riskEngine.evaluateMember(member);

  if (result.autoBan) {
    await member.ban({ reason: result.reason });
    return;
  }

  if (result.kick) {
    await member.kick(result.reason);
    return;
  }

  if (result.timeout) {
    await member.timeout(24 * 60 * 60 * 1000, result.reason);
  }

  if (result.quarantine) {
    const role = member.guild.roles.cache.find(r => r.name === "Quarantine");
    if (role) await member.roles.add(role);
  }
});

/* =========================
   MESSAGE MONITORING
========================= */

client.on('messageCreate', async (message) => {

  if (!message.guild) return;
  if (message.author.bot) return;

  const member = message.member;

  // Never punish admins
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const result = await riskEngine.evaluateMessage(message);

  if (result.timeout) {
    await member.timeout(24 * 60 * 60 * 1000, result.reason);
  }

  if (result.kick) {
    await member.kick(result.reason);
  }

  if (result.ban) {
    await member.ban({ reason: result.reason });
  }
});

client.login(process.env.BOT_TOKEN);
