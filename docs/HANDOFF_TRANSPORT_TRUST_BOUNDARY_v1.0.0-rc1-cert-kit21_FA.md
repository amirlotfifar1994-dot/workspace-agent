# Handoff Transport Trust Boundary — v1.0.0-rc1 cert-kit21

## هدف

cert-kit21 مرز اعتماد انتقال Primary/Peer Handoff را قبل از هر mutation روی Frozen Source می‌بندد. ZIP، lockfile و Pointer ورودی تا زمانی که validation کامل نشده‌اند untrusted هستند.

## Safe archive extraction

`windows-safe-archive-expand.ps1` جای `Expand-Archive` مستقیم روی ورودی untrusted را می‌گیرد. همه entryها پیش از جایگزینی destination بررسی می‌شوند و extraction ابتدا داخل staging sibling انجام می‌شود.

Fail-closed موارد زیر:
- path traversal، absolute/drive/UNC path و dot segment؛
- NTFS ADS (`:`)، trailing dot/space و Windows reserved device names؛
- duplicate case/Unicode-normalized aliases و file/directory collision؛
- ZIP symlink/reparse attributes؛
- control characters؛
- archive/entry/uncompressed-size خارج bounds؛
- reparse point در tree استخراج‌شده.

Destination موجود فقط پس از extraction و validation کامل جایگزین می‌شود.

## Staged lock verification

ترتیب اعتماد الزامی:

1. safe extract؛
2. verify Handoff بدون Source identity؛
3. verify `package-lock.json` در محل staging با `verify-release-inputs --lockfile`؛
4. verify Handoff با Release Identity محاسبه‌شده از همان staged lock؛
5. فقط پس از PASS کامل، import اتمیک lockfile به Source؛
6. verify مجدد Release Inputs محلی.

بنابراین Handoff خراب نمی‌تواند قبل از reject شدن `package-lock.json` سورس را تغییر دهد.

## Handoff schema v3 و Pointer semantics

Handoff v3 علاوه بر hash فایل Pointer، referenceهای داخل Pointer را نیز semantic verify می‌کند. Reference باید relative، بدون `.`/`..`، regular file واقعی، realpath-contained و عضو entries هش‌شده Handoff باشد.

Primary refs: certification report، evidence bundle، release manifest، SHA256SUMS، manual evidence template و package lock.
Peer refs: certification report، evidence bundle و package lock.

Peer Windows families باید Windows10/Windows11 و متفاوت باشند.

## ExecutionRoot isolation

`path-trust-boundary.cjs` هم lexical overlap و هم projected realpath overlap را بررسی می‌کند. parent-of-source، alias/junction/symlink به Source و مسیر داخل Source رد می‌شوند؛ فقط `source/rc1-execution` استثنای کنترل‌شده است.

## Windows evidence

Source tests این قرارداد را verify می‌کنند. رفتار واقعی ZIP/NTFS روی Windows با `windows-safe-handoff-transport-rc1.uat.cjs` در Certification lane اجباری است و در non-Windows PASS ادعا نمی‌شود.
