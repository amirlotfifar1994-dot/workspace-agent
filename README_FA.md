# Workspace Agent v1.0.0-rc1 — Feature-Frozen Release Candidate Source

این نسخه اولین Release Candidate شاخه v1 است. Core از v0.9.8 Feature Freeze شده و هدف این بسته افزودن قابلیت اصلی جدید نیست؛ هدف، بستن قرارداد Release، Migration از v0.9.8، Windows Certification و تولید Artifact قابل‌تکرار است.

## وضعیت این بسته

- Core feature freeze: فعال
- Baseline migration: `0.9.8 → 1.0.0-rc1`
- Data Epoch: `1` (بدون migration مخرب)
- Regression source gate: قابل اجرا در محیط فعلی
- Windows 10/11 Certification: هنوز نیازمند Windows واقعی
- package-lock / npm ci / NSIS / Portable: نیازمند registry-accessible Windows lane
- Authenticode: طبق Stable Policy اجباری؛ نیازمند certificate واقعی در Windows lane

## RC Contract

`package.json > workspaceAgentRelease` قرارداد RC را نگه می‌دارد:

```json
{
  "channel": "rc",
  "featureFreeze": true,
  "baselineVersion": "0.9.8",
  "dataEpoch": 1,
  "releaseCandidate": "rc1",
  "coreFeatureAdditionsAllowed": false
}
```

`npm run check:rc1-source` قبل از Release این قرارداد را با `VersionUpdateGuard.DATA_EPOCH`، App ID، runtime pins و release scripts تطبیق می‌دهد.

## مسیر رسمی RC

روی Windows آنلاین و با Node/npm pin شده:

```powershell
npm run release:lock
npm ci --no-audit --no-fund
npm run check
$env:WA_CERT_ROOT_A='C:\WA-Cert'
$env:WA_CERT_ROOT_B='D:\WA-Cert'
npm run release:win:rc1
```

برای امضا و Evidence دستی، `scripts/windows-release.ps1` از همان gateهای v0.9.7/v0.9.8 استفاده می‌کند.

## اصل Release

این source candidate را نباید به‌عنوان Windows-certified binary معرفی کرد مگر اینکه package-lock واقعی، Windows UAT، scale UAT، packaged smoke و artifact verification همگی PASS شوند.

جزئیات در `docs/RC1_ACCEPTANCE_MODEL_FA.md` و `docs/RELEASE_READINESS_v1.0.0-rc1.json` است.


## cert-kit21 — Handoff Transport Trust Boundary

Core همچنان Feature-Frozen است. cert-kit21 trust boundary انتقال Primary/Peer را می‌بندد: Handoff ZIP پیش از هر trust با extractor محدود و fail-closed باز می‌شود؛ incoming lock قبل از هر mutation روی Source در staging verify و به Release Identity bind می‌شود؛ Handoff v3 referenceهای Pointer را declared/regular/realpath-contained می‌خواهد؛ و ExecutionRoot علاوه بر lexical path با projected realpath نیز از Frozen Source جدا می‌شود.

Windows Safe-Handoff UAT نیز به certification lane اجباری اضافه شده است. Source validation این revision: **108/108 tests PASS** و Syntax **253 فایل PASS**؛ Windows واقعی همچنان P0 نهایی است و Safe-Handoff UAT در non-Windows `SKIP/WINDOWS_REQUIRED` می‌ماند.

جزئیات: `docs/HANDOFF_TRANSPORT_TRUST_BOUNDARY_v1.0.0-rc1-cert-kit21_FA.md` و `docs/GAP_AUDIT_v1.0.0-rc1-cert-kit21_FA.md`.

## cert-kit20 — Non-Downgradable Stable Policy + Strong Manual Evidence

Core همچنان Feature-Frozen است. cert-kit20 دو شکاف داوری باقی‌مانده را می‌بندد: معیارهای Stable دیگر با flag اپراتور قابل ضعیف‌کردن نیستند و از `stableCertificationPolicy` ثابت می‌آیند؛ همچنین Manual Evidence v4 برای هر پنج PASS attachment hash-bound اجباری می‌خواهد و به Primary Certification Report همان execution bind است.

