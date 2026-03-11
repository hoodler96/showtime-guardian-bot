const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  guildId: { type: String, required: true },
  reporterId: { type: String, required: true },
  reporterTag: { type: String, required: true },
  targetId: { type: String, required: true },
  targetTag: { type: String, required: true },
  reason: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', schema);
