const { REST, Routes, SlashCommandBuilder } = require('discord.js');

module.exports = async function registerCommands(clientId, guildId, botToken) {
  const cleanClientId = String(clientId || '').trim();
  const cleanGuildId = String(guildId || '').trim();
  const cleanToken = String(botToken || '').trim();

  console.log('registerCommands received:', {
    cleanClientId,
    cleanGuildId,
    tokenPresent: !!cleanToken,
    tokenLength: cleanToken.length
  });

  if (!cleanClientId) {
    throw new Error('CLIENT_ID missing inside registerCommands');
  }

  if (!cleanGuildId) {
    throw new Error('GUILD_ID missing inside registerCommands');
  }

  if (!cleanToken) {
    throw new Error('BOT_TOKEN missing inside registerCommands');
  }

  const commands = [
    new SlashCommandBuilder()
      .setName('report')
      .setDescription('Report a user to the moderators')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to report')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for the report')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('message_link')
          .setDescription('Optional link to the message')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('appeal')
      .setDescription('Submit an appeal')
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Why should the moderation action be reviewed?')
          .setRequired(true)
      )
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(cleanToken);

  await rest.put(
    Routes.applicationGuildCommands(cleanClientId, cleanGuildId),
    { body: commands }
  );
};
