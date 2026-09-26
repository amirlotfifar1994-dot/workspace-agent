# Local AI Model — v0.9.0

## هدف
Local AI در این پروژه **Planner / Interpreter** است، نه executor. مدل هیچ API برای اجرای Shell، کلیک، حذف فایل یا نوشتن مستقیم در Workspace دریافت نمی‌کند.

مسیر اعتماد:

User command → Secret redaction → Skill retrieval → Local model → JSON Schema → Application validation → Ephemeral plan token → Mission DAG → Existing Safety Core

هر Skill نوشتنی همچنان Preview/Confirmation/Transaction/Verify/Undo خودش را دارد.

## Provider
v0.9 فقط OpenAI-compatible endpoint محلی روی loopback را می‌پذیرد:

- `127.0.0.1`
- `localhost`
- `::1`

Remote host، Credential داخل URL و API key storage در این نسخه عمداً مسدود است.

پیش‌فرض:

`http://127.0.0.1:8080/v1`

Provider پیشنهادی: `llama.cpp / llama-server`.

## مدل‌ها
کد به مدل خاصی قفل نیست. در زمان ساخت v0.9 خانواده‌های Qwen3.6 و Qwen3.5 گزینه‌های باز و مناسب برای تست هستند.

- Qwen3.6: نسل جدیدتر؛ مدل‌های باز 27B و 35B-A3B و پشتیبانی text+vision در llama.cpp.
- Qwen3.5: اندازه‌های سبک‌تر از جمله 0.8B/2B/4B/9B؛ برای تست روی سخت‌افزار معمولی گزینه عملی‌تری است.

هیچ weight یا GGUF داخل این سورس bundle نشده است. License/model card هر weight انتخابی باید جدا بررسی شود.

## اجرای نمونه llama.cpp
بسته به نسخه llama.cpp، executable ممکن است `llama-server` یا CLI جدید `llama serve` باشد. نمونه کلاسیک:

```powershell
llama-server -m C:\Models\your-model.gguf --host 127.0.0.1 --port 8080 --ctx-size 16384
```

برای VLM ممکن است فایل/projector یا تنظیم multimodal مخصوص GGUF انتخابی لازم باشد. دستور دقیق را از model card همان GGUF بگیرید.

سپس:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-ai-smoke.ps1
```

و در UI:

1. Local AI → Enable Local AI
2. Base URL = `http://127.0.0.1:8080/v1`
3. Model = همان ID که `/v1/models` برمی‌گرداند
4. Save
5. Health Test

## JSON Schema
Planner از `response_format.type=json_schema` استفاده می‌کند. حتی با Schema، خروجی مدل دوباره در برنامه validate می‌شود.

Model فقط می‌تواند از Skill IDهایی استفاده کند که Retriever همان لحظه در allowlist قرار داده است. Interactive UIA Skill به مدل ارائه نمی‌شود.

Inputهای پرخطر از خروجی مدل حذف می‌شوند، از جمله:

- root/path/source/destination/target
- shell/script/powershell/cmd/executable
- URL
- password/secret/token/api-key

Root واقعی فقط توسط برنامه از Workspace انتخاب‌شده اضافه می‌شود.

## Privacy
- Raw prompt روی Disk ذخیره نمی‌شود.
- Journal فقط hash فرمان، Skill IDها، latency/model و outcome را ثبت می‌کند.
- Skill Memory فقط used/success/failed/lastUsed را نگه می‌دارد.
- Vision فقط روی تصویری است که کاربر با File Picker انتخاب می‌کند.
- Background screen capture وجود ندارد.
- Vision output advisory است و coordinate/click execution تولید نمی‌کند.

## Runtime guards
- Prompt-size budget
- timeout
- single in-flight request
- calls-per-minute
- consecutive-failure circuit breaker
- loopback-only network validation
- redirect disabled
- plan token TTL = 10 minutes
- plan token bound to Workspace root

## چیزهایی که هنوز در v0.9.0 نیست
- auto-download مدل
- start/stop خودکار llama-server
- Cloud AI provider
- API key storage
- background screenshot/VLM loop
- autonomous tool calling
- arbitrary MCP execution
- مدل‌محور کردن File Mutation

## UAT واقعی مدل محلی
بعد از اجرای llama-server:

```powershell
$env:WA_LOCAL_AI_BASE_URL='http://127.0.0.1:8080/v1'
$env:WA_LOCAL_AI_MODEL='MODEL_ID_FROM_/v1/models'
npm run test:local-ai-uat
```

برای Vision اختیاری:

```powershell
$env:WA_LOCAL_AI_VISION_FILE='C:\WA-Test\screen.png'
npm run test:local-ai-uat
```

این UAT Plan واقعی مدل را از همان Validator/allowlist عبور می‌دهد ولی هیچ Plan را خودکار Execute نمی‌کند.
