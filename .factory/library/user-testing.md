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

## Flow Validator Guidance: browser web UI

- Stay inside `/home/soeur/project/rimun` and the assigned evidence/output paths only.
- Use the dev services from `.factory/services.yaml`: Bun host on `http://127.0.0.1:3071` and Vite on `http://127.0.0.1:5175`.
- Prefer `http://127.0.0.1:5175/?fixture=demo` for deterministic drag/drop, filter, profile-switch, and route-blocker assertions. Switch to the host-backed root URL only if a flow specifically requires live backend behavior that the fixture cannot cover.
- Use a dedicated `agent-browser` session for this validator; do not reuse another validator's browser state.
- Avoid actions that would write back to a real RimWorld installation or config. In particular, do not click save/apply actions unless the assigned assertion explicitly requires it.
- For `VAL-WEB-PERF-001/002/003`, use `window.__rimunPerfCapture.start(label)` before the drag stress interaction and `window.__rimunPerfCapture.stop()` immediately after, then save the returned JSON in the flow report.
- Capture screenshots or recordings for every assertion group and store them under the assigned evidence directory. Treat any uncaught console error, missing drag overlay cleanup, or broken navigation dialog as a failed assertion.
- In this environment, Task-based `user-testing-flow-validator` launches may fail before producing output; if that happens, run the planned browser flow directly in the parent validator and record the launch failure as a friction.
- For fixture-demo validation of Active → Inactive drags, hover the pointer over the left side of the inactive target row to hit the row droppable. Center-hovering over the row can resolve to the active column-end droppable instead.

## Flow Validator Guidance: terminal perf guardrails

- Stay inside `/home/soeur/project/rimun`.
- Do not start `dev:web`; these assertions are satisfied by deterministic test output only.
- Use targeted test commands that exercise the committed guardrails and capture their stdout verbatim in the flow report.
- Treat any missing `VAL-PERF-*` line, non-zero exit code, or unexpected test failure as a failed assertion.
- Do not edit application code during validation; only write the assigned flow report/evidence artifacts.
