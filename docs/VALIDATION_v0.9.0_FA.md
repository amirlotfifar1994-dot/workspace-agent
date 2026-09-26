# Validation v0.9.0 — Local AI Foundation

تاریخ Validation: 2026-08-13

## Source gates
- Exact dependency pins: PASS
- Source hygiene: PASS
- JavaScript syntax: PASS
- JSX parse/type syntax gate: PASS
- Legacy + current regression: PASS

## Regression count
`npm test` شامل 29 فایل تست است و همگی PASS شدند.

## Local AI tests
### local-ai-foundation-v090
PASS:
- non-loopback endpoint blocked
- non-`/v1` base path blocked
- secret redaction
- interactive-only UIA skill از retrieval حذف می‌شود
- local `/models` health
- explicit Workspace required
- provider response-size ceiling
- schema-constrained Plan parse
- unknown/path/shell input removal
- write skill retains Confirmation
- Mission DAG validation
- plan token Workspace binding
- token one-time consumption
- user-selected Vision advisory transport
- no raw prompt / external network privacy status

### local-ai-guard-v090
PASS:
- single-flight
- consecutive-failure circuit breaker
- circuit reset
- prompt-size ceiling

### ai-mission-v090
PASS:
- `workspace-ai-goal-plan-v1` از مسیر `local-ai-token`
- read Skill قبل از write Skill
- write child cycle روی Confirmation متوقف می‌شود
- approve → deterministic child execution
- mission completion → outcome memory hook

## Existing safety regression
PASS از نسخه‌های قبل:
- Cycle Engine / confirmation / rollback
- File Guardian / Quarantine / Transaction Recovery
- Persistent SQLite Index / Crash Resume
- Watcher backpressure / Worker hashing
- Long path / Unicode / symlink/reparse guards
- Volume identity / removable-drive state model
- suspend/resume safeguards
- Root outage وسط scan
- pre-write و post-confirmation root guard
- lifecycle/unclean shutdown marker
- resource-pressure adaptive budgets
- multi-root isolation
- UIA pinned action safety

## Release boundary
`npm run check:release-inputs` در این محیط عمداً:

`LOCKFILE_REQUIRED`

برگشت داد. package-lock رسمی هنوز باید روی محیط آنلاین Node/npm pin‌شده تولید و commit شود.

`npm run build` در این محیط:

`vite: not found`

برگشت داد چون `node_modules` نصب نیست. این مورد به‌عنوان Build PASS ثبت نشده است.

## UATهای باقی‌مانده
- Windows 10 واقعی
- Windows 11 واقعی
- llama.cpp واقعی روی loopback
- Qwen text model UAT
- Qwen vision model UAT
- packaged app + local AI health
- NSIS / Portable
- Authenticode
- power-loss manual evidence

## نتیجه
Source foundation v0.9.0 برای Local AI از نظر unit/integration/regression آماده است؛ ادعای Certification مدل/باینری Windows تا اجرای UATهای فوق انجام نمی‌شود.

## Real Local Model UAT source
`tests/local-ai-server-v090.uat.cjs` از نظر Syntax PASS شد و در محیط فعلی به‌علت نبودن `WA_LOCAL_AI_BASE_URL` و `WA_LOCAL_AI_MODEL` به‌صورت صریح `SKIP` شد. این تست برای PASS واقعی باید کنار llama.cpp/Qwen اجرا شود.
