# My Portal Extension

A Chrome Side Panel companion for [My Portal](https://github.com/hatappo/my-portal-gas), built with WXT, Svelte, and Skeleton. Keep several portals or HTTPS pages open beside your browser tabs and add Chrome bookmarks to a portal's Links spreadsheet.

## Features

- Up to 20 pages, with optional names, a footer selector, and drag/keyboard reordering.
- Lazy loading and retained page state while the panel document remains open.
- Ordinary deployed GAS URLs: connection parameters are handled internally.
- Selected-folder bookmark import with a preview, duplicate skipping, optional folder tags, and TSV export.
- One-click blackout and double-click reveal for screen sharing.
- English and Japanese controls, following the browser language by default.

## Install and connect

The extension is **not yet published on the Chrome Web Store**. Build with Node.js 26.13.1 or newer in the 26.x series and npm 12.2.2 or newer:

```sh
npm ci
npm run build
```

Load `extension/.output/chrome-mv3` using **Load unpacked** in `chrome://extensions`. Open **My Portal Extension** from its toolbar button.

1. Copy **Extension ID** from extension settings.
2. Save it in the portal's **Settings → Extension → Additional allowed extension ID**.
3. Register the portal's ordinary deployed `/exec` URL as a page in the extension. Save and connect.

The portal and extension must both include the bookmark-import feature. No query parameters or templates need to be entered. Existing GAS connection URLs are normalized when restored. **Open tab** opens the ordinary URL.

Downloadable development ZIPs are published on [GitHub Releases](https://github.com/hatappo/my-portal-ext/releases). Older releases retain their `alcove-…` archive names and behavior. Use `npm run dev` for development or `npm run zip` to package a build.

An unpacked extension's ID and settings storage can change when its directory moves. Before moving from an Alcove checkout, copy its saved page URLs and extension settings. Load the new directory, register its ID in each portal, and check it before removing the old installation. A future store installation will have a stable ID.

## Import Chrome bookmarks

1. Open a connected, updated portal and choose **Import bookmarks** in the footer.
2. Click **Choose Chrome bookmarks** and grant the optional bookmark permission.
3. Select a folder. Its descendants are included; other folders are not sent to the portal. Folder names can optionally become tags.
4. Choose **Preview additions**. Check the destination spreadsheet and sheet, additions, duplicate count, and unsupported URLs.
5. Choose **Add to spreadsheet** to confirm. Existing rows are never edited or deleted. The portal refreshes Links after a successful addition.

The limit is 1,000 selected bookmarks per import. HTTP(S) URLs only are imported. Duplicate detection compares trimmed URLs exactly, including query strings and fragments, across existing normal, hidden, and related-link rows as well as the selected batch. Each addition becomes a top-level Links entry. Column order is resolved from header names.

Direct import uses the portal's existing `drive.file` permission: the destination must be editable by this app, normally a spreadsheet created by the portal. Entering an arbitrary spreadsheet ID alone does not grant write access. No Google scopes are added. **Export TSV** is available for manual import when direct writing is unavailable. It exports only additions after a successful preview, or all selected HTTP(S) entries before preview; the latter has not been checked against the sheet. TSV includes column headers, so paste data rows in the corresponding columns rather than replacing an existing header.

A timeout can occur after a successful write. Preview again before retrying; the portal rechecks current URLs under a lock before appending. Imports through the same portal project are serialized. Separate GAS projects and manual spreadsheet edits do not share that lock, so avoid simultaneous imports or column changes in those contexts.

## Page behavior and privacy

- Pages load on first selection and stay mounted when switching or opening settings. Changing a URL or deleting a page discards only that document. Explicit reload affects only the selected page.
- Chrome can destroy the panel document when closing it. Reopening then reloads the selected page. Hidden pages remain inert, but their scripts and network activity may continue.
- Local previews accept HTTP URLs on `localhost`, its subdomains, and `127.0.0.1`, with any port (for example, `http://localhost:4173/#links`). Other HTTP hosts, LAN addresses, and embedded credentials are rejected. Local pages do not receive GAS connection parameters or bookmark-import access.
- Other HTTPS pages still work when they permit embedding. They do not receive portal parameters or access to bookmark import. CSP and `X-Frame-Options` are not bypassed; Chrome internal pages cannot be embedded.
- Required permissions are `sidePanel` and `storage`, plus limited GAS host access. `bookmarks` is optional and requested only on explicit selection. The extension never modifies Chrome bookmarks.
- Settings use `chrome.storage.local`; blackout uses `chrome.storage.session`. Imported data is held in memory for the import screen, not stored in extension settings or logged. Only the selected folder's entries are sent to the configured portal.
- Portal credentials remain in GAS. A per-frame nonce, exact origins, request IDs, and a versioned capability bind the import bridge. The iframe sandbox does not allow arbitrary top-level navigation.
- Blackout hides content and disables interaction. It does not log out, stop network traffic, or conceal Chrome's own panel header.
- No analytics, content scripts, broad website host permissions, or separate backend.

## Development

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

Both repositories build independently; the extension imports no sibling source files. Browser tests use mocked HTTPS pages, permissions, and bookmark trees. They cover nested GAS iframe communication and explicit import confirmation but do not verify Google sign-in or real spreadsheet writes. Check a deployed portal before release.

Tags must match `package.json`. Pushing a `v*` tag publishes a development ZIP, not a Chrome Web Store release. See [CHANGELOG.md](CHANGELOG.md).

## License

MIT. Formerly Alcove, extracted from gas-portal (now My Portal). The cursive A artwork and warm colors are retained. See [NOTICE](NOTICE) for attribution.
