/* ============================================================
   SERVER — OJeyT Tracker Backend
   Express + MongoDB setup with authentication
   ============================================================ */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== MONGODB CONNECTION =====
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ojeyt-tracker';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✓ MongoDB connected'))
  .catch(err => console.error('✗ MongoDB connection error:', err));

// ===== MODELS =====
const User = require('./models/User');
const Session = require('./models/Session');

// ===== ROUTES =====
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const shiftRoutes = require('./routes/shifts');

app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/shifts', shiftRoutes);

// ===== SERVE FRONTEND =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n✓ Server running on http://localhost:${PORT}\n`);
});
