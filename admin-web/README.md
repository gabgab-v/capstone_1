# Admin Dashboard

This Vite + React application provides the lightweight admin console for managing users and organizer requests. It talks to the same backend used by the mobile app (`rn-backend`), so you can switch between the Render deployment and a local server just by changing one environment variable.

## Configure the backend URL

Set the API base URL with `VITE_ADMIN_API_URL` in `admin-web/.env`. The dashboard now falls back to `VITE_API_BASE_URL`, then `VITE_BACKEND_URL`, and finally `http://localhost:3000` if nothing is provided.

```bash
# admin-web/.env
VITE_ADMIN_API_URL=https://backend-capstone-olpj.onrender.com
```

If you want to hit a local instance of `rn-backend`, simply change that value to `http://localhost:3000` after starting the Next.js server.

## Local development

```bash
cd admin-web
npm install
npm run dev
```

The dev server runs on `http://localhost:5173`. Log in with an admin account and you should see the latest users and organizer requests coming straight from the configured backend.
