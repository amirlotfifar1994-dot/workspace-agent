# Validation v0.5.0

## PASS — Node/Electron syntax
تمام serviceهای فعال با `node --check` پاس شدند، شامل:
- similarity-core
- image-similarity
- text-similarity
- office-text-extractor
- workspace-intelligence
- fingerprint-store
- workspace-cycles / main / planner / registry

## PASS — Regression tests
- cycle-engine.test.cjs
- file-guardian.test.cjs
- file-cycles.integration.test.cjs
- windows-agent-v03.test.cjs
- mission.integration.test.cjs
- automation-v04.test.cjs

## PASS — v0.5 tests
- semantic-intelligence-v05.test.cjs
  - dHash نزدیک/دور
  - Similar Image cluster
  - SimHash distance
  - Project Candidate
  - Destination suggestion
  - Content Rename suggestion
  - Persian planner intent
- semantic-cycles-v05.test.cjs
  - Similar Image cycle
  - Fingerprint cache miss → hit
  - Similar Text cycle
  - Text cache miss → hit
  - Workspace Intelligence policy gate
- office-extractor-v05.test.cjs
  - ZIP central/local parser
  - DOCX document.xml extraction
  - XML entity/text conversion

## PASS — JSX parse
App.jsx، CycleTimeline.jsx و main.jsx با TypeScript JSX parser بدون parse diagnostic بررسی شدند.

## نیازمند Windows packaged UAT
- Electron `nativeImage` decode واقعی JPEG/PNG/WebP/BMP/GIF.
- PowerShell/CIM System Doctor.
- Windows Notification.
- `npm run build` / `npm run build:win` بعد از نصب dependencyها.
- benchmark روی مجموعه‌های واقعی 100k/500k/1M فایل.

## Build dependency attempt
`npm install --ignore-scripts --no-audit --no-fund` در محیط ساخت پس از 90 ثانیه timeout شد و `node_modules`/lockfile قابل اتکایی تولید نشد؛ بنابراین Vite/Electron bundle در این محیط اجرا نشد. این محدودیت مربوط به دسترسی/سرعت نصب dependencyهای محیط validation است، نه تست هسته Node. پس از timeout، `npm run check` دوباره اجرا شد و تمام تست‌ها PASS ماندند.
