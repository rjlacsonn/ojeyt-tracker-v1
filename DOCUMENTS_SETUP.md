# Accounts, student approvals, and OJT documents

## Setup in Supabase

Run these files in the SQL Editor in this order:

1. `supabase-schema.sql` (base tables; new projects).
2. `supabase-documents-migration.sql` (private files and coordinator connections).
3. `supabase-account-registration-migration.sql` (separate registration records).
4. **`supabase-student-approval-migration.sql`** (current approval rules).
5. **`supabase-professor-hours-migration.sql`** (professor-managed hour allocations).
6. **`supabase-no-default-hours-migration.sql`** (unassigned targets until professor allocation).
7. **`supabase-student-progress-migration.sql`** (professor's student progress summaries).
8. **`supabase-short-coordinator-codes-migration.sql`** (six-character professor codes).
9. **`supabase-auto-approve-code-migration.sql`** (immediate access after a valid code).
10. **`supabase-student-roster-management-migration.sql`** (search and completed-student archiving).

For a project already running the first three scripts, run steps 4–10. If step 9 is
already installed, run only step 10. Step 4 activates
existing professor registrations, including accounts that were previously waiting
for administrator approval. Existing student records, shifts, files, and coordinator
connections are preserved. Step 8 assigns each professor a new six-character code;
previously shared codes stop working, but already enrolled students remain connected.
Step 9 activates existing pending enrollments and makes future valid code entries immediate.
Step 10 adds roster search data and safe removal controls for completed students.
Refresh the browser and sign in again after the migration succeeds.

If Students reports **"structure of query does not match function result type"**,
ensure steps 6 and 7 have completed in the SQL Editor, then refresh the browser. The older
`supabase-student-list-fix.sql` repair is included and must not be rerun afterward.
It repairs the student-list function's return types without changing accounts,
coordinator codes, approvals, or uploaded files. The full approval migration
already includes this correction for new setups.

Do not rerun an older migration alone after the approval migration, because it
would restore older function definitions. If rebuilding setup, apply all scripts
in the order above. The final migration also refreshes the Supabase API schema cache.

## Registration and approval flow

- **Professor / coordinator:** use the professor registration form with name,
  school, optional department, email, and password. Professor accounts activate
  automatically. If Supabase email confirmation is enabled, confirm the email
  before signing in. There is no administrator approval step for professors.
- **Student:** use the student registration form. After signing in, enter the
  coordinator code shared by the professor and choose Join professor. A valid code
  activates the tracker immediately; there is no separate approval step.
- **Professor:** open Students to see the coordinator code and every student who
  joined with it. No manual account approval is required.
- **Roster management:** search connected students by name or email. A professor
  sees OJT Complete only after all 10 document requirements are approved and the
  student's logged hours reach the assigned target. Only then can the professor
  remove that student card.
  Clear completed roster is available only when every active student is complete.
  Removal archives the enrollment and returns the student to the coordinator-code
  screen. Tracker access remains blocked until the student enters a valid code again.
  The student account, shifts, and document audit history are preserved.
- **Student progress:** each card shows assigned hours, logged hours, remaining
  hours, and completion percentage. Select Refresh to load updated records.
  Logged hours use the same saved shift totals as the student's dashboard.
  Remaining hours never go below zero and completion is capped at 100%.
  Unassigned targets show Not assigned; logged hours remain visible. The RPC
  returns only students currently enrolled with the signed-in professor and
  aggregate hours, without exposing individual shift details or notes.
- **Required hours:** only the student's current professor or coordinator can allocate
  or change the target. In Students, enter a whole number from 1 to 10,000 and choose
  Save hours. Students can view their
  target in Settings; they cannot set it at signup or change it through the API.
  New accounts start with no target and display Not assigned. Step 6
  clears older targets that have no record of professor allocation; professors must
  set these again. It preserves shifts, logged hours, and subsequent professor
  allocations when rerun. Students refresh the
  browser to see updated progress, remaining hours, and badge calculations.
- **Student:** after a valid code is accepted, Dashboard, History, Documents,
  Badges, and Settings unlock immediately.

An unconnected student can access the professor connection page and profile settings only.
Professors have Students, Review, Account, and Settings. Their student tracking and
badge screens remain hidden. A student cannot access another professor without that
professor's valid coordinator code.

Account types are captured when an account is created; changing editable auth
metadata later cannot turn an existing student account into a professor.

Entering a different valid professor code changes the student's professor immediately.
Past document submissions keep their original reviewer. Do not delete and recreate an
account to change professors.

## Documents

The checklist contains requirements **4–13**, matching the supplied screenshot.
Requirements 1–3 and original blank templates were not supplied.

- Upload one or multiple files for each requirement: PDF, DOC, DOCX, XLS, XLSX,
  JPG/JPEG or PNG, up to 10 MiB (10,485,760 bytes) per file. Empty files are rejected.
- Uploads are private drafts. A professor cannot read a student's unsubmitted drafts.
- Submit one requirement or all ready files. Partial submissions are supported.
- Submitted files are locked while Awaiting review.
- Professors use Review to download files, approve them, or return them for revision.
  Returning a file requires feedback. Students select Refresh to see changes.
- Review also shows a document progress card for every enrolled student, including
  students who have not submitted anything. Each card shows requirements submitted,
  awaiting review, returned for revision, and not submitted, plus approved requirements
  out of 10 and completion percentage. Expand View requirement checklist for the
  status of every requirement. Multiple attachments count as one requirement;
  all submitted attachments must be approved for that requirement to count approved.
  Student selection and name/email search filter the progress cards and file list.
  Files to review are grouped into collapsible sections by student, with the student's
  name, email, file count, and awaiting-review count shown in each section header.
  The status filter affects individual files only. Approving or returning a file
  refreshes the cards automatically. Past submissions remain accessible if a
  student changes professors and are marked as previous submissions.
  This uses the existing roster RPC and document permissions; no additional
  database migration is required after the account and student-progress setup.
- Returned files can be resubmitted or removed and replaced. A requirement is
  Approved only when all of its current attachments are approved.
- Download retrieves an uploaded file; it is not a blank school form template.

## Access controls

The private `ojt-documents` bucket stores files under student UUID folders.
Authenticated downloads do not publish file URLs. Row-level security limits reads
and writes, and database functions enforce enrollment, account approval, submission,
review, and coordinator ownership. Unconnected students cannot read or write tracker
records or upload files. Students can still read and update their own profile before
entering a valid coordinator code.

An upload with failed metadata registration attempts to clean up its unreferenced
storage object. Submitted objects cannot be overwritten or deleted. Cleanup errors
are reported and an administrator can remove unreferenced objects later in Storage.

The app does not send email notifications or attachments to professors. Their
Students and Review tabs are the connected-student and submission views.

## Troubleshooting

If account access is unavailable, ensure every migration completed successfully,
with the student roster management migration applied last. `PGRST202` means a required
function is unavailable in the API cache. The scripts refresh that cache. Select
Retry or sign in again after setup. Existing accounts do not need to register again.
If SQL Editor reports an error, resolve it before retrying the app.

## Verification

With Node.js installed:

```sh
node tests/account-registration.test.js
node tests/enrollment.test.js
node tests/documents.test.js
node tests/documents-workflow.test.js
node tests/gamification.test.js
```

Client checks simulate Supabase. Also test with a real professor and two student
accounts: confirm immediate professor access, isolated student lists, immediate
code-based student access, blocked unconnected-student uploads/tracking, and private
drafts. Actual
Supabase database and Storage permissions must be verified after migration.
