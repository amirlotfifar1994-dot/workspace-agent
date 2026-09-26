# Dependency Source Provenance — cert-kit19

## Policy

RC1 برای dependencyهای npm از allowlist صریح استفاده می‌کند:

- `allowedRegistryOrigins = ["https://registry.npmjs.org"]`
- `allowedResolvedProtocols = ["https:"]`
- links ممنوع
- git sources ممنوع
- file sources ممنوع
- integrity برای registry artifacts اجباری

Policy در `package.json > workspaceAgentRelease.dependencySourcePolicy` قرار دارد و canonical SHA-256 آن داخل Release Identity و Release Manifest ثبت می‌شود.

## Lockfile gate

`verify-release-inputs.cjs` علاوه بر pins، خود `package-lock.json` را source-by-source می‌خواند. lockfile باید regular non-link file باشد. resolved source خارج allowlist، protocol غیر HTTPS، link/git/file یا artifact بدون integrity باعث failure می‌شود.

## Windows lane

`generate-lockfile.ps1` قبل از generation مقدار `npm config get registry` را با origin مصوب مقایسه می‌کند و lockfile را با همان `--registry` تولید می‌کند. `windows-release.ps1` و Windows Certification نیز registry provenance و lockfile provenance را ثبت و verify می‌کنند.

## Release identity

`workspace-agent-release-identity-v2` این موارد را bind می‌کند:

- Frozen Source Fingerprint v2
- SHA-256 package-lock رسمی
- version / tooling revision
- Node/npm/packageManager pins
- x64 release lane
- canonical dependency source policy + policy SHA-256

تغییر policy، lockfile یا source باعث تغییر/عدم تطابق Release Identity می‌شود.
