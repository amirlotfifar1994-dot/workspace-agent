# Validation v0.9.1

## Source-level
- Node syntax: PASS
- JSX parse/type syntax: PASS
- Runtime manager unit test: PASS
- Hardware advisor unit test: PASS
- OpenAI compatibility fallback test: PASS
- `/props` capability test: PASS
- JSON schema probe: PASS
- synthetic Vision probe: PASS
- Windows Real Local AI UAT: SKIP در محیط non-Windows

## Runtime security assertions
- Host 127.0.0.1: PASS
- no-webui: PASS
- no arbitrary MCP/agent args: PASS
- LLAMA_ARG_* scrub: PASS
- LLAMA_API_KEY scrub: PASS
- explicit regular-file runtime/model validation: PASS

## Pending external certification
- real llama-server.exe on Windows 10
- real llama-server.exe on Windows 11
- real Qwen GGUF text
- real multimodal GGUF vision
- packaged NSIS/Portable smoke with managed runtime

## Final gate (2026-08-13)
- `npm run check`: PASS
- npm test chain: 31 suites/files PASS
- Windows Real Local AI UAT: SKIP (Windows only)
- strict release inputs: expected FAIL-CLOSED with `LOCKFILE_REQUIRED`
- Vite source build in this container: not executed because dependencies are not installed (`vite: not found`)
- async Child Process spawn-error fail-fast: PASS
