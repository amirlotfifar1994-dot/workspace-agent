# کیت Certification ویندوز — Workspace Agent v1.0.0-rc1 / cert-kit21

این revision قابلیت محصولی جدیدی به Core اضافه نمی‌کند. Core همچنان Feature-Frozen است. هدف cert-kit21 این است که اجرای Certification واقعی Windows از یک مجموعه دستور پراکنده به یک **Execution Kit مرحله‌بندی‌شده، قابل انتقال بین دو سیستم‌عامل و قابل Finalize** تبدیل شود.

## قرارداد Final PASS

Final PASS فقط وقتی ممکن است که Windows 10 و Windows 11 هر دو با همان Source Fingerprint، همان `package-lock.json` و همان `releaseIdentitySha256` PASS شوند، Scale واقعی 100k و 1M کامل باشد، NSIS و Portable معتبر ساخته شوند، Evidence Bundle هر دو Run سالم باشد، Manual Evidence v3 کامل شود و upgrade واقعی `0.9.8 → 1.0.0-rc1` دقیقاً با NSIS متعلق به Artifact Owner انجام شده باشد.

## مسیر پیشنهادی cert-kit21

### 1) Primary / Artifact Owner

روی Windows اول با دو NTFS واقعی:

```powershell
$env:WA_CERT_ROOT_A='C:\WA-Cert'
$env:WA_CERT_ROOT_B='D:\WA-Cert'
$env:WA_CERT_SCALE_ROOT='C:\WA-Cert'

npm run certify:execution:rc1 -- -Mode Primary -Operator "Your Name"
```

این Mode از `windows-rc1-certify.ps1` استفاده می‌کند، lockfile رسمی را در Release Runtime می‌سازد/verify می‌کند، Scale 100k+1M را اجرا می‌کند، Artifactها را می‌سازد و سپس یک بسته‌ی انتقالی تولید می‌کند:

- `RC1-<ExecutionId>-PRIMARY-HANDOFF.zip`
- SHA256 همان ZIP
- کل Evidence directory مربوط به Primary
- NSIS + Portable + Release Manifest + SHA256SUMS
- همان `package-lock.json`
- `MANUAL_EVIDENCE.prefilled.json`
- `handoff-manifest.json` با hash فایل‌به‌فایل، aggregate hash و Release Identity مشترک

Result کلی Primary می‌تواند در Orchestrator داخلی `INCOMPLETE` باشد چون Peer/Manual Evidence هنوز وجود ندارد؛ اما Execution Kit فقط وقتی Handoff قابل استفاده می‌سازد که **خود `certification-report.json` Primary برابر PASS باشد**.

### Phase Readiness قبل از Handoff

Primary/Peer ممکن است در Orchestrator کلی `INCOMPLETE` باشند چون Final evidence هنوز کامل نیست. cert-kit21 با `rc1-phase-readiness.cjs` بین این incompleteness مورد انتظار و یک blocker واقعی فرق می‌گذارد. Evidence Bundle، Source/Release Identity و دلایل incomplete دوباره verify می‌شوند؛ هر دلیل خارج allowlist یا هر tamper باعث توقف Handoff می‌شود.

### 2) Manual Evidence

فایل `MANUAL_EVIDENCE.prefilled.json` هیچ Evidence را خودکار PASS نمی‌کند. فقط metadata و SHA256 NSIS متعلق به Primary را از `release-manifest.json` وارد می‌کند تا خطای دستی در artifact binding کمتر شود.

سناریوهای فیزیکی/واقعی را روی محیط کنترل‌شده اجرا کنید و فقط بعد از مشاهده واقعی، `status=PASS` همراه `observedAt` و notes/attachment ثبت کنید. Upgrade باید با **همان NSIS موجود در Primary Handoff** انجام شود.

در صورت نیاز به ساخت دوباره Template:

```powershell
npm run certify:execution:rc1 -- `
  -Mode PrepareEvidence `
  -HandoffZip .\RC1-...-PRIMARY-HANDOFF.zip `
  -Operator "Your Name"
```

### 3) Peer Windows Family

همان Source cert-kit21 را روی خانواده دیگر Windows باز کنید و Primary Handoff را منتقل کنید:

```powershell
npm run certify:execution:rc1 -- `
  -Mode Peer `
  -HandoffZip .\RC1-...-PRIMARY-HANDOFF.zip `
  -RootA C:\WA-Cert `
  -RootB D:\WA-Cert
```

Execution Kit قبل از Certification، **package-lock دقیق Primary را import/verify** می‌کند و Handoff را با Source Fingerprint و Release Identity فعلی cross-check می‌کند. اگر Windows Family همان Primary باشد، Peer شروع نمی‌شود.

خروجی:

- `RC1-<ExecutionId>-PEER-RETURN.zip`
- SHA256 ZIP
- کل Peer Evidence directory
- `peer-pointer.json`
- hash manifest مستقل

### 4) Finalize روی Artifact Owner

روی Primary machine یا محیطی که همان frozen source و lockfile را دارد:

```powershell
npm run certify:execution:rc1 -- `
  -Mode Finalize `
  -HandoffZip .\RC1-...-PRIMARY-HANDOFF.zip `
  -PeerReturnZip .\RC1-...-PEER-RETURN.zip `
  -ManualEvidenceFile .\MANUAL_EVIDENCE.final.json
