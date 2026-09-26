# Certification Chain Closure — v1.0.0-rc1 cert-kit19

cert-kit19 قابلیت محصولی جدیدی به Core اضافه نمی‌کند و Feature Freeze پابرجاست. این revision چهار خلأ زنجیره Certification را می‌بندد که بعد از cert-kit18 در ممیزی adversarial مشخص شدند.

## 1) Handoff path/reparse policy

Primary/Peer Handoff دیگر فقط فایل‌های regular را hash نمی‌کند و entryهای link را نادیده نمی‌گیرد. کل درخت transport با `lstat` و `realpath` پیمایش می‌شود:

- symlink / reparse-like entry: `FORBIDDEN_FAIL_CLOSED`
- special file: `FORBIDDEN_FAIL_CLOSED`
- realpath escape: `FORBIDDEN_FAIL_CLOSED`
- Pointer باید هم lexical و هم realpath داخل همان Handoff باشد و خودش یک regular file ثبت‌شده در manifest باشد.

Handoff Manifest schema به `workspace-agent-rc1-execution-handoff-v2` ارتقا یافته است.

## 2) Promotion-time leaf reverification

Stable Promotion فقط top-level Verdict JSON را re-hash نمی‌کند. درست قبل از `PROMOTE_ALLOWED` دوباره این verifierها اجرا می‌شوند:

- Release Manifest + bytes واقعی NSIS/Portable + SHA256SUMS
- در حالت signing اجباری: live Authenticode + thumbprint match روی Windows
- Manual Evidence v3 + attachment bytes/SHA
- Primary Certification Evidence Bundle
- Peer Certification Evidence Bundle

در نتیجه mutation بعد از Finalize ولی قبل از Promotion fail-closed است.

## 3) Self-contained Final Certification Bundle

خروجی Finalization یک directory/bundle مستقل با schema `workspace-agent-rc1-final-certification-bundle-v1` می‌سازد که شامل موارد زیر است:

- Final Verdict / Final Envelope / Stable Decision
- Primary Handoff کامل
- Peer Handoff کامل
- Manual Evidence + attachmentهای referenced
- Frozen Source کامل مطابق Source Fingerprint
- package-lock رسمی همان Release
- Source Fingerprint manifest
- Release Identity
- `final-bundle-manifest.json` با bytes/SHA-256 همه فایل‌ها، aggregate hash و bundleId

Verifier bundle از داخل همان frozen source دوباره Source Fingerprint، Release Identity، هر دو Handoff، Release Manifest، Manual Evidence و هر دو Evidence Bundle را بررسی می‌کند. Final bundle به pathهای ماشین اولیه برای verification وابسته نیست.

## 4) Dependency source provenance

Policy رسمی RC:

- تنها registry مجاز: `https://registry.npmjs.org`
- resolved protocol مجاز: `https:`
- `git:` / GitHub shorthand: ممنوع
- `file:` / `link:`: ممنوع
- HTTP plaintext: ممنوع
- registry artifact بدون integrity: ممنوع

خود policy hash داخل Release Identity و Release Manifest bind می‌شود. `generate-lockfile.ps1` و Windows release/certification lane نیز registry فعال npm را با همین allowlist تطبیق می‌دهند.

## Execution binding policy

Raw Windows certification report یک PASS boundary وابسته به Frozen Source + package-lock + Release Identity است. Transport و Final promotion علاوه بر آن به `executionId` bind هستند. Recovery فقط در همان Execution state/history اجازه reuse bounded PASS boundary را می‌دهد؛ mix-and-match بین Handoff/Manual/Final متعلق به Execution دیگر مجاز نیست.

## Stable boundary

این revision Windows UAT را شبیه‌سازی یا PASS اعلام نمی‌کند. بعد از بسته‌شدن Source-side chain، blocker اصلی Stable همچنان اجرای واقعی Windows 10/11 و Manual/physical evidence است.
