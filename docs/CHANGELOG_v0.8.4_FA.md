# Changelog v0.8.4

- اضافه شدن `LifecycleState` با atomic marker، heartbeat و clean/unclean exit detection.
- startup integrity check و dirty-gap بعد از session غیرتمیز.
- اضافه شدن `ResourcePressureGuard` و adaptive scan/hash budgets.
- اضافه شدن Runtime Certification IPC/UI.
- packaged executable smoke mode با userData ایزوله.
- اضافه شدن `windows-certification.ps1` با گزارش JSON/Markdown.
- اضافه شدن multi-root Windows UAT با دو test location اختیاری.
- Release script حالا packaged application startup smoke و multi-root UAT را هم دارد.
- Capability Registry به schema v8.4 ارتقا یافت.
- تست force-kill lifecycle، multi-root resilience، multi-root SQLite و resource-aware cycles اضافه شد.
