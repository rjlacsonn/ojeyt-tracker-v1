# Supabase Setup

1. Open your Supabase project.
2. Go to **SQL Editor** and run `supabase-schema.sql`.
3. Go to **Project Settings > API**.
4. Copy your **Project URL** and **anon public key**.
5. Paste them into `ojeyt-tracker/js/supabase-config.js`.

```js
window.SUPABASE_CONFIG = {
  url: 'https://your-project-id.supabase.co',
  anonKey: 'your-anon-public-key',
};
```

For instant signup/login inside the app, go to **Authentication > Providers > Email** and turn off email confirmation while developing. If email confirmation is enabled, Supabase creates the account but the user must confirm their email before signing in.

For document submissions and separate student/professor accounts, run the migrations
in order: `supabase-documents-migration.sql`, `supabase-account-registration-migration.sql`,
then `supabase-student-approval-migration.sql` and `supabase-professor-hours-migration.sql`.
Apply `supabase-no-default-hours-migration.sql` next so students start with no hour target.
Then apply `supabase-student-progress-migration.sql` for the professor's progress summaries.
Apply `supabase-short-coordinator-codes-migration.sql` afterward to replace long professor
codes with six-character codes. Existing student connections are preserved.
Then apply `supabase-auto-approve-code-migration.sql` so a valid professor code gives
students immediate access and activates requests from the previous approval flow.
Apply `supabase-student-roster-management-migration.sql` last to add professor roster
search, combined document-and-hours completion checks, and safe removal of completed
student cards.
Only professors allocate students' required hours. Professors activate automatically;
students activate by entering a valid professor code. See [DOCUMENTS_SETUP.md](DOCUMENTS_SETUP.md).

## Administrator setup

After applying the roster management migration, run `supabase-admin-migration.sql`
in the Supabase SQL Editor and deploy the updated frontend. Register a dedicated
account, confirm its email, and verify its UUID in Authentication → Users.
Grant administration from the SQL Editor using that verified UUID:

```sql
insert into public.ojt_admins(user_id) values ('YOUR-VERIFIED-USER-UUID');
```

Sign in again to open Administration. To revoke access, delete that UUID's row
from public.ojt_admins. The directory covers the entire Supabase project.
Disconnect enrollment is an administrative correction for an incorrect class
connection. It preserves student records. Recent actions lists the last 50
administrative changes with actor, target and timestamp.

If an administrator sees **Account access unavailable**, rerun
`supabase-admin-migration.sql`. The migration is safe to rerun and restores the
administrator-aware account context without changing accounts or audit records.

Apply `supabase-archived-review-cleanup-migration.sql` after the admin migration.
It removes archived students from the professor's Review page and blocks access to
their stored submissions while preserving the underlying records.

Then apply `supabase-admin-document-requirements-migration.sql`. It adds reversible
administrator controls for the student document checklist. Removing a requirement
deactivates it without deleting submissions; restoring it makes the preserved section
and its files count toward progress again.

Finally apply `supabase-admin-badges-migration.sql`. It preserves the current badge
collection and lets administrators add, customize, remove, and restore badges and XP
rewards. Suggested badges remain optional until an administrator selects Use suggestion.

Apply `supabase-lock-student-coordinator-migration.sql` last. Connected students can
view their assigned coordinator but cannot replace it with another code. An administrator
must use Disconnect enrollment before the student can join a different coordinator.
Apply `supabase-student-profile-picture-migration.sql` afterward so the professor's
Students page can display pictures already uploaded to student profiles. The roster
continues to return only students actively enrolled with the signed-in professor.
The migration is safe to rerun. If Documents reports permission denied for
`ojt_document_requirements`, rerun the latest copy to install the active-requirement
read policy, then refresh the browser.

Apply `supabase-admin-account-deletion-migration.sql` last to add **Delete user**
to the Account directory. This action permanently removes the Supabase Auth identity
and its linked profile, enrollment, shifts, sessions, and document records. The
administrator must type the account email in the confirmation dialog. The currently
signed-in administrator cannot delete their own account. The frontend then removes
the user's OJT documents and profile pictures through the Storage API before deleting
the Auth identity. If storage cleanup fails, the account is retained and Administration
reports that cleanup must be retried or checked in Supabase Storage.
This migration also exempts authenticated administrators from the professor-approval
restriction during account and file deletion. If an administrator sees a professor
approval message while deleting, rerun the latest copy of this migration.