Release Identity اکنون schema v3 و Release Manifest schema v10 است. Signing، dual-Windows، 100k/1M، Manual Evidence و Final Bundle جزو policy fail-closed هستند. Source validation این revision: **105/105 tests PASS** و Syntax **248 فایل PASS**؛ Windows واقعی همچنان P0 نهایی است.

جزئیات: `docs/STABLE_CERTIFICATION_POLICY_v1.0.0-rc1-cert-kit20_FA.md`، `docs/MANUAL_EVIDENCE_STRENGTH_v1.0.0-rc1-cert-kit20_FA.md` و `docs/GAP_AUDIT_v1.0.0-rc1-cert-kit20_FA.md`.

## cert-kit19 — Certification Chain Closure

Core همچنان Feature-Frozen است. cert-kit19 چهار خلأ Source-side باقی‌مانده در Final Certification را می‌بندد: Handoff v2 هر symlink/reparse/special-file/realpath escape را fail-closed می‌کند؛ Stable Promotion leaf evidence را در آخرین لحظه دوباره verify می‌کند؛ Final Certification Bundle به‌صورت self-contained شامل Frozen Source، lockfile، Primary/Peer Handoff و Manual attachments است؛ و dependency source policy فقط registry رسمی npm روی HTTPS را مجاز می‌داند و خود policy به Release Identity bind شده است.

Validation این revision پس از بسته‌شدن tree در `docs/VALIDATION_v1.0.0-rc1-cert-kit19-certification-chain-closure_FA.md` ثبت می‌شود. Windows 10/11 واقعی همچنان P0 نهایی است و در محیط non-Windows PASS ادعا نمی‌شود.

جزئیات: `docs/CERTIFICATION_CHAIN_CLOSURE_v1.0.0-rc1-cert-kit19_FA.md`، `docs/DEPENDENCY_SOURCE_PROVENANCE_v1.0.0-rc1-cert-kit19_FA.md` و `docs/GAP_AUDIT_v1.0.0-rc1-cert-kit19_FA.md`.

## cert-kit18 — Final Evidence Provenance Hardening

Core همچنان Feature-Frozen است. cert-kit18 آخرین زنجیره‌ی Final Certification را در برابر mix-and-match و stale evidence سخت می‌کند: Manual Evidence schema v3 به `executionId`، Source Fingerprint، package-lock، Release Identity، کل Release Manifest و NSIS hash bind است؛ attachmentهای دستی hash/size verify و در Final ZIP self-contained حمل می‌شوند. Finalizer نیز فقط report کافی نمی‌داند و Primary/Peer Handoff + Pointer همان execution را دوباره verify می‌کند. Stable Readiness تمام Verdict inputs را درست قبل از Promotion re-hash می‌کند.

Validation این revision: **98/98 Source tests PASS**، Syntax روی **238 فایل PASS**، JSX/Hygiene/Pins/RC1 Contract PASS. `check:release-inputs` بدون lockfile رسمی عمداً `LOCKFILE_REQUIRED` است و Windows 10/11 evidence همچنان P0 نهایی است.

جزئیات: `docs/FINAL_EVIDENCE_PROVENANCE_v1.0.0-rc1-cert-kit18_FA.md` و `docs/GAP_AUDIT_v1.0.0-rc1-cert-kit18_FA.md`.

## cert-kit17 — Certification Execution Recovery / Resume Hardening

Core همچنان Feature-Frozen است. cert-kit17 Recovery Plan قابل ممیزی برای crash/restart خود Windows Certification اضافه می‌کند. فقط PASS boundaryهای کامل که به version/tooling و `releaseIdentitySha256` فعلی bind هستند reuse می‌شوند؛ خروجی ناقص Primary/Peer archive و فقط همان phase rerun می‌شود. State history hash-chain و latest state هر دو مستقل verify می‌شوند.

