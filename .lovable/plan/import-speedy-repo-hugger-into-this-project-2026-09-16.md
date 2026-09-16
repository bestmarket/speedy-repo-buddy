# Import "speedy-repo-hugger" into this project

The repo is a YouTube content-studio app: sign-in, source-channel analysis, an AI chat strategist, a studio/video editor, and scheduled video publishing. This project is currently the blank starter, so the import is a straight copy-in plus backend setup.

## What you'll get

- **Sign in / sign up** page, with the rest of the app behind login.
- **Sources** — add a YouTube channel and analyse its style (opens by default).
- **Chat** — AI strategist that turns a channel style into video ideas.
- **Studio** — turn ideas into scripts and videos, with the video editor.
- **Channels** — manage connected channels and scheduling.
- **Automatic publishing hook** that a scheduler can call for queued videos.

## Steps

1. Turn on Lovable Cloud (database, logins, server code, storage) for this project.
2. Copy across all app code: pages, components, shared logic, styling and design tokens, favicon/robots.
3. Add the extra packages the app uses (AI toolkit, markdown/streaming UI, charts, drag/resize panels, database tooling).
4. Recreate the database exactly as in the repo: the four migration files in order (content tables plus roles, AI-provider governance, grants and row-level security). No customer data comes with the repo, so tables start empty.
5. Point the app at this project's own backend and set the one internal secret the scheduling hook needs. AI features run through Lovable's built-in AI, so no external AI key is required.
6. Verify: build and typecheck clean, sign up a test account, load each page, run one create/read action, then remove the test data.

## Technical notes

- Same stack (TanStack Start v1, React 19, Tailwind v4, shadcn), so no framework conversion — files transfer as-is, with TanStack versions kept at this template's pinned versions.
- Supabase integration files (`client.ts`, `client.server.ts`, auth middleware/attacher, `types.ts`) are replaced by the ones Cloud generates here; the repo's `_authenticated/route.tsx` gate and `src/start.ts` auth middleware are preserved in equivalent form.
- Migrations applied as SQL in order `0000` → `0002` → `0003` (`0001` is empty); `drizzle/schema.ts` and `drizzle.config.ts` come along for reference.
- Env: `SUPABASE_*`/`VITE_SUPABASE_*` and `LOVABLE_API_KEY` are provided by Cloud; `LOVABLE_CRON_SECRET` (and optional `_PREVIOUS`) will be generated for `/api/public/hooks/scheduled-videos`.
- Repo `.env` values point at the source project's backend and are deliberately not reused.

## Not carried over

- Existing users, rows, and uploaded files — the public repo contains none. If you have exports, share them after the preview and they can be loaded in.
