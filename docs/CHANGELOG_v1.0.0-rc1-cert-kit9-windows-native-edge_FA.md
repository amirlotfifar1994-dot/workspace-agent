# Changelog — v1.0.0-rc1 / cert-kit9 Windows-native Edge Hardening

این revision Feature Freeze را حفظ می‌کند و روی NTFS/UNC/Unicode/Volume edgeهای Windows تمرکز دارد.

## تغییرات اصلی

- UNC volume identity به share root پایدار bind شد.
- Windows batch volume classification ابتدا از `probeVolume()` و Volume UniqueId استفاده می‌کند.
- Batch root validation به دو سطح تقسیم شد: deep identity در ابتدای Chunk و fast availability/cached identity برای آیتم‌های همان Chunk.
- Unicode canonical key برای Windows با NFC + case-fold اضافه شد؛ canonical-equivalent sibling collision قبل از Preview و قبل از Commit Block می‌شود.
- normalization-only rename روی Windows Block می‌شود؛ case-only rename cert-kit8 حفظ شده است.
- Single-file و Batch staging به Parent مقصد منتقل شد تا Stage در context مقصد ساخته شود و rename نهایی داخل همان Parent انجام شود.
- relocation candidate در Root validation با `ROOT_RELOCATED_CANDIDATE` صریح surface می‌شود؛ Auto-Rebind وجود ندارد.
- UAT جدید `windows-native-edge-rc1.uat.cjs` برای NTFS/Unicode/Persian/emoji/long display path/case-only rename/real FileShare.None lock اضافه و به Windows certification script متصل شد.
- `toolingRevision` از `cert-kit8` به `cert-kit9` ارتقا یافت.

## Validation Source-side

- Source tests: `76/76 PASS`
- JS/CJS/MJS syntax: `205 files PASS`
- JSX gate: `PASS`
- Source hygiene: `PASS`
- Dependency pins: `PASS`
- RC1 source contract: `PASS`, toolingRevision=`cert-kit9`
- RC1 cert-kit suite: `PASS`
- Windows-native UAT در محیط فعلی: `SKIP (Windows only)`
- Release input gate: `LOCKFILE_REQUIRED` تا زمان تولید package-lock رسمی روی Release Lane.
