export const DEFAULT_LEGAL_DOCUMENT_KEY = 'terms';

export const LEGAL_DOCUMENTS = {
  terms: {
    key: 'terms',
    title: 'Terms of Use',
    summary: 'Please read these terms carefully before using Pabukid.',
    lastUpdated: 'October 15, 2025',
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Pabukid is an outdoor adventure companion that helps you discover guided hikes and community events, record trails with GPS, share trip reports, chat with organizers, and manage bookings.',
          'By creating an account or using the app you agree to these Terms of Use and to abide by all applicable laws. If you do not agree, do not access or use the service.',
        ],
      },
      {
        heading: 'Eligibility and Account Responsibilities',
        paragraphs: [
          'You must be at least 18 years old or have the consent of a legal guardian to create an account.',
          'Keep your login credentials secure and notify us immediately at support@trailmate.app if you suspect unauthorized access.',
          'You are responsible for all activity that occurs under your account, including posts, bookings, and messages.',
        ],
      },
      {
        heading: 'Acceptable Use and Conduct',
        paragraphs: [
          'Use Pabukid only for lawful purposes connected to outdoor recreation and community engagement.',
          'Do not upload content that is harmful, harassing, fraudulent, hateful, or infringes intellectual property rights.',
          'Do not attempt to interfere with the app, reverse engineer code, scrape data, or misuse location services.',
        ],
      },
      {
        heading: 'Community Content',
        paragraphs: [
          'You retain ownership of content you post, including photos, trail recordings, and comments, but grant Pabukid a non exclusive license to display, reproduce, and distribute that content within the service.',
          'You warrant that you have the right to share all content you upload and that it does not violate the rights of others.',
          'We may remove or moderate content that violates these terms or community guidelines.',
        ],
      },
      {
        heading: 'Bookings and Payments',
        paragraphs: [
          'Some adventures, workshops, or trail experiences may require reservations or payments that are handled through connected organizers.',
          'You are responsible for reviewing the details, requirements, and cancellation policies of every booking before confirming.',
          'Pabukid is not the organizer of most events and is not liable for changes, cancellations, or injuries that occur during an activity.',
        ],
      },
      {
        heading: 'Location and Activity Features',
        paragraphs: [
          'Trail recording and discovery features rely on device location data. You may disable location permissions at any time, but the app may not function as intended.',
          'Use your best judgment when following suggested routes or trail statistics. Outdoor conditions can change quickly and cell signals may drop.',
          'Always prepare adequately, carry the proper gear, and follow local regulations when heading outdoors.',
        ],
      },
      {
        heading: 'Organizers and Experts',
        paragraphs: [
          'Organizers and experts who list events or services through Pabukid must provide accurate information, maintain required permits or licenses, and honor commitments made to participants.',
          'We may suspend or remove organizer access if reported behavior violates these terms, safety requirements, or community standards.',
        ],
      },
      {
        heading: 'Third Party Services',
        paragraphs: [
          'Pabukid uses third party services such as Supabase for authentication and data storage, Mapbox for maps, and notification providers for alerts.',
          'Those services may have their own terms. Your use of them through Pabukid is subject to their policies as well.',
        ],
      },
      {
        heading: 'Suspension and Termination',
        paragraphs: [
          'We may suspend or terminate your access without notice if you violate these terms, misuse the platform, or create security risks for other members.',
          'You may delete your account at any time by contacting support@trailmate.app. Termination does not affect rights or obligations that by their nature should survive, such as intellectual property rights.',
        ],
      },
      {
        heading: 'Changes and Contact',
        paragraphs: [
          'We may update these terms from time to time. When we do, we will revise the Last Updated date and notify you through the app or email.',
          'If you have questions about these terms, contact us at support@trailmate.app.',
        ],
      },
    ],
  },
  privacy: {
    key: 'privacy',
    title: 'Privacy Notice',
    summary: 'This notice explains how Pabukid collects, uses, and shares information.',
    lastUpdated: 'October 15, 2025',
    sections: [
      {
        heading: 'Information We Collect',
        paragraphs: [
          'Account details such as name, email address, password, and profile information you provide when you sign up or edit your account.',
          'Trail and activity data including GPS tracks, timestamps, distance, and photos attached to posts or recordings.',
          'Booking information such as selected events, participants, preferences, and communications with organizers.',
          'Device and usage information including app version, device model, operating system, and interactions needed to keep the service secure and reliable.',
        ],
      },
      {
        heading: 'How We Use Information',
        paragraphs: [
          'To create and manage your account, authenticate logins, and deliver the features you request.',
          'To personalize discovery feeds, recommend events or trails, and surface content that matches your preferences.',
          'To support community features such as posts, comments, chats, and organizer coordination.',
          'To process bookings, send confirmations and reminders, and handle receipts.',
          'To improve app performance, troubleshoot issues, and develop new features.',
        ],
      },
      {
        heading: 'How We Share Information',
        paragraphs: [
          'With organizers and experts when you book an event or apply to host experiences so they have attendee details and preferences.',
          'With service providers that help us operate the app, including Supabase for data hosting, Mapbox for mapping and geocoding, analytics providers, and notification services.',
          'With other members when you post public content, join community discussions, or share trail activity on leaderboards.',
          'When required by law, to respond to legal requests, or to protect the rights, safety, and property of our community.',
        ],
      },
      {
        heading: 'Location Data',
        paragraphs: [
          'Trail recording, nearby event suggestions, and safety alerts rely on background or foreground location data.',
          'You can disable location permissions in your device settings, but doing so will limit trail recording and discovery features.',
          'We store trail recordings and other location information in Supabase so you can revisit your history and share it with friends or organizers.',
        ],
      },
      {
        heading: 'Data Retention',
        paragraphs: [
          'We retain account and booking information for as long as your account remains active or as needed to provide services.',
          'You may request deletion of your account and associated personal data by emailing support@trailmate.app. Some information may remain in backups for a limited period or as required by law.',
        ],
      },
      {
        heading: 'Security',
        paragraphs: [
          'We use industry standard safeguards such as encrypted connections, access controls, and monitoring to protect your data.',
          'No online service can guarantee absolute security, so please use strong passwords and keep your device secure.',
        ],
      },
      {
        heading: 'Your Choices',
        paragraphs: [
          'Update your profile, communication preferences, and location permissions at any time within the app settings.',
          'Opt out of marketing emails by using in app toggles or the unsubscribe instructions in the message.',
          'Request access, correction, or deletion of your personal data by contacting support@trailmate.app.',
        ],
      },
      {
        heading: 'Children',
        paragraphs: [
          'Pabukid is not directed to children under the age of 13, and we do not knowingly collect personal data from them.',
          'If we learn that we have collected data from a child under 13 without parental consent, we will delete it promptly.',
        ],
      },
      {
        heading: 'Changes and Contact',
        paragraphs: [
          'We may update this Privacy Notice to reflect changes in our practices or legal requirements. We will notify you of material updates within the app or by email.',
          'Questions about privacy can be sent to support@trailmate.app.',
        ],
      },
    ],
  },
  eula: {
    key: 'eula',
    title: 'End User License Agreement',
    summary: 'This EULA governs your installation and use of the Pabukid mobile application.',
    lastUpdated: 'October 15, 2025',
    sections: [
      {
        heading: 'License Grant',
        paragraphs: [
          'We grant you a personal, revocable, non transferable, and non exclusive license to install and use Pabukid on your compatible devices solely for your own outdoor planning and community activities.',
        ],
      },
      {
        heading: 'Permitted Use',
        paragraphs: [
          'Use the app to discover events, record trails, communicate with other members, and manage your bookings.',
          'Downloadable trail data or offline content is for personal use only and may not be redistributed without permission.',
        ],
      },
      {
        heading: 'Restrictions',
        paragraphs: [
          'Do not copy, modify, distribute, sell, lease, or sublicense the app or any part of it.',
          'Do not reverse engineer, decompile, or attempt to extract source code except where such restrictions are prohibited by law.',
          'Do not circumvent security features, limit access controls, or interfere with the normal operation of the service.',
        ],
      },
      {
        heading: 'Updates and Availability',
        paragraphs: [
          'We may issue updates, patches, or enhancements that install automatically or require you to take action. Some features may not function without the latest version.',
          'Features may change or be discontinued. Significant changes will be communicated within the app or release notes.',
        ],
      },
      {
        heading: 'Third Party Services and Open Source',
        paragraphs: [
          'The app integrates third party services such as Supabase, Mapbox, and notification providers. Your use of those services through the app is subject to their terms.',
          'The app may include open source components licensed under their respective licenses. Those licenses remain in full force.',
        ],
      },
      {
        heading: 'Disclaimer of Warranties',
        paragraphs: [
          'Pabukid is provided on an as is and as available basis. We disclaim all warranties, express or implied, including fitness for a particular purpose and non infringement.',
          'Trail conditions, weather, and organizer availability can change rapidly. Always verify critical information before heading outdoors.',
        ],
      },
      {
        heading: 'Limitation of Liability',
        paragraphs: [
          'To the fullest extent permitted by law, we shall not be liable for indirect, incidental, special, consequential, or exemplary damages arising from your use of the app.',
          'Our total liability for any claims related to the app will not exceed the amount you paid, if any, to use Pabukid in the twelve months before the claim.',
        ],
      },
      {
        heading: 'Indemnification',
        paragraphs: [
          'You agree to indemnify and hold harmless Pabukid, its affiliates, and its partners from any claims, damages, or expenses arising out of your misuse of the app or violation of this agreement.',
        ],
      },
      {
        heading: 'Governing Law',
        paragraphs: [
          'These terms are governed by the laws of the jurisdiction where Pabukid operates, without regard to conflict of law principles.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          'Questions about this EULA may be sent to support@trailmate.app.',
        ],
      },
    ],
  },
};

export const AVAILABLE_LEGAL_DOCUMENTS = Object.values(LEGAL_DOCUMENTS).map(
  ({ key, title }) => ({ key, title }),
);
