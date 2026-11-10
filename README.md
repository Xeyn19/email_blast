This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Fixed cron campaign delivery

EmailBlast uses one global campaign slot and one permanent cron-job.org URL. A dashboard user prepares one campaign for cron; the next cron request atomically claims that campaign and asks Brevo to send it once.

1. Apply the SQL migration in `supabase/migrations` to the project database.
2. Add `SUPABASE_SERVICE_ROLE_KEY` and a long random `CRON_SECRET` to local and Vercel environment settings. Keep both server-only.
3. Configure one cron-job.org job:

```text
Method: POST
URL: https://email-blast-xmeta.vercel.app/api/cron/campaigns/send?token=<CRON_SECRET>
Body: none
```

The endpoint returns a safe success response when the slot is empty. Do not log, share, or expose the complete URL because its query token authorizes delivery.
