# Changelog

All notable changes to this extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-04

### Added

- Russian and English interface. The language follows the editor's display
  language and can be switched manually in the panel; the choice is remembered.
- Localized extension manifest: command titles and the welcome view now follow
  the editor's display language.

### Changed

- Comments in generated TypeScript are always English, regardless of the
  interface language — generated code is meant to be pasted into your project.

## [1.0.0] - 2026-09-04

First public release.

### Added

- Endpoint browser over any OpenAPI 3.0/3.1 spec, loaded from a file path or a URL.
- TypeScript generation for path and query parameters, request bodies, responses,
  and every referenced DTO, keeping the backend's original schema names.
- Generation rules: user-defined JS hooks (`field`, `scalar`, `typeName`,
  `declaration`, `docs`) with a live preview and built-in presets.
- Semantic type comparison against a type pasted from your own code, in per-field
  and line-diff views.
- Support for specs behind an auth redirect, with the session cookie kept in
  VSCode's `SecretStorage`.
- Syntax highlighting that matches the active editor theme.
