module.exports.checkRaid = function(joinTimestamps, guild) {

  const now = Date.now();
  const lastMinute = joinTimestamps.filter(t => now - t < 60000);

  if (lastMinute.length >= 10) {
    console.log("Raid detected. Locking server.");

    guild.channels.cache.forEach(channel => {
      if (channel.permissionOverwrites) {
        channel.permissionOverwrites.edit(guild.roles.everyone, {
          SendMessages: false
        });
      }
    });
  }
}
