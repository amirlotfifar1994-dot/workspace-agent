# Validation v0.9.3

## Automated

- Dependency pin verification: PASS
- Source hygiene: PASS
- Node syntax: PASS
- JSX check: PASS
- Legacy + current regression chain: PASS
- Dialog duplicate-label ranking: PASS
- ScrollItem controlled action policy: PASS
- Stale candidate recovery: PASS
- Ambiguous recovery block: PASS
- Exact-window crop: PASS
- Secondary-monitor crop with negative coordinates: PASS
- Untrusted screenshot mapping rejection: PASS

## Grounding benchmark

1500 UIA elements, 30 iterations after context-signature caching:
- p50 ~33 ms
- p95 ~44 ms
- expected target rank #1

## Not certified in this environment

- Real Windows multi-monitor/DPI UAT: PENDING
- Real popup/menu UIA behavior across applications: PENDING
- NSIS/Portable artifact: PENDING
- package-lock: PENDING
