# Changelog v0.7.2 — Windows Action Foundation

## Added
- `windows-action-policy.cjs`: allowlist، selector validation، high-impact deny policy، pinned plan hash.
- `windows-action-session-store.cjs`: نگهداری ephemeral مقدار `setValue` بدون persistence.
- `windows-uia-actions.cjs`: Resolve و اجرای pinned UI Automation patterns.
- `windows-ui-action` Cycle با Preview → Confirm → Execute → Verify.
- Skill جدید `skill.windows.uia-action` با `risk=write`, `confirmation=true`, `interactiveOnly=true`.
- IPC اختصاصی `wa:start-uia-action`; شروع این Cycle از IPC عمومی Block است.
- UI Action Composer داخل Windows UI Map.
- RuntimeId و IsPassword metadata به UIA Grounding اضافه شد.
- تست `windows-uia-action-v072.test.cjs`.

## Safety changes
- coordinate click و SendKeys عمومی وجود ندارد.
- Mission/LLM نمی‌تواند مستقیم Windows UI Action را اجرا کند.
- Selector ضعیف، target مبهم، target عوض‌شده، Password، Disabled/Offscreen و high-impact target باعث Safe Abort می‌شوند.
- Value واقعی `setValue` در Cycle/Journal ذخیره نمی‌شود.
- Invoke به‌عنوان semantic verification کامل گزارش نمی‌شود.

## Compatibility
تمام تست‌های v0.7.1 و قبل بعد از تغییرات PASS باقی ماندند.
