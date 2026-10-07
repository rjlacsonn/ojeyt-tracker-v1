# Deploy OJeyT Tracker with GitHub and Vercel

The current application serves `public/index.html` and connects directly to Supabase.
It does not need an npm build or the legacy Express/MongoDB server.

## Update GitHub

The root `vercel.json` configures a static deployment from `public` and skips install
and build commands. The older `public/vercel.json` rewrite has been removed.
`.vercelignore` excludes the unused Express/MongoDB backend from deployment.

The local `.env` file was tracked by Git. Remove it from tracking while retaining
your local copy, then commit and push your reviewed changes:

```sh
git rm --cached .env
git add .gitignore .vercelignore vercel.json public/vercel.json
git add public/js/documents.js public/js/documents-model.js public/css/documents.css
git add tests/documents.test.js tests/documents-workflow.test.js
git add README.md DOCUMENTS_SETUP.md DEPLOYMENT.md
git commit -m "Prepare Vercel deployment and document progress monitoring"
git push origin main
```

Removing a tracked file does not remove it from previous commits. If `.env`
contained real passwords, private credentials, or signing secrets pushed to GitHub,
replace those credentials with their provider. Do not put Supabase service-role
keys into frontend JavaScript. The existing Supabase anon key is a public client
key; row-level security provides data access restrictions.

## Import into Vercel

1. Sign into Vercel with GitHub and choose Add New > Project.
2. Import this repository. Grant Vercel access to it if it is not listed.
3. Use these settings:

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Root Directory | Repository root (`./`), not `public` |
| Build Command | Empty; skip the build |
| Output Directory | `public` |
| Install Command | Empty; skip dependency installation |
| Environment Variables | None required by the current static frontend |

4. Click Deploy and copy the production URL, such as `https://your-project.vercel.app`.

The frontend currently reads the URL and public anon key from
`public/js/supabase-config.js`. Adding Vercel environment variables alone does not
replace values in this static JavaScript file.

## Configure Supabase for the production URL

1. Open the same Supabase project used locally.
2. Go to Authentication > URL Configuration.
3. Set Site URL to the production Vercel URL.
4. Add the exact allowed redirect URLs:

```text
https://your-project.vercel.app/
https://your-project.vercel.app/?reset=true
```

Replace the example domain with yours. Save the configuration. Add your actual
localhost development URLs separately if you still use them. Update these settings
again if you switch to a custom domain.

Existing database tables, accounts, and files remain in Supabase. Do not recreate
the database or rerun older migrations just to deploy. If setup is incomplete,
apply outstanding migrations in the order described in DOCUMENTS_SETUP.md.

## Verify the live site

- Sign in as a professor and check Students and Review.
- Register a student, request approval, then approve them as their professor.
- Allocate required hours and check the student's progress after refreshing.
- Upload and submit a document, then approve or return it in Review.
- Test password reset and, if enabled, the signup confirmation email.

Future pushes to Vercel's configured production branch deploy automatically.
SQL migration files still need to be applied in Supabase when database changes
are introduced; a GitHub push does not execute them.

## Fix 500 FUNCTION_INVOCATION_FAILED

This error indicates a server function crashed. The current frontend should be
served statically. An older deployment may have detected the legacy `server.js`
as an Express app. That server requires dependencies and MongoDB which are not
used by the Supabase frontend.

1. Ensure the root `vercel.json` and `.vercelignore` are committed and pushed to
   the branch Vercel deploys. Local changes do not update the GitHub deployment.
2. In Vercel > Settings > Build and Deployment, select Other as the framework,
   leave Root Directory at the repository root, use `public` as the output
   directory, and leave build/install commands empty.
3. Open Deployments and select the new deployment triggered by the push. Confirm
   its commit matches GitHub. Redeploy that latest commit if needed; redeploying
   the original failed commit uses the old files again.
4. Open the production domain from that successful deployment. If it still
   fails, open Runtime Logs and copy the first exception and function name.
   The generic error screen alone does not identify the underlying exception.

References: [Vercel build settings](https://vercel.com/docs/builds/configure-a-build),
[Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
