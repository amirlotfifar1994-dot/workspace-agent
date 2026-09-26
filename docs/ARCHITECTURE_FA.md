# معماری Workspace Agent v0.8.0

## لایه‌ها

1. **Electron Main / IPC Boundary** — Renderer بدون Node/File-System access مستقیم.
2. **Cycle Engine v4+Budget** — status، evidence، confirmation receipt، End Verdict، max-iteration، max-wall-time و rollback.
3. **Persistent Index Layer** — SQLite WAL، root generation، scan queue، chunk/resume، indexed search و hash cache.
4. **Legacy Indexer / Read Intelligence** — scanTree، health، legacy search، snapshot delta و drive audit برای backward compatibility.
5. **Semantic Fingerprint Layer** — dHash، SimHash، Office extractor و Fingerprint Cache.
6. **Recommendation Layer** — project detection، destination recommender، content rename suggestions و Confidence/Evidence.
7. **Review Queue Layer** — صف محلی پیشنهادها، Pending/Dismissed/Applied/Reverted، بدون Auto Apply.
8. **Controlled Write Layer** — Recommendation Apply، Organizer، Maintenance Quarantine، Duplicate Quarantine و Renamer.
9. **Safety Layer** — write-root policy، path containment، live preflight، confirmation، staging، verify و rollback.
10. **Managed Zone Layer** — Downloads/Desktop/Documents و Zoneهای سفارشی، Audit و Storage Trend.
11. **Agent Layer** — Persian Goal Planner، Reusable Skill Registry، Mission Skill DAG و parent/child cycles.
12. **Windows Layer** — System Doctor، Startup Review Advisor، Drive-wide read-only audit، UIA Grounding و Pinned UIA Action.
13. **Automation Layer** — Ruleهای Read-only/Agent-local با Condition Watch + File Watcher incremental index reconcile.
14. **Local State** — Cycle، Snapshot، Automation، Fingerprint، Review Queue، Managed Zone، Storage Trend و Persistent SQLite Index.

## Persistent Index lifecycle
Workspace → Generation Start → Persistent Directory Queue → Directory Read → Batched Metadata UPSERT → Queue Checkpoint → Chunk Pause/Resume → Queue Zero → Stale Generation Cleanup → Completed.

اصل کلیدی: **اسکن ناقص حق ندارد index کامل قبلی را پاک کند.** stale rowها تنها بعد از پایان موفق generation حذف می‌شوند.

## Watch-to-index lifecycle
File Watch Event → debounce → containment → اگر root index ندارد: skip → اگر path حذف شده: index delete → اگر file موجود است: UPSERT → اگر directory است: bounded subtree reconcile.

این lifecycle فقط state داخلی Agent را تغییر می‌دهد و به Controlled Write Layer دسترسی ندارد.

## Duplicate lifecycle جدید
SQLite Size Group → Candidate Paths → Hash Cache check → stable SHA-256 → Exact Groups → Report/Review.

Quarantine/Restore همچنان از lifecycle قدیمی Preview/Confirm/Transaction/Verify استفاده می‌کند؛ Indexed Duplicate فقط Discovery را بهینه می‌کند.

## Recommendation lifecycle
Intelligence → Confidence/Evidence → Review Queue → User Selection → Preview → Confirm → Staging → Execute → Verify → End.

## Conditional Automation
Schedule tick → Condition evaluation → اگر False: ثبت `condition-not-met` و پایان → اگر True: اجرای یکی از cycleهای مجاز Read-only/Agent-local.

Actionهای Write مانند Cleanup، Organize، Rename و Recommendation Apply در Automation Store مجاز نیستند.

## Windows UI Action boundary
UIA Grounding → Interactive selector → Unique resolve → Pinned Plan → Confirmation → RuntimeId re-check → Pattern Execute → Action-specific verification.

Action Layer عمومی از coordinate click، SendKeys، Password write و arbitrary shell استفاده نمی‌کند.

## مرزهای v0.8.0
- Persistent Index فعال است، ولی UAT واقعی 1M-file روی NTFS هنوز لازم است.
- substring search هنوز FTS نیست؛ مزیت فعلی primarily low-RAM/persistence است.
- File Watcher مرجع consistency نهایی نیست؛ periodic/resumable full scan لازم می‌ماند.
- PDF Base Intelligence فعال است، اما OCR و semantic PDF vision هنوز فعال نیست.
- Startup Disable/Registry modification فعال نیست.
- Write روی Drive root همچنان Block است.
- CorelDRAW خارج از Scope فعال است و فقط در `docs/deferred/` نگه‌داری می‌شود.
