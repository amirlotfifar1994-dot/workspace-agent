# مدل پذیرش Workspace Agent v1.0.0-rc1 — cert-kit21

## قرارداد ثابت RC

- Version: `1.0.0-rc1`
- Baseline: `0.9.8`
- Feature Freeze: فعال
- Node: `24.14.1`
- npm: `11.11.0`
- Release Identity: `workspace-agent-release-identity-v3`
- Release Manifest: `workspace-agent-release-v10`
- Manual Evidence: `workspace-agent-manual-evidence-rc1-v4`
- Stable Policy: fail-closed و bind شده به Release Identity

## Definition of a promotable Stable candidate

Promotion فقط وقتی مجاز است که همه موارد زیر Evidence واقعی و قابل verify داشته باشند:

1. package-lock رسمی و dependency provenance مطابق allowlist؛
2. Source Fingerprint + Release Identity یکسان در Primary/Peer؛
3. Windows 10 و Windows 11 واقعی و متمایز؛
4. دو NTFS volume واقعی؛
5. Scale 100k و 1M بدون امکان Skip؛
6. Windows native edge / ACL / Junction-Reparse / lock / sleep-resume UAT؛
7. NSIS و Portable x64 با SHA-256 و Manifest v10؛
8. Authenticode واقعی `Valid` و live thumbprint re-check روی Windows؛
9. Manual Evidence v4 برای هر پنج سناریوی اجباری با attachment hash-bound؛
10. upgrade واقعی `0.9.8 → 1.0.0-rc1` و state preservation؛
11. Primary/Peer Evidence Bundle و Handoff v3 بدون reparse escape؛
12. Final Verdict/Envelope/Stable Decision همگی execution-bound؛
13. Promotion-time rehash/reverification همه leaf evidence؛
14. Final Certification Bundle کاملاً self-contained و independently verifiable.

هر مورد انجام‌نشده یا غیرقابل verify، `INCOMPLETE/BLOCKED` است؛ هیچ flag اپراتوری اجازه downgrade این policy را ندارد.
