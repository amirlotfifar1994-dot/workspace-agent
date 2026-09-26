# RC1 Execution Recovery / Resume — cert-kit17

این revision قابلیت محصولی جدیدی به Core اضافه نمی‌کند. هدف فقط این است که crash/restart یا قطع اجرای Certification باعث تکرار کورکورانه‌ی کل Run یا reuse ناامن Evidence ناقص نشود.

## اصل اصلی

Recovery فقط از **مرز کامل و قابل‌اثبات** ادامه می‌دهد. یک phase فقط زمانی reusable است که result و report هر دو وجود داشته باشند، `overall=PASS` باشند، version/tooling revision درست باشد و `releaseIdentitySha256` با frozen source + lockfile فعلی تطبیق کند.

اگر crash داخل UAT یا Certification phase رخ داده باشد و PASS کامل وجود نداشته باشد، آن phase resume داخلی نمی‌شود. خروجی ناقص به مسیر زیر منتقل می‌شود و فقط همان phase دوباره اجرا می‌شود:

`rc1-execution/<ExecutionId>/recovery-invalidated/<UTC timestamp>/...`

این archive حذف نمی‌شود تا برای audit/debug باقی بماند.


## Phase readiness پیش از reuse

Recovery برای Primary/Peer از همان validator رسمی `rc1-phase-readiness.cjs` استفاده می‌کند؛ در نتیجه یک `INCOMPLETE` کلی فقط زمانی reusable است که incompleteness صرفاً مربوط به evidence نهاییِ هنوز نرسیده باشد. Evidence Bundle با metadata ثبت‌شده در report دوباره verify می‌شود.

## State integrity

قبل از هر Recovery، `execution-history.jsonl` و `execution-state.json` بررسی می‌شوند:

- hash هر state دوباره محاسبه می‌شود؛
- `previousStateSha256` باید زنجیره‌ی بدون شکست بسازد؛
- latest state باید دقیقاً tail همان history باشد؛
- خود latest state نیز مستقل re-hash می‌شود تا تغییر محتوا با hash قدیمی پذیرفته نشود.

در صورت شکست این زنجیره، Action برابر `BLOCK_STATE_CHAIN_INVALID` است و هیچ مسیر ثبت‌شده یا Evidence قبلی مورد اعتماد قرار نمی‌گیرد.

## Recover — فقط تشخیص

```powershell
npm run certify:execution:rc1 -- `
  -Mode Recover `
  -ExecutionId <ExecutionId>
```

این Mode هیچ UAT یا Artifact را تغییر نمی‌دهد و `recovery-plan.json` تولید می‌کند.

Actionهای اصلی:

- `RESUME_PRIMARY_HANDOFF`: Primary PASS کامل است؛ فقط Handoff دوباره ساخته شود.
- `RERUN_PRIMARY_CERTIFICATION`: Primary PASS معتبر وجود ندارد؛ partial archive و Primary فقط از phase Certification تکرار شود.
- `PRIMARY_COMPLETE_AWAIT_PEER`: Primary Handoff کامل است؛ هیچ Primary rerun لازم نیست.
- `RESUME_PEER_RETURN`: Peer PASS کامل است؛ فقط Peer Return دوباره ساخته شود.
- `RERUN_PEER_CERTIFICATION`: Peer ناقص/نامعتبر است؛ فقط Peer phase تکرار شود.
- `PEER_COMPLETE_RETURN_TO_PRIMARY`: Peer Return کامل است؛ فقط به Primary برگردانده شود.
- `RESUME_FINALIZE`: Finalize قطع شده؛ verification/promotion deterministic دوباره اجرا شود.
- `PROMOTION_COMPLETE`: Final decision و delivery کامل‌اند؛ Certification دوباره اجرا نمی‌شود.
- `BLOCK_STATE_CHAIN_INVALID`: state/history قابل اعتماد نیست و Resume ممنوع است.

## Resume — اجرای bounded plan

```powershell
npm run certify:execution:rc1 -- `
  -Mode Resume `
  -ExecutionId <ExecutionId>
```

Resume ابتدا همان Recovery Plan را می‌سازد و سپس فقط Action مجاز را اجرا می‌کند. Partial output فقط برای دو phase شناخته‌شده `primary-certification` و `peer-certification` archive می‌شود؛ path خارج Execution Root یا نام phase ناشناخته fail-closed است.

## Finalize recovery

Finalize قبل از verification یک state `FINALIZE_RUNNING` با سه input واقعی ثبت می‌کند:

- Primary Handoff
- Peer Return
- Manual Evidence

اگر crash بعد از آن رخ دهد، Resume فقط deterministic final verification / envelope / decision را دوباره اجرا می‌کند و Windows Certification سنگین را تکرار نمی‌کند.

## محدودیت آگاهانه

cert-kit17 ادعا نمی‌کند که یک UAT چندمرحله‌ای در وسط عملیات transactionally resumable است. چنین ادامه‌ای می‌تواند Evidence اشتباه بسازد. مرز امن v1 این است:

**phase کامل PASS → reuse**

**phase ناقص/مشکوک → archive + rerun همان phase**

Windows 10/11 Certification واقعی همچنان شرط نهایی Stable است.
