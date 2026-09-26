# Gap Audit — v1.0.0-rc1 cert-kit19

## بسته‌شده در این revision

### P1 — HANDOFF_SYMLINK_REPARSE_ESCAPE
بسته شد: Handoff v2 کل transport tree را fail-closed پیمایش می‌کند. symlink/reparse، special file یا realpath escape ممنوع است. Pointer نیز باید regular، declared و lexical+realpath-contained باشد.

### P1 — PROMOTION_LEAF_EVIDENCE_TOCTOU
بسته شد: Stable Readiness قبل از Promotion دوباره Release artifacts/Release Manifest، Authenticode در صورت الزام، Manual attachments و Primary/Peer Evidence Bundle را verify می‌کند؛ صرف re-hash top-level JSON کافی نیست.

### P1 — FINAL_BUNDLE_NOT_INDEPENDENTLY_VERIFIABLE
بسته شد: Final Certification Bundle اکنون Frozen Source، package-lock، Primary/Peer Handoff، Manual Evidence attachments و Final artifacts را با manifest/aggregate مستقل حمل می‌کند و از داخل خودش دوباره verify می‌شود.

### P1 — DEPENDENCY_REGISTRY_PROVENANCE_UNBOUND
بسته شد: dependency source allowlist، lockfile source verification، registry pin در Windows lane و policy hash binding به Release Identity/Manifest اضافه شد.

### P1 — LINK_BACKED_LEAF_EVIDENCE
بسته شد: package-lock، Release Manifest/artifacts، Manual attachment، Evidence Bundle و Handoff entries باید regular non-link باشند؛ link-backed leaf evidence fail-closed است.

## حفظ‌شده از revisionهای قبلی

- Manual Evidence v3 execution/release binding
- Finalizer Primary/Peer Handoff binding
- Promotion-time top-level input rehash
- Live Authenticode re-check
- Expected-INCOMPLETE Primary/Peer phase gate
- Certification Recovery/Resume + state hash-chain
- Release Identity chain
- Local AI runtime provenance
- Bounded anchored Journal retention
- NTFS metadata fidelity supported-or-fail-closed
- Exact transactional state restore

## باز

### P0 — REAL_WINDOWS_CERTIFICATION
Blocker اصلی Stable: اجرای واقعی Windows 10 و Windows 11 با دو Volume واقعی NTFS، Scale 100k/1M، locks، ACL/Junction/Reparse، metadata fidelity، sleep/resume، removable/USB، disk-full، unclean shutdown/power interruption، NSIS/Portable، upgrade واقعی `0.9.8 → 1.0.0-rc1`، Manual Evidence و Final Dual-Windows bundle.

### P2 — COREL_SKILL_PACK
Post-v1 core stabilization.

### P2 — FULL_DR_AND_1M_UI_PROFILE
Full disaster-recovery bundle و profiling کامل responsiveness رابط Electron در scale 1M post-certification باقی می‌ماند.

## Stable status

`BLOCKED_PENDING_WINDOWS_CERTIFICATION`