```

Finalization عمداً **Primary Report + Primary Release Manifest** را Artifact Owner قرار می‌دهد تا upgrade evidence به همان NSIS bind بماند. Peer فقط ماتریس Windows دوم را اثبات می‌کند.

اگر تمام Gateها PASS باشند، Finalization ابتدا leaf evidence را دوباره verify می‌کند و سپس خروجی نهایی شامل موارد زیر است:

- `rc1-final-envelope.json`
- `rc1-final-verdict.json`
- `stable-promotion-decision.json`
- `RC1-<ExecutionId>-FINAL-CERTIFICATION.zip` شامل Final Bundle مستقل، Frozen Source، exact package-lock، Primary/Peer Handoff، Manual Evidence/attachments و `final-bundle-manifest.json`

`stable-promotion-decision.json` فقط دو تصمیم دارد:

- `PROMOTE_ALLOWED`
- `BLOCKED`

وجود `PROMOTE_ALLOWED` به معنی این است که Evidence لازم برای promotion همین RC به Stable طبق Contract فعلی کامل است؛ Stable binary باید همچنان از همین frozen source و release process مصوب ساخته شود.

## Recovery پس از قطع اجرا

cert-kit21 برای Runهای قطع‌شده Modeهای `Recover` و `Resume` دارد. اگر Primary یا Peer Certification کامل PASS شده باشد ولی crash در packaging رخ داده باشد، همان PASS boundary با Release Identity فعلی verify و فقط packaging ادامه داده می‌شود. اگر phase ناقص باشد، partial evidence archive و فقط همان phase rerun می‌شود.

## Status

برای دیدن آخرین مرحله:

```powershell
npm run certify:execution:rc1 -- -Mode Status
```

Execution State شامل stage، overall، next step و مسیر artifactهای مرحله است.

## Handoff Integrity

`rc1-execution-handoff.cjs` تمام فایل‌های Primary/Peer transport را با bytes + SHA-256 ثبت می‌کند و aggregate hash می‌سازد. Verification علاوه بر محتویات Handoff، version، tooling revision، current Source Fingerprint، exact package-lock و Release Identity را بررسی می‌کند. پوشه‌های runtime مثل `rc1-execution` و `final-certification` از Source Fingerprint حذف شده‌اند تا خود Evidence باعث تغییر fingerprint Source نشود.

## Manual Evidence v3

برای هر PASS، `observedAt` معتبر و notes یا attachment لازم است. Upgrade واقعی علاوه بر آن نیاز دارد:

- `fromVersion = 0.9.8`
- `toVersion = 1.0.0-rc1`
- `installerSha256` مطابق Primary NSIS
- Self-Check قبل و بعد = `pass`
- `statePreserved = true`

## اصل غیرمخرب Harness

Execution Kit خودش disk format، disk initialization، USB eject اجباری، پرکردن عمدی کامل دیسک، shutdown/restart ناگهانی یا تغییر ACL سیستم را انجام نمی‌دهد. سناریوهای فیزیکی فقط توسط اپراتور در محیط تست انجام و Evidence آن ثبت می‌شود.

## cert-kit21 — Local AI Runtime provenance input
پیش از اجرای Certification روی هر Windows، `WA_LLAMA_SERVER_PATH` و `WA_LLAMA_SERVER_EXPECTED_SHA256` باید به یک `llama-server.exe` واقعی اشاره کنند. اگر signer pin نیز در Release Policy لازم است، `WA_LLAMA_SERVER_EXPECTED_SIGNER_THUMBPRINT` را هم تنظیم کنید. نبود این ورودی‌ها Gate `test:windows-local-ai-provenance-rc1-uat` را `INCOMPLETE` می‌کند و Stable promotion مجاز نیست.


## cert-kit21 — Handoff/Dependency/Final Bundle closure

Handoff v2 link/reparse/special-file را fail-closed می‌کند. Dependency Source Policy فقط `https://registry.npmjs.org` را می‌پذیرد و policy hash بخشی از Release Identity است. Stable Promotion پیش از اجازه نهایی Release Manifest/artifacts، Manual attachments و هر دو Evidence Bundle را live reverify می‌کند. Final ZIP از Final Bundle self-contained ساخته می‌شود.


## cert-kit21 — Safe transport gate

هر Handoff قبل از import با safe archive extractor و Handoff v3 verify می‌شود. `test:windows-safe-handoff-transport-rc1-uat` در Windows lane اجباری است؛ traversal/ADS/case-alias/resource-boundary classes باید fail-closed باشند. Lockfile تا قبل از PASS کامل staging verification Source را mutate نمی‌کند.
