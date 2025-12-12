const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@your-domain.com";

export const metadata = {
  title: "Email confirmed",
  description: "Your email is verified. You can log in and start using the app.",
};

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
            Thanks for confirming your email. Your account is ready. You can close this tab and open the app
            to log in.
          </p>

          <div className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-slate-100/80">
            <p className="mb-2 text-base font-semibold text-white">What happens next</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>Keep this tab open until you see the app load.</li>
              <li>If login fails later, request a new confirmation email.</li>
              <li>
                Still stuck? Contact support at <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> and include the email you used to sign up.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
