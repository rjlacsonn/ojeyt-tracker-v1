# OJeyT Tracker 🎓

A clean, responsive OJT (On-the-Job Training) hour tracker built with vanilla HTML, CSS, and JavaScript.

## Getting Started

### Option 1 — Open directly (simplest)
Just double-click `index.html` and it opens in your browser. Done!

### Option 2 — Live Server in VS Code (recommended)
1. Open the `ojeyt-tracker` folder in VS Code
2. Install the **Live Server** extension (by Ritwick Dey)
3. Right-click `index.html` → **Open with Live Server**
4. Your app opens at `http://127.0.0.1:5500` and auto-refreshes on save!

## Project Structure

```
ojeyt-tracker/
├── index.html          ← Main HTML (single page app)
├── css/
│   ├── reset.css       ← Browser normalization
│   ├── variables.css   ← Design tokens, colors, dark mode
│   ├── layout.css      ← Topbar, nav, page containers
│   ├── components.css  ← All UI components (cards, buttons, etc.)
│   ├── pages.css       ← Page-specific styles (minimal)
│   ├── animations.css  ← Keyframes & transitions
│   └── responsive.css  ← Mobile → tablet → desktop breakpoints
├── js/
│   ├── storage.js      ← localStorage wrapper
│   ├── timer.js        ← Session timer logic
│   ├── ui.js           ← DOM rendering helpers
│   └── app.js          ← Main controller (state, events)
└── README.md
```

## Features

- ✅ **Check In / Check Out** — live timer with active session badge
- 📊 **Progress bar** — hours rendered vs. required
- 🔥 **Streak tracker** — consecutive days attended
- 📅 **Session history** — full log with date, time, and duration
- 📈 **Insights** — summary stats + completion forecast
- 📉 **Weekly bar chart** — visual breakdown of this week
- 🌙 **Dark mode** — auto-detects system preference, manually toggleable
- 📱 **Fully responsive** — mobile, tablet, and desktop
- 💾 **Persistent** — all data saved in localStorage (no backend needed)

## Customizing

### Change the color scheme
Edit `css/variables.css` — all colors are CSS custom properties.
The main green brand color is `--green-400: #1D9E75`.

### Add a feature
- **New page**: add a `<section id="page-xxx">` in `index.html`, a nav button, and handle it in `app.js → navTo()`
- **New stat**: add to the stats grid in `index.html` and update `UI.updateStats()` in `ui.js`
- **New setting**: add a field in the Settings section and save it in `app.js → saveSettings()`

## Tips

- Sessions shorter than 1 minute are not saved (accidental taps)
- If you refresh the page mid-session, the timer resumes automatically
- The streak counts consecutive calendar days with at least one session

## Future Ideas

- Export sessions to CSV / PDF
- Multiple internship profiles
- PWA support (installable on phone home screen)
- Notification reminders
- Notes per session


## Gamification

The Badges navigation tab includes six intern levels, automatic achievement
badges, a daily shift + accomplishment mission, and a five-day weekly attendance goal.
Existing shifts count automatically. Add an accomplishment in the shift notes to
complete the daily mission.

- Attendance: 50 XP per distinct date with positive logged hours.
- Accomplishment: 25 XP per date with nonempty shift notes.
- Badges: one-time bonuses for first day, full day, reflections, 3/5/10/20-day
  streaks, ten accomplishment days, and 25%/50%/100% of required hours.
- Levels: New Intern (0), Rising Intern (250), Dedicated Intern (750), Skilled
  Contributor (1,500), OJT Trailblazer (3,000), Intern Champion (5,000 XP).
- Extra overtime earns no additional daily XP. Future and invalid records earn none.
- Streaks bridge weekends and the existing holiday dates in `public/js/calendar.js`.
  That calendar is inherited from this project and should be reviewed for the
  institution's schedule. Today remains available to log until local midnight;
  an earlier missed workday resets the current streak. Best streak badges remain
  earned unless the underlying attendance records are corrected or deleted.
- Rewards are calculated from saved shifts and the current required-hours target.
  Editing, deleting, or changing the target can change XP and badges. There is
  no separate rewards database or leaderboard.

**Existing Supabase projects:** run `supabase-gamification-migration.sql` in the
Supabase SQL Editor before using accomplishments. It adds the notes column used
by shift saving and the profile picture URL column used by the existing UI.
New projects can run `supabase-schema.sql`.

Reward logic: `public/js/gamification.js`. Dashboard rendering:
`public/js/gamification-ui.js`. Styling: `public/css/gamification.css`.
Run the reward checks with `node tests/gamification.test.js` when Node.js is available.

## OJT document submissions

Students can upload requirements 4–13 in the **Documents** tab, connect to their
coordinator by code, and submit private draft files for review. Professors
have a **Review** tab to download, approve, or return files with feedback.
See [DOCUMENTS_SETUP.md](DOCUMENTS_SETUP.md) for the required database migration,
account setup, student approvals, upload limits, and workflow.

The login page has separate student and professor registration forms. Professors
activate automatically and start in **Students**, where they share their code and
approve student accounts. Students wait for their professor’s approval before using
the tracker or document submissions. Run `supabase-student-approval-migration.sql`
after the account registration migration; it also activates existing professor accounts.
Then run `supabase-professor-hours-migration.sql` so only each student's professor
can allocate or change required OJT hours from Students. Students view their assigned
target in Settings. Apply `supabase-no-default-hours-migration.sql` last: students
start with no target until their professor allocates hours. Older targets without
a professor allocation record are cleared and must be assigned again.
Apply `supabase-student-progress-migration.sql` afterward to show each enrolled
student's assigned, logged, and remaining hours plus completion in Students.
