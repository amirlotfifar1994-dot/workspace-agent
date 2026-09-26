# Changelog v0.9.1

## Added
- Hardware Profile Service برای RAM/CPU/GPU read-only
- Model Advisor محافظه‌کارانه و non-guaranteed
- Managed llama.cpp Runtime Manager
- انتخاب صریح `llama-server(.exe)` و GGUF
- start/stop/restart/autostart managed runtime
- bounded in-memory runtime logs با path redaction
- `/props` capability detection
- JSON schema capability probe
- synthetic Vision capability probe
- warmup
- OpenAI-compatible compatibility retry
- AI UI Assist با UIA-first و user-selected Vision fallback
- IPC/Preload/UI کامل برای Runtime و Hardware
- Windows Real Local AI UAT opt-in

## Security
- loopback host hard-lock
- `--no-webui`
- arbitrary args/env ممنوع
- `LLAMA_ARG_*` و `LLAMA_API_KEY` حذف می‌شوند
- executable/model باید regular non-symlink باشند
- model باید `.gguf` باشد
- هیچ model/runtime download خودکار وجود ندارد
- Vision fallback بدون background capture
