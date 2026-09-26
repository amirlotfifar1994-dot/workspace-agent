# ممیزی استفاده از اجزای سورس قبلی

در سورس Gold Shop الگوهای زیر برای Agent عمومی ارزشمند بودند:
- `accountingAgentTaskPlanner.js` → تفکیک Goal/Plan/Step
- `accountingAgentTaskGuard.js` → Guard قابل ارزیابی قبل از عمل
- `accountingAgentSafety.js` → Risk/Confirmation boundary
- `accountingAgentPostActionGuard.js` → شبیه‌سازی و Verify پس از Mutation
- `accountingAgentSelfAudit.js` → راستی‌آزمایی مستقل پس از Commit
- `accountingAgentCapabilityRegistry.js` → کاتالوگ صریح قابلیت‌ها
- `accountingAgentGoalCopilot.js` → Goal-to-steps
- `accountingAgentProactiveCopilot.js` → پیشنهاد next action
- `accountingAgentExecutor.js` → جداسازی planning از mutation executor
- `electron/ipc-agent-handlers.cjs` → IPC trust boundary

## تبدیل Domain-specific → Domain-neutral در v0.2
- Accounting metric guard → File path/mtime/size/hash guard
- Ledger post-action verification → Source/Destination verification
- Maker/checker-like approval → Preview/Confirm gate
- Action receipt → Cycle evidence + confirmation receipt
- Reversal → Undo/Restore manifest
- Capability coverage → Active/Beta/Planned registry

هیچ قاعده فروش، خرید، خزانه یا حسابداری وارد Workspace Agent نشده است.
