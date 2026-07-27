---
change_id: label-scan-logging
title: Label scan logging
status: archived
created: 2026-07-26
updated: 2026-07-27
archived_at: 2026-07-27T14:43:23Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

**Plan amendment (Phase 4, not in the original plan text):** added `"types": ["node"]` to the root `tsconfig.json` so `scripts/estimate-smoke.ts`'s new `node:fs`/`node:path` fixture-reading imports type-check. Applied at the root rather than the pre-existing (but dead/unwired) `scripts/tsconfig.json`, since none of the `scripts/run-*.mjs` esbuild bundlers point at that file — scoping it there wouldn't have satisfied Phase 4's own `tsc --noEmit` check. Verified via a full project `tsc --noEmit` pass that this introduces no other type-checking changes. Decided during impl-review (F3) to keep as-is rather than rewire the bundlers for a currently-theoretical benefit.
