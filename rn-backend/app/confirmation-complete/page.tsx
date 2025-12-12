import Link from "next/link";
import { useCallback } from "react";

const loginHref = process.env.NEXT_PUBLIC_APP_LOGIN_URL || "/";
const appDeepLink = process.env.NEXT_PUBLIC_APP_DEEP_LINK || "trailmeet://login";
const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@your-domain.com";

export const metadata = {
  title: "Email confirmed",
  description: "Your email is verified. You can log in and start using the app.",
};

function ActionButtons({
  deepLink,
  loginUrl,
  supportEmailAddress,
}: {
  deepLink: string;
  loginUrl: string;
  supportEmailAddress: string;
}) {
  "use client";

  const handleOpenApp = useCallback(() => {
    if (typeof window === "undefined") return;

    // Attempt to open the installed app; fall back to web login if unhandled.
    const fallbackTimer = window.setTimeout(() => {
      window.location.href = loginUrl;
    }, 1400);

    window.location.href = deepLink;

    window.addEventListener(
      "pagehide",
      () => {
        window.clearTimeout(fallbackTimer);
      },
      { once: true },
    );
  }, [deepLink, loginUrl]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={handleOpenApp}
        className="inline-flex items-center justify-center rounded-xl bg-emerald-400 text-slate-950 px-5 py-3 text-base font-semibold shadow-lg shadow-emerald-400/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-300/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Open in the app
      </button>
      <Link
        href={loginUrl}
        className="inline-flex items-center justify-center rounded-xl bg-white text-slate-900 px-5 py-3 text-base font-semibold shadow-lg shadow-emerald-400/20 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-300/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Go to login
      </Link>
      <a
        href={`mailto:${supportEmailAddress}`}
        className="inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 text-base font-semibold text-white/90 transition hover:-translate-y-0.5 hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:col-span-2"
      >
        Need help? Email support
      </a>
    </div>
  );
}

export default function ConfirmationCompletePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white flex items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(94,234,212,0.18),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.12),transparent_25%),radial-gradient(circle_at_50%_100%,rgba(236,72,153,0.1),transparent_30%)]" />
        <div className="relative p-8 sm:p-10 space-y-8">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-300/70 bg-emerald-400/15 text-emerald-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                className="h-7 w-7"
              >
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
                Email confirmed
              </p>
              <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">You&apos;re all set.</h1>
              <p className="text-sm text-slate-200/80">Your account is ready to go.</p>
            </div>
          </div>

          <p className="text-lg leading-relaxed text-slate-100/80">
            Thanks for confirming your email. You can log in and pick up where you left off. If the app
            is already open on another device, refresh it so your status updates immediately.
          </p>

          <ActionButtons deepLink={appDeepLink} loginUrl={loginHref} supportEmailAddress={supportEmail} />

          <div className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-slate-100/80">
            <p className="mb-2 text-base font-semibold text-white">What happens next</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>Keep this tab open until you see the app load.</li>
              <li>If login fails, try refreshing or request a new confirmation email.</li>
              <li>Still stuck? Contact support and include the email address you used to sign up.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
