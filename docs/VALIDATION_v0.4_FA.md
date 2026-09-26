# Validation v0.4.0

## PASS
- Syntax check تمام serviceهای فعال Node/Electron.
- cycle-engine.test.cjs
- file-guardian.test.cjs
- file-cycles.integration.test.cjs
- windows-agent-v03.test.cjs
- mission.integration.test.cjs
- automation-v04.test.cjs

## سناریوهای پاس‌شده
- Duplicate → Quarantine → Verify → Restore
- Organize → Verify → Undo
- Cleanup → Quarantine → Restore
- Snapshot → Workspace mutation → Delta
- Bulk Rename → Verify → Undo
- Persian Mission → read child → write confirmation → complete → mission rollback
- Automation rule → scheduled-compatible read cycle → cycle completed → rule state recorded
- Block کردن write-capable cycle در Automation
- Windows System cycle در runtime غیر-Windows graceful fallback دارد؛ PowerShell/CIM path باید در Windows UAT اجرا شود.

## UI Build
Dependencyهای frontend در محیط validation نصب نبودند، بنابراین `vite build` اینجا اجرا نشد. Windows UAT باید `npm install`, `npm run build`, `npm run build:win` و تست واقعی System Doctor/Notification را پوشش دهد.
