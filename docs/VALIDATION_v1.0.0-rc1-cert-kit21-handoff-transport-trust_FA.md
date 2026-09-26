# Validation — v1.0.0-rc1 cert-kit21

این سند نتیجه Source-side validation است و جای Windows Certification واقعی را نمی‌گیرد.

## Source validation

- Source tests: `PASS_108_108_SINGLE_RUN`
- Syntax: `PASS_253_FILES`
- JSX: PASS
- Source Hygiene: PASS
- Dependency Pins: PASS
- Dependency Source Policy: PASS
- Stable Certification Policy: PASS
- RC1 Source Contract: `PASS_CERT_KIT21`
- package-lock release gate: `LOCKFILE_REQUIRED_EXPECTED`

## cert-kit21 hardening

- bounded safe Handoff ZIP extraction contract: PASS source tests
- staged incoming lock verification before Source mutation: PASS dynamic source tests
- Handoff v3 pointer semantic containment: PASS dynamic tamper tests
- Peer Windows-family pointer pairing: PASS
- ExecutionRoot lexical + projected-realpath isolation: PASS dynamic tests
- Stable policy consistency across primary/legacy/artifact paths: PASS
- Final Bundle / Recovery / Evidence chain regression: PASS

## Windows-only evidence

- Safe-Handoff Transport UAT: `SKIP_NON_WINDOWS_WINDOWS_REQUIRED`
- NTFS Metadata UAT: `SKIP_NON_WINDOWS`
- Local-AI Provenance UAT: `SKIP_NON_WINDOWS_WINDOWS_REQUIRED`

بنابراین هیچ Windows PASS در این محیط ادعا نمی‌شود. Windows 10/11 واقعی همچنان شرط Stable Promotion است.
