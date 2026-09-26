# مدل اجرای Windows UIA Action — v0.7.2

## هدف
این لایه برای کنترل Windows از **Microsoft UI Automation Pattern** استفاده می‌کند، نه کلیک مختصاتی کور. هدف این است که Action تا حد ممکن به هویت یک کنترل واقعی متصل باشد و قبل/بعد از اجرا قابل بررسی باشد.

## Lifecycle

UI Map → Select Control → Build Selector → Resolve Unique Target → Build Pinned Plan → Confirm → Re-resolve → Fingerprint Check → Execute Pattern → Verify → End

## Actionهای فعال
- `focus` → `AutomationElement.SetFocus()`
- `invoke` → `InvokePattern.Invoke()`
- `toggle` → `TogglePattern.Toggle()`
- `expand` / `collapse` → `ExpandCollapsePattern`
- `setValue` → `ValuePattern.SetValue()`

## چیزهایی که عمداً فعال نیستند
- coordinate click / mouse teleport
- global SendKeys / arbitrary keyboard scripting
- arbitrary PowerShell/Shell command از ورودی Agent
- Password/Secret write
- Permanent destructive UI targets مانند Format / Factory Reset / Permanent Delete / Payment
- Action مستقیم از Mission/LLM؛ Skill مربوطه `interactiveOnly` است.

## Selector
Selector می‌تواند شامل موارد زیر باشد:
- ProcessId
- Window Name / Window Class
- AutomationId
- Name
- ClassName
- ControlType
- FrameworkId

Selector ضعیف قبل از Resolve رد می‌شود و Runtime باید **دقیقاً یک** Target پیدا کند؛ صفر یا چند نتیجه Safe Abort هستند.

## Pinning / TOCTOU Guard
در Preview هویت Target شامل RuntimeId و metadata اصلی ذخیره می‌شود. بعد از Confirmation، Target دوباره Resolve می‌شود و قبل از Action با Preview مقایسه می‌شود. اگر Process/AutomationId/Name/Class/ControlType/Framework/Window/RuntimeId تغییر کرده باشد، Action اجرا نمی‌شود.

## Ephemeral Value
برای `setValue` متن واقعی داخل Cycle Store یا Event Journal نوشته نمی‌شود. فقط `SHA-256 + length` در Cycle می‌ماند. Value واقعی در `WindowsActionSessionStore` حافظه‌ای با TTL ده دقیقه نگه‌داری می‌شود. Restart یا انقضای Session باعث Safe Abort و نیاز به Preview جدید می‌شود.

این مکانیزم برای Password نیست؛ `IsPassword=true` مستقل از مقدار ورودی Block می‌شود.

## Verify-after-action
- Focus: FocusedElement با RuntimeId بررسی می‌شود.
- SetValue: مقدار ValuePattern دوباره خوانده و Equality بررسی می‌شود.
- Toggle: ToggleState قبل/بعد مقایسه می‌شود.
- Expand/Collapse: State نهایی بررسی می‌شود.
- Invoke: موفقیت اجرای Pattern تأیید می‌شود، اما اثر معنایی هر برنامه به‌صورت generic قابل اثبات نیست؛ کیفیت پایان `execution-verified` است تا ادعای بیش از حد نشود.

## Recovery Policy
در Target Changed، Ambiguous Target، Disabled/Offscreen، Pattern unavailable یا Verification failure:
- Retry کور انجام نمی‌شود.
- fallback مختصاتی اجرا نمی‌شود.
- Action با evidence و `safeAbort=true` متوقف می‌شود.
- کاربر باید UI Map/Preview جدید بسازد.

## محدودیت فعلی
کد و policy در محیط non-Windows تست شده‌اند، اما Pattern execution واقعی باید روی Windows 10/11 UAT شود. تا انجام UAT، قابلیت `beta` باقی می‌ماند.
