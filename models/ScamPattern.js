const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  type: String,
  value: String,
  severity: Number,
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ScamPattern", schema);
