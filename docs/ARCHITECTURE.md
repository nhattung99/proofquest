# Architecture

Current: Next.js App Router + TypeScript; statically bundled official Primus browser SDK; localhost-only Node route handlers; Zod validation; volatile opaque-cookie attempt store. lib/policy.ts separates signature-independent business rules from lib/poc.ts orchestration. The client receives only public configuration and signed requests. No application secret is serialized to the browser.

Planned after live integration passes: Next.js UI with Tailwind/shadcn, wagmi/viem wallet and SIWE sessions, Supabase PostgreSQL via Drizzle, persistent verification_attempts, users, quests, claims, point_ledger and badges. Unique claim/user/quest and proof identifiers plus transactions must make concurrent rewards atomic. A verified challenge connects source proof to the authenticated user and immutable quest policy. Do not infer authenticated identity from a supplied recipient string.

Release order: real proof acceptance → dashboard → durable auth and verification backend → atomic rewards → automated and real E2E checks → GitHub/Vercel preparation and approval for publication.
