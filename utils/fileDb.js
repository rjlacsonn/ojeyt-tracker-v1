const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function defaultDb() {
  return { users: [], sessions: [], shifts: [] };
}

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) return defaultDb();
    return { ...defaultDb(), ...JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) };
  } catch (error) {
    console.error('File DB read error:', error);
    return defaultDb();
  }
}

function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function userToResponse(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    requiredHours: user.requiredHours,
    officeLocation: user.officeLocation,
    autoCheckIn: user.autoCheckIn,
  };
}

function calculateSessionDuration(session) {
  if (!session.endTime) return 0;
  return Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 1000);
}

async function createUser({ fullName, email, password }) {
  const db = readDb();
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: crypto.randomUUID(),
    fullName: String(fullName).trim(),
    email: normalizedEmail,
    password: passwordHash,
    requiredHours: 200,
    officeLocation: {
      latitude: 14.5995,
      longitude: 120.9842,
      radius: 100,
    },
    autoCheckIn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.users.push(user);
  writeDb(db);
  return user;
}

async function validatePassword(user, password) {
  return bcrypt.compare(password, user.password);
}

function findUserByEmail(email) {
  const db = readDb();
  return db.users.find(user => user.email === normalizeEmail(email)) || null;
}

function findUserById(id) {
  const db = readDb();
  return db.users.find(user => user.id === id) || null;
}

function updateUser(id, patch) {
  const db = readDb();
  const index = db.users.findIndex(user => user.id === id);
  if (index === -1) return null;
  db.users[index] = {
    ...db.users[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeDb(db);
  return db.users[index];
}

function getUserSessions(userId) {
  const db = readDb();
  return db.sessions
    .filter(session => session.userId === userId)
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
}

function getActiveSession(userId) {
  const db = readDb();
  return db.sessions.find(session => session.userId === userId && session.isActive) || null;
}

function createSession(sessionData) {
  const db = readDb();
  const session = {
    id: crypto.randomUUID(),
    duration: 0,
    createdAt: new Date().toISOString(),
    ...sessionData,
  };
  db.sessions.push(session);
  writeDb(db);
  return session;
}

function updateSession(id, patch) {
  const db = readDb();
  const index = db.sessions.findIndex(session => session.id === id);
  if (index === -1) return null;
  db.sessions[index] = { ...db.sessions[index], ...patch };
  writeDb(db);
  return db.sessions[index];
}

function getProgress(userId, requiredHours) {
  const shifts = getShifts(userId);
  const totalHours = shifts.reduce((acc, shift) => acc + (shift.total_hours || 0), 0);
  const percentage = requiredHours > 0 ? Math.round((totalHours / requiredHours) * 100) : 0;
  return {
    totalHours: parseFloat(totalHours.toFixed(2)),
    requiredHours,
    percentage: Math.min(percentage, 100),
  };
}

function getShifts(userId) {
  const db = readDb();
  return db.shifts
    .filter(shift => shift.userId === userId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function createShift(shiftData) {
  const db = readDb();
  const shift = {
    id: crypto.randomUUID(),
    ...shiftData,
  };
  db.shifts.push(shift);
  writeDb(db);
  return shift;
}

function deleteShift(userId, shiftId) {
  const db = readDb();
  const index = db.shifts.findIndex(shift => shift.userId === userId && shift.id === shiftId);
  if (index === -1) return false;
  db.shifts.splice(index, 1);
  writeDb(db);
  return true;
}

module.exports = {
  calculateSessionDuration,
  createSession,
  createShift,
  createUser,
  deleteShift,
  findUserByEmail,
  findUserById,
  getActiveSession,
  getProgress,
  getShifts,
  getUserSessions,
  updateSession,
  updateUser,
  userToResponse,
  validatePassword,
};
