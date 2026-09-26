# Changelog v0.7.1 — Upstream Architecture Foundation

## Agent / Skill Runtime
- Reusable Skill Registry با allowlist صریح cycleType.
- risk class برای هر Skill: read / agent-local / write.
- Confirmation اجباری برای Skillهای Write.
- Mission Plan به Skill DAG تبدیل می‌شود و dependencyها قبل از اجرای child cycle بررسی می‌شوند.
- child cycleها skillId و risk را در metadata/evidence ثبت می‌کنند.

## Windows Native Grounding
- Windows UI Map جدید با Microsoft UI Automation از طریق PowerShell/.NET built-in.
- خواندن Top-level Windows، Focused Window و control metadata.
- Name / AutomationId / ClassName / ControlType / FrameworkId / ProcessId / Bounding Rectangle.
- Read-only policy: Click / Keyboard / Value Write غیرفعال.

## Runtime Safety
- maxWallTimeMs علاوه بر maxIterations به Cycle Engine اضافه شد.
- Budget در خود Cycle Persist می‌شود.
- Arbitrary/Unregistered Skill در Mission Compiler Block می‌شود.

## UI
- تب Windows UI Map.
- نمایش Reusable Skill Registry در Command Center.
- نسخه UI به v0.7.1 ارتقا یافت.

## Compatibility
- Transaction Store، Crash Recovery، Quarantine، Review Queue، Event Journal و File Watcher v0.7 بدون حذف حفظ شده‌اند.
