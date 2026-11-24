# OJeyT Tracker — Complete English Presentation Script

**Presenters:** RJ and Richard  
**Suggested time:** 12–15 minutes, plus questions  
**Flow:** Overview → Student → Coordinator → Admin → Security → Demo → Conclusion

## Before presenting

Prepare four accounts: an unconnected Student, an active Student with sample data, a Coordinator, and a Super Admin. Also prepare one small PDF or image for the document demo. Do not permanently delete a real account during the presentation; use a disposable test account or simply explain the control.

---

## Slide 1 — Introduction

### RJ

Good day, everyone. We are RJ and Richard, and today we will present our system called **OJeyT Tracker**.

OJeyT Tracker is a web-based On-the-Job Training management system. It brings duty-hour recording, progress monitoring, document submission and review, student management, gamification, and administration into one platform.

Its purpose is to replace scattered records and manual follow-ups with a more organized and transparent process.

### Richard

We will explain the complete system through its three main user perspectives: the **Student**, the **Professor or OJT Coordinator**, and the **Administrator**.

We will also show how information moves between these users, how permissions are protected, and how the platform supports the full OJT workflow.

---

## Slide 2 — System users and access

### Richard

The system has three main account types.

The **Student** can access the Dashboard, History, Documents, Badges, and Settings after connecting to a coordinator.

The **Professor or Coordinator** can access Students, Review, Account, and Settings.

The **Administrator** can access Administration and Settings. The system further distinguishes a regular **Administrator** from a **Super Admin**.

Each account sees only the pages and actions intended for its role. The database verifies the role after login; it is not based only on editable information in the browser.

### RJ

This separation matches each user's responsibility. Students manage their own OJT records. Coordinators supervise only their connected students. Administrators maintain the system as a whole.

---

## Slide 3 — Registration and coordinator connection

### RJ

The login screen provides separate registration flows for students and professors.

A student registers using a name, email, and password. The student must then enter a valid coordinator code before the tracker becomes active.

A professor also provides an institution and department. The professor account activates automatically and receives a unique six-character code, such as `ABC123`.

### Richard

The professor shares this code with the intended students. When a student enters it, the database creates the connection immediately. The student gains tracker access and automatically appears in that coordinator's roster.

Once connected, the student cannot replace the coordinator with another code. If the connection is incorrect, an administrator must disconnect the enrollment first. This preserves the student's account, hours, and documents while preventing unauthorized transfers.

An administrator may also disable an account. Disabling blocks access, including access from an existing session, but preserves the data so the account can be enabled later.

---

## Slide 4 — Student Dashboard

### Richard

We will now explain the Student side.

The Dashboard is the student's main OJT workspace. Its Progress Overview shows total logged hours, assigned hours, remaining hours, completion percentage, total duty days, current attendance streak, best streak, and estimated completion date.

The required-hours target is controlled by the coordinator. If no target has been assigned, the system displays **Not assigned** instead of an inaccurate percentage.

### RJ

The dashboard also compares the student's daily average with the target pace. A shift-activity calendar shows when records were created, using either a 90-day or 12-month view.

It immediately answers three questions: How many hours have I completed? How many remain? And am I progressing consistently?

---

## Slide 5 — Logging a shift

### RJ

The student records duty through the **Log your shift** form. It contains the date, morning clock-in and clock-out, afternoon clock-in and clock-out, optional overtime, and optional accomplishment notes.

The system calculates each session and the total shift duration automatically. It rejects future dates, reversed or incomplete time pairs, overlapping schedules, and duplicate records for the same date.

### Richard

After saving, the Dashboard, total and remaining hours, completion percentage, History, activity calendar, XP, and badge progress are recalculated.

The student may edit or delete their own shift to correct a mistake. Because progress and rewards come from saved records, any correction also updates the related calculations.

---

## Slide 6 — History and DTR export

### Richard

The **History** page provides a complete duty record. It shows total days, total hours, daily average, and short days. The student can switch between a daily view and a monthly summary.

Date-range controls allow the student to generate a Daily Time Record, or DTR.

### RJ

Before exporting, the student enters details such as name, school, course or department, company, position, and optional supervisor information.

The DTR can be produced through **Print or PDF, CSV, or Excel**, allowing the electronic record to support school or company reporting requirements.

---

## Slide 7 — Student documents

### RJ

The **Documents** page manages OJT requirements. The checklist is controlled by the administrator, so the institution can add, edit, remove, or restore sections. The default setup contains requirements 4 through 13.

For each active requirement, a student may upload one or more PDF, Word, Excel, JPG, or PNG files, with a maximum of 10 megabytes per file.

### Richard

Uploading and submitting are separate actions. A newly uploaded file is a private draft, so the coordinator cannot view it yet. The student may check or replace it before selecting **Submit for review**.

After submission, the file is locked while awaiting a decision. The coordinator can approve it or return it for revision. Returned files include feedback and can be replaced or resubmitted.

A requirement counts as approved only when all current attachments for that requirement are approved.

