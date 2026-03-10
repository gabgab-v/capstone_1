import type { Metadata } from "next";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Pabukid";
const DEVELOPER_NAME =
  process.env.NEXT_PUBLIC_DEVELOPER_NAME?.trim() || "Pabukid";
const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@trailmate.app";
const LAST_UPDATED = "March 10, 2026";

const steps = [
  "Send an email to the support address below with the subject line: Delete Account Request.",
  "Include the email address associated with your account and your full name (or username).",
  "If you used multiple sign-in methods, specify which account should be deleted.",
  "We may ask you to verify ownership before we delete the account.",
];

const dataDeleted = [
  "Account profile (name, email, avatar, bio, preferences, verification status).",
  "User-generated content (posts, comments, likes, uploaded photos).",
  "Trail recordings and activity history.",
  "Chats and direct messages tied to your account.",
  "Push notification tokens linked to your device.",
];

const dataRetained = [
  "Booking and payment records required for legal, audit, or dispute resolution purposes.",
  "Access and security logs used to prevent fraud or abuse.",
  "Backups that may persist for a limited time before being overwritten.",
];

export const metadata: Metadata = {
  title: `Delete Account | ${APP_NAME}`,
  description: `Request account deletion for ${APP_NAME}`,
};

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium tracking-wide text-slate-500">
            {APP_NAME} by {DEVELOPER_NAME}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Delete Account Request
          </h1>
          <p className="mt-4 text-sm text-slate-600">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            To request deletion of your {APP_NAME} account and associated data,
            follow the steps below.
          </p>
        </header>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:mt-8 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">How To Request Deletion</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700 sm:text-base">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            Email:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-sky-700 underline underline-offset-2"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">Data We Delete</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 sm:text-base">
            {dataDeleted.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">Data We May Keep</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700 sm:text-base">
            Some data may be retained for legal, security, or operational reasons.
            When retained, we restrict access and keep it only for as long as necessary.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 sm:text-base">
            {dataRetained.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
