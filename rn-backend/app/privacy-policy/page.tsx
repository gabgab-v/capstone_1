import type { Metadata } from "next";

const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Pabukid";
const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@trailmate.app";
const LAST_UPDATED = "March 9, 2026";

const sections = [
  {
    heading: "1. Scope",
    paragraphs: [
      `${APP_NAME} is a hiking and event platform that includes trail recording, social posting, chat, and booking features.`,
      "This Privacy Policy explains what personal data we collect, how we use it, who we share it with, and the choices available to you.",
    ],
  },
  {
    heading: "2. Information We Collect",
    bullets: [
      "Account and profile data: name, email address, password (handled through Supabase Authentication), birthdate, avatar, bio, and hiking preferences.",
      "Trail and location data: GPS trail recordings, timestamps, distance, elevation, trail geometry, and selected places for events.",
      "Community content: posts, photos, comments, likes, follows, and direct or event chat messages.",
      "Booking and payment-related data: booking status, amounts, cancellation and refund details, payment receipt image, waivers, medical certificates, and other booking support files you upload.",
      "Verification data (if you submit it): identity document images, selfie, extracted identity fields, business verification screenshots, and Facebook page/activity signals for organizer trust workflows.",
      "Notification and device data: push notification token, platform/device identifiers (if provided), app usage signals needed for reliable delivery and fraud prevention.",
      "Security and operational logs: request metadata such as IP address for abuse prevention, rate limiting, and organizer access logging.",
    ],
  },
  {
    heading: "3. How We Use Information",
    bullets: [
      "Provide core app features, including account management, trail recording, chat, social feed, and event bookings.",
      "Process event participation workflows, confirmations, reminders, status updates, and organizer coordination.",
      "Verify organizer trust signals and review submitted verification materials.",
      "Improve reliability, troubleshoot issues, prevent abuse, and protect users and platform integrity.",
      "Comply with legal obligations and enforce our terms and safety policies.",
    ],
  },
  {
    heading: "4. How We Share Information",
    bullets: [
      "With other users and organizers according to your actions and visibility settings (for example, posts, booking context, and event chat participation).",
      "With service providers that operate parts of the service, such as Supabase (authentication/database/storage), Mapbox (maps/location rendering), and Expo push infrastructure (notification delivery).",
      "With law enforcement, regulators, or courts when required by law or to protect rights, safety, and property.",
      "We do not sell your personal data for third-party marketing.",
    ],
  },
  {
    heading: "5. Data Retention",
    bullets: [
      "Direct one-to-one chat messages may be retained for up to 365 days and then removed by scheduled cleanup.",
      "Event group chats are removed 7 days after an event is marked completed.",
      "Account, profile, booking, and verification records are retained while your account is active and as needed for legal, security, and operational reasons.",
      "Some records may remain in backups for a limited period before deletion cycles complete.",
    ],
  },
  {
    heading: "6. Your Choices and Rights",
    bullets: [
      "You can review and update parts of your profile and preferences in the app.",
      "You can control location and push-notification permissions through your device settings.",
      "You can request access, correction, or deletion of personal data by contacting support.",
      "Account deletion requests can be submitted by email to support; we will process verified requests in line with applicable law and legitimate retention requirements.",
    ],
  },
  {
    heading: "7. Security",
    paragraphs: [
      "We use reasonable technical and organizational safeguards, including authenticated access controls and encrypted connections where supported.",
      "No method of transmission or storage is perfectly secure, so we encourage strong passwords and secure device practices.",
    ],
  },
  {
    heading: "8. Children",
    paragraphs: [
      `${APP_NAME} is not intended for children under 13, and we do not knowingly collect personal data from children under 13.`,
      "If you believe a child has provided personal data, contact us so we can investigate and delete the data when appropriate.",
    ],
  },
  {
    heading: "9. International Data Transfers",
    paragraphs: [
      "Our service providers may process and store data in countries other than your own.",
      "Where required, we apply reasonable measures to protect personal data during cross-border processing.",
    ],
  },
  {
    heading: "10. Changes to This Policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time to reflect product, legal, or operational changes.",
      `When we update this page, we will revise the "Last updated" date (${LAST_UPDATED}).`,
    ],
  },
];

export const metadata: Metadata = {
  title: `Privacy Policy | ${APP_NAME}`,
  description: `Privacy Policy for ${APP_NAME}`,
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium tracking-wide text-slate-500">
            {APP_NAME}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-slate-600">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            Questions or privacy requests:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-sky-700 underline underline-offset-2"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </header>

        <div className="mt-6 space-y-4 sm:mt-8">
          {sections.map((section) => (
            <section
              key={section.heading}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
            >
              <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>

              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-6 text-slate-700 sm:text-base">
                  {paragraph}
                </p>
              ))}

              {section.bullets?.length ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 sm:text-base">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
