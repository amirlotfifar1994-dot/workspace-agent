# Local AI Runtime v0.9.1

## هدف
v0.9.1 لایه‌ی Local AI نسخه 0.9.0 را از یک Provider صرف به Runtime مدیریت‌شده‌ی اختیاری ارتقا می‌دهد. Agent می‌تواند یک `llama-server` و یک مدل GGUF که کاربر صریحاً از دیسک انتخاب کرده است اجرا/متوقف کند، اما هیچ Runtime یا مدل را خودکار دانلود نمی‌کند.

## مرز امنیتی
- Runtime فقط از فایل معمولی و غیر-link با نام دقیق `llama-server.exe` در Windows اجرا می‌شود.
- مدل فقط فایل معمولی و غیر-link با پسوند `.gguf` است.
- Host همیشه `127.0.0.1` است.
- Web UI با `--no-webui` غیرفعال است.
- هیچ arbitrary argument یا arbitrary environment از UI/AI عبور نمی‌کند.
- `LLAMA_ARG_*` و `LLAMA_API_KEY` از محیط Child Process حذف می‌شوند.
- AI همچنان Tool Executor نیست؛ خروجی Planner باید از Skill Allowlist، Mission DAG و Safety Core عبور کند.

## Capability Probe
Provider این موارد را بدون اعتماد به نام مدل Probe می‌کند:
1. `/v1/models`
2. `/props` در صورت پشتیبانی Runtime
3. constrained JSON schema
4. Vision فقط اگر Runtime آن را advertise کند و Vision در تنظیمات فعال باشد

Vision capability probe از یک PNG مصنوعی 1x1 استفاده می‌کند و هیچ تصویر کاربر را برای Probe نمی‌خواند.

## Hardware Advisor
Hardware profile از Node برای RAM/CPU پایه استفاده می‌کند. در Windows جزئیات CPU/GPU با PowerShell + CIM به شکل read-only خوانده می‌شود. مقدار `Win32_VideoController.AdapterRAM` فقط low-confidence است و برای تضمین fit مدل استفاده نمی‌شود.

Presetهای محافظه‌کارانه:
- RAM کمتر از 8GB: Qwen3.5-0.8B class
- 8GB: Qwen3.5-2B class
- 12GB+: Qwen3.5-4B class
- 24GB+: Qwen3.5-9B class
- 48GB+: Qwen3.6-27B class
- 64GB+ با GPU گسسته: Qwen3.6-35B-A3B class

این‌ها فقط Recommendation هستند، نه تضمین fit یا performance. GGUF/quantization واقعی باید روی همان دستگاه benchmark شود.

## UIA-first / Vision-fallback
`AI UI Assist` ابتدا Windows UI Automation Map را اجرا می‌کند. اگر UIA ساختار کافی ارائه کند، Vision فراخوانی نمی‌شود. فقط اگر UIA ناکافی باشد، کاربر باید یک screenshot/image را دستی انتخاب کند و Vision روی همان فایل اجرا می‌شود. Background screenshot وجود ندارد.

## Runtime lifecycle
Managed Runtime دارای stateهای `stopped / starting / running / stopping / failed` است. Startup فقط وقتی موفق است که Provider health واقعاً Ready شود. Stop ابتدا SIGTERM و سپس در timeout مسیر kill محافظتی دارد. Logها در RAM محدود و مسیرهای model/runtime redacted هستند.

## Upstream rationale
- llama.cpp server: OpenAI-compatible HTTP, multimodal, JSON-schema response format و CPU/GPU runtime.
- Qwen: preset کوچک از خانواده Qwen3.5 و preset بزرگ‌تر از Qwen3.6 انتخاب شده؛ نام مدل در Core hard-code اجرایی نیست و فقط Recommendation است.

## مواردی که هنوز Certification واقعی می‌خواهند
- اجرای `llama-server.exe` واقعی روی Windows 10/11
- GGUF واقعی Text
- GGUF واقعی Vision
- GPU backend واقعی و thermal/performance طولانی
- Packaged NSIS/Portable runtime path
- Code signing/release artifacts
