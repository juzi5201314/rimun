# @rimun/desktop

Desktop host package for Rimun. It runs the Electrobun shell, the Bun host APIs used by the Mod Library, and the local scan/config persistence logic for RimWorld mods.

## Common Commands

From the repository root:

```bash
bun run dev
bun run dev:web
bun run build
bun run test
```

From `packages/desktop`:

```bash
bun run dev
bun run dev:host
bun run build
bun run test
```

## What Lives Here

- `src/bun/` — host services, mod scanning, path handling, persistence, and dev host entrypoints
- `src/mainview/` — desktop shell view assets used by Electrobun
- `scripts/` — helpers for local desktop and CDP-enabled development

## Notes

- Rescan logic is read-only with respect to `ModsConfig.xml`.
- Scan-performance optimizations rely on in-memory caching only; no persistent scan-cache files are introduced.
- `bun run dev:web` is the preferred browser-accessible validation surface when full desktop UI automation is not required.