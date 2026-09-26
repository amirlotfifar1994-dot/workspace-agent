# مدل Recovery در Workspace Agent

## اصل
«چرخه Running» به‌تنهایی مدرک کافی برای فهمیدن وضعیت فایل نیست. بنابراین v0.7 یک Transaction Intent مستقل از Cycle دارد.

## قبل از Write
Transaction شامل این موارد روی دیسک ثبت می‌شود:
- kind
- cycleId
- root
- source
- optional staging path
- destination
- expected size
- operation state

## هنگام Restart
برای هر operation وجود واقعی سه Path بررسی می‌شود:
- Source
- Staging
- Destination

### وضعیت‌های امن
- فقط Source وجود دارد: هنوز Commit نشده؛ Resume یا Rollback امن است.
- فقط Staging وجود دارد: وسط staging؛ Resume یا Rollback امن است.
- فقط Destination وجود دارد: Commit شده؛ Resume/Finalize یا Rollback قابل انجام است.

### وضعیت مبهم
اگر بیش از یکی از Pathها وجود داشته باشد یا هیچ‌کدام وجود نداشته باشند، Agent Write خودکار را Block و `manual-review` اعلام می‌کند.

## سیاست
Recovery هیچ‌وقت هنگام Startup خودش Move/Rename نمی‌کند. Startup فقط وضعیت را شناسایی می‌کند. Resume/Rollback یک اقدام صریح کاربر است.
