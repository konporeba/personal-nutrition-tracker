# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Re-derive "now" per render; own it at the data seam

- **Context**: Day/time-scoped React data hooks — any hook or screen whose query key or user-visible date/label is derived from the current instant (`src/data/use-*.ts` and the screens that consume them).
- **Problem**: S-01 froze `new Date()` in `useMemo(() => new Date(), [])` on the Today screen. Apps are resumed, not relaunched, so a session spanning midnight kept observing the previous day's query key — and since a write invalidates the key derived from its own `logged_at`, a meal logged after midnight invalidated the *new* day while the screen still watched the *old* one, and never appeared at all.
- **Rule**: Never capture the current instant in `useMemo(…, [])` or module scope when it feeds a query key or a user-visible date. Re-derive it per render and let the data hook own it — return the resolved day alongside the query so the key and the label cannot disagree.
- **Applies to**: plan, implement, impl-review