---

## Slide 8 — Badges and Settings

### Richard

The **Badges and Achievements** page encourages consistency. Students can earn XP based on measures such as attendance days, eight-hour days, accomplishment days, streaks, total hours, and percentage of assigned hours completed.

The system has six progress levels, from **New Intern** to **Intern Champion**.

### RJ

Students cannot manually claim XP. Progress is calculated from actual shift records and the active rules configured by the administrator.

In **Settings**, the student can update their display name and profile picture. Assigned OJT hours are visible but read-only because only the connected coordinator can change the target.

---

## Slide 9 — Coordinator Students page

### RJ

We will now move to the Coordinator side.

The **Students** page displays the coordinator's join code and active roster. Each student card shows the name, email, profile picture when available, approved documents, assigned hours, logged hours, remaining hours, and completion percentage.

The coordinator can search by name or email and filter students by all, in progress, or completed.

### Richard

The coordinator assigns or updates each student's required OJT hours here. The target automatically appears on the student's Dashboard and Settings page.

Coordinators see only students connected to their own accounts. They cannot browse another coordinator's roster.

A student is marked **OJT Complete** only after completing at least the assigned hours and receiving approval for every active document requirement.

Only completed students can be removed from the active roster through this page. Removal preserves their account, shifts, and document history. The student returns to the code-entry screen and must reconnect to regain tracker access.

---

## Slide 10 — Coordinator Review page

### Richard

The **Review Submissions** page gives the coordinator a central view of requirements.

For each active student, it displays approved requirements, completion percentage, files awaiting review, files needing revision, and requirements not yet submitted. A detailed checklist can be expanded for every student.

Search, student selection, and status filters help with larger classes. Files are grouped into collapsible student sections so simultaneous submissions do not become one mixed list.

### RJ

For every submitted file, the coordinator can download it and select **Approve** or **Return for revision**.

Returning requires written feedback so the student knows what to correct. Once saved, the coordinator's progress view and the student's status update.

Coordinators cannot access private drafts; they see only files formally submitted for review.

---

## Slide 11 — Administration dashboard

### RJ

The third major part is the **Administration dashboard**.

At the top are system-wide counts for students, professors, and files awaiting review.

The Account Directory is a searchable and paginated list of all Student, Professor, Administrator, and Super Admin accounts. It displays account status, role, coordinator connection, and student OJT hours where applicable.

### Richard

From the directory, administrators can correct and manage access. They can reset a professor's coordinator code, disconnect a student's incorrect enrollment while preserving records, and disable or enable student and professor accounts.

Disabling is reversible. It blocks system and private-file access while preserving the user's account data, hours, and uploads.

---

## Slide 12 — Requirement and badge configuration

### Richard

Administrators can configure the Student Document Requirements. They may add a section; edit its name, number, or order; remove it from the active checklist; or restore it later.

Removal is a reversible deactivation. Existing files remain preserved, but the inactive requirement no longer counts toward completion.

### RJ

Administrators also configure achievement badges. Each badge can have an icon, name, description, measurement, target, XP reward, and display order. The dashboard supports custom badges and optional suggestions.

Badges can also be removed and restored. An inactive badge disappears from student collections and its XP stops counting. When restored, progress is recalculated from saved records.

---

## Slide 13 — Admin versus Super Admin

### RJ

The system separates regular Admin and Super Admin permissions to reduce the risk of high-impact actions.

A regular Admin manages students and professors, corrects enrollment issues, changes non-admin account access, and configures requirements and badges.

### Richard

A **Super Admin** can additionally grant administrator access to an existing account, remove regular administrator access, disable or enable regular administrators, and permanently delete eligible users.

Permanent deletion removes the authentication identity and linked profile, enrollment, shifts, sessions, document records, and uploaded files. The Super Admin must type the exact email address to confirm.

The signed-in administrator cannot delete their own account, and Super Admin accounts are protected from dashboard deletion or disabling.

The dashboard also records recent administrative actions with the action, target, actor, and timestamp, creating an audit trail.

---

## Slide 14 — End-to-end workflow

### Richard

The complete workflow is straightforward.

First, a coordinator registers and receives a code. Second, a student registers, enters that code, and joins the roster. Third, the coordinator assigns the required OJT hours.

The student then logs shifts, monitors progress, earns achievements, and uploads requirements. The coordinator reviews submitted files and either provides revision feedback or approves them.

When all active requirements are approved and the assigned hours are complete, the system marks the student as **OJT Complete**.

### RJ

Throughout this process, the administrator maintains account access, corrects enrollment issues, configures requirements and badges, and reviews the administrative audit log.

This creates one continuous and traceable workflow instead of separate attendance sheets, folders, and manual calculations.

---

## Slide 15 — Security and privacy

### RJ

OJeyT Tracker uses **Supabase Authentication** for registration and login, **PostgreSQL** for structured records, and private **Supabase Storage** for uploaded files.

