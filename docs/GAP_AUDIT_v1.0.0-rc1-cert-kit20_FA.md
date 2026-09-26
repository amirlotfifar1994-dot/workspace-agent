# Gap Audit — v1.0.0-rc1 cert-kit20

## شکاف‌های بسته‌شده در این revision

### P1 — Stable policy قابل downgrade از CLI
بسته شد. Authenticode، Artifact contract، dual-Windows، Manual Evidence، Final Bundle و Scale matrix از policy ثابت Source می‌آیند. CLI نمی‌تواند آن‌ها را ضعیف‌تر کند. Policy داخل Release Identity v3 و Release Manifest v10 bind شده است.

### P1 — Manual/Physical PASS با notes متنی
بسته شد. Manual Evidence v4 برای هر پنج PASS attachment hash-bound اجباری می‌خواهد و به Primary Certification Report همان execution bind است.

### P1 — مسیر artifact release با قرارداد قدیمی
بسته شد. `windows-release.ps1` نیز Release Manifest v10، Stable Policy، signing موثر و Scale matrix policy-bound تولید می‌کند. Stable Promotion همچنان فقط از Final dual-Windows + manual + final-bundle chain مجاز است.

## وضعیت P0

هیچ P0 Source-side شناخته‌شده‌ای که در محیط non-Windows قابل اثبات و بستن باشد باقی نمانده است.

P0 باز:
- اجرای واقعی Windows 10 Primary؛
- اجرای واقعی Windows 11 Peer؛
- دو NTFS volume واقعی و scale 100k/1M؛
- ACL/Junction/Reparse/locks/Sleep/Resume/USB/disk-full/power-loss؛
- ساخت و امضای واقعی NSIS + Portable؛
- upgrade واقعی 0.9.8 → RC1؛
- Final self-contained evidence و Promotion Decision روی Windows.

## موارد post-v1

- Background host/tray/start-with-Windows؛
- CorelDRAW skill pack؛
- DR bundle کامل و Electron 1M UI profiling عمیق.

این موارد blocker نسخه v1 نیستند و Feature Freeze را باز نمی‌کنند.
