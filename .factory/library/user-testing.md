# User Testing

Validation surface discovery, setup notes, and resource classification.

**What belongs here:** browser validation surface, fixture flow, screenshot requirements, concurrency guidance.

---

## Validation Surface

- Surface: browser-based Web UI
- Tool: `agent-browser`
- Entry: start services from `.factory/services.yaml` (`dev-host` then `web-ui`), then open `http://127.0.0.1:5175/`
- Preferred validation dataset: fixture demo mode for stable mock content and deterministic screenshots
- Required routes: `/` and `/settings`
- Required evidence: screenshots to `/tmp`, plus console error review

- Surface: terminal-based perf guardrail validation
- Tool: shell commands from repo root (use `tuistory` only if interactive terminal capture is needed)
- Entry: no app services required; run the targeted Bun/Vitest commands directly from `/home/soeur/project/rimun`
- Preferred validation scope: targeted tests whose names emit `VAL-PERF-001`, `VAL-PERF-002`, and `VAL-PERF-003`
- Required evidence: command output showing the assertion IDs, operation/work counters, rendered DOM count, and zero test failures

## Validation Concurrency

- Machine profile observed during planning: ~16 GB RAM, 10 CPU cores, low baseline utilization
- Planned max concurrent validators for browser surface: `1`
- Rationale: the mission validates a single local app surface backed by one dev session, and serial validation reduces state interference while preserving ample system headroom
- Planned max concurrent validators for terminal perf guardrail surface: `1`
- Rationale: the tests share one local Bun workspace and write a single flow report, so serialization avoids noisy overlap while keeping runtime predictable

## Flow Validator Guidance: terminal perf guardrails

- Stay inside `/home/soeur/project/rimun`.
- Do not start `dev:web`; these assertions are satisfied by deterministic test output only.
- Use targeted test commands that exercise the committed guardrails and capture their stdout verbatim in the flow report.
- Treat any missing `VAL-PERF-*` line, non-zero exit code, or unexpected test failure as a failed assertion.
- Do not edit application code during validation; only write the assigned flow report/evidence artifacts.
