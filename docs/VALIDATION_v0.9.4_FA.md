# Validation v0.9.4

## Source-level
- Node syntax: required new services/tests included in `check:syntax`.
- JSX: File Explorer tab checked by existing TypeScript JSX gate.
- Source hygiene: no eval/new Function/unrestricted child_process.exec/private-key artifact.

## Automated File Explorer tests
- Workspace-relative path validation.
- absolute path / `..` escape block.
- Properties via no-follow `lstat`.
- Search fallback.
- Copy file staging + SHA-256 verify + source retained.
- Copy undo only when destination hash is unchanged.
- New Folder + non-empty undo block.
- Move directory + verify + undo.
- Rename + verify + undo.
- directory copy explicitly deferred.
- symlink/junction write traversal block where host supports it.
- Copy transaction recovery with source retained.
- Cycle confirmation gate.
- Navigate/Select shell adapter dispatch.
- Explorer Write skills excluded from AI/Mission retrieval.
- dedicated IPC / generic write entrypoint boundary present.
- verified Write → direct Persistent Index reconcile callback.
- full `npm run check`: 39 chained test files/suites PASS.

## Windows UAT
`npm run test:windows-explorer-uat`

On non-Windows runtime this must report `SKIP (Windows only)` and is not counted as Windows certification evidence.
