# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** required tools, runtime constraints, fixture mode notes, platform assumptions.
**What does NOT belong here:** service ports or commands (use `.factory/services.yaml`).

---

- Repository root: `/home/soeur/project/rimun`
- Package manager / runtime: Bun
- With Bun 1.3.10 in this repo, workspace package scripts should use `bun run --cwd <path> <script>`; `bun --cwd <path> run <script>` prints usage instead of running the script.
- Development can run inside WSL while product paths target Windows semantics
- Browser validation entrypoint is `bun run dev:web`
- Browser audit should prefer fixture demo mode for reproducible UI validation
- Screenshot artifacts belong in `/tmp`
