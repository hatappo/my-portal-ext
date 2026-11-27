# My Portal Extension

A Chrome Side Panel companion for [My Portal](https://github.com/hatappo/my-portal-gas), built with WXT, Svelte, and Skeleton. Keep several portals or HTTPS pages open beside your browser tabs and add Chrome bookmarks to a portal's Links spreadsheet.

## Features

- Up to 20 pages, with optional names, a header menu, and drag/keyboard reordering.
- Lazy loading and retained page state while the panel document remains open.
- Ordinary deployed GAS URLs: connection parameters are handled internally.
- Selected-folder bookmark import with a preview, duplicate skipping, optional folder tags, and TSV export.
- Page comments anchored by standard Text Fragment URLs, with local storage and optional persistent bubbles.
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

1. Open a connected, updated portal and choose **Import bookmarks** in the **More options** header menu.
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
- Local previews accept HTTP URLs on `localhost`, its subdomains, and `127.0.0.1`, with any port (for example, `http://localhost:4173/#links`). Other HTTP hosts, LAN addresses, and embedded credentials are rejected. Local pages receive navigation connection parameters but never bookmark-import access.
- Other HTTPS pages still work when they permit embedding. They do not receive portal parameters or access to bookmark import. CSP and `X-Frame-Options` are not bypassed; Chrome internal pages cannot be embedded.
- Required permissions are `sidePanel`, `storage`, `contextMenus`, `activeTab`, and `scripting`, with HTTP(S) host access for page comments. Chrome requests this access when installing or updating the extension. Content scripts are registered only for sites with saved comments, never every website. `bookmarks` remains optional and is requested only on explicit selection. The extension never modifies Chrome bookmarks.
- Settings use `chrome.storage.local`; blackout uses `chrome.storage.session`. Imported data is held in memory for the import screen, not stored in extension settings or logged. Only the selected folder's entries are sent to the configured portal.
- Portal credentials remain in GAS. A per-frame nonce, exact origins, request IDs, and a versioned capability bind the import bridge. The iframe sandbox does not allow arbitrary top-level navigation.
- Blackout hides content and disables interaction. It does not log out, stop network traffic, or conceal Chrome's own panel header.
- No analytics or separate backend. Automatic comment scripts target exact saved-comment sites, never wildcard subdomains or embedded frames. Hidden mode removes comment UI and automatic registrations; visible modes restore comments on already-open matching pages. Deleting a site's final comment removes it from the registered matches. Browser-internal pages and Chrome-protected pages remain unsupported.

## Page comments

1. Select text in a normal HTML page and choose **Add page comment** from the context menu.
2. Write a plain-text comment in the extension panel and save it.
3. The selected passage is highlighted with a small marker. Hover to reveal its bubble, click to keep it open, or choose **Edit** inside it.
4. Use the header's three-part **Comment display** control: **Hide comments**, **Show comment markers** (default), or **Show comment text**. Saved comments return automatically on later visits. Markers appear at the start of the selected passage; click or hover to open the popover.

**More options → Page comments** lists saved notes and exports them as JSON. The display mode is a single global preference for existing and new comments. It updates open pages without changing comment text or edit timestamps. Hidden mode removes markers, popovers and highlights. Marker mode allows temporary opening; text mode keeps all comment bodies open. Export is a backup file, not an automatic sync or import feature. Data stays in `chrome.storage.local` on this Chrome profile and is deleted when the extension is removed. No comments are sent to GAS or a spreadsheet. Unsaved editor contents are not durable if Chrome destroys the panel.

Each record has only `url`, `comment`, and `updatedAt`. The full Text Fragment URL is the key: reselecting the same generated URL edits its comment. Quotes of up to 100 grapheme clusters are stored in full; longer selections start with 30-grapheme leading/trailing terms. Terms extend to word boundaries and may grow, or standard prefix/suffix context may be added, to identify the selected range uniquely. Long quotes are not archived in full. URLs retain query parameters and SPA route fragments. Equivalent URLs with different query parameters or selector representations remain distinct keys.

Anchoring covers ordinary rendered HTML text, normalized whitespace, and case-insensitive matching. It is not a complete implementation of every browser Text Fragment matching rule. Form fields, editable regions, embedded frames, PDF viewers, canvas and shadow-root text are not supported. An ambiguous or missing target is never silently attached elsewhere: the record remains in the list, with a warning in its editor when the activated page reports that condition. Page indexing is bounded to one million UTF-16 units; changes are debounced, with no polling loop. Multiple large comments may overlap; temporary opening and closing in marker mode does not change the setting.

The content script receives only comments for its current page. Extension storage is restricted to trusted extension contexts. Comments are inserted as plain text in a style-isolated overlay, not interpreted as HTML. Displayed comments are part of the page DOM and should not be considered secret from that page. Simultaneous edits use revision checks rather than silently overwriting another window's changes. The side panel's blackout hides the panel, not annotations in the browser tab.

## Development

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

Both repositories build independently; the extension imports no sibling source files. Browser tests use mocked HTTPS pages, permissions, and bookmark trees. They cover nested GAS iframe communication and explicit import confirmation but do not verify Google sign-in or real spreadsheet writes. Comment browser tests exercise the production script on mocked pages with the required HTTP(S) host grant. They cover selection, editing, rendering, stale targets and message isolation, but native Chrome context-menu gestures and the temporary `activeTab` grant still need a manual smoke check. Check a deployed portal before release.

Tags must match `package.json`. Pushing a `v*` tag publishes a development ZIP, not a Chrome Web Store release. See [CHANGELOG.md](CHANGELOG.md).

## License

MIT. Formerly Alcove, extracted from gas-portal (now My Portal). The cursive A artwork and warm colors are retained. See [NOTICE](NOTICE) for attribution.


### Portal navigation in the extension

Updated portals negotiate a compact icon navigation header with the extension. The extension adds `header=external` internally alongside its per-frame connection parameters. The portal hides its own header only after the extension has rendered replacement controls. Tab selection, language labels and calendar pinning follow the portal state; navigation does not reload the iframe or discard drafts. Global page switching, blackout and extension settings remain in the **More options** header menu.

If the portal is older or negotiation fails, its normal header stays available. Local mock previews can negotiate the same navigation on loopback URLs, but cannot receive bookmark-import authority. No additional Chrome permissions or GAS scopes are needed.
