# Gap Audit — v1.0.0-rc1 cert-kit17

## بسته‌شده در این revision

### P0 — EXPECTED_INCOMPLETE_HANDOFF_DEADLOCK
بسته شد: Primary و Peer دیگر exit code 2 را کورکورانه blocker فرض نمی‌کنند. `rc1-phase-readiness.cjs` ثابت می‌کند certification report/evidence واقعاً PASS است و فقط incompleteness مورد انتظار Final (`DUAL_WINDOWS_EVIDENCE_REQUIRED` / `MANUAL_EVIDENCE_REQUIRED`) باقی مانده؛ سپس Handoff/Peer Return مجاز می‌شود. هر incompleteness دیگر fail-closed است.

### P1 — CERTIFICATION_EXECUTION_CRASH_RECOVERY
بسته شد: Execution Kit اکنون Recovery Plan مستقل دارد و می‌تواند پس از crash/restart بین PASS boundaryهای کامل ادامه دهد، بدون اینکه کل Primary/Peer کورکورانه تکرار شود.

### P1 — PARTIAL_EVIDENCE_REUSE_RISK
بسته شد: result/report ناقص یا Release Identity نامنطبق reusable نیست. partial phase به `recovery-invalidated` منتقل می‌شود و فقط همان phase rerun می‌شود.

### P1 — EXECUTION_STATE_LATEST_TAMPER
بسته شد: علاوه بر history chain، خود `execution-state.json` دوباره hash می‌شود و باید با tail history تطابق داشته باشد. تغییر محتوا با hash قدیمی fail-closed است.

### P1 — FINALIZATION_RESTART_TRACEABILITY
بسته شد: `FINALIZE_RUNNING` ورودی‌های Primary Handoff، Peer Return و Manual Evidence را قبل از final verification ثبت می‌کند تا Resume از همان inputs ادامه دهد.

## باز

### P0 — REAL_WINDOWS_CERTIFICATION
تنها blocker اصلی Stable باقی‌مانده است: Windows 10 + Windows 11 واقعی، دو Volume NTFS واقعی، Scale 100k/1M، locks، ACL/Junction/Reparse، NTFS metadata fidelity، sleep/resume، USB/removable، disk-full، unclean shutdown/power interruption، packaging، real 0.9.8→RC1 upgrade و evidence chain نهایی.

### P2 — COREL_SKILL_PACK
Post-v1 core stabilization.

### P2 — FULL_DR_AND_1M_UI_PROFILE
Disaster-recovery bundle کامل و Electron UI responsiveness profiling در 1M post-certification باقی می‌ماند.

## Stable status

`BLOCKED_PENDING_WINDOWS_CERTIFICATION`
