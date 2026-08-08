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
      ),

    new SlashCommandBuilder()
      .setName('reports')
      .setDescription('View recent reports'),

    new SlashCommandBuilder()
      .setName('bouncer')
      .setDescription('Staff moderation controls')

      .addSubcommand(subcommand =>
        subcommand
          .setName('status')
          .setDescription('View moderation status for a member')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('Member to review')
              .setRequired(true)
          )
      )

      .addSubcommand(subcommand =>
        subcommand
          .setName('strikes')
          .setDescription('View a member\'s current strike count')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('Member to check')
              .setRequired(true)
          )
      )

      .addSubcommand(subcommand =>
        subcommand
          .setName('remove-strike')
          .setDescription('Remove one strike from a member')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('Member to remove one strike from')
              .setRequired(true)
          )
      )

      .addSubcommand(subcommand =>
        subcommand
          .setName('clear-strikes')
          .setDescription('Clear all strikes from a member')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('Member whose strikes should be cleared')
              .setRequired(true)
          )
      )

      .addSubcommand(subcommand =>
        subcommand
          .setName('untimeout')
          .setDescription('Immediately remove a member timeout')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('Member whose timeout should be removed')
              .setRequired(true)
          )
      )

      .addSubcommand(subcommand =>
        subcommand
          .setName('unban')
          .setDescription('Remove a ban using the Discord user ID')
          .addStringOption(option =>
            option
              .setName('user_id')
              .setDescription('Discord user ID of the banned member')
              .setRequired(true)
          )
      )

      .addSubcommand(subcommand =>
        subcommand
          .setName('bypass')
          .setDescription('Exempt a trusted member from Bouncer moderation')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('Member to exempt from moderation')
              .setRequired(true)
          )
      )

      .addSubcommand(subcommand =>
        subcommand
          .setName('unbypass')
          .setDescription('Remove a member moderation bypass')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('Member to return to normal moderation')
              .setRequired(true)
          )
      )

      .addSubcommand(subcommand =>
        subcommand
          .setName('bypass-status')
          .setDescription('Check whether a member bypasses moderation')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('Member to check')
              .setRequired(true)
          )
      )
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(cleanToken);

  await rest.put(
    Routes.applicationGuildCommands(cleanClientId, cleanGuildId),
    {
      body: commands
    }
  );
};
