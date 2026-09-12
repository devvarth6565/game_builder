<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Database schema changes

This project is in active development with no need for backwards compatibility or migration history. Never run `drizzle-kit generate` or `drizzle-kit migrate` (`npm run db:generate` / `npm run db:migrate`). Always use `drizzle-kit push` (`npm run db:push`) to sync `lib/db/schema.ts` straight to the database.
