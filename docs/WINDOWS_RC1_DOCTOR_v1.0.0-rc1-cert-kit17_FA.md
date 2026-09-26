# Windows RC1 Doctor — cert-kit17

هدف Doctor این است که خطاهای محیطی قبل از شروع Certification واقعی پیدا شوند، بدون اینکه Build، npm ci، package-lock generation یا UAT مخرب/طولانی اجرا شود.

## چه چیزهایی بررسی می‌شود

- Source contract دقیق RC1 / cert-kit17
- Node `24.14.1` و npm `11.11.0`
- Windows 10 یا Windows 11 client و معماری x64
- وجود و writable بودن RootA/RootB/ScaleRoot
- NTFS بودن Rootها و متفاوت بودن Volume UniqueId برای RootA و RootB
- عدم overlap مسیرهای Certification با frozen Source tree
- حداقل فضای آزاد ScaleRoot برای ماتریس 100k + 1M، مگر `-SkipScale`
- وجود `llama-server.exe`، تطابق SHA-256 pin و در صورت تعریف، Authenticode signer thumbprint
- وجود signing credential در صورت `-RequireSigning`
- اگر package-lock وجود دارد: `verify-release-inputs`
- اگر package-lock هنوز ساخته نشده: قابل دسترس بودن npm registry بدون ساختن lockfile

## اجرا

```powershell
$env:WA_CERT_ROOT_A='C:\WA-Cert'
$env:WA_CERT_ROOT_B='D:\WA-Cert'
$env:WA_CERT_SCALE_ROOT='C:\WA-Cert'
$env:WA_LLAMA_SERVER_PATH='C:\Tools\llama.cpp\llama-server.exe'
$env:WA_LLAMA_SERVER_EXPECTED_SHA256='<64-hex-sha256>'

npm run doctor:windows:rc1
```

یا از Execution Kit:

```powershell
npm run certify:execution:rc1 -- -Mode Doctor
```

خروجی JSON به‌صورت atomic نوشته می‌شود. `PASS` فقط به معنی آماده بودن پیش‌نیازهای قبل از Certification است؛ Doctor جای Windows UAT، Scale، artifact build، manual evidence یا dual-Windows evidence را نمی‌گیرد.

## Safety

Doctor فایل probe موقت را فقط در Rootهای صریح کاربر می‌سازد و حذف می‌کند. هیچ format، disk initialization، shutdown، USB eject، disk-full injection یا ACL destructive scenario اجرا نمی‌کند.


## ارتباط با Recovery

در cert-kit17، Doctor همچنان قبل از Primary/Peer جدید اجرا می‌شود؛ اما اگر Recovery یک PASS boundary کامل را برای صرفاً packaging قابل reuse تشخیص دهد، Resume آن phase سنگین را دوباره اجرا نمی‌کند.
