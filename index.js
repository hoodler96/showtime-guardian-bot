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
app.get('/', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Web keep-alive listening on ${PORT}`);
});

console.log('Token length:', process.env.BOT_TOKEN?.length);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected');
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
  });

mongoose.connection.on('error', (err) => {
  console.error('Mongo runtime error:', err.message);
});

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

client.once('ready', async () => {
  console.log(`Guardian Online: ${client.user.tag}`);

  try {
    await registerCommands({
      token: process.env.BOT_TOKEN,
      clientId: client.user.id,
      guildId: process.env.GUILD_ID
    });
    console.log('Command registration attempt finished.');
  } catch (e) {
    console.error('Command registration failed:', e.message);
  }
});

client.on('guildMemberAdd', async (member) => {
  joinTimestamps.push(Date.now());
  raidDetection.checkRaid(joinTimestamps, member.guild);

  const result = await riskEngine.evaluateMember(member);

  if (result.autoBan) {
    try {
      await member.send('You were banned due to impersonation detection. If this is an error, reply here to appeal.');
    } catch {}
    await member.ban({ reason: result.reason });
    return;
  }

  if (result.kick) {
    try {
      await member.send('You were removed due to high risk score. Reply to this DM to appeal.');
    } catch {}
    await member.kick(result.reason);
    return;
  }

  if (result.timeout) {
    await member.timeout(24 * 60 * 60 * 1000, result.reason);
  }

  if (result.quarantine) {
    const role = member.guild.roles.cache.find(r => r.name === 'Quarantine');
    if (role) await member.roles.add(role);
  }
});

client.on('messageCreate', async (message) => {
  if (!message.guild) {
    try {
      const existingAppeal = await Appeal.findOne({
        userId: message.author.id,
        status: 'open'
      });

      if (!existingAppeal) {
        await Appeal.create({
          userId: message.author.id,
          message: message.content
        });
      }
    } catch (err) {
      console.error('Appeal save failed:', err.message);
    }
    return;
  }

  if (message.author.bot) return;

  const member = message.member;
  if (!member) return;

  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  try {
    const result = await riskEngine.evaluateMessage(message);

    if (result.ban) {
      await member.ban({ reason: result.reason });
    } else if (result.kick) {
      await member.kick(result.reason);
    } else if (result.timeout) {
      await member.timeout(24 * 60 * 60 * 1000, result.reason);
    }
  } catch (err) {
    console.error('Message moderation failed:', err.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'report') {
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true).slice(0, 800);

    if (target.id === interaction.user.id) {
      await interaction.reply({
        content: "You can't report yourself.",
        ephemeral: true
      });
      return;
    }

    if (target.bot) {
      await interaction.reply({
        content: "Reporting bots isn't supported here.",
        ephemeral: true
      });
      return;
    }

    try {
      await Report.create({
        guildId: interaction.guildId,
        reporterId: interaction.user.id,
        reporterTag: interaction.user.tag,
        targetId: target.id,
        targetTag: target.tag,
        reason
      });

      const reportChannel = interaction.guild.channels.cache.get(process.env.REPORT_CHANNEL_ID);

      const embed = new EmbedBuilder()
        .setTitle('🚩 New User Report')
        .addFields(
          { name: 'Reported User', value: `${target.tag} (${target.id})` },
          { name: 'Reporter', value: `${interaction.user.tag} (${interaction.user.id})` },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();

      if (reportChannel) {
        await reportChannel.send({ embeds: [embed] });
      } else {
        console.log('REPORT_CHANNEL_ID missing or invalid. Report saved to DB only.');
      }

      await interaction.reply({
        content: 'Report submitted. Staff have been notified.',
        ephemeral: true
      });
    } catch (err) {
      console.error('Report command failed:', err.message);
      await interaction.reply({
        content: 'Report failed to submit.',
        ephemeral: true
      });
    }
  }
});

client.login(process.env.BOT_TOKEN);
