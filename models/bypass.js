const mongoose = require('mongoose');

const bypassSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true
  },

  userId: {
    type: String,
    required: true
  },

  addedBy: {
    type: String,
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

bypassSchema.index(
  { guildId: 1, userId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  'Bypass',
  bypassSchema
);