Modeهای `Recover` و `Resume` به Execution Kit اضافه شده‌اند و Finalize نیز قبل از شروع ورودی‌های واقعی خود را در `FINALIZE_RUNNING` ثبت می‌کند. جزئیات در `docs/RC1_EXECUTION_RECOVERY_v1.0.0-rc1-cert-kit17_FA.md` و `docs/GAP_AUDIT_v1.0.0-rc1-cert-kit17_FA.md` است.

## cert-kit16 — Windows Execution Hardening

cert-kit16 Windows RC1 Doctor، validation امن `ExecutionId`، isolation مربوط به ExecutionRoot، continuity مربوط به PrepareEvidence، state atomic + chained history و triage صریح `PRIMARY_INCOMPLETE/PEER_INCOMPLETE` را اضافه کرد. Validation آن revision: **93/93 Source tests PASS** و Syntax **231 فایل PASS**؛ Windows evidence همچنان pending بود.

## cert-kit15 — Frozen Source + Release Identity Hardening

cert-kit15 ambiguity بین هویت frozen source و `package-lock.json` رسمی Release را بست. Source Fingerprint v2 lockfile را از identity سورس خارج می‌کند و `releaseIdentitySha256` Source + exact lockfile + runtime pins + version/tooling + x64 lane را bind می‌کند. Primary/Peer/Manifest/Envelope/Promotion باید همین identity را داشته باشند. Validation آن revision: **91/91 Source tests PASS** و Syntax **229 فایل PASS**.

## cert-kit14 — Runtime Provenance + Bounded Journal Retention

Core همچنان Feature-Frozen است. cert-kit14 دو P1 عملیاتی باقی‌مانده را در Source می‌بندد: provenance واقعی Managed `llama-server` و retention محدود/قابل‌verify برای Event Journal. SHA-256 قبل از Spawn محاسبه می‌شود، policy می‌تواند hash pin و روی Windows Authenticode signer thumbprint را اجباری کند، و تغییر executable بعد از inspection fail-closed است. Journal نیز archiveهای نامحدود را با anchor/checkpoint، durable retention intent، restart recovery و disk-pressure bounds جایگزین می‌کند.

قرارداد محصول v1 نیز صریح شد: Automation فقط در foreground GUI اجرا می‌شود و Update به‌صورت manual + verified است؛ background host و automatic updater به post-v1 منتقل شده‌اند. Stable همچنان فقط به‌خاطر Windows 10/11 certification واقعی Block است.

جزئیات: `docs/LOCAL_AI_RUNTIME_PROVENANCE_v1.0.0-rc1-cert-kit14_FA.md`، `docs/JOURNAL_RETENTION_MODEL_v1.0.0-rc1-cert-kit14_FA.md`، `docs/V1_PRODUCT_CONTRACTS_v1.0.0-rc1-cert-kit14_FA.md` و `docs/GAP_AUDIT_v1.0.0-rc1-cert-kit14_FA.md`.

Validation Source این revision: **89/89 test files PASS** در یک اجرای کامل `npm run check`، Syntax روی **226 فایل PASS**، JSX/Hygiene/Pins/RC1 Contract PASS و `toolingRevision=cert-kit14`. Release input gate همچنان عمداً با `LOCKFILE_REQUIRED` متوقف می‌شود؛ Windows Local-AI provenance UAT روی non-Windows `SKIP/WINDOWS_REQUIRED` است و Stable فقط با Evidence واقعی Windows قابل ارتقاست.

## cert-kit13 — NTFS Fidelity + Exact Transactional Restore Hardening

Core همچنان Feature-Frozen است. cert-kit13 دو شکاف مهم باقی‌مانده از cert-kit12 را در Source می‌بندد: **Cross-volume NTFS metadata fidelity** و **State Restore exact/crash-recoverable**.

