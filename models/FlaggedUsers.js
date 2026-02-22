const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: String,
  username: String,
  normalizedUsername: String,
  riskScore: Number,
  actionTaken: String,
  flaggedWallets: [String],
  flaggedDomains: [String],
  messageHashes: [String],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("FlaggedUser", schema);
