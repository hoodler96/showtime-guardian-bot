const mongoose = require('mongoose');

const strikeSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    guildId: {
      type: String,
      required: true,
      index: true
    },
    count: {
      type: Number,
      default: 0
    },
    lastStrikeAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

strikeSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('Strike', strikeSchema);
