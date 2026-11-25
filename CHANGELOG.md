# Changelog

All notable changes to My Portal Extension (formerly Alcove) are documented here. Versions follow Semantic Versioning. GitHub releases are development builds; Chrome Web Store publication has not started.

## Unreleased

### Added

- Negotiated portal navigation in a compact extension header, with synchronized tabs, language labels and calendar pinning.
- Navigation-only integration for localhost previews, retaining production-only bookmark import permissions.
- Fallback to the portal header when navigation negotiation is unsupported or incomplete.

### Changed

- Use Skeleton App Bar, segmented controls, popovers and tooltips, with standard button and divider styles, plus a Skeleton Combobox page picker in the shared header.
- Consolidate portal navigation and extension controls into one header; remove the footer wordmark. Keep blackout directly accessible and group other controls in a click-open menu.

## [0.3.0] - 2026-11-26

### Added

- HTTP local previews on localhost, its subdomains, and 127.0.0.1 without relaxing HTTPS requirements for other hosts.

- Selected-folder Chrome bookmark preview and append-only import into My Portal's Links spreadsheet, with optional folder tags and TSV export.
- Optional bookmark permission, requested only when choosing bookmarks; no tokens or credentials are transferred to the extension.

### Changed

- Rename the project to `my-portal-ext` and make it a dedicated My Portal companion, while keeping multiple HTTPS pages.
- Accept ordinary portal URLs. Connection parameters and per-frame nonces are added internally; URL templates are no longer a setting.
- Preserve the original icon and warm footer styling.

## [0.2.0] - 2026-11-17

### Changed

- Replace the inherited P icon with an outlined Allura A on a pale cream-and-gold background.
- Match the footer wordmark to the warm icon palette, with light, dark, and blackout colors.

### Fixed

- Stage extension archives outside hidden build directories for GitHub Actions artifact upload.

## [0.1.0] - 2026-11-17

### Added

- Standalone Chrome Side Panel extension extracted from gas-portal.
- Multiple HTTPS pages with optional names, drag/keyboard reordering, and a footer selector.
- Lazy iframe loading and retained state when switching pages, with per-page reload.
- Optional `{nonce}` URL templates with fresh random values on load or reload.
- One-click blackout and double-click reveal, synchronized between open panels.
- English and Japanese settings, following browser language by default.
- Independent WXT/Svelte/Skeleton build, tests, and GitHub development ZIP releases.

### Security

- HTTPS-only page validation, sandboxed iframes, and locally packaged extension scripts.
- No response-header rewriting, content scripts, or broad website host permissions.
- Content remains hidden until session visibility settings are restored successfully.

[0.1.0]: https://github.com/hatappo/alcove/releases/tag/v0.1.0

[0.2.0]: https://github.com/hatappo/alcove/compare/v0.1.0...v0.2.0
