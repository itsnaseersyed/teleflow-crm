## Plan: Remove Lovable & Migrate Supabase

TL;DR - Remove Lovable build integration, migrate database and auth away from Supabase/Lovable Cloud, and make the app self-contained. Approach: inventory current Supabase usage, abstract data/auth access behind services, choose replacement (self-hosted Postgres + Auth, or Supabase alternative), apply DB migrations, replace client/server SDKs, update environment and deployment, and run verification tests.

**Steps**
1. Inventory and map usages (completed): list all files that call Supabase, env vars, migrations, and Lovable plugin places. *depends on discovery*.
2. Choose migration targets: either (A) self-hosted Postgres + Keycloak/Clerk/Auth0, (B) Supabase project you control, or (C) PostgreSQL + custom JWT auth. Document chosen option and secrets handling. *blocks 3-6*
3. Introduce an abstraction layer: create `src/services/db/*` and `src/services/auth/*` wrappers that centralize calls currently using `supabase.from(...)`, `supabase.auth.*`, and `supabase.storage`. Replace direct calls with wrappers (doable incrementally). *parallelizable across routes*
4. Database migration:
   - If staying with Postgres/Supabase compatible: run existing SQL in `supabase/migrations/...sql` on new DB and verify RLS policies and functions.
   - If switching DB shape or auth model: convert SQL and re-implement RLS-like constraints or move logic into application layer.
   - Validate tables: `profiles`, `user_roles`, `leads`, `calls`, `followups`, `notifications`, and `auth.users` mapping.
   *depends on step 2*
5. Auth migration:
   - If replacing Supabase Auth: select provider (Auth0/Clerk/Keycloak) and map user lifecycle: signup, signin, sessions, password resets, profile storage.
   - Rework `src/lib/auth.tsx` to use new provider SDK; keep same Context API shape (session, user, role, fullName, loading, signOut, refreshRole) to minimize UI changes.
   - Recreate `user_roles` logic: map provider user ID to `profiles` and `user_roles` table entries.
   *depends on step 2 and 4*
6. Replace Supabase SDK usage:
   - Remove `src/integrations/supabase/client.ts` and `client.server.ts` usages; replace with new SDK clients behind the service layer. Keep `client.server.ts` semantics (server-only admin key) but with your new provider.
   - Update `src/integrations/*` to contain new clients or an adapter layer.
7. Storage migration (if used):
   - Inventory usage of `supabase.storage` via code scan; if present, choose R2/S3/GCS and implement `src/services/storage` adapter used by app.
   - Migrate existing files from Lovable Supabase buckets (download and re-upload to new storage) or leave in place if you keep the Supabase project.
8. Remove Lovable build tooling:
   - Replace [vite.config.ts](vite.config.ts) to remove `@lovable.dev/vite-tanstack-config` and re-add required plugins (`@vitejs/plugin-react`, `vite-tsconfig-paths`, `@cloudflare/vite-plugin` if deploying to Workers). Ensure TanStack Start SSR wiring is preserved (server entry: `src/server.ts`).
   - Update [package.json](package.json) to remove `@lovable.dev/vite-tanstack-config` and add any plugins you need; run `npm install`.
9. Deployment and secrets:
   - For Cloudflare Workers: set `SUPABASE_*` (or new provider) secrets via `wrangler secret put` or Cloudflare dashboard.
   - Update [wrangler.jsonc](wrangler.jsonc) if you change entry or compatibility flags.
10. Gradual rollout & testing:
   - Replace calls incrementally, run typecheck and `npm run dev` frequently.
   - Add integration smoke tests for login, profile load, create lead, create call, followup flow.
11. Cleanup and branding:
   - Remove Lovable references in code and meta tags (replace author/description), delete `supabase/config.toml` if you no longer need it, and remove the Lovable dependency from `package.json`.
12. Final verification and CI:
   - Add GitHub Actions to run `npm ci`, `npm run lint`, `npm run build`, a minimal server-side smoke test, and secret scanning to prevent service role key leakage.

**Verification**
1. Run TypeScript check: `npx tsc --noEmit` (fix errors introduced by adapter changes).
2. Dev server smoke tests: run `npm run dev` and test login, profile, create lead, and call creation flows in browser.
3. Run build: `npm run build` and validate Cloudflare worker bundle (if using Workers).
4. Database verification: run SQL queries against new DB to confirm tables, RLS policies, and custom functions behave as expected.
5. Secrets audit: ensure `SUPABASE_SERVICE_ROLE_KEY` or equivalent admin keys are stored only in secret stores; run `git grep` to ensure no secrets in repo.

**Decisions / Assumptions**
- Keep TanStack Start and React stack; only replace data and auth backends.
- Prefer adding an adapter/service layer to minimize UI changes.
- If you keep Supabase as the DB but host it yourself, minimal code changes required (mainly env vars). Full provider swap (Auth0/Clerk) requires more work in `src/lib/auth.tsx` and RLS removal.

**Further Considerations**
1. Option A (fast): Create your own Supabase project, run migrations, and only update env vars and secrets — minimal code changes.
2. Option B (medium): Replace Supabase DB with Postgres + Auth0 for auth — requires adapters and rework of RLS logic into app code or DB-level grants.
3. Option C (full migration): Replace DB + auth + storage with different providers — highest effort but removes Supabase lock-in.

If this plan looks good I will:
- implement step 8 (replace `vite.config.ts`) and update `package.json`, then run `npm run dev` to surface remaining changes, or
- begin step 3 by scaffolding `src/services/db` and `src/services/auth` adapters and migrate a single route as a proof-of-concept.
