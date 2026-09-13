<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Database schema changes

This project is in active development with no need for backwards compatibility or migration history. Never run `drizzle-kit generate` or `drizzle-kit migrate` (`npm run db:generate` / `npm run db:migrate`). Always use `drizzle-kit push` (`npm run db:push`) to sync `lib/db/schema.ts` straight to the database.

# Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.claude/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), read the most relevant skill's `SKILL.md`:

- `trigger-getting-started` — bootstrapping Trigger.dev: CLI auth, installing `@trigger.dev/sdk` / `@trigger.dev/build`, `trigger.config.ts`, the `/trigger` directory, `TRIGGER_SECRET_KEY`, and running the dev server.
- `trigger-authoring-tasks` — writing backend tasks in `/trigger`: `task()` / `schemaTask()`, retries, waits, queues and concurrency, idempotency keys, metadata, logging, triggering other tasks, scheduled/cron tasks, and `trigger.config.ts` essentials.
- `trigger-realtime-and-frontend` — the client side: subscribing to runs (`runs.subscribeToRun`, `useRealtimeRun`), consuming metadata and streams in React (`useRealtimeStream`), triggering tasks from the browser, and minting public tokens.
- `trigger-authoring-chat-agent` — durable AI chat agents with `chat.agent` from `@trigger.dev/sdk/ai`: the per-turn run loop, spreading `...chat.toStreamTextOptions()` first, the start-session and public-token server actions, and wiring `useChat` to `useTriggerChatTransport`.
- `trigger-chat-agent-advanced` — advanced chat.agent features: raw Sessions, custom transports, sub-agents, human-in-the-loop, steering, `chat.defer` / `chat.inject`, preload and Head Start, compaction and recovery, `chat.local`, offline testing with `mockChatAgent`, and version upgrades.
- `trigger-cost-savings` — auditing tasks, schedules, and runs to reduce spend: right-sizing machines and reviewing task efficiency.
