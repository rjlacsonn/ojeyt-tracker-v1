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
Apply `supabase-no-default-hours-migration.sql` last so students start with no hour target.
Then apply `supabase-student-progress-migration.sql` for the professor's progress summaries.
Only professors allocate students' required hours. Professors activate automatically;
students need their professor’s approval. See [DOCUMENTS_SETUP.md](DOCUMENTS_SETUP.md).
