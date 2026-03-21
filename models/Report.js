const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true
    },
    reporterId: {
      type: String,
      required: true,
      index: true
    },
    reporterTag: {
      type: String,
      required: true
    },
    targetId: {
      type: String,
      required: true,
      index: true
    },
    targetTag: {
      type: String,
      required: true
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    messageLink: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved', 'dismissed'],
      default: 'open'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Report', reportSchema);
