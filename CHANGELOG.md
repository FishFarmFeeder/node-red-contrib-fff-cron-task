# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `msg.cron` and `msg.date` input fields. Each forces strict validation as its respective type (cleaner than the legacy `msg.inputDate`).
- Explicit warning in README and node help about `contextStorage` being in-memory by default — persistence only survives restarts when a filesystem store is configured.
- `msg.action = "list"` emits the active jobs (with their next invocation) on output 1.
- `msg.action = "cancelAll"` cancels every job in the node instance at once.
- `nextInvocation` field in the triggered output payload (ISO-8601 string, or `null` for one-shot dates).
- Status text now shows the active job count when more than one is scheduled (`"3 jobs · <next>"`).
- Tests covering the explicit input fields, the new control commands, the `nextInvocation` field, and the persistence save/cleanup contract.
- Localization with `locales/en-US/cron-task.json` and `locales/es/cron-task.json` for runtime status text and error messages. The node help text now ships with English and Spanish variants.
- Unit tests under `test/validators_spec.js` and `test/persistence_spec.js` that cover the extracted modules without spinning up the Node-RED helper — including a real save → restore round-trip across separate node instances.

### Changed
- README rewritten without decorative emojis, marketing-style language, or the embedded JSON example duplicated from `examples/basic-flow.json`.
- Node help text updated to document the three input fields and the priority order (`msg.cron` > `msg.date` > `msg.inputDate`).
- Cron-vs-date auto-detection (used only by the legacy `msg.inputDate` path) now relies on `cron-parser` and `new Date` directly instead of a chain of regex heuristics.
- Input handler migrated to the modern Node-RED 1.0+ signature `(msg, send, done)` so the runtime gets full message lifecycle telemetry.
- Source code split into `lib/validators.js` (pure input validation), `lib/scheduler.js` (scheduling primitives, factory closure), and `lib/persistence.js` (save/restore/remove). `cron-task.js` is now a thin orchestrator.
- ESLint rules hardened: `eqeqeq`, `prefer-const`, `no-var`, `curly`.
- `package.json#files` now ships `lib/` and `locales/` so the published tarball includes the new directories.

### Removed
- Monkey-patching of `node-schedule` internals (`scheduled._scheduleInput`, `scheduled._jobId`) — replaced by a separate `node.jobMeta` map.

### Fixed
- Fragile fallback in input detection that defaulted any non-cron, non-date string to "cron".

## [0.0.1] - 2025-11-28

### Added
- **Persistent Jobs**: Optional persistence of scheduled job across Node-RED restarts using context storage
- **Robust Cron Validation**: Using `cron-parser` library for accurate cron string validation
- **Dedicated Error Output**: Second output port for errors and validation failures
- **Comprehensive Test Suite**: Automated tests using Mocha and node-red-node-test-helper
- Complete package.json metadata (repository, bugs, homepage, engines)
- CHANGELOG.md following Keep a Changelog format

### Changed
- Node display name from "cron task" to "cron-task"
- Version reset to 0.0.1 to reflect early development stage
- Improved error messages with more context
- Better status indicators

### Fixed
- Weak cron validation that could accept invalid patterns
- Missing metadata in package.json preventing npm publication

[Unreleased]: https://github.com/fishfarmfeeder/node-red-contrib-fff-cron-task/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/fishfarmfeeder/node-red-contrib-fff-cron-task/releases/tag/v0.0.1
