# Changelog

All notable changes to EasyBill are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Unit test suite (Vitest) covering the e-invoicing services and the database repositories.
- `npm run typecheck` and `npm test` scripts, run in CI together with lint and packaging.

### Changed

- Build tooling moved to Electron Forge + Vite; ESLint and TypeScript configurations rewritten accordingly.

### Fixed

- Database backup, company lookup and e-invoicing statistics on an empty database.
