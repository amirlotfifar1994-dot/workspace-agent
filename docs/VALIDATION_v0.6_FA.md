# Validation Report — Workspace Agent v0.6.0

## نتیجه
هسته v0.6 و Regression نسخه‌های قبل PASS شد.

### npm run check
PASS:
- cycle-engine.test
- file-guardian.test
- file-cycles.integration.test
- windows-agent-v03.test
- mission.integration.test
- automation-v04.test
- semantic-intelligence-v05.test
- semantic-cycles-v05.test
- office-extractor-v05.test
- windows-agent-v06.test

### تست‌های اختصاصی v0.6
PASS:
- دو Recommendation برای یک Source به یک Move+Rename ترکیب شدند.
- چرخه قبل از Write در waiting-confirmation متوقف شد.
- Recommendation Apply با staging و Verify موفق بود.
- Undo فایل را دقیقاً به Source اولیه برگرداند.
- Review Queue: Pending → Applied → Reverted.
- Managed Zone Audit: old file / partial download / suggestion-only policy.
- Storage Trend sample ثبت شد.
- Built-in و Custom Managed Zone کار کردند.
- Drive Audit با Scope تستی و بدون Write اجرا شد.
- Startup Review Advisor با `autoDisable=false` و duplicate evidence تست شد.
- Conditional Automation: condition-met چرخه را اجرا کرد؛ condition-not-met بدون اجرای چرخه ثبت شد.

### JSX parse
با TypeScript JSX parser:
- `src/App.jsx` — PASS
- `src/components/CycleTimeline.jsx` — PASS
- `src/main.jsx` — PASS

### Scope Audit
در `electron/`، `src/` و `package.json` هیچ reference اجرایی به Corel باقی نمانده است. فایل قدیمی Corel فقط در `docs/deferred/` نگه‌داری می‌شود.

## Build UI/Electron
`npm run build` در محیط Validation اجرا شد اما به دلیل نبود dependency نصب‌شده با `vite: not found` متوقف شد. بنابراین packaged Windows build در این محیط تأیید نشده است. این وضعیت از تست‌های Node/Electron service و JSX parse جداست.

برای UAT واقعی Windows:
```bash
npm install
npm run check
npm run build
npm run build:win
```

پس از Build ویندوز باید Native image decode، PowerShell/CIM، Windows Notification، Known Folders و installer نیز روی Windows 10/11 تست شوند.
