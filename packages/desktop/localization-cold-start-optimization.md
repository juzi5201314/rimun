# Localization Cold Start Optimization

## Goal

Reduce the real cold-start time of localization analysis measured by:

```bash
bun run --cwd packages/desktop bench:localization:real
```

Target:

- cold localization analysis <= 2000ms

## Baseline

Initial real benchmark on 2026-03-18:

- snapshot scan: about 306ms
- cold localization run: 9947.0ms
- warm localization run: 244.4ms

The large cold/warm gap showed that the main issue was not the steady-state
status computation. The expensive part was cold-process setup work.

## Profiling Summary

After adding finer-grained benchmark counters, the cold path showed three main
cost centers:

1. `languageInventory`
   - repeated filesystem traversal and file metadata collection for
     `Languages/English` and current-language trees
2. watcher installation
   - cold requests were paying for `localization-languages`,
     `localization-defs`, and `localization-roots` watcher setup
3. repeated metadata and cache hydration overhead
   - repeated `About.xml` dependency parsing
   - duplicate cloning of cached descriptor/defs data

## Architectural Changes

### 1. Collapse watcher topology

Previous design:

- root watcher group
- language watcher group
- defs watcher group

New design:

- single recursive mod-root watcher for long-lived host-service requests

Effect:

- removes thousands of per-directory watcher registrations from the critical
  path
- keeps host-service incremental invalidation support through
  `watchChanges: true`
- lets one-shot callers skip watcher work entirely

### 2. Separate analysis from live watching

`analyzeModLocalizations` and `readModLocalizationSnapshot` now accept
`watchChanges?: boolean`.

Default behavior:

- one-shot callers do pure analysis without watcher setup

Host-service behavior:

- explicitly passes `watchChanges: true` so the desktop backend still keeps
  long-lived invalidation behavior

This decouples correctness of a single analysis run from the cost of preparing
live watch infrastructure.

### 3. Fast-path dependency metadata reuse

Localization analysis no longer reparses `About.xml` when
`entry.manifestMetadata.dependencyMetadata` is already present in the snapshot.

Fallback remains:

- if a test or nonstandard caller builds a `ModSourceSnapshotEntry` without
  `manifestMetadata`, analysis falls back to parsing `aboutXmlText`

### 4. Faster file inventory traversal

Filesystem inventory collection was rewritten to:

- use `readdir(..., { recursive: true, withFileTypes: true })`
- avoid collecting directory watch lists that are no longer needed on the pure
  analysis path
- keep stable fingerprint generation for persistent cache reuse
- parallelize `current` and `English` language folder inventory collection

### 5. Reduce cache hydration overhead

Persistent cache hydration now avoids unnecessary second-pass cloning after
`loadCachedDescriptorArtifacts` / `loadCachedDefsBaseline`, because those loaders
already return owned arrays.

### 6. Avoid unnecessary worker preheat

Worker pool preinitialization now runs only when localization workers are
actually enabled.

### 7. Enable worker parsing for large miss paths

The localization miss path now actually uses the existing worker pipeline for:

- large descriptor misses
- large defs misses

The worker chunk size is dynamic:

- small batches keep fine-grained progress updates
- large batches use bigger chunks to reduce message overhead

### 8. Batch persistent cache writes

Descriptor cache and defs cache persistence now use transaction-based batch
upserts instead of per-entry writes.

This was the key change that brought the synthetic cold-miss path under the
2-second target.

### 9. Fast path for flat keyed LanguageData

Common flat `LanguageData` keyed files now use a conservative fast-path parser.

Fallback behavior remains:

- any complex XML shape still falls back to the existing robust parser

## Result

Final real benchmark on 2026-03-18:

- snapshot scan: 399.9ms
- cold localization run: 1210.7ms
- warm localization run: 948.1ms

Cold-start target status:

- achieved for the real localization benchmark

Synthetic perf regression tests:

- `VAL-LOCALIZATION-PERF-002`: `coldMs=1721.7`
- `VAL-LOCALIZATION-PERF-003`: `changedMs=1267.9`

## Notes

- The real benchmark target is now met on the current machine with existing app
  data cache.
- The localization perf tests now also pass after increasing their timeout to
  account for fixture setup cost while keeping the actual performance assertion
  unchanged (`< 2000ms` for the measured analysis phase).
- The benchmark output now includes additional profiling counters such as:
  `descriptorDbHydrateMs`, `languageInventoryMs`, `defsDbHydrateMs`,
  `defsInventoryMs`, `descriptorBuildMs`, and `analyzeMs`.

## Files Changed

- `packages/desktop/src/bun/mod-localization.ts`
- `packages/desktop/src/bun/mods.ts`
- `packages/desktop/src/bun/host-service.ts`
- `packages/desktop/src/bun/watch-group.ts`
- `packages/desktop/src/bun/bench-real-localization.ts`
- `packages/desktop/src/bun/mod-localization.test.ts`
- `packages/desktop/src/bun/mod-localization.perf.test.ts`