در Cross-volume Copy/Move، فقط SHA-256 stream اصلی کافی نیست. این revision برای فایل/پوشه معمولی Windows profile شامل ACL/SDDL، Creation/LastWrite/LastAccess time و File Attributes را capture می‌کند، مقصد را بعد از content verification دوباره finalise و verify می‌کند، و تغییر ACL/attribute/stream metadata منبع در میانه عملیات را قبل از حذف Source تشخیص می‌دهد. مواردی که fidelity آن‌ها در v1 تضمین نمی‌شود — ADS، hard-link relationship، sparse/compressed/encrypted/offline/reparse/integrity/no-scrub metadata یا عدم امکان stream enumeration — **fail-closed** هستند؛ یعنی Agent به‌جای silent degradation منبع را حذف نمی‌کند.

State Backup نیز از import افزایشی جدا شده است. Restore اکنون ابتدا همه domainها را validate می‌کند، سپس Automation/Managed Zones/Watch Roots و Local AI settings را با exact replacement برمی‌گرداند، قبل از کار Backup جدید می‌سازد، restore-intent durable دارد، failure وسط کار را rollback می‌کند و در startup restore نیمه‌تمام را به state قبلی برمی‌گرداند. Rootهای متاثر نیز برای جلوگیری از استفاده از Index قدیمی به stale/dirty تبدیل می‌شوند و Full Rescan لازم اعلام می‌شود.

Windows Certification lane یک UAT اجباری جدید برای metadata دارد که روی دو Volume واقعی، نام فارسی/Unicode، timestamp/attribute/ACL observation، directory metadata، ADS fail-closed و hard-link fail-closed را آزمایش می‌کند. این UAT روی non-Windows عمداً SKIP است و جای Evidence واقعی Windows را نمی‌گیرد.

Validation Source این revision: **87/87 test files PASS** در یک اجرای کامل `npm run check`، Syntax روی **222 فایل PASS**، JSX/Hygiene/Pins/RC1 Contract PASS و `toolingRevision=cert-kit13`. `check:release-inputs` همچنان عمداً با `LOCKFILE_REQUIRED` متوقف می‌شود تا package-lock رسمی فقط در Release Runtime pinشده ساخته شود.

جزئیات در `docs/NTFS_METADATA_FIDELITY_v1.0.0-rc1-cert-kit13_FA.md`، `docs/EXACT_TRANSACTIONAL_RESTORE_v1.0.0-rc1-cert-kit13_FA.md` و `docs/GAP_AUDIT_v1.0.0-rc1-cert-kit13_FA.md` آمده است.

## RC1 Windows Certification Kit — cert-kit11

Core همچنان Feature-Frozen است. cert-kit11 اجرای Certification واقعی Windows را به یک **Execution Kit مرحله‌بندی‌شده و قابل انتقال** تبدیل می‌کند تا Report، Evidence Bundle، lockfile، Artifact و Manual Evidence متعلق به Runهای مختلف با هم قاطی نشوند.

جریان اصلی:

```powershell
$env:WA_CERT_ROOT_A='C:\WA-Cert'
$env:WA_CERT_ROOT_B='D:\WA-Cert'
$env:WA_CERT_SCALE_ROOT='C:\WA-Cert'

npm run certify:execution:rc1 -- -Mode Primary -Operator "Your Name"
```

Primary فقط وقتی Handoff می‌سازد که `certification-report.json` خودش PASS باشد. Handoff شامل کل Evidence Primary، NSIS/Portable، Release Manifest، SHA256SUMS، همان package-lock و یک Manual Evidence template از قبل bindشده به SHA256 NSIS است.

روی خانواده دوم Windows:

```powershell
npm run certify:execution:rc1 -- `
  -Mode Peer `
  -HandoffZip .\RC1-...-PRIMARY-HANDOFF.zip `
  -RootA C:\WA-Cert `
  -RootB D:\WA-Cert
```

Peer exact lockfile Primary را import/verify می‌کند، Handoff را با Source Fingerprint فعلی تطبیق می‌دهد و فقط روی Windows family متفاوت ادامه می‌دهد. خروجی `PEER-RETURN.zip` است.

