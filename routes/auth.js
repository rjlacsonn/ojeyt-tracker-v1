/* ============================================================
   AUTH ROUTES — Signup, Login, Logout
   ============================================================ */

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const fileDb = require('../utils/fileDb');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const useFileDb = () => mongoose.connection.readyState !== 1;

// ===== MIDDLEWARE: VERIFY TOKEN =====
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ===== SIGNUP =====
router.post('/signup', async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body;

    // ===== VALIDATION =====
    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // ===== CHECK IF USER EXISTS =====
    if (useFileDb()) {
      const existingUser = fileDb.findUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }

      const newUser = await fileDb.createUser({ fullName, email, password });
      const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '30d' });

      return res.status(201).json({
        success: true,
        message: 'Account created successfully',
        token,
        user: fileDb.userToResponse(newUser),
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // ===== CREATE USER =====
    const newUser = new User({
      fullName,
      email,
      password,
    });

    await newUser.save();

    // ===== CREATE TOKEN =====
    const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        requiredHours: newUser.requiredHours,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Error creating account' });
  }
});

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // ===== VALIDATION =====
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    // ===== FIND USER =====
    if (useFileDb()) {
      const user = fileDb.findUserByEmail(email);
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const isPasswordValid = await fileDb.validatePassword(user, password);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

      return res.json({
        success: true,
        message: 'Login successful',
        token,
        user: fileDb.userToResponse(user),
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // ===== VERIFY PASSWORD =====
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // ===== CREATE TOKEN =====
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        requiredHours: user.requiredHours,
        officeLocation: user.officeLocation,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Error logging in' });
  }
});

// ===== GET CURRENT USER =====
router.get('/me', verifyToken, async (req, res) => {
  try {
    if (useFileDb()) {
      const user = fileDb.findUserById(req.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return res.json({
        success: true,
        user: {
          ...fileDb.userToResponse(user),
          progress: fileDb.getProgress(user.id, user.requiredHours),
        },
      });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const progress = await user.getProgress();

    res.json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        requiredHours: user.requiredHours,
        officeLocation: user.officeLocation,
        autoCheckIn: user.autoCheckIn,
        progress,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Error fetching user' });
  }
});

// ===== UPDATE USER SETTINGS =====
router.put('/settings', verifyToken, async (req, res) => {
  try {
    const { requiredHours, officeLocation, autoCheckIn } = req.body;

    if (useFileDb()) {
      const user = fileDb.updateUser(req.userId, {
        ...(requiredHours && { requiredHours }),
        ...(officeLocation && { officeLocation }),
        ...(autoCheckIn !== undefined && { autoCheckIn }),
      });

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return res.json({
        success: true,
        message: 'Settings updated',
        user: fileDb.userToResponse(user),
      });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        ...(requiredHours && { requiredHours }),
        ...(officeLocation && { officeLocation }),
        ...(autoCheckIn !== undefined && { autoCheckIn }),
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Settings updated',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        requiredHours: user.requiredHours,
        officeLocation: user.officeLocation,
        autoCheckIn: user.autoCheckIn,
      },
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, message: 'Error updating settings' });
  }
});

module.exports = router;
