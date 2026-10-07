/* ============================================================
   SHIFT ROUTES — Manual shift logging
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

// ===== SAVE SHIFT =====
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      date,
      morning_in,
      morning_out,
      afternoon_in,
      afternoon_out,
      overtime_start,
      overtime_end,
      total_hours
    } = req.body;

    // ===== VALIDATE INPUT =====
    if (!date || !morning_in || !morning_out) {
      return res.status(400).json({ success: false, message: 'Date, morning clock-in, and clock-out are required' });
    }

    if (useFileDb()) {
      const user = fileDb.findUserById(req.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const newShift = fileDb.createShift({
        userId: req.userId,
        date,
        morning_in,
        morning_out,
        afternoon_in,
        afternoon_out,
        overtime_start,
        overtime_end,
        total_hours: parseFloat(total_hours) || 0,
        created_at: new Date().toISOString(),
      });

      return res.status(201).json({
        success: true,
        message: 'Shift saved successfully',
        shift: newShift,
      });
    }

    // MongoDB implementation would go here
    return res.status(500).json({ success: false, message: 'MongoDB not implemented for shifts' });

  } catch (error) {
    console.error('Save shift error:', error);
    res.status(500).json({ success: false, message: 'Failed to save shift' });
  }
});

// ===== GET SHIFTS =====
router.get('/', verifyToken, async (req, res) => {
  try {
    if (useFileDb()) {
      const shifts = fileDb.getShifts(req.userId);
      return res.json({
        success: true,
        shifts: shifts || [],
        total: shifts?.length || 0,
      });
    }

    // MongoDB implementation would go here
    return res.status(500).json({ success: false, message: 'MongoDB not implemented for shifts' });

  } catch (error) {
    console.error('Get shifts error:', error);
    res.status(500).json({ success: false, message: 'Failed to get shifts' });
  }
});

// ===== DELETE SHIFT =====
router.delete('/:shiftId', verifyToken, async (req, res) => {
  try {
    const { shiftId } = req.params;

    if (useFileDb()) {
      const success = fileDb.deleteShift(req.userId, shiftId);
      if (!success) {
        return res.status(404).json({ success: false, message: 'Shift not found' });
      }

      return res.json({
        success: true,
        message: 'Shift deleted successfully',
      });
    }

    // MongoDB implementation would go here
    return res.status(500).json({ success: false, message: 'MongoDB not implemented for shifts' });

  } catch (error) {
    console.error('Delete shift error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete shift' });
  }
});

module.exports = router;