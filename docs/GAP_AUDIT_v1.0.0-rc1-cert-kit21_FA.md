# Gap Audit — v1.0.0-rc1 cert-kit21

## شکاف‌های بسته‌شده

### P1 — Source mutation قبل از Handoff verification
بسته شد. incoming lock ابتدا در staging verify و به Release Identity bind می‌شود؛ import به Source فقط بعد از PASS کامل و به‌صورت atomic انجام می‌شود.

### P1 — Untrusted ZIP extraction
بسته شد در Source. raw `Expand-Archive` برای Handoff حذف شد و bounded safe extractor traversal/ADS/device-name/case-alias/reparse/archive-bomb classes را fail-closed می‌کند. Windows UAT واقعی هنوز لازم است.

### P1 — Pointer semantic escape
بسته شد. Handoff v3 تمام path referenceهای Pointer را declared/regular/realpath-contained می‌خواهد و Windows-family pairing را verify می‌کند.

### P1 — ExecutionRoot junction/parent overlap
بسته شد. lexical و projected-realpath overlap با Frozen Source fail-closed است؛ فقط `rc1-execution` کنترل‌شده مجاز است.

### P1 — Stable policy inconsistency در مسیرهای فرعی
بسته شد. `windows-rc1-certify.ps1`، direct `windows-certification-v097.ps1` و Execution lane نمی‌توانند artifact/signing/100k+1M requirements را برای RC1 downgrade کنند.

## P0 باقی‌مانده

تنها blocker نهایی، Certification واقعی روی Windows 10 و Windows 11 است: دو NTFS volume واقعی، 100k/1M، reparse/ACL/locks، sleep/resume، USB، disk-full/power-loss، signed NSIS/Portable، upgrade واقعی و evidence نهایی.

## Post-v1
Background host/tray، CorelDRAW skill pack و DR/UI profiling عمیق همچنان خارج Feature Freeze v1 هستند.