پس از تکمیل Evidence واقعی و upgrade `0.9.8 → 1.0.0-rc1` با همان NSIS Primary:

```powershell
npm run certify:execution:rc1 -- `
  -Mode Finalize `
  -HandoffZip .\RC1-...-PRIMARY-HANDOFF.zip `
  -PeerReturnZip .\RC1-...-PEER-RETURN.zip `
  -ManualEvidenceFile .\MANUAL_EVIDENCE.final.json
```

خروجی نهایی `stable-promotion-decision.json` است و فقط دو وضعیت دارد: `PROMOTE_ALLOWED` یا `BLOCKED`. Execution Kit هیچ Evidence فیزیکی را خودکار PASS نمی‌کند.

جزئیات کامل در `docs/RC1_WINDOWS_CERTIFICATION_KIT_FA.md` و `docs/RC1_WINDOWS_EXECUTION_KIT_v1.0.0-rc1_FA.md` است.

Validation این revision در محیط فعلی: **81/81 Source tests PASS**، Syntax روی **212 فایل PASS**، JSX/Source Hygiene/Dependency Pins/RC1 Contract همگی PASS؛ Windows-native UAT روی Linux به‌درستی SKIP و Release Input Gate تا ساخت lockfile رسمی `LOCKFILE_REQUIRED` است.

## cert-kit10 — Certification Evidence-chain Hardening

cert-kit10 پایه‌ی Evidence Chain این revision است: هر Windows run یک `evidence-bundle.json` با bytes/SHA-256/aggregate hash دارد، Certification Report به Bundle bind است و Final Envelope Bundle هر دو Windows family را دوباره verify می‌کند. cert-kit11 این مدل را حذف نکرده و فقط Execution/Handoff/Finalization را روی آن سخت‌تر کرده است.

## cert-kit9 — Windows-native Edge Hardening

این revision همچنان `1.0.0-rc1` و Feature-Frozen است. تمرکز cert-kit9 روی مرزهایی است که در ویندوز واقعی بیشترین احتمال ابهام یا هزینه عملیاتی دارند، بدون اضافه‌کردن قابلیت محصولی جدید:

