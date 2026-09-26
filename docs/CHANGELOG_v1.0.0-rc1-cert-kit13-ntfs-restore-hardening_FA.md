# Changelog — cert-kit12 → cert-kit13

- افزودن `windows-ntfs-metadata.cjs` برای capture/apply/verify metadata ویندوز.
- حفظ ACL/SDDL، timestamps و attributes در Cross-volume file/directory path.
- fail-closed برای ADS، hard-links و metadataهایی که v1 fidelity آن‌ها را تضمین نمی‌کند.
- ذخیره metadata evidence در Batch state و Undo.
- source-metadata mutation detection برای جلوگیری از state ترکیبی در copy/move.
- final metadata apply پس از content hash برای تثبیت LastAccessTime.
- directory metadata re-finalization درست قبل از Source rmdir.
- افزودن Windows-only structured NTFS UAT به Certification lane.
- ارتقای State Backup به schema v2 و exact transactional restore.
- exact replacement برای Automation/Managed Zones/Watcher/Local AI.
- durable restore intent + rollback + startup recovery.
- stale/dirty کردن Rootهای متاثر پس از Restore برای Full Rescan.
- اضافه‌شدن regressionهای NTFS fidelity و transactional restore.
- toolingRevision → `cert-kit13`.
