# Windows Certification Execution Kit — cert-kit21

هدف: کاهش خطای عملیاتی هنگام انتقال RC1 بین Windows 10 و Windows 11 و جلوگیری از ترکیب شدن Report، lockfile، Release Identity، Artifact یا Manual Evidence متعلق به Runهای متفاوت.


## Doctor — قبل از Primary/Peer

برای کاهش خطای اپراتور، cert-kit21 یک preflight مستقل دارد:

```powershell
npm run certify:execution:rc1 -- -Mode Doctor
```

Doctor بدون Build/UAT طولانی بررسی می‌کند Runtime pins، Windows family/x64، NTFS و writable بودن Rootها، تفاوت Volumeها، عدم overlap با Source، فضای Scale، provenance مربوط به `llama-server.exe` و readiness مربوط به lockfile/registry درست باشند. Primary و Peer نیز همین Doctor را قبل از Certification به‌صورت خودکار اجرا می‌کنند.

ExecutionId فقط یک path component محدود است و ID دریافت‌شده از Handoff قبل از استفاده در مسیر validate می‌شود. `PrepareEvidence` نیز همان ID متعلق به Primary را ادامه می‌دهد. Execution State با atomic replace نوشته می‌شود و `execution-history.jsonl` مسیر stageها را حفظ می‌کند.

## Recovery / Resume پس از crash یا restart

برای inspect بدون تغییر:

```powershell
npm run certify:execution:rc1 -- -Mode Recover -ExecutionId <ExecutionId>
```

برای اجرای bounded recovery plan:

```powershell
npm run certify:execution:rc1 -- -Mode Resume -ExecutionId <ExecutionId>
```

Recovery فقط PASS boundary کامل و Release-Identity-bound را reuse می‌کند. UAT ناقص archive می‌شود و فقط همان Primary/Peer phase دوباره اجرا می‌شود. state/history نامعتبر باعث `BLOCK_STATE_CHAIN_INVALID` می‌شود. جزئیات در `docs/RC1_EXECUTION_RECOVERY_v1.0.0-rc1-cert-kit17_FA.md` است.

## State machine

`PRIMARY_RUNNING → PRIMARY_READY → PEER_RUNNING → PEER_READY → PROMOTE_ALLOWED`

هر Failure به stage صریح `*_FAILED` یا `PROMOTION_BLOCKED` می‌رود. هیچ stage شکست‌خورده‌ای به‌صورت خودکار PASS نمی‌شود.

## Phase Readiness و `INCOMPLETE` مورد انتظار

`windows-rc1-certify.ps1` قبل از Finalize عمداً می‌تواند exit code 2 بدهد، چون Manual Evidence و/یا خانواده دوم Windows هنوز کامل نشده‌اند. cert-kit21 این وضعیت را کورکورانه failure تلقی نمی‌کند. `rc1-phase-readiness.cjs` فقط وقتی ادامه را مجاز می‌کند که:

- certification report واقعاً `PASS` باشد؛
- Evidence Bundle دوباره hash/aggregate verify شود؛
- Source Fingerprint و Release Identity فعلی منطبق باشند؛
- Primary فقط `DUAL_WINDOWS_EVIDENCE_REQUIRED` و `MANUAL_EVIDENCE_REQUIRED` را به‌عنوان incompleteness قابل انتظار داشته باشد؛
- Peer فقط `MANUAL_EVIDENCE_REQUIRED` را تا Finalize تحمل کند؛
- هیچ hard failure یا incomplete دلیل دیگری وجود نداشته باشد.

Primary پیش از ساخت Handoff، Release Manifest و Artifactها را نیز دوباره verify می‌کند تا mutation بعد از Certification وارد transport نشود.

## بسته Primary

Primary Handoff مالک Artifact نهایی است. در آن Report و Evidence Bundle کامل Primary، release manifest، SHA256SUMS، NSIS، Portable، lockfile دقیق و Manual Evidence prefill نگه‌داری می‌شود.

## بسته Peer

Peer Return فقط Evidence خانواده دوم Windows را حمل می‌کند. Peer artifactها برای PASS شدن UAT محلی ساخته می‌شوند، اما Finalization از Artifact Owner اولیه استفاده می‌کند تا installer hash مربوط به upgrade جابه‌جا نشود.

## Source/lock consistency

روی Peer، package-lock از Handoff وارد می‌شود و `verify-release-inputs` باید PASS شود. سپس Handoff manifest Source Fingerprint و `releaseIdentitySha256` فعلی را بررسی می‌کند. Runtime output directory از Source Fingerprint خارج است و `package-lock.json` نیز به‌صورت مستقل در Release Identity bind می‌شود.

## Finalization

Finalize هر دو Handoff را دوباره verify می‌کند، Manual Evidence را با Primary Release Manifest artifact-bind می‌کند، Final Envelope را می‌سازد و در پایان `stable-promotion-decision.json` تولید می‌کند.

این Kit جای Windows UAT را نمی‌گیرد؛ فقط اجرای آن را deterministic‌تر و قابل ممیزی‌تر می‌کند.


## cert-kit21 transport/final closure

Primary/Peer Handoff v3 علاوه بر fail-closed بودن symlink/reparse/special-file، referenceهای Pointer را نیز declared/regular/realpath-contained می‌خواهد. Finalize بعد از Stable Decision یک Final Bundle self-contained می‌سازد و همان bundle را مستقل verify می‌کند؛ Recovery نیز Final Bundle ثبت‌شده را دوباره verify می‌کند. Registry/lock provenance نیز به policy allowlist و Release Identity bind است.


## cert-kit21 Stable Policy

در RC1 معیارهای Stable از `package.json > workspaceAgentRelease.stableCertificationPolicy` می‌آیند. نبود `-RequireSigning` امضا را غیرفعال نمی‌کند و `-SkipScale` با matrix اجباری 100k/1M رد می‌شود. Manual Evidence فقط از Primary PASS report prefill می‌شود و هر PASS attachment hash-bound لازم دارد.


## cert-kit21 — Handoff transport trust

ZIP ورودی قبل از هر trust با `windows-safe-archive-expand.ps1` در staging استخراج می‌شود. `package-lock.json` ورودی پیش از verify کامل Handoff هرگز داخل Source کپی نمی‌شود؛ ابتدا external-lock validation و Release Identity verification انجام می‌شود و سپس import اتمیک مجاز است. ExecutionRoot نیز با lexical و projected-realpath guard از Frozen Source جدا می‌شود.