- هویت UNC اکنون به ریشه‌ی Share (`\\server\share\`) bind می‌شود، نه به subdirectory؛ در نتیجه پوشه‌های مختلف یک Share به‌اشتباه Volumeهای جدا تلقی نمی‌شوند.
- Batch روی Windows برای تشخیص same/cross-volume ابتدا از Volume probe قوی استفاده می‌کند و فقط در fallback به drive identity می‌رود.
- deep Volume/PowerShell probe برای Batch در شروع هر Chunk اجباری است، ولی برای تک‌تک آیتم‌ها از availability + cached identity استفاده می‌شود تا Jobهای 100k/1M دچار PowerShell storm نشوند.
- نام فایل‌ها برای collision detection روی Windows با Unicode NFC + case-fold مقایسه می‌شوند. نام canonical-equivalent مبهم Block می‌شود؛ case-only rename واقعی همچنان پشتیبانی می‌شود.
- Single Copy و Batch Copy staging را در Parent مقصد می‌سازند تا فایل Stage از ابتدا در security context همان مقصد ایجاد شود؛ commit همچنان atomic rename داخل همان Parent است.
- `RootResilienceService.validateRoot()` اکنون relocation candidate یک Volume جابه‌جاشده/USB را به‌صورت `ROOT_RELOCATED_CANDIDATE` صریح برمی‌گرداند و آن را با `ROOT_UNAVAILABLE` گم نمی‌کند. Auto-rebind همچنان انجام نمی‌شود.
- Windows Certification lane یک UAT جدید برای NTFS، نام فارسی/Unicode/emoji، مسیر بلند، case-only rename و lock واقعی `FileShare.None` دارد. این UAT روی non-Windows عمداً SKIP می‌شود.

این موارد Source-tested هستند؛ ACL inheritance واقعی، removable-drive reconnect/drive-letter change، sharing mode برنامه‌های واقعی و long-path policy هنوز باید در Windows 10/11 Certification اجرا شوند.

Regression این revision در Source برابر `76/76 PASS` و Syntax gate برابر `205 files PASS` است.

## cert-kit8 — External Mutation + Power Transition Fence

این revision همچنان `1.0.0-rc1` و Feature-Frozen است و cert-kit7 را حفظ می‌کند، اما روی دو ریسک واقعی استفاده روزمره سخت‌گیری بیشتری دارد: تغییر فایل توسط برنامه‌هایی مثل Office/Corel/Photoshop هم‌زمان با Agent، و Suspend/Resume ویندوز وسط عملیات Write.

- `ExplorerOperationCoordinator` اکنون barrier و epoch دارد. Suspend یک write barrier سراسری می‌گذارد؛ Resume تا پایان probe اجباری Root/Volume barrier را باز نمی‌کند.
- Leaseای که قبل از Suspend گرفته شده بعد از Resume برای Commit معتبر نیست و با `EXPLORER_OPERATION_FENCE_STALE` Pause می‌شود؛ در نتیجه Job باید با Root/Volume تازه‌اعتبارسنجی‌شده Resume شود.
- Single Copy و Batch Copy قبل از Commit Hash منبع و Stage را تثبیت می‌کنند و پس از Commit مقصد را با همان Hash بررسی می‌کنند.
- اگر برنامه دیگری درست بعد از Commit مقصد Copy را تغییر دهد، cleanup دیگر آن فایل تغییرکرده را کورکورانه حذف نمی‌کند؛ مقصد دست‌نخورده می‌ماند و Rollback ناقص/نیازمند بررسی صریح ثبت می‌شود.
- Parent مقصد و زنجیره symlink/junction درست قبل از mutation/commit دوباره بررسی می‌شود تا swap شدن پوشه مقصد بعد از Preview به Write ناخواسته خارج از Workspace منجر نشود.
- Move/Rename درست قبل از Commit دوباره Snapshot منبع را بررسی می‌کند و اگر مقصد بلافاصله توسط برنامه دیگری تغییر کند، Verify آن را `DESTINATION_MUTATED_AROUND_MOVE` اعلام می‌کند.
- Case-only rename ویندوز (مثلاً `Photo.JPG → photo.jpg`) به‌عنوان NOOP اشتباه رد نمی‌شود و با two-hop staging قابل Recovery انجام می‌شود.
- Batch cross-volume قبل از حذف Source نیز power fence را دوباره بررسی می‌کند تا Resume از Sleep بین Copy و Delete به حذف بدون revalidation منجر نشود.

این‌ها Source-level hardening هستند و اثبات رفتار واقعی sharing modes، ACL inheritance، NTFS reparse points و Sleep/Resume همچنان بخشی از Windows Certification واقعی است.

Regression این revision در Source برابر `75/75 PASS` و Syntax gate برابر `203 files PASS` است.

## cert-kit7 — Concurrency Leasing + Multi-Job Safety

این revision همچنان `1.0.0-rc1` و Feature-Frozen است. تمرکز cert-kit7 روی جلوگیری از برخورد چند چرخه/Job هم‌زمان روی فایل‌ها، Rootها و Volumeهای مشترک است:

- Electron با `requestSingleInstanceLock()` فقط یک Process اصلی فعال نگه می‌دارد؛ در نتیجه دو Instance برنامه نمی‌توانند هم‌زمان روی State و فایل‌ها عملیات بنویسند.
- `CycleEngine` برای هر Cycle یک in-flight guard دارد؛ Double-click/Resume/Confirm هم‌زمان باعث اجرای دوباره همان `next()` نمی‌شود و Rollback هنگام اجرای فعال با `CYCLE_BUSY` متوقف می‌شود.
- `ExplorerOperationCoordinator` Leaseهای read/write روی Pathهای هم‌پوشان می‌گیرد؛ reader/reader مجاز است ولی هر overlap شامل writer با `EXPLORER_OPERATION_BUSY` متوقف می‌شود.
- Batch Copy/Move روی Source/Destination scope Lease می‌گیرند و Cross-volume jobها علاوه بر Path، Volume lease هم دارند؛ contention به‌جای race یا overwrite به Pause امن تبدیل می‌شود و بعداً Resume می‌شود.
- File Explorer Copy/Move/Rename/New Folder نیز قبل از Commit Lease می‌گیرند و هنگام Busy بودن بدون mutation Pause می‌شوند.
- Write cycleهای فایل‌محور دیگر مثل Organize، Duplicate Review، Maintenance Cleanup، Bulk Rename و Recommendation Apply در مرحله Execute یک Lease سطح Workspace می‌گیرند تا با Batch/Explorer job هم‌پوشان برخورد نکنند.
- خطاهای `EBUSY`/`ETXTBSY` به‌عنوان File Lock قابل‌بازیابی شناخته می‌شوند؛ `EPERM` نیز صادقانه به‌صورت permission-or-lock دسته‌بندی می‌شود تا فایل بازشده توسط برنامه دیگر به failure مبهم تبدیل نشود.
- Leaseها عمداً process-local هستند: با Crash خودبه‌خود آزاد می‌شوند و Startup reconciliation موجود، Cycle/Batch نیمه‌تمام را `interrupted`/stale می‌کند؛ بنابراین stale persistent lock باقی نمی‌ماند.
- وضعیت Leaseها در Certification runtime/smoke report قابل مشاهده است.

Regression فعلی Source برای این revision `72/72` PASS و Syntax gate روی `200` فایل PASS است. این hardening جای Windows Certification واقعی را نمی‌گیرد؛ Gateهای Windows 10/11، دو NTFS، Scale 100k/1M، package-lock رسمی، NSIS/Portable و upgrade واقعی همچنان PENDING هستند.

## cert-kit4 — Release Lane Closure + Production Resilience

این revision همچنان `1.0.0-rc1` و Feature-Frozen است؛ hardeningهای cert-kit3 حفظ شده‌اند و cert-kit4 خلأهای Release Lane را می‌بندد. قابلیت اصلی جدیدی به محصول اضافه نشده است:

- زمان انتظار برای Confirm/Pause دیگر از بودجه active runtime چرخه کم نمی‌شود.
- Retention هیچ Cycle فعال یا Transaction قابل Recovery را حذف نمی‌کند.
- Undo برای Rename/Organize/Quarantine/Maintenance در صورت اشغال‌شدن مقصد، نتیجه موفق جعلی یا نام جایگزین نمی‌دهد؛ exact restore یا failure صریح.
- Recovery کپی قبل از حذف مقصد SHA-256 واقعی منبع/مقصد را بررسی می‌کند و mismatch را دست‌نخورده نگه می‌دارد.
- Auto rollbackها فقط وقتی `rolled-back` ثبت می‌شوند که پاک‌سازی واقعاً کامل شده باشد؛ در غیر این صورت `rollback-failed` ثبت می‌شود.
- Advanced Batch بعد از تأیید، checkpointها را در UI به‌صورت خودکار ادامه می‌دهد؛ Pause و Cancel در مرز امن chunk حفظ شده‌اند و دیگر برای هزاران chunk به هزاران کلیک Resume نیاز نیست.
- برچسب نسخه در UI با `v1.0.0-rc1` هماهنگ شده است.

علاوه بر hardening قبلی، Release Lane اکنون دقیقاً یک `Workspace-Agent-Setup-...-x64.exe` و یک `Workspace-Agent-Portable-...-x64.exe` می‌خواهد، برای آن‌ها `SHA256SUMS.txt` و `release-manifest.json` نسخه v9 می‌سازد و Envelope نیز همین قرارداد را دوباره verify می‌کند. Manual Evidence v3 زمان مشاهده و مشخصات upgrade را می‌خواهد و SHA256 installer upgrade باید با NSIS همان Release Manifest یکی باشد.

این‌ها جای Windows Certification واقعی را نمی‌گیرند؛ Gateهای Windows 10/11، NTFS دو Volume، Scale 100k/1M، `npm ci` رسمی و upgrade واقعی همچنان باید روی Release Lane اجرا شوند.


## cert-kit5 — Write-Integrity Hardening

این revision semver را تغییر نمی‌دهد و Feature Freeze را حفظ می‌کند. cert-kit4 Release Lane Closure همچنان مبناست، اما لایه نوشتن فایل و Recovery سخت‌گیرانه‌تر شده است:

- Batch Move قبل از اجرا Snapshot منبع را دوباره بررسی می‌کند و Resumeِ source-missing را بدون Evidence معتبر نمی‌پذیرد.
- Cross-volume Resume به Hash ثبت‌شده و تطابق SHA-256 مقصد نیاز دارد.
- Copy/Move درست قبل از Commit، Destination را دوباره بررسی می‌کنند تا race باعث overwrite نشود.
- Undo هدف Move را با Snapshot پس از Commit تطبیق می‌دهد و Replace Undo قبل از mutation وجود Backup را تأیید می‌کند.
- Watcher runtime error را gap واقعی محسوب می‌کند: Root dirty می‌شود و handle مرده آزاد می‌شود.
- سقف Watch Root، Automation Rule و Managed Zone دیگر باعث حذف بی‌صدای تنظیمات قدیمی نمی‌شود.
- دو تست regression جدید برای write-integrity و watcher/config resilience اضافه شده و تست wall-time قدیمی deterministic شده است.

این تغییرات Source-side هستند؛ Windows 10/11، دو NTFS، Scale 100k/1M، package-lock رسمی، NSIS/Portable و upgrade واقعی همچنان Gateهای اجباری بیرون از این محیط‌اند.

## cert-kit6 — Long-Job Consistency + Index Truthfulness

این revision همچنان `1.0.0-rc1` و Feature-Frozen است. تمرکز cert-kit6 روی فاصله‌های زمانی خطرناک بین Commit فایل، Checkpoint چرخه و به‌روزرسانی Persistent Index است:

- Copy/Replace قبل از rename نهایی حالت پایدار `commit-ready` و SHA-256 commit-intent ثبت می‌کند؛ Crash بعد از rename فقط با Evidence همان Commit Resume می‌شود.
- Rollback هر آیتم را جداگانه `rolled-back` یا `rollback-failed` می‌کند؛ Retry فقط آیتم‌های شکست‌خورده را تکرار می‌کند و Undoهای موفق دوباره اجرا نمی‌شوند.
- Transaction Recovery علاوه بر size/type، Snapshot هویتی منبع شامل `dev/ino/mtime` را نگه می‌دارد تا فایل هم‌اندازه ولی بی‌ربط به‌عنوان نتیجه Move پذیرفته نشود.
- Startup، Batchهای `running` را `interrupted` می‌کند و Rootهای درگیر در Cycle/Transaction ناتمام را در Index/Watcher به‌صورت stale/dirty علامت می‌زند؛ حتی اگر filesystem commit درست قبل از آخرین checkpoint رخ داده باشد.
- Reconcile ناقص پوشه دیگر Success کامل گزارش نمی‌شود. Root `stale` می‌شود و File Explorer Search تا Full Scan به bounded-scan fallback می‌رود.
- Indexed Search و Indexed Duplicate روی Index stale/paused اجرا نمی‌شوند و `INDEX_NOT_FRESH` می‌دهند تا نتیجه ناقص به‌عنوان حقیقت کامل ارائه نشود.
- Undo و Recovery نیز بعد از تغییر filesystem مسیرهای درگیر را دوباره reconcile می‌کنند؛ failure/partial reconcile به Full Rescan gap تبدیل می‌شود.

این hardening جای Windows Certification را نمی‌گیرد؛ `package-lock` رسمی، Windows 10 + 11، دو NTFS، Scale 100k/1M، NSIS/Portable و upgrade واقعی هنوز PENDING هستند.

