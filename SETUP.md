# OJeyT Tracker — Setup Guide

Welcome! You now have a complete OJT tracking application with **user authentication**, **location-based check-in**, and a modern UI. Here's how to get it running.

## 📋 Prerequisites

- **Node.js** (v14 or higher)
- **MongoDB** (local or Atlas cloud)
- A modern web browser with GPS support (for location features)

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory (copy from `.env.example`):

```env
# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/ojeyt-tracker

# JWT Secret (CHANGE THIS TO SOMETHING SECURE!)
JWT_SECRET=your-super-secret-key-change-this

# Server Port
PORT=5000
```

**For Production:** Use MongoDB Atlas instead of local:
```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/ojeyt-tracker?retryWrites=true&w=majority
```

### 3. Start MongoDB

If using local MongoDB:
```bash
mongod
```

### 4. Start the Server
```bash
node server.js
```

You should see:
```
✓ MongoDB connected
✓ Server running on http://localhost:5000
```

### 5. Open the App

Visit: **http://localhost:5000**

## 📱 Features

### ✅ User Accounts
- **Sign up** with email & password
- **Login** securely with JWT tokens
- Private session data per user
- Each classmate has their own account

### 📍 Location-Based Check-in
- **GPS verification**: Automatically checks if you're near the office
- **Office location setup**: Configure in Settings
- **Detection radius**: Set how close you need to be (default: 100m)
- **Auto-checkin**: Optional automatic check-in when entering office area
- **Warning system**: Alerts if you check in outside the office range

### 📊 Dashboard
- Real-time session timer
- Progress ring showing hours completion
- Daily/weekly statistics
- Streak tracking
- Recent sessions list

### 📋 Session History
- View all check-in/check-out records
- Filter by date range
- Duration for each session

### ⚙️ Settings
- Update required OJT hours
- Set office location (GPS or manual coordinates)
- Adjust detection radius
- Toggle auto-check-in feature

## 🗺️ Setting Office Location

### Option 1: Use GPS
1. Go to Settings
2. Click "📍 Use Current Location"
3. This automatically sets your coordinates

### Option 2: Manual Entry
1. Get coordinates from Google Maps
2. Enter latitude & longitude in Settings
3. Set detection radius (10-1000 meters)

**Example Default:** Manila coordinates (14.5995, 120.9842)

## 🔐 Security

- Passwords are **hashed** with bcryptjs
- JWT tokens expire after **30 days**
- Each user can only access their own data
- All API endpoints require authentication

## 🛠️ API Endpoints

### Authentication
- `POST /api/auth/signup` — Create account
- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Get current user
- `PUT /api/auth/settings` — Update settings

### Sessions
- `POST /api/sessions/check-in` — Start session (with location)
- `POST /api/sessions/check-out` — End session
- `GET /api/sessions` — Get all sessions
- `GET /api/sessions/current` — Get active session
- `GET /api/sessions/stats/weekly` — Weekly statistics

## 📂 Project Structure

```
ojeyt-tracker/
├── server.js                 # Express server
├── models/
│   ├── User.js              # User schema
│   └── Session.js           # Session schema
├── routes/
│   ├── auth.js              # Auth endpoints
│   └── sessions.js          # Session endpoints
├── ojeyt-tracker/           # Frontend
│   ├── index.html           # HTML structure
│   ├── js/
│   │   ├── api.js           # API client
│   │   ├── auth.js          # Auth handler
│   │   ├── app.js           # Main app logic
│   │   ├── timer.js         # Timer utility
│   │   ├── storage.js       # Local storage
│   │   └── ui.js            # UI utilities
│   └── css/
│       ├── variables.css    # Design tokens
│       ├── layout.css       # Layout styles
│       ├── pages.css        # Page styles
│       ├── animations.css   # Animations
│       └── responsive.css   # Mobile/tablet/desktop
├── .env.example             # Environment template
└── package.json             # Dependencies
```

## 🐛 Troubleshooting

### "Cannot find module 'cors'"
```bash
npm install cors dotenv
```

### MongoDB Connection Error
- Make sure `mongod` is running
- Check `MONGO_URI` in `.env`
- For Atlas, check username/password

### Location Permission Denied
- Browser blocked location access
- Check browser settings: Settings → Privacy & Security → Site Permissions
- Allow location access for localhost

### "JWT is not defined"
- Make sure all script files load in order:
  1. api.js
  2. auth.js
  3. storage.js
  4. timer.js
  5. ui.js
  6. app.js

## 🎓 For Your Classmates

Share these instructions:

1. **Sign up** at the first login
2. **Configure office location** in Settings (get GPS coordinates from Google Maps)
3. **Check in** when arriving (click the green button)
4. **Check out** when leaving
5. **Monitor progress** on the Dashboard

Each classmate's hours are **completely private**.

## 🚀 Deployment

### To Deploy to Production:

1. **Use MongoDB Atlas** (cloud database)
2. **Set strong JWT_SECRET**
3. **Deploy server** (Heroku, Railway, Render)
4. **Update API_BASE** in `ojeyt-tracker/js/api.js` to your deployed server URL

```javascript
// In api.js
const API_BASE = 'https://your-deployed-server.com/api';
```

## 📝 Notes

- **Offline mode**: App stores sessions locally if offline
- **Auto-sync**: Syncs to server when connection restored
- **Multiple devices**: Same account works on multiple devices
- **Session duration**: Must be at least 1 minute to save

## 💡 Future Enhancements

- [ ] Email notifications
- [ ] Monthly reports
- [ ] Team view (admin only)
- [ ] Overtime tracking
- [ ] Mobile app
- [ ] Biometric check-in

## 📞 Support

If you have issues:
1. Check the browser console (F12 → Console tab)
2. Check server logs in the terminal
3. Verify `.env` settings
4. Make sure MongoDB is running

---

**Happy tracking! 🎉**
