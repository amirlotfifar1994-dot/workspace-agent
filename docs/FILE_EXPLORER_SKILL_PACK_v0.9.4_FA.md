# File Explorer Skill Pack v0.9.4

## هدف

ساخت اولین Skill Pack برنامه‌محور روی Workspace Agent با تکیه بر File API و Electron Shell، بدون بازکردن مسیر shell command، coordinate click یا AI tool execution آزاد.

## Skill Registry

| Skill | Cycle | Risk | Mission/AI |
|---|---|---:|---|
| File Explorer Properties | `explorer-properties` | read | مجاز |
| File Explorer Search | `explorer-search` | read | مجاز |
| Open Folder in File Explorer | `explorer-navigate` | agent-local | interactive-only |
| Reveal Item in File Explorer | `explorer-select` | agent-local | interactive-only |
| File Explorer New Folder | `explorer-new-folder` | write | interactive-only + confirmation |
| File Explorer Copy File | `explorer-copy` | write | interactive-only + confirmation |
| File Explorer Move | `explorer-move` | write | interactive-only + confirmation |
| File Explorer Rename | `explorer-rename` | write | interactive-only + confirmation |

## Path model

تمام ورودی‌ها Workspace-relative هستند. `cleanRelative()` این موارد را رد می‌کند:
- absolute path
- drive-qualified path
- UNC/extended namespace path
- `..` escape
- NUL

پس از resolve، `assertInsideRoot()` دوباره مرز Workspace را enforce می‌کند.

### Reparse guard

برای Write، زنجیره مسیر با `lstat()` بررسی می‌شود. هر segment موجود که Symbolic Link/Junction باشد با `EXPLORER_REPARSE_PATH_BLOCKED` متوقف می‌شود. این لایه جلوی escape فیزیکی از Workspace را می‌گیرد؛ چیزی که صرفاً lexical path check نمی‌تواند تضمین کند.

## Write plan

`workspace-file-explorer-write-plan-v1` شامل:
- action
- root
- source / destination
- source snapshot
- planHash
- createdAt

قبل از Execute:
1. plan hash دوباره محاسبه می‌شود.
2. Root و Path Policy دوباره اجرا می‌شوند.
3. Source snapshot دوباره بررسی می‌شود.
4. Destination باید همچنان خالی باشد.
5. Reparse chain دوباره بررسی می‌شود.

## Copy

در v0.9.4 فقط regular file:
1. Source snapshot
2. Copy به `.workspace-agent-staging/<cycle>/...part`
3. Source recheck
4. `fsync` stage
5. atomic rename stage → destination
6. SHA-256 source و destination
7. Transaction complete

Recursive directory copy عمداً `EXPLORER_COPY_DIRECTORY_DEFERRED` است تا Recovery ناقص tree-level وارد Core نشود.

## Move / Rename

از filesystem rename استفاده می‌شود. مقصد موجود overwrite نمی‌شود. Move برای فایل و پوشه پشتیبانی می‌شود؛ junction/symlink source Block است. Rename فقط داخل parent فعلی و با Windows filename validation انجام می‌شود.

## New Folder

`mkdir(..., recursive:false)`؛ Parent باید از قبل موجود و داخل Workspace باشد. Undo فقط در صورت خالی‌بودن پوشه انجام می‌شود.

## Recovery Copy

`RecoveryService.classifyOp()` برای `explorer-copy-file` stateهای زیر دارد:
- `copy-source`
- `copy-staged`
- `copy-destination`
- `copy-source-missing`

در هیچ stateای source به destination rename نمی‌شود.

## Undo integrity

- Copy: size + SHA-256 مقصد باید همان artifact ایجادشده باشد.
- Move/Rename: snapshot مقصد باید بدون تغییر باشد و source path آزاد باشد.
- New Folder: فقط empty directory.

## Index consistency

پس از Verify موفق، Cycle یک callback مستقیم به Persistent Index می‌دهد و Source/Destination را reconcile می‌کند. شکست reconcile باعث جعل شکست Write نمی‌شود؛ نتیجه در Evidence ثبت می‌شود و Index/Watcher می‌تواند repair جداگانه انجام دهد.

## UI

تب `File Explorer Skills` مسیرهای نسبی دریافت می‌کند. Write buttonها مستقیماً Execute نمی‌کنند؛ Preview Cycle را از IPC اختصاصی شروع می‌کنند و `CycleTimeline` Confirmation را نمایش می‌دهد.
