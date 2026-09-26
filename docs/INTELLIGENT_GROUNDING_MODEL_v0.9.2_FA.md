# مدل Intelligent Grounding در v0.9.2

## هدف
v0.9.2 فاصله بین «دیدن UI» و «اجرای Action» را بدون بازکردن مسیر Computer-use آزاد کم می‌کند. اصل بنیادی این است:

**UIA هویت Target را می‌سازد؛ Vision فقط شواهد تصویری را به همان Targetهای موجود اضافه می‌کند.**

## Pipeline
1. کاربر intent متنی کوتاه می‌دهد.
2. Microsoft UI Automation پنجره فعال و کنترل‌ها را می‌خواند.
3. Candidateها به‌صورت deterministic رتبه‌بندی می‌شوند.
4. اگر کیفیت پایین/مبهم باشد، کاربر می‌تواند Screenshot پنجره فعال را انتخاب کند.
5. Crop فقط حول Candidateهای UIA ساخته می‌شود، اگر mapping پنجره↔تصویر معتبر باشد.
6. VLM فقط از Candidate IDهای allowlisted انتخاب می‌کند.
7. Confidence UIA + Vision fuse می‌شوند.
8. کاربر Candidate و Action را صریحاً انتخاب می‌کند.
9. Backend selector را از Grounding Session می‌گیرد؛ selector از Renderer پذیرفته نمی‌شود.
10. Action Core مسیر Preview → Confirm → re-pin → Pattern → Verify را اجرا می‌کند.
11. در صورت موفقیت و confidence کافی، signature هش‌شده در Grounding Memory تقویت می‌شود.
12. Visual verifier پس از Action اختیاری است و هیچ Action جدیدی ایجاد نمی‌کند.

## Confidence
Confidence نهایی ترکیبی از این مؤلفه‌هاست:
- semantic overlap با Name / AutomationId / Class / ControlType
- structural score: enabled، onscreen، AutomationId، ControlType مناسب intent
- uniqueness کنترل در پنجره
- memory boost فقط از Actionهای قبلی verified
- vision corroboration اختیاری

هیچ threshold به‌تنهایی مجوز Execute نیست. Execute همیشه به انتخاب Candidate و Confirmation کاربر نیاز دارد.

## Vision boundary
VLM در Grounding:
- coordinate دریافت/تولید نمی‌کند؛
- Candidate جدید اختراع نمی‌کند؛
- فقط IDهای UIA موجود را match می‌کند؛
- password/hidden state/action instruction تولید نمی‌کند؛
- فقط تصویر انتخاب‌شده توسط کاربر را می‌بیند.

## Crop policy
Crop نسبت BoundingRectangle کنترل‌های UIA به BoundingRectangle پنجره فعال و ابعاد Screenshot محاسبه می‌شود. اگر mapping معتبر نباشد، crop انجام نمی‌شود و این موضوع در metadata با `applied=false` ثبت می‌شود.

## Action boundary
Grounded Action endpoint فقط این موارد را از Renderer می‌پذیرد:
- Grounding session token
- Candidate ID
- Action انتخاب‌شده توسط کاربر
- Value غیرحساس در صورت `setValue`

Selector از session داخلی ساخته می‌شود. Backend همچنین Action/ControlType compatibility را بررسی می‌کند.

## Memory privacy
فایل `ui-grounding-memory.json` فقط شامل:
- `intentClass`
- candidate signature هش‌شده
- attempts/success
- lastVerifiedAt
- action counters

موارد زیر ذخیره نمی‌شوند:
- raw intent
- raw UI label/name
- screenshot
- crop image
- prompt/response Vision

## Anti-poison rule
Memory فقط بعد از UIA Verify موفق تقویت می‌شود و Grounding باید confidence متوسط به بالا یا Vision corroboration قوی داشته باشد. Reject/Preview/Failed action هیچ learning ایجاد نمی‌کند.

## Verifier
UIA verification همچنان authoritative execution check است. Visual verification فقط می‌تواند نتیجه را `corroborated / needs-review / deterministic-only` دسته‌بندی کند و هرگز Action را دوباره اجرا نمی‌کند.
