# Pabukid

<p align="center">
  <img src="assets/Pabukid-Logo.png" alt="Pabukid logo" width="180" />
</p>

<p align="center">A mobile platform for discovering hikes, connecting with fellow adventurers, recording trails, and joining trusted outdoor events.</p>

> **Pabukid** brings hikers and verified event organizers together in one place. It supports personalized event discovery, GPS trail recording, event booking, social posts, messaging, and organizer verification.

## Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Project structure](#project-structure)
- [Technology](#technology)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Available scripts](#available-scripts)
- [Team](#team)
- [License](#license)

## Features

### For hikers

- Create an account and set hiking preferences for more relevant event recommendations.
- Discover upcoming hikes with match scores based on difficulty, distance, duration, elevation, budget, trail type, and mountain.
- View event details, itinerary, route/location information, organizer details, and participant limits.
- Book events, upload payment receipts and supporting requirements, and review booking status.
- Record GPS trails, save them for offline sync, and share trail routes with the community.
- Create posts with images, react to and comment on posts, control post visibility, and follow other hikers.
- Send direct messages and participate in event group conversations.
- Receive push notifications and manage app, privacy, and appearance settings.

### For organizers and administrators

- Apply to become an organizer and submit identity and business-verification documents.
- Create, edit, publish, cancel, and reschedule hiking events.
- View bookings, payment receipts, and attendance information for organizer events.
- Apply for an expert badge by providing summit evidence and a certificate.
- Use the web-based admin dashboard to review users, organizer applications, business verifications, and expert-verification requests.

## Screenshots

The following screenshots are included in the repository under `docs/`.

### Authentication

![Authentication screen](docs/auth-and-preferences.jpg)

### Hiking preferences

![Hiking preferences](docs/preferences.jpg)

### Discover personalized hikes

![Personalized event discovery](docs/discover-events.jpg)

### Event details and booking

![Event details and booking](docs/event-booking.jpg)

### GPS trail recording

![GPS trail recording](docs/trail-recording.jpg)

### Community and messaging

![Community and messaging](docs/community-and-messaging.jpg)

### Organizer event management

![Organizer event management](docs/organizer-management.jpg)


## Project structure

```text
.
|-- App.js                 # Expo / React Native application entry point
|-- src/                   # Mobile screens, navigation, components, hooks, and utilities
|-- assets/                # App icons, logos, and splash assets
|-- rn-backend/            # Next.js API and Prisma/PostgreSQL database layer
|   |-- app/api/           # API routes
|   |-- prisma/            # Database schema, migrations, and seed data
|   `-- scripts/           # Maintenance and GPX-import tasks
|-- admin-web/             # Vite + React admin dashboard
`-- docs/                  # Project documents and screenshots
```

## Technology

| Area | Tools used |
| --- | --- |
| Mobile application | Expo, React Native, React Navigation, NativeWind |
| Maps and location | Mapbox, Expo Location |
| Backend API | Next.js |
| Database | PostgreSQL with Prisma ORM |
| Authentication and storage | Supabase |
| Notifications | Expo Notifications |
| Admin dashboard | React, Vite, Ant Design |

## Getting started

### Prerequisites

- Node.js 20 or later
- npm
- A PostgreSQL database
- A Supabase project
- A Mapbox access token for map and route previews
- Android Studio/emulator or the Expo Go app for mobile testing

### 1. Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/pabukid.git
cd pabukid
```

### 2. Configure and run the backend

Create `rn-backend/.env` and add the required variables described in [Configuration](#configuration).

```bash
cd rn-backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

The API is available at `http://localhost:3000` by default.

### 3. Configure and run the mobile app

From the project root, set the mobile app configuration in `app.json` or through Expo public environment variables. For Android Emulator development, point the API to `http://10.0.2.2:3000`; for a physical device, use your computer's LAN IP address.

```bash
cd ..
npm install
npm start
```

Then scan the QR code with Expo Go, or run:

```bash
npm run android
```

### 4. Run the admin dashboard (optional)

Create `admin-web/.env` with the admin API URL, then run:

```bash
cd admin-web
npm install
npm run dev
```

The dashboard runs at `http://localhost:5173` by default.

## Configuration

Never commit real credentials. The repository ignores `.env` files; use the examples below as a guide.

### Backend: `rn-backend/.env`

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET=YOUR_SUPABASE_JWT_SECRET
JWT_SECRET=YOUR_APPLICATION_JWT_SECRET
SUPABASE_RECEIPT_BUCKET=receipts
SUPABASE_EMAIL_CONFIRM_REDIRECT_TO=http://localhost:3000/confirmation-complete
NEXT_PUBLIC_APP_URL=http://localhost:3000
CURRENT_TERMS_VERSION=1.0
```

Optional variables include `FACE_MATCH_THRESHOLD`, `FB_PAGE_ACCESS_TOKEN`, `NEXT_PUBLIC_SUPPORT_EMAIL`, and `GPX_OWNER_EMAIL`.

### Mobile application

The app reads the values in `expo.extra` in `app.json` first, then falls back to Expo public environment variables.

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
EXPO_PUBLIC_MAPBOX_TOKEN=YOUR_MAPBOX_ACCESS_TOKEN
```

### Admin dashboard: `admin-web/.env`

```env
VITE_ADMIN_API_URL=http://localhost:3000
```

## Available scripts

### Mobile application

```bash
npm start        # Start Expo
npm run android  # Run on Android
npm run ios      # Run on iOS
npm run web      # Run in a web browser
```

### Backend

```bash
npm run dev                   # Start the Next.js API in development
npm run build                 # Create a production build
npm run start                 # Start the production server
npm run import:gpx            # Import GPX trails
npm run fix:trail-durations   # Recalculate stored trail durations
npm run deactivate:inactive   # Process inactive accounts
npm run cleanup:messages      # Enforce message-retention rules
npm run remind:events         # Send event reminders
```

### Admin dashboard

```bash
npm run dev      # Start the Vite development server
npm run build    # Create a production build
npm run preview  # Preview the production build
npm run lint     # Lint the dashboard source
```

## Team

Built as a capstone project by:

- **[Name]** - [Role / contribution]
- **[Name]** - [Role / contribution]
- **[Name]** - [Role / contribution]

Replace the entries above with your team members' names, GitHub profiles, and contributions.

## License

This project is intended for academic and portfolio use. Add your chosen license here before distributing or reusing the project.
