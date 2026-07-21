# Owner provisioning (one-time)

The store is keyed to a **single pre-provisioned Supabase auth user** — the "owner."
Both clients (phone + web) sign in as this same user, and every `owner_id` in the schema
references its uid. The owner never sees these credentials during daily use (daily access
is the S-12 PIN); they are entered once per client at setup via the minimal sign-in input
(Phase 2), and used by the Node smoke script (Phase 4).

Creating an `auth.users` row is **not** done in a SQL migration — that bypasses GoTrue
(no proper password hashing / identities row) and can produce a broken user. Create it
one of these ways instead:

## Option A — Dashboard (simplest)

1. Supabase project → **Authentication → Users → Add user**.
2. Enter the owner email + a strong password. Enable "Auto Confirm User".
3. Copy the resulting **user UID** — this is the owner uid the whole store is scoped to.

## Option B — Admin API / CLI (scriptable)

Use the service-role key (server-side only, never in the app) with the Admin API:

```bash
curl -sS -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"OWNER_EMAIL","password":"OWNER_PASSWORD","email_confirm":true}'
```

## After creating the owner

Put the credentials the **Node smoke/seed script** uses (Phase 4) in the git-ignored
`.env.local` (never `EXPO_PUBLIC_*`, never the bare `.env`):

```
OWNER_EMAIL=...
OWNER_PASSWORD=...
```

The app itself does not read these — it obtains a session from the one-time sign-in input
and persists the token thereafter.

## ⚠️ Disable public signups (required security assumption)

The store's privacy model assumes **exactly one identity can authenticate** — the owner.
The `meal-photos` storage policy (`supabase/migrations/*_storage.sql`) scopes access to
`authenticated` users by `bucket_id` only, i.e. it treats "any authenticated user" as
"the owner." That equivalence holds **only while no other user can sign up**.

Supabase enables email signups by default. After creating the owner, turn signups **off**:

- Dashboard → **Authentication → Sign In / Providers → Email → disable "Allow new users to sign up"**
  (or Authentication → Settings → "Allow new signups" = off).

If public signups are ever re-enabled, the storage policy must first be tightened to an
owner-scoped predicate (e.g. object path prefixed with the owner uid,
`meal-photos/<owner_id>/<meal_entry_id>.jpg`, gated by
`(storage.foldername(name))[1] = (select auth.uid())::text`). Until then, keeping signups
disabled is what makes the single-owner assumption true. (See review finding F1.)

## Note on tooling

This project's migrations were authored and applied via the Supabase MCP (no local Docker).
When you later want a local dev stack, run `supabase init` (generates the full `config.toml`)
and `supabase link` against this project; the migrations under `supabase/migrations/` are the
source of truth and replay with `supabase db reset`.
