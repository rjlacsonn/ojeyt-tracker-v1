# OJeyT Tracker — English Presentation Script

**Estimated presentation time:** 7–10 minutes

## 1. Introduction

Good day, Professor. Today I will present **OJeyT Tracker**, a web-based system designed to make On-the-Job Training monitoring easier and more organized.

The main purpose of the system is to bring OJT time records, student progress, document submissions, and professor reviews into one platform. Instead of managing attendance, progress calculations, and requirements separately, students and professors can access them through their own accounts.

## 2. System users

The system has two main types of users: **students** and **professors or OJT coordinators**.

Each role has different pages and permissions. Students can access the Dashboard, History, Documents, Badges, and Settings pages. Professors can access the Students, Review Submissions, Account, and Settings pages.

The user's role is verified through the database and not simply through editable browser information. This prevents a student from changing their account information to gain professor access.

## 3. Registration and coordinator codes

The system provides separate registration forms for students and professors. When a professor creates an account, the system gives them a unique **six-character coordinator code**, such as `ABC123`.

The professor shares this code with their students. When a student enters a valid code, the student is automatically connected to that professor, receives immediate access to the tracker, and appears in the professor's student list.

A separate manual approval is no longer required. Possession of the professor's valid unique code serves as the student's authorization to join the class. If the code is incorrect or does not exist, the student will not receive access.

## 4. Student dashboard and duty logging

After activation, the student is taken to the Dashboard. The Dashboard shows the total rendered hours, remaining hours, completion percentage, total duty days, attendance streak, and estimated completion date.

When saving a shift, the student must enter the date, morning time-in, and morning time-out. Afternoon and overtime schedules are optional. The system automatically calculates the duration of each period and the total number of hours.

The system also validates every entry. It does not accept future dates, invalid time-in and time-out pairs, overlapping schedules, or more than one shift record for the same date. Students may also add notes or accomplishments describing what they completed during that day.

Students can edit or delete their own shift records. After every change, the Dashboard and progress calculations update automatically.

## 5. History and progress monitoring

The History page displays all duty records, including morning, afternoon, and overtime schedules, total hours, and accomplishments. It provides both a daily view and a monthly summary.

The monthly summary shows total hours, days worked, average hours per day, and short days. The system also includes an activity calendar showing when new shift records were saved during the last 90 or 365 days.

Students cannot change their own required OJT hours. Only their connected professor can assign or update the target. Once the professor assigns the required hours, the student's remaining hours and completion percentage are updated automatically.

## 6. Professor features

On the Students page, the professor can see their coordinator code and all students who joined using that code. Each student card shows the assigned hours, logged hours, remaining hours, and completion percentage.

The professor can also assign or update the required OJT hours for each connected student. A professor can only access students connected to their own account, so every coordinator has an isolated student list.

For larger classes, the professor can search the roster by student name or email. A student is marked **OJT Complete** only when all 10 document requirements are approved and the student has rendered all assigned OJT hours. Completed student cards can then be removed from the active roster after confirmation. The account, hours, and document history remain preserved, but the student returns to the coordinator-code screen and must reconnect before using the tracker again.

The manual student-approval step was removed to reduce unnecessary work for the professor. Once a student enters the correct code, the student immediately appears in the list and can begin using the tracker.

## 7. Gamification

The system includes a Badges and Achievements page to encourage students to remain consistent with their OJT attendance and accomplishments.

Students earn experience points, or XP, through attendance days, recorded accomplishments, consecutive attendance streaks, full duty days, and completion of their required hours. The system has six levels, beginning with **New Intern** and ending with **Intern Champion**.

Rewards are calculated from the actual shift records saved in the database. If a shift is edited or deleted, or if the required-hours target changes, the XP and badge progress are recalculated automatically. XP cannot be added manually, and the current version does not include a leaderboard.

## 8. OJT document management

On the Documents page, students can upload OJT requirements numbered 4 through 13. These include the application form, monitoring form, feedback paper, work pictures, waiver, certification, consent form, and confidentiality agreement.

