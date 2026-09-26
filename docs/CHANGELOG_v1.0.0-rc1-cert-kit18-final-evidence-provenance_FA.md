# Changelog — v1.0.0-rc1 cert-kit18

- Manual Evidence schema v3 با binding کامل به execution/release identity.
- hash/size verification برای Manual Evidence attachments.
- حمل self-contained attachmentهای Manual Evidence در Final Certification ZIP.
- Finalizer binding اجباری به Primary/Peer Handoff Manifest و Pointerهای همان execution.
- Final Verdict schema v3 با executionId و Handoff IDها.
- Stable Promotion Decision schema v2 با execution traceability.
- re-hash تمام Verdict input files بلافاصله قبل از Stable Promotion.
- Final Envelope schema v4 با execution binding اختیاری برای phase و اجباری برای Finalize.
- live Authenticode re-check و signer thumbprint match در `--require-signing`.
- Core feature freeze بدون تغییر باقی مانده است.
