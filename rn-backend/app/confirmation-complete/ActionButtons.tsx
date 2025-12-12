"use client";

import Link from "next/link";
import { useCallback } from "react";

type Props = {
  deepLink: string;
  loginUrl: string;
  supportEmailAddress: string;
};

export function ActionButtons({ deepLink, loginUrl, supportEmailAddress }: Props) {
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