Row Level Security limits students to their own records and coordinators to their connected students and formally submitted files.

### Richard

Important actions—such as joining a coordinator, assigning hours, submitting or reviewing documents, changing access, and deleting an account—are checked through server-side database functions.

Security therefore does not depend only on hidden interface buttons. The database verifies identity, role, account status, ownership, and coordinator relationship before accepting an action.

---

## Slide 16 — Technology and testing

### Richard

The front end uses **HTML, CSS, and vanilla JavaScript** as a responsive single-page application. It supports desktop, laptop, tablet, and mobile screens. Supabase provides authentication, database, storage, and server-side functions, while the site can be deployed through Vercel.

### RJ

The project also contains automated tests for registration, startup, enrollment, shift activity, hour settings, documents, gamification, administration, disabling, deletion, and Super Admin permissions. These tests help prevent existing features from breaking during updates.

---

## Slide 17 — Limitations and future work

### RJ

The current version does not send automatic email or push notifications when a document is submitted, approved, or returned. Users must open or refresh their pages to see updates.

It accepts completed documents but does not supply the institution's blank templates. The holiday calendar for streak calculations should also be maintained according to the official academic schedule.

### Richard

Future improvements may include email and in-app notifications, announcements, richer analytics, official templates, coordinator-generated reports, and a dedicated backup and recovery interface.

---

## Slide 18 — Live demonstration

### RJ

We will begin with the Coordinator account.

**[Open Students.]** Here we can see the join code, roster, document progress, and assigned versus logged hours.

**[Point to Required OJT hours.]** The coordinator assigns the student's hour target here.

### Richard

Next, I will use an unconnected Student account.

**[Enter the code and select Join professor.]** The student connects immediately, receives Dashboard access, and appears in the coordinator's roster.

**[Open Dashboard and save a sample shift with an accomplishment.]** Notice how total hours, remaining hours, progress, History, activity, XP, and badge progress update.

### RJ

Now we will demonstrate Documents.

**[Upload the sample file.]** It is currently a private draft and cannot yet be seen by the coordinator.

**[Select Submit for review, then switch to Coordinator Review.]** The file now appears under the student's section. The coordinator may download it, approve it, or return it with required feedback.

### Richard

Finally, we will open Administration.

**[Open Administration.]** Here we can search the full account directory, correct connections, enable or disable users, configure document requirements and badges, and view recent actions.

**[Point to Administrator Management and a Delete user control without confirming a real deletion.]** Super Admins receive additional controls for regular administrator management and protected permanent deletion.

---

## Slide 19 — Conclusion

### Richard

In conclusion, OJeyT Tracker provides an end-to-end OJT process for students, coordinators, and administrators.

Students record hours, monitor progress, export a DTR, submit requirements, and view achievements. Coordinators manage their roster, assign hours, monitor completion, and review documents. Administrators manage access, correct relationships, configure requirements and badges, and audit system changes.

### RJ

By placing these functions in one secure, role-based platform, the system makes OJT monitoring more organized, transparent, and efficient.

Thank you for listening. We are now ready to answer your questions and receive your feedback.

---

## Prepared answers for possible questions

**Why does a valid coordinator code activate a student immediately?**  
The unique code acts as the enrollment credential. The database still validates the code and the coordinator's status before creating the connection.

**Can a student change coordinators?**  
Not while connected. An administrator must disconnect the enrollment first. The student's account, hours, and files are preserved.

**Can a coordinator see private drafts?**  
No. Only formally submitted files are available for review.

**Who can change required OJT hours?**  
Only the student's connected coordinator. The value is read-only for the student.

**When is a student OJT Complete?**  
After logging at least the assigned hours and receiving approval for every active document requirement.

**What is the difference between roster removal and account deletion?**  
Roster removal disconnects enrollment and preserves the account, hours, and documents. Super Admin deletion permanently removes the identity and linked records.

**What is the difference between disabling and deleting?**  
Disabling is reversible and preserves data. Deleting is permanent and removes the account, linked records, and uploaded files.

**What can a Super Admin do that a regular Admin cannot?**  
A Super Admin can manage regular administrator access and permanently delete eligible accounts, in addition to regular administrative functions.

**How are records protected?**  
Through authentication, role-based navigation, Row Level Security, private storage, account-status checks, and server-side permission validation.

**Can students manually add XP?**  
No. XP and badges are derived from their records and active administrator-configured rules.

**Can the system generate a DTR?**  
Yes. It supports a selected date range and Print or PDF, CSV, and Excel outputs.

**What happens when a requirement or badge is removed?**  
It is deactivated, not destroyed. Related records remain preserved, and the item can be restored.

**Where is the data stored?**  
Structured records are in the Supabase PostgreSQL database. Uploaded documents are in private Supabase Storage.

**Does it work on mobile?**  
Yes. The interface is responsive across desktop, tablet, and mobile screens.

**What happens without internet access?**  
An internet connection is required to authenticate and synchronize with Supabase. A failed operation should be retried when the connection is restored.
