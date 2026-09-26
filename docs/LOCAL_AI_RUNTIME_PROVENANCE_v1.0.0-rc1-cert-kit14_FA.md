# Local AI Runtime Provenance — v1.0.0-rc1 / cert-kit14

## هدف
Managed Runtime نباید صرفاً به نام `llama-server.exe` اعتماد کند. cert-kit14 قبل از هر Spawn یک fingerprint تازه از executable می‌گیرد و Trust Policy را روی همان فایل enforce می‌کند.

## رفتار Source
- executable باید فایل معمولی و non-symlink باشد و نام آن روی Windows دقیقاً `llama-server.exe` باشد.
- SHA-256 به‌صورت streaming محاسبه می‌شود و metadata فایل قبل/بعد hash مقایسه می‌شود؛ mutation حین hash fail-closed است.
- درست قبل از Spawn، identity فایل دوباره بررسی می‌شود؛ تغییر بین inspection و Spawn با `AI_RUNTIME_EXECUTABLE_CHANGED_AFTER_TRUST` مسدود می‌شود.
- روی Windows، `Get-AuthenticodeSignature` با PowerShell ثابت و بدون shell interpolation اجرا می‌شود و Status، Subject، Issuer و Thumbprint در Runtime Trust قابل مشاهده است.

## Policyها
- `inspect`: فقط evidence را نمایش می‌دهد و اجرا را به hash/signature pin وابسته نمی‌کند.
- `hash-required`: اجرای Runtime فقط در صورت تطابق SHA-256 pin شده مجاز است.
- `hash-and-signer-required`: علاوه بر SHA-256، Windows Authenticode باید `Valid` باشد و Thumbprint دقیقاً با pin کاربر تطبیق کند.

## نکته Certification
Source رفتار fail-closed را تست می‌کند، اما Authenticode واقعی یک `llama-server.exe` واقعی هنوز باید روی Windows 10/11 در Certification evidence ثبت شود. هیچ signer یا hash رسمی از طرف پروژه جعل یا hard-code نشده است.

## Windows UAT اجباری در Certification
`windows-certification-v097.ps1` اکنون gate اجباری `test:windows-local-ai-provenance-rc1-uat` دارد. قبل از Certification باید این متغیرها تنظیم شوند:
- `WA_LLAMA_SERVER_PATH`: مسیر واقعی `llama-server.exe`
- `WA_LLAMA_SERVER_EXPECTED_SHA256`: SHA-256 مورد انتظار همان فایل
- `WA_LLAMA_SERVER_EXPECTED_SIGNER_THUMBPRINT`: اختیاری؛ اگر داده شود signer pin نیز اجباری می‌شود.

UAT علاوه بر positive verification، عمداً یک SHA اشتباه را امتحان می‌کند و باید ثابت کند Spawn policy آن را Block می‌کند.
