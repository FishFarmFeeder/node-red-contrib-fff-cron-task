# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
