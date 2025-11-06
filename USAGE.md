nx-scanner — Usage & Quick Tips

Quick start

1. Install dependencies

```bash
npm install
```

2. Environment

Create `.env.local` with:

```bash
MONGODB_URI="mongodb+srv://<username>:<password>@cluster.example.mongodb.net/"
MONGODB_DB=nx-scanner
```

If you don't want DB persistence during development, leave `MONGODB_URI` empty or unset. The API will return an auth error until configured.

3. Run dev server

```bash
npm run dev
```

4. Theme

Use the theme toggle in the page header to switch light/dark. The selection is saved to `localStorage`.

Troubleshooting

- MongoDB auth errors: ensure credentials are correct and password is URL-encoded; check Atlas IP whitelist.
- To test the API locally (after setting env), run the curl command shown in the README or USAGE.

Files to look at

- `app/page.tsx` — front-end UI and parser
- `app/api/scans/route.ts` — server route that writes scans to MongoDB
- `app/globals.css` — theme variables and global styles

If you want, I can:

- Add a dev fallback for scans (in-memory) so scanning works without DB auth.
- Add unit tests for parsing and theme behavior.
