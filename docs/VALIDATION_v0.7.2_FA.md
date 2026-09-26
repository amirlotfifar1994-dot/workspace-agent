# Validation v0.7.2

## اجراشده در محیط توسعه
- `npm run check:syntax` — PASS
- `npm run check:jsx` — PASS
- `npm test` — PASS

## Regression Suite
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
- production-hardening-v07.test — PASS
- upstream-foundation-v071.test — PASS
- windows-uia-action-v072.test — PASS

## v0.7.2 assertions
- Action allowlist و selector specificity.
- high-impact target block.
- Password control block.
- `interactiveOnly` Skill از Mission رد می‌شود.
- plan hash و Runtime fingerprint pinning.
- raw `setValue` داخل serialized Cycle ظاهر نمی‌شود.
- Approve مسیر Execute را دقیقاً یک بار اجرا می‌کند.
- Reject هیچ Action اجرا نمی‌کند و Session پاک می‌شود.

## نیازمند Windows UAT
این محیط Windows نبود؛ بنابراین Microsoft UI Automation Pattern execution واقعی هنوز روی Windows 10/11 اجرا نشده است. این مورد blocker برای خروج `windows-uia-action` از beta است.

## Scale benchmark
- 100,000 records: build 317 ms · search 191 ms · RSS 130 MB
- 500,000 records: build 924 ms · search 1016 ms · RSS 346 MB
- 1,000,000 records: build 1821 ms · search 1921 ms · RSS 681 MB

## Build note
`npm run build` در محیط فعلی به دلیل نصب نبودن local `vite/node_modules` اجرا نشد (`vite: not found`). Syntax/JSX/Test validation مستقل از این مورد PASS است. Build نهایی باید پس از `npm install` در Windows release environment اجرا شود.
