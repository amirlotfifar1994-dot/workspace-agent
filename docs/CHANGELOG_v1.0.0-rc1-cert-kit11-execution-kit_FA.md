# Changelog — v1.0.0-rc1 / cert-kit11 Windows Certification Execution Kit

- `toolingRevision` از cert-kit10 به cert-kit11 ارتقا یافت؛ Feature Freeze حفظ شد.
- `windows-rc1-execution.ps1` با Modeهای `Primary`, `Peer`, `PrepareEvidence`, `Finalize`, `Status` اضافه شد.
- Primary/Peer transport دارای manifest فایل‌به‌فایل، SHA-256 و aggregate hash شد.
- package-lock دقیق Artifact Owner در Handoff منتقل و روی Peer قبل از اجرا verify می‌شود.
- Manual Evidence prefill مستقیماً SHA256 NSIS Primary را از Release Manifest وارد می‌کند، بدون اینکه هیچ Evidence را خودکار PASS کند.
- Finalize همیشه Primary را Artifact Owner نگه می‌دارد و Peer فقط Windows family دوم را اثبات می‌کند.
- `stable-promotion-decision.json` با تصمیم صریح `PROMOTE_ALLOWED` یا `BLOCKED` اضافه شد.
- `rc1-execution` و `final-certification` از Source Fingerprint مستثنی شدند تا runtime evidence fingerprint Source را تغییر ندهد.
- Execution State و ZIP delivery برای handoff/final evidence اضافه شد.
- Regressionهای Handoff tamper، prefill binding، execution contract و stable decision اضافه شدند.