The system accepts PDF, Word, Excel, JPG, and PNG files, with a maximum size of 10 megabytes per file. A newly uploaded file remains a private draft. The professor cannot view it until the student selects **Submit for review**.

After submission, the file is temporarily locked while waiting for the professor's review. On the Review Submissions page, the professor can download the file, approve it, or return it for revision. When returning a document, the professor must provide feedback so the student clearly understands what must be corrected.

The professor can also see each student's overall document progress, including approved requirements, submissions awaiting review, returned files, and requirements that have not been submitted. Search and student filters make the review process easier when there are many records.

Files to review are grouped into collapsible sections for each student. Every section shows the student's name, email address, number of files, and number awaiting review, preventing simultaneous submissions from becoming one mixed list.

## 9. Security and data privacy

The system uses **Supabase Authentication** for registration and login, a **PostgreSQL database** for profiles, shifts, enrollment, and document records, and private **Supabase Storage** for uploaded files.

It uses Row Level Security, or RLS. This means students can only access and modify their own profiles and shift records. Professors can only access students connected to them and documents officially submitted for their review. They cannot see a student's private drafts.

The system also uses server-side database functions for coordinator connections, required-hour assignments, document submissions, and reviews. Permissions are therefore checked by the database and not only by the visible interface.

## 10. Technologies used

The front end was developed using **HTML, CSS, and vanilla JavaScript**. It works as a single-page application, allowing users to move between sections without reloading the entire website.

The interface is responsive and can be used on desktop computers, laptops, tablets, and mobile phones. Supabase provides the backend services, while the website can be hosted through Vercel and updated through GitHub.

The project also includes automated tests for registration, account access, student enrollment, document workflows, gamification, settings, startup behavior, and activity tracking. These tests help prevent existing features from breaking when the system is updated.

## 11. Current limitations and possible improvements

The current version does not yet send automatic email or push notifications when a document is submitted or returned. It also does not provide blank school templates; students must upload their completed files.

The holiday dates used by the attendance-streak calculation should also be reviewed and updated according to the institution's official academic calendar.

Possible future improvements include email notifications, PDF or Excel report exports, an administrator dashboard, an announcement system, and more detailed analytics.

## 12. Suggested live demonstration

For the live demonstration, I will first open the professor account and show its six-character coordinator code. I will then sign in using a student account and enter that code to demonstrate that access is granted immediately and that the student automatically appears in the professor's student list.

Next, I will save a duty shift with an accomplishment. I will show how the total hours, Dashboard progress, History page, activity calendar, XP, and badges update after saving the record.

After that, I will upload a sample document using the student account and submit it for review. Using the professor account, I will demonstrate how to download it, return it with feedback, and approve the requirement.

Finally, I will show how the professor assigns the student's required OJT hours and how the updated target automatically appears on the student's Dashboard.

## 13. Conclusion

In conclusion, OJeyT Tracker was designed to make OJT monitoring more organized, transparent, and efficient. It helps students monitor their hours, progress, accomplishments, and requirements, while giving professors a central view of their students, assigned hours, progress, and document submissions.

Thank you for listening. I am ready to answer your questions and receive suggestions for the next improvements to the system.

## Prepared answers to possible questions

**Why does entering a code provide immediate access?**  
The code is unique to each professor. It removes the manual approval workload while still requiring the student to receive a valid code before joining the professor's list.

**What happens if a student enters an incorrect code?**  
The database will reject it, no enrollment will be created, and the student will remain unconnected.

**Can the professor see draft documents?**  
No. Professors can only view documents that the student has officially submitted for review.

**Who can change the required OJT hours?**  
Only the student's connected professor or coordinator. The target is read-only on the student side.

**Where is the system's data stored?**  
Accounts and structured records are stored in the Supabase database, while uploaded requirements are stored in private Supabase Storage.

**How are the records protected?**  
The system uses authentication, role-based navigation, Row Level Security, private storage policies, and server-side database functions.
