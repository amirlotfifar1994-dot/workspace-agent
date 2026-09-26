# Changelog v0.5.0

## Added
- Similar Photo Finder: dHash 64-bit، Hamming، BK-tree clustering.
- Near-duplicate Text/Office Finder: SimHash 64-bit.
- Office Open XML text extractor برای DOCX/PPTX/XLSX بدون dependency خارجی.
- Fingerprint Store با Size/mtime invalidation و pruning.
- Project Candidate detection.
- Smart Destination recommendation برای فایل‌های Loose.
- Content-based Rename suggestion برای نام‌های generic.
- Confidence/Evidence policy و `autoApply=false`.
- File Intelligence UI tab.
- Persian Goal Planner intents برای Similar Image/Text و Workspace Intelligence.

## Performance
- Similar image/text fingerprinting با concurrency محدود.
- BK-tree به‌جای pairwise full matrix.
- Cache hit در اجرای دوم fingerprint scan.

## Safety
- هیچ Recommendation هوشمندی مستقیماً Write نمی‌شود.
- Permanent Delete همچنان غیرفعال است.
- Quarantine/Undo/rollback قبلی دست‌نخورده باقی مانده است.
- Office ZIP reader سقف اندازه فایل و entry output دارد.

## Deferred
- Semantic object labeling روی تصاویر.
- PDF text extraction.
- Apply-selected recommendations با Preview/Confirm مستقل.
