# Validation — v1.0.0-rc1 cert-kit20

این سند نتیجه Source-side validation است و جای Windows Certification واقعی را نمی‌گیرد.

## Source validation

- Source tests: `PASS_105_105_SINGLE_RUN`
- Syntax: `PASS_248_FILES`
- JSX: PASS
- Source Hygiene: PASS
- Dependency Pins: PASS
- Dependency Source Policy: PASS
- Stable Certification Policy: PASS
- RC1 Source Contract: `PASS_CERT_KIT20`
- package-lock release gate در Source package: `LOCKFILE_REQUIRED_EXPECTED`

## Hardening جدید

- non-downgradable signing policy: PASS source tests
- immutable 100k/1M scale policy: PASS source tests
- Release Identity v3 policy binding: PASS source tests
- Manual Evidence v4 Primary-report binding: PASS source tests
- all-five hash-bound attachments required: PASS source tests
- Final Bundle E2E structural verify + tamper rejection: PASS source tests
- Promotion leaf re-verification: PASS source tests

## Windows-only evidence

در محیط validation فعلی Windows واقعی وجود ندارد. بنابراین Windows Native/NTFS/Local-AI provenance/Authenticode/packaging/upgrade/physical evidence به‌عنوان PASS گزارش نمی‌شوند و تا اجرای lane واقعی `PENDING_WINDOWS` باقی می‌مانند.
