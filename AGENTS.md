# Repository Guidelines

## Project Structure & Module Organization

This repository is a TypeScript/React 3D shirt configurator built with Vinext/Vite and Cloudflare tooling. Page entry points and global styling live in `app/`; feature UI lives in `components/editor/`, with primitives in `components/ui/`. Put domain models and serialization in `lib/` (`design.ts`, `schema.ts`, `project-io.ts`, `persistence.ts`), state in `store/`, and reusable React behavior in `hooks/`. Static and 3D assets belong in `public/`, especially `public/models/`. Tests and fixtures belong in `tests/`; maintenance scripts belong in `scripts/`.

## Build, Test, and Development Commands

Use pnpm, Node.js 22.13 or newer, and the checked-in `pnpm-lock.yaml`:

- `pnpm install` — install locked dependencies.
- `pnpm dev` — start the local development server.
- `pnpm build` — create the production Vinext build.
- `pnpm start` — serve the built Cloudflare/Wrangler output locally.
- `pnpm test` — run the Vitest suite once.
- `pnpm typecheck` — run strict TypeScript checks without emitting files.
- `pnpm lint` / `pnpm format` — run Oxlint / Oxfmt.
- `pnpm generate:uv-mask` and `pnpm validate:model` — regenerate or validate 3D model support assets.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, 2-space indentation, single quotes, and an 80-column format; let Oxfmt enforce formatting. Use `PascalCase` for components and types, `camelCase` for functions and variables, and kebab-case for hook filenames (for example, `use-autosave.ts`). Prefer the `@/*` alias. Keep UI components presentational and place persistence, schema validation, and design-document logic in `lib/`.

## Testing Guidelines

Vitest runs `tests/**/*.test.ts` in the Node environment. Name tests after the module or behavior under test, such as `schema.test.ts` or `project-io.test.ts`. Add regression coverage for schema, persistence, import/export, state, and UV-mask changes. No coverage threshold is configured; run `pnpm test` plus `pnpm typecheck` before submitting changes.

## Commit & Pull Request Guidelines

Recent commits use short imperative summaries, in either Spanish or English (for example, `Fix UV zone masking at shirt side seams`). Keep commits focused. Pull requests should explain the problem and solution, list validation commands, link related issues when applicable, and include screenshots or a short recording for editor/UI changes. Do not commit generated directories such as `dist/`, `.next/`, `.wrangler/`, or `graphify-out/`.

## Security & Configuration Tips

Keep secrets in local `.env*` files; do not commit them. Treat imported design documents and uploaded assets as untrusted input and preserve the existing Zod validation and sanitization paths when changing import, persistence, or export behavior.
