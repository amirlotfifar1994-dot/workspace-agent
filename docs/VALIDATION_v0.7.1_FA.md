# Validation Report — v0.7.1 Upstream Architecture Foundation

## نتیجه کلی
**Core / Regression / Syntax / JSX: PASS**

## تست‌ها
- cycle-engine.test — PASS
- file-guardian.test — PASS
- file-cycles.integration.test — PASS
- windows-agent-v03.test — PASS
- mission.integration.test — PASS
- automation-v04.test — PASS
- semantic-intelligence-v05.test — PASS
- semantic-cycles-v05.test — PASS
- office-extractor-v05.test — PASS
- windows-agent-v06.test — PASS
- production-hardening-v07.test — PASS
- upstream-foundation-v071.test — PASS

### تست‌های جدید v0.7.1
- Skill Registry دارای Skillهای ثبت‌شده و UIA skill است.
- تمام Write Skillها `confirmation=true` دارند.
- Skill ثبت‌نشده/Arbitrary action توسط registry رد می‌شود.
- Goal Plan به Mission DAG معتبر تبدیل می‌شود.
- dependencyهای DAG قبل از اجرا تعریف/بررسی می‌شوند.
- max-wall-time عملاً Cycle را با `MAX_WALL_TIME` متوقف می‌کند.
- روی non-Windows، UIA به‌صورت صریح `supported=false` برمی‌گرداند.

## Static checks
- `npm run check:syntax` — PASS
- `npm run check:jsx` — PASS با TypeScript 5.8.3
- Scan برای `eval(` / `new Function(` / `child_process.exec(` — موردی پیدا نشد.

## Scale benchmark synthetic
محیط این validation:
- 100,000 رکورد: build 338ms / search 203ms / RSS 131MB
- 500,000 رکورد: build 1074ms / search 920ms / RSS 347MB
- 1,000,000 رکورد: build 1861ms / search 1943ms / RSS 685MB

این benchmark synthetic است و جایگزین UAT واقعی NTFS نیست.

## Build
`npm run build` در این sandbox اجرا شد اما `vite` در node_modules نصب نبود و با `vite: not found` متوقف شد. این شکست dependency installation است، نه خطای syntax/JSX.

## Windows UAT باقی‌مانده
به دلیل Linux بودن runtime فعلی، مسیر واقعی `System.Windows.Automation` اجرا نشده است. قبل از فعال کردن Action Layer باید روی Windows 10/11 موارد زیر تست شوند:
1. FocusedElement روی File Explorer، Settings، Notepad، Office و برنامه‌های Electron/Chromium.
2. Top-level window enumeration.
3. AutomationId / ClassName / FrameworkId correctness.
4. پنجره‌های با accessibility ضعیف و controls offscreen.
5. latency روی پنجره‌های با هزاران descendant.
6. packaged NSIS/Portable و PowerShell policy behavior.

## حکم انتشار
v0.7.1 برای **source-level integration / development** آماده است. فعال‌سازی عمومی Click/Keyboard/Value Write تا UAT Windows و اضافه شدن per-action verifier مجاز نیست.
