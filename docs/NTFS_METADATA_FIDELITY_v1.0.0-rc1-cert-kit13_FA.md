# NTFS Metadata Fidelity — v1.0.0-rc1 / cert-kit13

## هدف
Cross-volume Move روی Windows عملاً Copy → Verify → Delete است. تطابق SHA-256 فقط stream اصلی را ثابت می‌کند و برای حفظ «file object semantics» کافی نیست. cert-kit13 Source را طوری تغییر می‌دهد که حذف Source فقط زمانی مجاز باشد که byte content و metadata پشتیبانی‌شده مقصد هر دو قابل اثبات باشند.

## metadata پشتیبانی‌شده
برای فایل/پوشه معمولی روی Windows، profile زیر capture و verify می‌شود:
- ACL / Security Descriptor به شکل SDDL
- CreationTimeUtc
- LastWriteTimeUtc
- LastAccessTimeUtc
- File/Directory Attributes پشتیبانی‌شده
- نبود named Alternate Data Streams

Destination staging داخل parent مقصد ساخته می‌شود. Content ابتدا hash می‌شود، سپس metadata apply می‌شود. چون hash/read می‌تواند LastAccessTime را تغییر دهد، metadata پس از content verification دوباره روی مقصد finalise و verify می‌شود.

## جلوگیری از state ترکیبی
Metadata Source قبل از copy capture می‌شود. یک mutation fingerprint که LastAccessTime را عمداً نادیده می‌گیرد، ACL/attributes/streams/creation/write metadata را قبل از commit/delete دوباره بررسی می‌کند. بنابراین تغییر هم‌زمان ACL یا attribute توسط برنامه دیگری باعث ادامه‌ی silent نمی‌شود.

برای directoryهای Cross-volume Move، metadata در انتهای copy و یک بار دیگر درست قبل از حذف Source finalise می‌شود؛ timestamp اولیه از Snapshot حفظ می‌شود، ولی ACL/attribute نهایی Source قبل از delete دوباره اثبات می‌شود.

## Fail-closed policy
موارد زیر در v1 به‌جای تبدیل ضمنی یا از دست‌دادن metadata Block می‌شوند:
- Alternate Data Streams (ADS)
- hard-link relationship (`nlink > 1`)
- SparseFile
- ReparsePoint
- Compressed
- Offline
- Encrypted / EFS
- IntegrityStream / NoScrubData
- ناتوانی در enumeration مطمئن streamها

این به معنی «پشتیبانی همه قابلیت‌های NTFS» نیست؛ معنی آن **عدم silent loss** است.

## Undo
Cross-volume Move، metadata evidence اولیه را داخل Undo نگه می‌دارد. Restore فایل از همان Evidence استفاده می‌کند و برای directory نیز metadata profile قبل از حذف Source در Undo ذخیره می‌شود. Undo مجبور نیست metadata را دوباره از مقصد تغییرکرده حدس بزند.

## Windows UAT
`tests/windows-ntfs-metadata-rc1.uat.cjs` در Certification lane اجباری است و فقط روی Windows اجرا می‌شود. Root A/B باید از دو Volume واقعی باشند. UAT file/directory fidelity، فارسی/Unicode، ACL قابل مشاهده، تفاوت عمدی attribute قبل از apply، ADS fail-closed و hard-link fail-closed را ثبت می‌کند.

## مرز ادعا
Source regression رفتار policy و state-machine را اثبات می‌کند. رفتار واقعی ACL/PowerShell/NTFS تنها پس از PASS شدن UAT روی Windows 10 و Windows 11 و دو Volume واقعی قابل Certification است.
