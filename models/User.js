/* ============================================================
   USER MODEL — User schema for MongoDB
   ============================================================ */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  requiredHours: {
    type: Number,
    default: 200,
  },
  officeLocation: {
    latitude: {
      type: Number,
      default: 14.5995, // Default: Manila, Philippines
    },
    longitude: {
      type: Number,
      default: 120.9842,
    },
    radius: {
      type: Number,
      default: 100, // meters
    },
  },
  autoCheckIn: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// ===== PASSWORD HASHING =====
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ===== PASSWORD COMPARISON =====
userSchema.methods.comparePassword = async function (passwordAttempt) {
  return await bcrypt.compare(passwordAttempt, this.password);
};

// ===== CALC PROGRESS =====
userSchema.methods.getProgress = async function () {
  const Session = require('./Session');
  const sessions = await Session.find({ userId: this._id });
  const totalSecs = sessions.reduce((acc, s) => acc + s.duration, 0);
  const totalHours = totalSecs / 3600;
  const percentage = Math.round((totalHours / this.requiredHours) * 100);
  return {
    totalHours: parseFloat(totalHours.toFixed(2)),
    requiredHours: this.requiredHours,
    percentage: Math.min(percentage, 100),
  };
};

module.exports = mongoose.model('User', userSchema);
