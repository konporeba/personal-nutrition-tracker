---
change_id: free-text-meal-logging
title: Free text meal logging
status: archived
created: 2026-07-24
updated: 2026-07-24
archived_at: 2026-07-24T19:59:58Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **Scaffold deletion has a larger orphan graph than the named files (impl-review F5).**
  The plan scoped the scaffold removal to routes and their direct components, but
  removing the last real consumers cascaded: dropping the web tab bar's Docs link
  took `AnimatedIcon` with it, which orphaned `external-link.tsx`,
  `animated-icon.module.css`, and `logo-glow.png`, which in turn made
  `expo-symbols`, `expo-web-browser`, and `expo-device` unused. Trimming all of it
  cut the web bundle from 2.5 MB to 1.5 MB. **For the next starter-derived slice
  (e.g. S-02 adding a tab): trace the import/dependency graph outward from the
  deleted files rather than deleting only the files named in the plan.**
