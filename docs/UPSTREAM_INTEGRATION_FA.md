# Upstream Integration — v0.7.1

## هدف
این نسخه نتیجه بررسی معماری Agentهای متن‌باز Windows/Computer-Use است. هیچ repository خارجی به‌صورت کامل داخل پروژه Vendor نشده است. الگوهای مفید با معماری و Safety موجود Workspace Agent بازطراحی شده‌اند.

## الگوهای اقتباس‌شده
### Microsoft UFO / UFO² — معماری مرجع
- Native-first Windows grounding به‌جای تکیه کامل به Screenshot.
- Observe / Decide / Act / Memory و recovery-oriented execution به‌عنوان مرجع طراحی.
- در v0.7.1 فقط بخش **Grounding خواندنی UI Automation** فعال شده است.
- هیچ Action عمومی Click/Keyboard یا Shell آزاد اضافه نشده است.

### Microsoft CUA Skill — معماری مرجع
- Reusable Skill Registry.
- Skill-level risk/confirmation metadata.
- Mission plan به شکل DAG دارای dependency.
- Execution budget برای جلوگیری از loop بی‌پایان.
- خروجی Planner هرگز با eval یا shell عمومی اجرا نمی‌شود.

### WindowsAgentArena — فقط QA reference
- برای UAT آینده روی Windows واقعی و سناریوهای چندبرنامه‌ای در نظر گرفته شده است.
- هیچ runtime dependency از benchmark وارد محصول نشده است.

### OmniParser / Vision models — Deferred Adapter
- Vision fallback باید پشت adapter جدا باشد و فقط وقتی UIA/Native grounding کافی نیست فعال شود.
- در v0.7.1 هیچ model weight یا dependency تصویری Vendor نشده است.

## فایل‌های جدید
- `electron/services/skill-registry.cjs`
- `electron/services/mission-compiler.cjs`
- `electron/services/windows-uia.cjs`
- `tests/upstream-foundation-v071.test.cjs`

## Security boundaries
1. Mission فقط cycleهایی را می‌تواند اجرا کند که Skill متناظر در registry دارند.
2. Skill با `risk=write` باید `confirmation=true` داشته باشد.
3. Arbitrary shell در Mission DAG ممنوع است.
4. Windows UIA در این نسخه فقط Read-only است.
5. Cycle علاوه بر max-iteration دارای max-wall-time است.
6. Transaction / Quarantine / Recovery / Journal نسخه قبل بدون حذف باقی مانده‌اند.

## مرحله بعد
بعد از UAT UIA روی Windows 10/11، Action Layer کنترل‌شده اضافه شود:
- Invoke button با selector پایدار و precondition.
- SetValue فقط روی control مجاز و با preview.
- Keyboard fallback فقط برای app-specific skill.
- Post-action verifier و screenshot/UIA evidence.
- per-app skill packs؛ CorelDRAW همچنان Deferred تا بلوغ Runtime.
