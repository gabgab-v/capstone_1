This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Email confirmation landing page

- A static confirmation page is available at `/confirmation-complete` for Supabase email verification redirects.
- Set `SUPABASE_EMAIL_CONFIRM_REDIRECT_TO=https://your-domain.com/confirmation-complete` in your environment (Render and local) so confirmation emails point at the live page.
- Optional: set `NEXT_PUBLIC_APP_LOGIN_URL` to control where the “Go to login” button sends users; defaults to `/`.
- Optional: set `NEXT_PUBLIC_SUPPORT_EMAIL` to customize the support mailto link.

## Account inactivity safeguards

- Users are automatically flagged for temporary deactivation after 12 months of inactivity. Run `npm run deactivate:inactive` (with `.env` loaded) to batch-mark inactive accounts for recovery.
- Recovery steps live at `POST /api/auth/reactivate` and include verifying email/phone, accepting updated terms, and resetting the password. The endpoint returns outstanding steps and reactivates the account when all are satisfied.
- New Prisma fields: `lastActiveAt`, `deactivatedAt`, `deactivationReason`, `reactivationChecklist`, `termsVersionAccepted`, `emailVerifiedAt`, `phoneVerifiedAt`. Run a Prisma migration and `prisma generate` after updating your database schema.
- Set `CURRENT_TERMS_VERSION` (and optional `SUPABASE_EMAIL_CONFIRM_REDIRECT_TO`) in `.env` to control which terms version users must accept during recovery.

## Message retention

- Direct/1:1 chats keep messages for at least 12 months; older messages are purged by `npm run cleanup:messages`.
- Event group chats are deleted 7 days after an event is marked completed. The same cleanup script enforces this and the event chat API returns days-remaining metadata so clients can warn users.
- Schedule `npm run cleanup:messages` (cron/Render job) daily or weekly with `.env` loaded to keep retention rules enforced.

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
