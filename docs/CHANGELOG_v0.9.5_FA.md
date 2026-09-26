# Changelog v0.9.5

- افزودن `ExplorerBatchStore` مبتنی بر SQLite.
- افزودن `explorer-batch-copy` و `explorer-batch-move`.
- Recursive copy با checkpoint/resume.
- Multi-source selection و Manifest تا 50k item.
- Conflict policies: skip / rename / file replace.
- Duplicate-aware SHA-256.
- Cycle state جدید `paused` و Resume/Cancel کنترل‌شده برای handlerهای opt-in.
- Partial rollback برای batch handler در cancelled/failed/interrupted.
- Crash recovery برای replace در stateهای backed-up/committed.
- Progress و Batch UI.
- Persistent-index direct reconcile بعد از chunk.
- Ignore کردن `.workspace-agent-*` در File Watcher.
- Skill Registry: 34 Skill / 12 Write.
