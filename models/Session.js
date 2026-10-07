/* ============================================================
   SESSION MODEL — Session tracking schema
   ============================================================ */

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
  },
  duration: {
    type: Number, // in seconds
    default: 0,
  },
  checkInLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
  },
  checkOutLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  notes: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ===== CALCULATE DURATION =====
sessionSchema.methods.calculateDuration = function () {
  if (!this.endTime) {
    return 0;
  }
  return Math.floor((this.endTime - this.startTime) / 1000); // in seconds
};

// ===== INDEX FOR QUERIES =====
sessionSchema.index({ userId: 1, startTime: -1 });

module.exports = mongoose.model('Session', sessionSchema);
