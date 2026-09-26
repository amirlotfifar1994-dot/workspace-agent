# Validation Report — v0.7.0

## وضعیت کلی
**Core/Regression: PASS**

## تست‌های قبلی
- cycle-engine.test — PASS
- file-guardian.test — PASS
- file-cycles.integration.test — PASS
- windows-agent-v03.test — PASS
- mission.integration.test — PASS
- automation-v04.test — PASS
- semantic-intelligence-v05.test — PASS
- semantic-cycles-v05.test — PASS
- office-extractor-v05.test — PASS
- windows-agent-v06.test — PASS

## تست جدید Production Hardening
`production-hardening-v07.test.cjs` — PASS

سناریوهای تست‌شده:
1. Crash مصنوعی بعد از انتقال به Destination → Recovery inspect → Rollback → Source restored.
2. Crash مصنوعی در Staging → Recovery inspect → Resume → Destination committed.
3. Bulk Rename با Transaction Store → Verify → Transaction completed.
4. Running Cycle بعد از Restart → Interrupted reconciliation.
5. Event Journal hash-chain integrity → PASS.
6. PDF base text + metadata extraction → PASS.
7. PDF در Text Similarity reader → PASS.
8. File Watch event capture → PASS.
9. Config Export/Import merge → PASS.
10. Ambiguous Source+Destination state → Auto Recovery blocked / Manual Review → PASS.
11. Completed file transaction + interrupted parent cycle → local-state reconciliation path → PASS.
12. Journal tampering → hash-chain verification fails as expected → PASS.

## Scale benchmark
Command:
`npm run test:scale`

نتیجه Runtime این Validation:
- 100,000 رکورد: build 83ms / search 78ms / RSS 132MB
- 500,000 رکورد: build 456ms / search 436ms / RSS 347MB
- 1,000,000 رکورد: build 1072ms / search 960ms / RSS 682MB

این Benchmark synthetic است و جایگزین UAT واقعی روی NTFS با 1M فایل نیست.

## JSX parse
TypeScript 5.8.3 با `--jsx preserve --noEmit` روی:
- `src/App.jsx`
- `src/components/CycleTimeline.jsx`
- `src/main.jsx`

نتیجه: **PASS**.

## Build
`npm run build` در محیط فعلی اجرا شد اما به دلیل نبود dependency نصب‌شده با:
`vite: not found`
متوقف شد.

این مورد شکست Core Test نیست. برای UAT نهایی باید روی Windows:
1. `npm install`
2. `npm run check`
3. `npm run build`
4. `npm run build:win`
5. اجرای NSIS و Portable روی Windows 10 و Windows 11
انجام شود.

## محدودیت‌های باقی‌مانده
- Recursive `fs.watch` باید روی Windows packaged build تحت بار واقعی UAT شود.
- Recovery روی state فایل‌ها تصمیم می‌گیرد؛ در حالت مبهم Auto-Recovery ممنوع است.
- PDF extractor پایه OCR ندارد و font encodingهای پیچیده ممکن است متن ناقص بدهند.
- Index فعلی برای 1M فایل RAM قابل توجه مصرف می‌کند؛ persistent index هنوز ساخته نشده است.
- Code signing و installer reputation هنوز انجام نشده است.
