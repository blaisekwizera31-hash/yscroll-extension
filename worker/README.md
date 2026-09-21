# Doomshield D1 Worker

This workspace did not contain the existing Wrangler project or `wrangler.toml`, so the Worker source is isolated here and expects the existing D1 binding to be named `DB`.

Configure the existing Worker project with:

```toml
[[d1_databases]]
binding = "DB"
database_name = "YOUR_EXISTING_DATABASE_NAME"
database_id = "YOUR_EXISTING_DATABASE_ID"
migrations_dir = "migrations"
```

Set a signing secret before deployment:

```powershell
wrangler secret put JWT_SECRET
```

Apply the migration and deploy from the Worker project directory:

```powershell
wrangler d1 migrations apply YOUR_EXISTING_DATABASE_NAME --remote
wrangler deploy
```

The extension expects the deployed API at `https://doomshield.pages.dev`:

- `POST /api/auth/register`
- `POST /api/usage/sync`
- `GET /api/leaderboard`

The leaderboard is cumulative across all dates and returns only real D1 users, limited to the top 50.
