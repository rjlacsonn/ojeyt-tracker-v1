/* ============================================================
   SESSION ROUTES — Check-in/Check-out with location
   ============================================================ */

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');
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

// ===== HELPER: CALCULATE DISTANCE =====
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ===== CHECK IN =====
router.post('/check-in', verifyToken, async (req, res) => {
  try {
    const { latitude, longitude, forceCheckIn } = req.body;

    // ===== VALIDATE INPUT =====
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'Location coordinates required' });
    }

    // ===== GET USER & CHECK OFFICE LOCATION =====
    if (useFileDb()) {
      const user = fileDb.findUserById(req.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const distance = calculateDistance(
        user.officeLocation.latitude,
        user.officeLocation.longitude,
        latitude,
        longitude
      );

      const withinRange = distance <= user.officeLocation.radius;
      const activeSession = fileDb.getActiveSession(req.userId);
      if (activeSession) {
        return res.status(400).json({ success: false, message: 'Already checked in' });
      }

      const newSession = fileDb.createSession({
        userId: req.userId,
        startTime: new Date().toISOString(),
        checkInLocation: { latitude, longitude },
        isActive: true,
      });

      return res.status(201).json({
        success: true,
        message: withinRange
          ? 'Checked in successfully'
          : 'Warning: You are outside office range. Check-in recorded anyway.',
        session: {
          id: newSession.id,
          startTime: newSession.startTime,
          withinRange,
          distance: parseFloat(distance.toFixed(2)),
          officeRadius: user.officeLocation.radius,
        },
      });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const distance = calculateDistance(
      user.officeLocation.latitude,
      user.officeLocation.longitude,
      latitude,
      longitude
    );

    let withinRange = distance <= user.officeLocation.radius;

    // ===== CHECK IF ALREADY CHECKED IN =====
    const activeSession = await Session.findOne({ userId: req.userId, isActive: true });
    if (activeSession) {
      return res.status(400).json({ success: false, message: 'Already checked in' });
    }

    // ===== CREATE NEW SESSION =====
    const newSession = new Session({
      userId: req.userId,
      startTime: new Date(),
      checkInLocation: {
        latitude,
        longitude,
      },
      isActive: true,
    });

    await newSession.save();

    res.status(201).json({
      success: true,
      message: withinRange
        ? 'Checked in successfully'
        : 'Warning: You are outside office range. Check-in recorded anyway.',
      session: {
        id: newSession._id,
        startTime: newSession.startTime,
        withinRange,
        distance: parseFloat(distance.toFixed(2)),
        officeRadius: user.officeLocation.radius,
      },
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ success: false, message: 'Error checking in' });
  }
});

// ===== CHECK OUT =====
router.post('/check-out', verifyToken, async (req, res) => {
  try {
    const { latitude, longitude, notes } = req.body;

    // ===== GET ACTIVE SESSION =====
    if (useFileDb()) {
      const session = fileDb.getActiveSession(req.userId);
      if (!session) {
        return res.status(400).json({ success: false, message: 'No active session' });
      }

      const endTime = new Date().toISOString();
      const duration = fileDb.calculateSessionDuration({ ...session, endTime });
      const updatedSession = fileDb.updateSession(session.id, {
        endTime,
        isActive: false,
        duration,
        notes,
        ...(latitude !== undefined && longitude !== undefined && {
          checkOutLocation: { latitude, longitude },
        }),
      });

      const durationMins = Math.floor(updatedSession.duration / 60);
      const durationHours = (updatedSession.duration / 3600).toFixed(2);

      return res.json({
        success: true,
        message: 'Checked out successfully',
        session: {
          id: updatedSession.id,
          startTime: updatedSession.startTime,
          endTime: updatedSession.endTime,
          duration: `${durationHours}h (${durationMins}m)`,
          durationSeconds: updatedSession.duration,
          notes: updatedSession.notes || '',
        },
      });
    }

    const session = await Session.findOne({ userId: req.userId, isActive: true });
    if (!session) {
      return res.status(400).json({ success: false, message: 'No active session' });
    }

    // ===== UPDATE SESSION =====
    session.endTime = new Date();
    session.isActive = false;
    session.duration = session.calculateDuration();
    if (latitude !== undefined && longitude !== undefined) {
      session.checkOutLocation = { latitude, longitude };
    }
    if (notes !== undefined) {
      session.notes = notes;
    }

    await session.save();

    const durationMins = Math.floor(session.duration / 60);
    const durationHours = (session.duration / 3600).toFixed(2);

    res.json({
      success: true,
      message: 'Checked out successfully',
      session: {
        id: session._id,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: `${durationHours}h (${durationMins}m)`,
        durationSeconds: session.duration,
        notes: session.notes || '',
        notes: session.notes || '',
      },
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ success: false, message: 'Error checking out' });
  }
});

