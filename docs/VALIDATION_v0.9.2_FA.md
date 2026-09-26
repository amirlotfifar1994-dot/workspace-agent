# Validation v0.9.2

تاریخ: 2026-08-13

## محیط validation این بسته
- Platform: Linux x86_64
- Node runtime test host: v22.16.0
- npm host: 10.9.2
- Target release runtime همچنان Node 24.14.1 / npm 11.11.0 / Electron 43.2.0 است.

## PASS
- dependency exact pins
- source hygiene
- JS syntax
- JSX parse
- تمام regressionهای v0.2 تا v0.9.1
- semantic UIA candidate ranking
- password/offscreen/disabled filtering
- Vision candidate allowlist filtering
- crop geometry
- Grounding session token/candidate binding
- hashed Grounding Memory privacy
- verified-action learning callback
- Local AI Grounding Vision schema
- post-action outcome fusion
- UIA Action/ControlType compatibility

## Regression
`npm run check` کامل PASS شد.
زنجیره اصلی شامل 35 test file/suite است.


## Grounding scale benchmark
روی dataset مصنوعی 1500 عنصر UIA و 30 اجرای ranking:
- p50: 20.53 ms
- p95: 35.13 ms
- RSS: 101.3 MB
- expected target rank: #1

این benchmark فقط semantic/UIA ranking را اندازه می‌گیرد و latency مدل Vision داخل آن نیست.

## Build / release checks
- `npm run check:release-inputs` -> `LOCKFILE_REQUIRED` (رفتار fail-closed مورد انتظار)
- `npm run build` -> `vite: not found` چون `node_modules` در محیط validation نصب نیست؛ این نتیجه به‌عنوان Build PASS ثبت نشده است.

## Windows-only
`npm run test:windows-grounding-uat` در محیط Linux به‌صورت صحیح:
`SKIP (Windows only)`

بنابراین موارد زیر هنوز باید روی Windows 10/11 واقعی تأیید شوند:
- UIA semantic grounding روی برنامه‌های واقعی
- DPI / multi-monitor crop mapping
- WinForms controlled UAT
- Qwen/llama.cpp Vision corroboration واقعی
- post-action visual verifier واقعی
- packaged Electron path

## Release boundary
نبود `package-lock.json` در این سورس همچنان Release رسمی را Fail-closed نگه می‌دارد تا lockfile واقعی با `npm run release:lock` روی محیط مناسب تولید و review شود.
