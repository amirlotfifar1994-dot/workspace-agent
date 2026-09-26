# Changelog — v1.0.0-rc1 cert-kit17

این revision فقط Certification Execution recovery hardening است و Feature Freeze را نمی‌شکند.

- اضافه شدن `scripts/rc1-execution-recovery.cjs` با Recovery Plan hash-bound.
- اضافه شدن Modeهای `Recover` و `Resume` به Windows RC1 Execution Kit.
- verify کامل `execution-history.jsonl` و re-hash مستقل latest state.
- reuse فقط برای Certification result/report کامل PASS و Release Identity منطبق.
- archive fail-closed خروجی ناقص Primary/Peer به `recovery-invalidated` پیش از rerun.
- جلوگیری از invalidation path خارج Execution Root یا phase ناشناخته.
- Resume بسته‌بندی Primary Handoff بدون تکرار Certification PASS کامل.
- Resume بسته‌بندی Peer Return بدون تکرار Peer Certification PASS کامل.
- ثبت `FINALIZE_RUNNING` با inputهای واقعی برای continuation deterministic پس از restart.
- بازیابی state برای Primary/Peer/Promotion کامل بدون اجرای مجدد UAT.
- دو تست Source جدید برای recovery planner و PowerShell recovery contract.

- رفع P0 در Execution flow: exit code 2 مورد انتظارِ pre-Final دیگر Primary/Peer را deadlock نمی‌کند؛ Phase Readiness فقط دلیل‌های incomplete مجاز را می‌پذیرد.
- verify مجدد Evidence Bundle و Primary Release Manifest/Artifact قبل از reuse یا Handoff.
- canonical state hash با Node هم در write و هم verify، برای حذف اختلاف serializer بین PowerShell و Node.
