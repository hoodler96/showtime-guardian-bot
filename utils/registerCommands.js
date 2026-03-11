const { REST, Routes } = require('discord.js');

async function registerCommands({ token, clientId, guildId }) {
  const commands = [
    {
      name: 'report',
      description: 'Report a user to the server admins/mods',
      options: [
        {
          name: 'user',
          description: 'The user you are reporting',
          type: 6,
          required: true
        },
        {
          name: 'reason',
          description: 'Reason for the report',
          type: 3,
          required: true
        }
      ]
    }
  ];

  const rest = new REST({ version: '10' }).setToken(token);

  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commands }
  );

  console.log('Slash commands registered for guild:', guildId);
}

module.exports = registerCommands;
