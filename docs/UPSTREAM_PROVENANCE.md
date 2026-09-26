# Upstream provenance / design references

No upstream repository is vendored in v0.9.0. The files in this source tree are project-local implementations. The following projects were reviewed as architecture/design references before this revision:

- Microsoft UFO / UFO² — Windows agent / UI Automation architecture — MIT repository license.
- Microsoft CUA Skill — reusable computer-use skill architecture — MIT repository license.
- Microsoft WindowsAgentArena — Windows agent evaluation environment — MIT repository license.
- Microsoft OmniParser — optional visual UI parsing reference; kept out of Core and not vendored.
- pywinauto — optional future Windows automation dependency/reference; not bundled in v0.9.0.
- llama.cpp — Local OpenAI-compatible inference/server design reference; no upstream code is vendored.
- Qwen3.6 / Qwen3.5 — current open model families considered for optional local text/vision UAT; no model weights are bundled.
- Qwen-Agent — planning/tool/memory architecture reference only; Python framework is not bundled because v0.9 keeps execution inside the existing Electron Skill/Cycle safety core.

If any upstream source code or model weights are vendored in a future release, add the exact pinned commit/version and required license/notice files to that release before distribution.

## v0.9.1 Local Runtime references (2026-08-13)
- llama.cpp server official repository/docs: https://github.com/ggml-org/llama.cpp/tree/master/tools/server
- Qwen3.6 official repository (includes Qwen3.5 release matrix and llama.cpp text+vision support): https://github.com/QwenLM/Qwen3.6
- Microsoft Win32_VideoController reference: https://learn.microsoft.com/windows/win32/cimwin32prov/win32-videocontroller

No upstream runtime binary, model weights, or model file is bundled in this source release.

## v0.9.2 Grounding/Vision verification references (2026-08-13)
- llama.cpp official server documentation was re-checked for OpenAI-compatible chat, multimodal input and schema-constrained JSON support.
- Qwen3.6 official repository was re-checked for current llama.cpp text + vision support.
- No llama.cpp/Qwen/OmniParser/UFO/CUA source code or model weights are vendored in v0.9.2; this revision remains project-local implementation code.
