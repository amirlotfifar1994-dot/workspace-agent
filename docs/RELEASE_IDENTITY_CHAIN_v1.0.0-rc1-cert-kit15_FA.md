# Release Identity Chain — v1.0.0-rc1 / cert-kit15

## مسئله
تا cert-kit14، `package-lock.json` در lane رسمی Windows قابل تولید بود و Source Fingerprint کل tree را می‌دید. در نتیجه اضافه‌شدن lockfile می‌توانست fingerprint سورس frozen را عوض کند؛ در حالی که lockfile باید یک ورودی مستقل و صریح Release باشد، نه تغییر هویت کد frozen.

## قرارداد cert-kit15
Source Fingerprint به schema `workspace-agent-source-fingerprint-v2` ارتقا یافت و scope آن `frozen-source-excluding-release-lockfile` است. فقط `package-lock.json` از هویت Source حذف می‌شود؛ خود lockfile همچنان اجباری است و SHA-256 آن جداگانه verify می‌شود.

`release-identity.cjs` یک هویت ترکیبی deterministic می‌سازد که این موارد را bind می‌کند:
- Source Fingerprint v2 + تعداد فایل
- SHA-256 و bytes دقیق `package-lock.json`
- version و toolingRevision
- featureFreeze
- Node/npm/packageManager pins
- architecture=x64

خروجی نهایی `releaseIdentitySha256` است.

## Fail-closed gates
- Orchestrator قبل و بعد از ساخت lockfile Source Fingerprint را مقایسه می‌کند؛ هر تغییر Source، FAIL است.
- Windows certification report باید `releaseIdentitySha256` داشته باشد.
- Release Manifest schema v8 باید همان Release Identity را bind کند.
- Primary/Peer باید Source، lockfile و Release Identity یکسان داشته باشند.
- Handoff manifest Release Identity فعلی را bind می‌کند و هنگام import دوباره verify می‌شود.
- Final Envelope و Stable Promotion Decision باید Release Identity فعلی را با evidence نهایی برابر ببینند.

## نتیجه
تولید lockfile دیگر Source Identity را تغییر نمی‌دهد، ولی تغییر حتی یک byte در lockfile، source، runtime pins یا tooling revision باعث تغییر Release Identity و بسته‌شدن promotion می‌شود.
