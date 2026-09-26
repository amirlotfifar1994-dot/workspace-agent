# Changelog v0.9.4

## Added
- File Explorer Skill Pack با 8 Skill جدید.
- `file-explorer-service.cjs` برای path policy، properties، search و write plan/execution/verify/undo.
- `file-explorer-cycles.cjs` برای Read/UI-local/Write cycleها.
- File Explorer tab در UI.
- IPC اختصاصی `wa:start-explorer-write`.
- Copy Recovery semantics مستقل از Move.
- Windows File Explorer UAT.

## Safety
- چهار Write جدید `interactiveOnly` و Confirmation-required هستند.
- Generic cycle entrypoint برای Explorer Write بسته شد.
- Workspace-relative only + absolute/escape block.
- symlink/junction traversal guard برای Write.
- overwrite خاموش.
- Copy directory recursive deferred.
- Copy SHA-256 verification و hash-protected undo.
- Undo folder only if empty.

## Compatibility
تمام Regressionهای قبلی بدون تغییر رفتار pass می‌شوند.
