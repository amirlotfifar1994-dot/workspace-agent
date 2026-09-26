# Gap Audit — v1.0.0-rc1 cert-kit18

## بسته‌شده در این revision

### P1 — MANUAL_EVIDENCE_CROSS_RUN_REUSE
بسته شد: Manual Evidence schema v3 اکنون به `executionId`، Source Fingerprint، package-lock SHA-256، Release Identity، SHA کامل Release Manifest و SHA نصب‌کننده NSIS bind است. Evidence یک Run یا Release دیگر در Finalize پذیرفته نمی‌شود.

### P1 — MANUAL_ATTACHMENT_UNVERIFIED_REFERENCE
بسته شد: اگر یک PASS به attachment استناد کند، reference به‌تنهایی کافی نیست. فایل باید داخل Evidence directory باشد و `attachmentSha256` و `attachmentBytes` دقیقاً verify شوند. Final Certification ZIP نیز attachmentهای verify‌شده را self-contained حمل می‌کند.

### P1 — FINALIZER_REPORT_HANDOFF_MIX_AND_MATCH
بسته شد: Finalizer اکنون Primary/Peer Handoff Manifest را اجباری می‌گیرد، integrity/source آن‌ها را دوباره verify می‌کند، role و `executionId` را می‌سنجد و Pointer باید دقیقاً به همان report/release-manifest ورودی اشاره کند.

### P1 — FINAL_PROMOTION_POST_FINALIZE_MUTATION
بسته شد: Stable Readiness دیگر فقط به hash ثبت‌شده در Verdict اعتماد نمی‌کند؛ تمام input metadataهای Verdict قبل از `PROMOTE_ALLOWED` دوباره از bytes واقعی re-hash می‌شوند. تغییر report/manual/handoff پس از Finalize باعث BLOCK می‌شود.

### P1 — FINAL_EVIDENCE_EXECUTION_TRACEABILITY
بسته شد: Final Verdict v3 و Stable Promotion Decision v2 هر دو `executionId` و Primary/Peer Handoff ID را حمل می‌کنند و Final Envelope execution binding را اجباری می‌کند.

### P1 — AUTHENTICODE_MANIFEST_STATUS_TRUST
بسته شد: در حالت `--require-signing`، verifier دیگر فقط `status: Valid` ذخیره‌شده در Release Manifest را قبول نمی‌کند. روی Windows، خود NSIS و Portable دوباره با `Get-AuthenticodeSignature` live re-check می‌شوند و signer thumbprint باید با Manifest تطابق داشته باشد. non-Windows نمی‌تواند این gate را PASS اعلام کند.

## بسته‌شده در revision قبلی و حفظ‌شده

- Expected-INCOMPLETE Primary/Peer handoff deadlock
- Crash Recovery / Resume برای Certification Execution
- Partial evidence invalidation before rerun
- Execution state canonical hash-chain + latest-state rehash
- Finalization input traceability
- Release Identity chain
- Local AI runtime provenance
- Bounded anchored Journal retention
- Cross-volume NTFS metadata fidelity supported-or-fail-closed
- Exact transactional state restore

## باز

### P0 — REAL_WINDOWS_CERTIFICATION
تنها blocker اصلی Stable: اجرای واقعی Windows 10 + Windows 11 با دو Volume NTFS واقعی، Scale 100k/1M، locks، ACL/Junction/Reparse، NTFS metadata fidelity، sleep/resume، USB/removable، disk-full، unclean shutdown/power interruption، packaging، upgrade واقعی `0.9.8 → 1.0.0-rc1` و Final Dual-Windows evidence.

### P2 — COREL_SKILL_PACK
Post-v1 core stabilization.

### P2 — FULL_DR_AND_1M_UI_PROFILE
Disaster-recovery bundle کامل و Electron UI responsiveness profiling در 1M post-certification باقی می‌ماند.

## Stable status

`BLOCKED_PENDING_WINDOWS_CERTIFICATION`
