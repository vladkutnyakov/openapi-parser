# Changelog

All notable changes to this extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-09-23

### Added

- Search can be limited to one type: press Ctrl+F after clicking inside a block,
  and only that block is searched. A chip in the search bar names it; clicking
  the chip's × or outside any block searches the whole output again. The scope
  follows the type by name, so the same DTO stays in scope on the next endpoint.

### Changed

- The endpoint's method, path and summary are pinned at the top of the output
  and stay visible while you scroll, so you always know whose types you are
  looking at. The summary sits on its own line under the method and path. The
  method badge uses the same colors as in the endpoint list.
- Section headers stick under that header while you scroll a long section, so
  the category and its collapse and copy buttons stay within reach. Collapsing a
  stuck section brings its header back into place instead of leaving you
  somewhere in the middle of the next one.
- "Copy all" is now an icon button next to the endpoint header.

### Fixed

- Typing in the search bar no longer jumps to the first match of the whole
  output on every keystroke. The current match stays put while you edit the
  query, and a fresh search starts from what is on screen — searching for a
  field in a DTO near the bottom used to throw the view back to the top.

## [1.4.0] - 2026-09-09

### Added

- Loading a spec is now visible where you are looking: a progress bar along the
  source bar, a status line naming the source being loaded, and the endpoint list
  dimmed and click-blocked until it matches that source. The spinning reload icon
  alone sits in a corner, and switching sources looked like nothing had happened.
- Network loads have a 120-second limit and report the source as the thing that
  went quiet. Previously the only limit was the panel waiting on the extension,
  so a slow backend was reported as the extension failing to answer.

### Changed

- Long specs scroll and resize smoothly: only the visible rows of the endpoint
  list are rendered. On a 2000-endpoint spec, dragging the sidebar edge cost 79 ms
  per step and now costs 1.5 ms.

### Fixed

- Switching the source while a spec is still loading cancels the first load.
  Pressing Enter or picking from history started a second load over the first, and
  whichever answered last won — so the panel could quietly end up showing a spec
  from the source you had just navigated away from.
- The gap between the endpoint list and the output is gone; the resize handle now
  overlays the border instead of holding a column of its own.
- The header above the endpoint list and the one above the output are the same
  height, so the border under them no longer steps.

## [1.3.0] - 2026-09-07

### Added

- The endpoint's method, path and summary, along with each response's status and
  description, are now drawn as part of the panel instead of comments inside the
  generated TypeScript, where they took the same dim color as field docs and got
  lost in the type. Clicking the path copies it.
- Content-Type of the request body and of every response is shown next to the
  type. Generated TypeScript looks the same for `multipart/form-data` as it does
  for JSON, so the wire format used to be invisible — and it decides how the
  client actually sends the request. When a body or response offers several media
  types, the others are listed too, since the type is generated from exactly one
  of them.

### Changed

- The Load button is now a refresh icon that spins while the spec is loading, in
  place of its three text labels. The label is kept as a tooltip and for screen
  readers.

### Fixed

- Restoring an endpoint no longer sets the method filter to that endpoint's
  method: the two shared one key in the saved state. Endpoints saved before this
  release still restore, with the filter reset to ALL.

## [1.2.0] - 2026-09-04

### Added

- Find in generated types: Ctrl+F opens a search bar over the output, with every
  match highlighted, a match counter and Enter / Shift+Enter to step through
  them. A match inside a collapsed section expands it.
- Generated types are grouped into collapsible sections — path parameters, query
  parameters, request body, responses and DTOs — each with its own copy button.
  Collapsed sections are remembered per category, so DTOs stay folded as you move
  between endpoints.
- Generation rules can be loaded from and saved to a `.js` file, so a house style
  can be kept in the repository and shared with the team.

### Removed

- The built-in "My project" preset. It encoded one team's conventions, which is
  exactly what the rules editor is for; "Classic TS" and "No comments" remain.

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
