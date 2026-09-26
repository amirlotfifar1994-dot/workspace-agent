# Changelog v0.9.8

## Added

- `version-update-guard.cjs`
- Data Epoch compatibility guard
- `rc-self-check-service.cjs`
- `state-backup-service.cjs`
- `diagnostics-bundle-service.cjs`
- `diagnostic-redaction.cjs`
- Update preflight CLI
- RC Self‑Check UI
- State Backup/Restore UI
- Redacted Diagnostics export UI
- Packaged smoke RC gates

## Changed

- App version: `0.9.7` → `0.9.8`
- Write cycles now consult Version/Update Guard before root-volume guard
- Certification runtime schema → v2
- Capability registry includes RC/state-safety capabilities
- source fingerprint historical test now validates current package version dynamically

## Safety

- Restore always creates pre-restore backup by default
- State Backup excludes workspace contents/index database/journal/secrets
- Diagnostics excludes journal payload/raw prompts/screenshots and redacts paths
- Data from a future Data Epoch causes fail-closed writes
- No automatic installer-level rollback is implemented
