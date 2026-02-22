const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: String,
  message: String,
  status: { type: String, default: "open" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Appeal", schema);
