# EmailBlast

EmailBlast is an authenticated email-campaign operations dashboard built for XMETA. It manages contacts, reusable HTML templates, Brevo campaign preparation, and scheduled delivery through one permanent cron-job.org endpoint.

## Features

- Operations-focused overview for active work, scheduled delivery, sent campaigns, issues, recent campaigns, and audience health.
- Contact import and bulk subscription-status management.
- Manual plain-text campaigns or reusable sanitized HTML templates.
- Optional per-recipient personalization with `{{recipient_name}}`, using Full name → Company → Email as the fallback order.
- Automatic campaign name, subject, and Gmail preview-text defaults derived from uploaded HTML.
- Embedded-image extraction to Supabase Storage so email HTML remains practical for Brevo and email clients.
- Delivery batches containing up to 10 independent campaigns with separate recipients, provider IDs, errors, and analytics.
- One globally armed delivery batch for the permanent cron schedule.
- Editable resend drafts that preserve the original Sent or Failed campaign record.
- Campaign archive and restore with permanent removal after 30 days.
- Safe template deletion: removed templates disappear from new campaigns while existing campaign snapshots and hosted images remain intact.

## Technology

- Next.js 16 App Router and React 19
- TypeScript and Tailwind CSS 4
- Supabase Authentication, Postgres, Row Level Security, and Storage
- Brevo Contacts and Email Campaign APIs
- cron-job.org for the external schedule
- Vitest and ESLint

## Campaign delivery workflow

1. Import or create contacts and mark eligible recipients as Subscribed.
2. Create a campaign using manual text or one or more saved HTML templates.
3. Review the generated campaign metadata, audience, previews, and personalization.
4. Save as Draft or prepare the selected campaigns in Brevo.
5. Review the prepared delivery batch and add it to the cron schedule.
6. cron-job.org calls the permanent endpoint at the configured schedule.
7. EmailBlast atomically claims the armed batch and requests delivery from Brevo.
8. The dashboard reconciles provider results as Sending, Sent, or Needs attention.

Each template creates an independent campaign. A delivery batch can contain 1–10 campaigns, and one campaign failing does not prevent the remaining batch items from being processed.

## HTML template rules

- Supported files: `.html` and `.htm`.
- Maximum file size: 5 MB per template.
- There is no application-level limit on the number of saved templates.
- A delivery batch can select at most 10 templates.
- `{{recipient_name}}` is optional and case-sensitive.
- Unknown or malformed template tokens are rejected.
- Scripts, forms, iframes, event handlers, and unsafe URL schemes are removed.
- Existing campaigns store immutable HTML snapshots, so deleting or changing a saved template does not alter campaign history.

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and provide the following values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=

CRON_SECRET=
```

Environment notes:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only and is used for atomic cron claims, protected database functions, and delivery reconciliation.
- `CRON_SECRET` must be a long random server-only value shared only with the configured cron job.
- Never prefix the service-role key, Brevo key, or cron secret with `NEXT_PUBLIC_`.
- `BREVO_SENDER_EMAIL` must be an authenticated sender or belong to an authenticated domain in Brevo.
- Add the same server environment variables to Vercel before deploying.

### 3. Apply the Supabase migrations

Apply every SQL file in `supabase/migrations` in filename order. These migrations create the campaign delivery lifecycle, email-template library and storage bucket, resend lineage, delivery batches, atomic claim functions, Row Level Security policies, and archive retention.

When using the Supabase Dashboard, open the SQL Editor and execute each migration against the intended project. Apply new migrations before deploying application code that depends on them.

### 4. Configure authentication URLs

In Supabase Authentication URL settings, add the appropriate application URLs, including:

```text
http://localhost:3000/auth/callback
https://email-blast-xmeta.vercel.app/auth/callback
```

### 5. Start the application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Permanent cron configuration

EmailBlast uses one fixed endpoint. cron-job.org owns the schedule, recurrence, and timezone; the application stores only the delivery batch waiting for the next run.

Configure one cron-job.org job:

```text
Method: POST
URL: https://email-blast-xmeta.vercel.app/api/cron/campaigns/send?token=<CRON_SECRET>
Body: none
Timezone: Asia/Manila, or the timezone required by operations
```

Behavior:

- An invalid token returns `401`.
- An empty schedule returns a safe `200` response with `reason: "no_batch_armed"`.
- Overlapping cron calls cannot claim or send the same campaign twice.
- Up to 10 campaigns are processed with bounded concurrency.
- An uncertain Brevo timeout remains Sending and is reconciled instead of being retried automatically.
- Expired campaign archives are purged during cron execution after the 30-day retention period.

Do not log, publish, or share the complete cron URL because its query token authorizes delivery.

## Scripts

```bash
npm run dev      # Start the local development server
npm test         # Run the Vitest suite
npm run lint     # Run ESLint
npm run build    # Create a production build
npm run start    # Run the production build locally
```

Before submitting changes, run:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

## Security and data ownership

- Dashboard APIs require an authenticated Supabase user.
- Campaigns, contacts, templates, and batches are restricted by ownership and Row Level Security.
- The Supabase admin client is server-only and is used only after authentication or by the secret-protected cron route.
- Cron responses never expose recipients, Brevo credentials, raw provider responses, or the configured secret.
- Sent and Failed campaigns remain immutable delivery records; resending creates a new editable draft.
- A Brevo Sent status confirms provider acceptance, not guaranteed inbox delivery or the absence of later bounces.

## Deployment checklist

1. Apply pending Supabase migrations.
2. Configure all environment variables in Vercel.
3. Confirm the Brevo sender identity is authenticated.
4. Deploy the application.
5. Test the cron endpoint with an invalid token.
6. Test the endpoint with no armed batch and confirm `no_batch_armed`.
7. Prepare a controlled campaign or batch with deliverable test contacts.
8. Run the cron job and verify the delivery status in EmailBlast and Brevo.