// ===== RESET ACTIVE SESSION =====
router.post('/reset', verifyToken, async (req, res) => {
  try {
    if (useFileDb()) {
      const session = fileDb.getActiveSession(req.userId);
      if (!session) {
        return res.status(400).json({ success: false, message: 'No active session' });
      }

      const updatedSession = fileDb.updateSession(session.id, {
        startTime: new Date().toISOString(),
        duration: 0,
      });

      return res.json({
        success: true,
        message: 'Session reset successfully',
        session: updatedSession,
      });
    }

    const session = await Session.findOne({ userId: req.userId, isActive: true });
    if (!session) {
      return res.status(400).json({ success: false, message: 'No active session' });
    }

    session.startTime = new Date();
    session.duration = 0;
    await session.save();

    res.json({
      success: true,
      message: 'Session reset successfully',
      session: {
        id: session._id,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        notes: session.notes || '',
      },
    });
  } catch (error) {
    console.error('Reset session error:', error);
    res.status(500).json({ success: false, message: 'Error resetting session' });
  }
});

// ===== GET ALL SESSIONS FOR USER =====
router.get('/', verifyToken, async (req, res) => {
  try {
    if (useFileDb()) {
      const sessions = fileDb.getUserSessions(req.userId);
      const formattedSessions = sessions.map(s => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: s.duration,
        durationFormatted: s.duration
          ? `${(s.duration / 3600).toFixed(2)}h`
          : 'Active',
        isActive: s.isActive,
        checkInLocation: s.checkInLocation,
        checkOutLocation: s.checkOutLocation,
      }));

      return res.json({
        success: true,
        sessions: formattedSessions,
        total: formattedSessions.length,
      });
    }

    const sessions = await Session.find({ userId: req.userId }).sort({ startTime: -1 });

    const formattedSessions = sessions.map(s => ({
      id: s._id,
      startTime: s.startTime,
      endTime: s.endTime,
      duration: s.duration,
      durationFormatted: s.duration
        ? `${(s.duration / 3600).toFixed(2)}h`
        : 'Active',
      isActive: s.isActive,
      checkInLocation: s.checkInLocation,
      checkOutLocation: s.checkOutLocation,
    }));

    res.json({
      success: true,
      sessions: formattedSessions,
      total: formattedSessions.length,
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ success: false, message: 'Error fetching sessions' });
  }
});

// ===== GET CURRENT SESSION =====
router.get('/current', verifyToken, async (req, res) => {
  try {
    if (useFileDb()) {
      const session = fileDb.getActiveSession(req.userId);

      if (!session) {
        return res.json({ success: true, session: null });
      }

      const now = new Date();
      const elapsed = Math.floor((now - new Date(session.startTime)) / 1000);

      return res.json({
        success: true,
        session: {
          id: session.id,
          startTime: session.startTime,
          elapsedSeconds: elapsed,
          checkInLocation: session.checkInLocation,
        },
      });
    }

    const session = await Session.findOne({ userId: req.userId, isActive: true });

    if (!session) {
      return res.json({ success: true, session: null });
    }

    const now = new Date();
    const elapsed = Math.floor((now - session.startTime) / 1000);

    res.json({
      success: true,
      session: {
        id: session._id,
        startTime: session.startTime,
        elapsedSeconds: elapsed,
        checkInLocation: session.checkInLocation,
      },
    });
  } catch (error) {
    console.error('Get current session error:', error);
    res.status(500).json({ success: false, message: 'Error fetching current session' });
  }
});

// ===== GET WEEKLY STATS =====
router.get('/stats/weekly', verifyToken, async (req, res) => {
  try {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    if (useFileDb()) {
      const sessions = fileDb.getUserSessions(req.userId).filter(session =>
        new Date(session.startTime) >= weekStart && !session.isActive
      );

      const totalSeconds = sessions.reduce((acc, s) => acc + s.duration, 0);
      const totalHours = (totalSeconds / 3600).toFixed(2);
      const daysWorked = new Set(sessions.map(s => new Date(s.startTime).toDateString())).size;

      return res.json({
        success: true,
        stats: {
          totalHours: parseFloat(totalHours),
          totalSessions: sessions.length,
          daysWorked,
        },
      });
    }

    const sessions = await Session.find({
      userId: req.userId,
      startTime: { $gte: weekStart },
      isActive: false,
    });

    const totalSeconds = sessions.reduce((acc, s) => acc + s.duration, 0);
    const totalHours = (totalSeconds / 3600).toFixed(2);
    const daysWorked = new Set(sessions.map(s => s.startTime.toDateString())).size;

    res.json({
      success: true,
      stats: {
        totalHours: parseFloat(totalHours),
        totalSessions: sessions.length,
        daysWorked,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Error fetching stats' });
  }
});

module.exports = router;
