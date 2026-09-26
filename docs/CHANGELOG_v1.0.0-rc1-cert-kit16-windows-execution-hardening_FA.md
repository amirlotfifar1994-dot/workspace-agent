# Changelog — v1.0.0-rc1 cert-kit16

این revision فقط Execution/Certification hardening است و feature-freeze را نمی‌شکند.

- اضافه شدن `windows-rc1-doctor.ps1` و script `doctor:windows:rc1`.
- Doctor برای Windows family/x64، Runtime pins، NTFS roots، writable probe، source/root isolation، scale free space، Local AI SHA/Signer و release-input readiness.
- اجرای خودکار Doctor قبل از Primary و Peer.
- Validation سخت‌گیرانه `ExecutionId` قبل از هر `Join-Path` برای ID دریافتی از Handoff.
- محدود کردن ExecutionRoot داخل Source به `rc1-execution`؛ مسیر سفارشی باید خارج frozen source باشد.
- اصلاح `PrepareEvidence` تا ExecutionId را از Primary Handoff ادامه دهد و Run جدید جعلی نسازد.
- triage صریح exit code 2 به `PRIMARY_INCOMPLETE` / `PEER_INCOMPLETE`.
- state file با atomic replace و history JSONL؛ هر state به hash state قبلی اشاره می‌کند.
- دو تست Source جدید برای Doctor contract و execution traceability/path safety.
