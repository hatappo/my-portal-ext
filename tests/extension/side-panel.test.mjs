import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { i18n } from '../../extension/i18n.js';

const output = path.resolve('extension/.output/chrome-mv3');
const portalUrl = 'https://script.google.com/a/macros/clap-s.com/s/test-deployment/exec#links';

async function openControls(page) {
  if (!await page.locator('#panel-controls').isVisible()) await page.locator('#panel-controls-toggle').click();
  await page.locator('#panel-controls').waitFor();
  // Flush the compositor before pointer input: headless Chromium can otherwise
  // keep a cross-origin iframe's old hit-test surface over a freshly opened popover.
  await page.screenshot();
}

async function choosePage(page, option) {
  await page.locator('#page-switcher').click();
  const options = page.locator('#page-switcher-options');
  await options.waitFor();
  if ('label' in option) await options.getByRole('option', { name: option.label, exact: true }).click();
  else await options.getByRole('option').nth(option.index).click();
}

test('Production permissions are limited to the panel, local settings, and GAS hosts', () => {
  const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.permissions.toSorted(), ['sidePanel', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://script.google.com/*', 'https://*.googleusercontent.com/*']);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.declarative_net_request, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.deepEqual(manifest.optional_permissions, ['bookmarks']);
  assert.match(manifest.content_security_policy.extension_pages, /frame-src https:/);
  assert.equal(manifest.version, JSON.parse(readFileSync('package.json', 'utf8')).version);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
});

test('Packaged icons cover toolbar and management sizes with the My Portal Extension artwork', () => {
  const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.icons), ['16', '32', '48', '128']);
  assert.deepEqual(manifest.action.default_icon, manifest.icons);
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = readFileSync(path.join(output, file));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }
  const license = readFileSync(path.join(output, 'FONT-LICENSE.txt'), 'utf8');
  assert.match(license, /SIL OPEN FONT LICENSE/);
  assert.match(license, /The Allura Project Authors/);
});

async function extensionPage(t, locale = 'en-US', width = 360) {
  const profile = mkdtempSync(path.join(tmpdir(), 'portal-extension-browser-'));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width, height: 800 }, locale, args: ['--disable-extensions-except=' + output, '--load-extension=' + output] });
  t.after(async () => { await context.close(); rmSync(profile, { recursive: true, force: true }); });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto('chrome-extension://' + id + '/sidepanel.html');
  return { page, context, id };
}

async function assertSavedPage(page, language) {
  const saved = await page.evaluate(() => globalThis.chrome.storage.local.get(null));
  assert.deepEqual(Object.keys(saved).sort(), language ? ['languagePreference', 'panelConfig'] : ['panelConfig']);
  if (language) assert.equal(saved.languagePreference, language);
  const config = saved.panelConfig;
  assert.equal(config.pages.length, 1);
  assert.equal(config.pages[0].url, portalUrl);
  assert.equal(config.pages[0].parameterSetId, undefined);
  assert.equal(config.activePageId, config.pages[0].id);
  assert.equal(config.parameterSets, undefined);
}

test('Unpacked extension saves page configuration, adds connection parameters internally, reloads and restores its connection', { timeout: 60000 }, async t => {
  const { page, context, id } = await extensionPage(t);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep authentication and network entirely mocked; this does not claim Google sign-in works.
  await context.route('https://**/*', route => {
    const request = new URL(route.request().url());
    const body = request.hostname === 'script.google.com'
      ? '<!doctype html><iframe src="https://abc-script.googleusercontent.com/panel?panelNonce=' + request.searchParams.get('panelNonce') + '"></iframe>'
      : '<!doctype html><body>Mock portal</body>';
    return route.fulfill({ contentType: 'text/html', body });
  });
  await page.goto('chrome-extension://' + id + '/sidepanel.html');
  await page.getByLabel('Page URL').fill('http://example.com');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  assert.match(await page.getByRole('alert').textContent(), /HTTPS/);
  await page.getByLabel('Page URL').fill(portalUrl);
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.locator('iframe').waitFor();
  const first = new URL(await page.locator('iframe').getAttribute('src'));
  assert.equal(first.searchParams.get('sidePanel'), '1');
  assert.match(first.searchParams.get('panelNonce'), /^[a-f0-9]{32}$/);
  await assertSavedPage(page);
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow != null);
  const outer = page.frame({ url: first.href });
  await outer.waitForLoadState();
  await page.frameLocator('iframe').frameLocator('iframe').locator('body').waitFor();
  const frame = page.frames().find(frame => frame.url().startsWith('https://abc-script.googleusercontent.com/'));
  assert.deepEqual(await frame.evaluate(() => Array.from(location.ancestorOrigins)), ['https://script.google.com', 'chrome-extension://' + id]);
  assert.equal(await page.getByRole('status').count(), 0, 'No site-specific readiness handshake');
  await openControls(page);
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await page.waitForFunction(old => document.querySelector('iframe').src !== old, first.href);
  const opened = context.waitForEvent('page');
  await openControls(page);
  await page.getByRole('button', { name: 'Open tab' }).click();
  const tab = await opened;
  await tab.waitForURL(portalUrl);
  await tab.close();
  await page.reload();
  await page.locator('iframe').waitFor();
  assert.equal(await page.getByLabel('Page URL').count(), 0);
  assert.deepEqual(errors, []);
  await openControls(page);
  await page.getByRole('button', { name: 'Extension settings', exact: true }).click();
  assert.equal(await page.getByLabel('Page URL').inputValue(), portalUrl);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/tmp/gas-portal-extension-setup.png', fullPage: true });
});

test('Japanese setup remains usable at the narrowest panel width', { timeout: 30000 }, async t => {
  const { page } = await extensionPage(t, 'ja-JP', 320);
  await page.getByRole('button', { name: '保存して接続', exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/tmp/gas-portal-extension-setup-ja.png', fullPage: true });
});


test('Extension language defaults to Auto, persists independently and keeps the portal iframe mounted', { timeout: 30000 }, async t => {
  const { page, context } = await extensionPage(t, 'en-US', 320);
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Mock portal</p>' }));
  const select = page.locator('#extension-language');
  await select.waitFor();
  assert.equal(await select.inputValue(), 'auto');
  await page.getByLabel('Page URL').fill('http://example.com');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await select.selectOption('ja');
  await page.waitForFunction(() => document.documentElement.lang === 'ja');
  assert.match(await page.getByRole('alert').innerText(), /HTTPS/);
  assert.equal(await page.locator('.settings-control span').textContent(), '拡張機能の設定');
  await page.getByLabel('画面のURL').fill(portalUrl);
  await page.getByRole('button', { name: '保存して接続' }).click();
  await page.locator('iframe').waitFor();
  await page.locator('iframe').evaluate(frame => { frame.dataset.identity = 'preserved'; });
  const frameUrl = await page.locator('iframe').getAttribute('src');
  await openControls(page);
  await page.getByRole('button', { name: '拡張機能の設定', exact: true }).click();
  await select.selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await openControls(page);
  await page.getByRole('button', { name: 'Extension settings', exact: true }).click();
  await page.locator('iframe').waitFor({ state: 'visible' });
  assert.equal(await page.locator('iframe').getAttribute('src'), frameUrl);
  assert.equal(await page.locator('iframe').getAttribute('data-identity'), 'preserved');
  await page.reload();
  await page.locator('iframe').waitFor();
  await openControls(page);
  await page.getByRole('button', { name: 'Extension settings', exact: true }).click();
  assert.equal(await select.inputValue(), 'en');
  await select.selectOption('auto');
  await page.waitForFunction(() => document.getElementById('extension-language-status').textContent === 'Saved');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { value: ['ja-JP'], configurable: true });
    window.dispatchEvent(new Event('languagechange'));
  });
  await page.waitForFunction(() => document.documentElement.lang === 'ja');
  await select.selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.evaluate(() => window.dispatchEvent(new Event('languagechange')));
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await assertSavedPage(page, 'en');
  assert.equal(await page.locator('.header-actions button svg:visible').count(), 2);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/tmp/gas-portal-extension-settings-en.png', fullPage: true });
});

test('A failed language save keeps the previous preference and shows localized feedback', { timeout: 30000 }, async t => {
  const { page } = await extensionPage(t, 'ja-JP');
  await page.getByRole('button', { name: '保存して接続' }).waitFor();
  await page.evaluate(() => { globalThis.chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); }; });
  await page.locator('#extension-language').selectOption('en');
  await page.waitForFunction(() => document.getElementById('extension-language-status').textContent.includes('保存できません'));
  assert.equal(await page.locator('#extension-language').inputValue(), 'auto');
  assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
  assert.deepEqual(await page.evaluate(() => globalThis.chrome.storage.local.get(null)), {});
});

test('Header hides on one activation and restores on two, preserving the mounted portal', { timeout: 30000 }, async t => {
  const { page, context } = await extensionPage(t, 'en-US', 320);
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><input value="Private content">' }));
  await page.getByLabel('Page URL').fill(portalUrl);
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const iframe = page.locator('iframe');
  await iframe.waitFor();
  await iframe.evaluate(frame => { frame.dataset.identity = 'retained'; });
  const src = await iframe.getAttribute('src');
  assert.equal(await page.locator('.extension-header').count(), 1);
  assert.equal(await page.locator('.extension-name, footer').count(), 0);
  const header = await page.locator('.extension-header').boundingBox();
  assert.equal(header.y, 0);
  assert.ok(header.height <= 45);
  const toggle = page.locator('#privacy-toggle');
  assert.equal(await page.locator('.header-actions button').first().getAttribute('id'), 'privacy-toggle');
  await page.mouse.move(0, 0);
  assert.equal(await toggle.locator('.privacy-current').isVisible(), true);
  assert.equal(await toggle.locator('.privacy-action').isVisible(), false);
  await toggle.hover();
  assert.equal(await toggle.locator('.privacy-current').isVisible(), false);
  assert.equal(await toggle.locator('.privacy-action').isVisible(), true);
  await toggle.click();
  await page.waitForFunction(() => document.querySelector('#privacy-toggle').getAttribute('aria-pressed') === 'true' && !document.querySelector('#privacy-toggle').disabled);
  assert.equal(await page.locator('.panel-body').evaluate(el => el.inert), true);
  assert.equal(await iframe.isVisible(), false);
  assert.equal(await page.locator('#panel-controls').getByRole('button', { name: 'Open tab', exact: true, includeHidden: true }).isDisabled(), true);
  assert.equal(await page.locator('.settings-control').isDisabled(), true);
  assert.equal(await page.locator('.panel-content').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  assert.deepEqual(await page.evaluate(() => globalThis.chrome.storage.session.get(null)), { privacyMode: true });
  await assertSavedPage(page);
  await page.screenshot({ path: '/tmp/gas-portal-extension-blackout.png' });
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await page.waitForTimeout(450);
  await toggle.dblclick();
  await iframe.waitFor({ state: 'visible' });
  assert.equal(await iframe.getAttribute('src'), src);
  assert.equal(await iframe.getAttribute('data-identity'), 'retained');
  await openControls(page);
  await page.getByRole('button', { name: 'Extension settings', exact: true }).click();
  await page.locator('.page-url').waitFor();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#privacy-toggle').getAttribute('aria-pressed') === 'true' && !document.querySelector('#privacy-toggle').disabled);
  assert.equal(await page.locator('.page-url').isVisible(), false, 'Settings and its URL are concealed too');
  await page.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Enter');
  await page.locator('.page-url').waitFor({ state: 'visible' });
  await toggle.dblclick();
  await page.waitForFunction(() => document.querySelector('#privacy-toggle').getAttribute('aria-pressed') === 'true' && !document.querySelector('#privacy-toggle').disabled);
  assert.equal(await page.locator('.page-url').isVisible(), false, 'A double-click while visible must only hide');
});

test('Reopening restores blackout without briefly showing content and synchronizes other panels', { timeout: 30000 }, async t => {
  const { page, context, id } = await extensionPage(t);
  await page.getByRole('button', { name: 'Save and connect' }).waitFor();
  await page.locator('#privacy-toggle').dblclick();
  await page.waitForFunction(async () => (await globalThis.chrome.storage.session.get('privacyMode')).privacyMode === true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.addInitScript(() => {
    globalThis.visibleBeforeRestore = false;
    const sample = () => {
      const body = document.querySelector('.panel-body');
      if (body && getComputedStyle(body).visibility !== 'hidden') globalThis.visibleBeforeRestore = true;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await reopened.goto('chrome-extension://' + id + '/sidepanel.html');
  await reopened.waitForFunction(() => !document.querySelector('#privacy-toggle')?.disabled);
  assert.equal(await reopened.locator('#privacy-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await reopened.evaluate(() => globalThis.visibleBeforeRestore), false);
  const other = await context.newPage();
  await other.goto('chrome-extension://' + id + '/sidepanel.html');
  await other.waitForFunction(() => !document.querySelector('#privacy-toggle')?.disabled);
  assert.equal(await other.locator('.panel-body').evaluate(el => el.inert), true);
  await reopened.locator('#privacy-toggle').dblclick();
  await other.waitForFunction(() => document.querySelector('#privacy-toggle').getAttribute('aria-pressed') === 'false');
  await other.getByRole('button', { name: 'Save and connect' }).waitFor();
});

test('Session read and write failures keep content black until explicit successful recovery', { timeout: 30000 }, async t => {
  const { page } = await extensionPage(t, 'ja-JP');
  await page.addInitScript(() => {
    globalThis.chrome.storage.session.get = async () => { throw new Error('Session unavailable'); };
  });
  await page.reload();
  await page.getByRole('alert').filter({ hasText: '暗転状態を読み込めません' }).waitFor();
  const toggle = page.locator('#privacy-toggle');
  assert.equal(await page.locator('.page-url').isVisible(), false);
  await toggle.dblclick();
  await page.getByRole('button', { name: '保存して接続' }).waitFor();
  await page.evaluate(() => { globalThis.chrome.storage.session.set = async () => { throw new Error('Write unavailable'); }; });
  await toggle.dblclick();
  await page.getByRole('alert').filter({ hasText: '暗転状態を保存できません' }).waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.page-url').isVisible(), false);
  await toggle.dblclick();
  assert.equal(await page.locator('.page-url').isVisible(), false, 'Failed reveal must not expose content');
});

test('Multiple URL-only pages switch in the header menu and reload only the active frame', { timeout: 60000 }, async t => {
  const { page, context } = await extensionPage(t, 'en-US', 320);
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Generic page</p>' }));
  await page.getByLabel('Page name', { exact: true }).fill('Docs');
  await page.getByLabel('Page URL', { exact: true }).fill('https://example.com/docs?mode=compact#intro');
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  await page.getByLabel('Page name', { exact: true }).nth(1).fill('Notes');
  await page.getByLabel('Page URL', { exact: true }).nth(1).fill('https://example.org/notes');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const iframe = page.locator('iframe:not([hidden])');
  await iframe.waitFor();
  const first = new URL(await iframe.getAttribute('src'));
  assert.equal(first.searchParams.get('mode'), 'compact');
  assert.equal(first.searchParams.get('panelNonce'), null);
  assert.equal(first.hash, '#intro');
  assert.equal(await page.getByRole('status').count(), 0, 'Generic pages do not wait for a GAS handshake');
  await openControls(page);
  await choosePage(page, { label: 'Notes' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.src.startsWith('https://example.org/'));
  assert.equal(await iframe.count(), 1);
  assert.equal(await page.locator('iframe').count(), 2);
  assert.equal(new URL(await iframe.getAttribute('src')).searchParams.get('panelNonce'), null);
  await page.reload();
  await iframe.waitFor();
  assert.ok((await iframe.getAttribute('src')).startsWith('https://example.org/'));
  await openControls(page);
  // Use keyboard activation after a frame switch/reload to avoid stale OOPIF hit-test regions.
  await page.getByRole('button', { name: 'Extension settings', exact: true }).focus();
  await page.getByRole('button', { name: 'Extension settings', exact: true }).press('Enter');
  await page.getByLabel('Page URL', { exact: true }).nth(1).fill('https://example.org/notes?mode=relaxed');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.src === 'https://example.org/notes?mode=relaxed');
  await iframe.evaluate(el => { el.dataset.old = 'true'; });
  await openControls(page);
  await page.getByRole('button', { name: 'Reload', exact: true }).focus();
  await page.getByRole('button', { name: 'Reload', exact: true }).press('Enter');
  await page.waitForFunction(() => !document.querySelector('iframe:not([hidden])')?.dataset.old);
  assert.equal(await iframe.getAttribute('src'), 'https://example.org/notes?mode=relaxed', 'Reload remounts even without a nonce');
  await openControls(page);
  await choosePage(page, { label: 'Docs' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.src.startsWith('https://example.com/docs?mode=compact'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const header = await page.locator('.extension-header').boundingBox();
  assert.ok(header.height <= 45, 'The menu must not grow the header to two rows');
  await page.screenshot({ path: '/tmp/my-portal-ext-pages.png' });
  await openControls(page);
  // Use keyboard activation after a frame switch/reload to avoid stale OOPIF hit-test regions.
  await page.getByRole('button', { name: 'Extension settings', exact: true }).focus();
  await page.getByRole('button', { name: 'Extension settings', exact: true }).press('Enter');
  await page.screenshot({ path: '/tmp/my-portal-ext-settings.png', fullPage: true });
  // Use keyboard activation after scrolling the settings overlay above a cross-origin frame.
  // Chromium can retain the frame's old pointer hit-test region for a compositor frame.
  const removeNotes = page.getByRole('button', { name: 'Remove page Notes' });
  await removeNotes.focus();
  await removeNotes.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.settings-card').length === 1);
  // Removing the tall card also changes the save button's pointer hit-test position.
  const savePages = page.getByRole('button', { name: 'Save and connect' });
  await savePages.focus();
  await savePages.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('#page-switcher-options [role=option]').length === 1);
  await iframe.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#page-switcher-options [role=option]').count(), 1);
});

test('Legacy URL is restored and failed configuration saves keep the draft and current page intact', { timeout: 30000 }, async t => {
  const { page, context } = await extensionPage(t);
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Portal</p>' }));
  await page.evaluate(url => globalThis.chrome.storage.local.set({ portalUrl: url }), portalUrl);
  await page.reload();
  await page.locator('iframe').waitFor();
  const src = await page.locator('iframe').getAttribute('src');
  await openControls(page);
  await page.getByRole('button', { name: 'Extension settings', exact: true }).click();
  await page.getByLabel('Page name', { exact: true }).fill('My portal');
  // Let Chromium finish hiding the cross-origin frame before clicking through its old surface.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => { globalThis.chrome.storage.local.set = async () => { throw new Error('Unavailable'); }; });
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Page name', { exact: true }).inputValue(), 'My portal');
  assert.equal(await page.locator('iframe').getAttribute('src'), src);
  assert.equal(await page.locator('#page-switcher').inputValue(), 'My Portal');
  assert.deepEqual(await page.evaluate(() => globalThis.chrome.storage.local.get(null)), { portalUrl });
});


test('Settings exposes a selectable extension ID and its close button preserves the page', { timeout: 30000 }, async t => {
  const { page, context, id } = await extensionPage(t);
  await context.route('https://**/*', route => route.fulfill({ body: '<p>Example</p>', contentType: 'text/html' }));
  const field = page.getByLabel('Extension ID', { exact: true });
  await field.click();
  assert.equal(await field.inputValue(), id);
  assert.deepEqual(await field.evaluate(el => [el.selectionStart, el.selectionEnd]), [0, id.length]);
  assert.equal(await page.getByText('GAS Portal connection', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Query parameter sets', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByText('No pages yet.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByLabel('Page URL').fill('https://example.com/');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const frame = page.locator('iframe');
  await frame.waitFor();
  await frame.evaluate(el => { el.dataset.identity = 'retained'; });
  await openControls(page);
  await page.getByRole('button', { name: 'Extension settings', exact: true }).click();
  // Wait for the hidden cross-origin surface to leave Chromium's hit-test regions.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('button', { name: 'Close settings' }).click();
  await frame.waitFor({ state: 'visible' });
  assert.equal(await frame.getAttribute('data-identity'), 'retained');
});

test('Page cards support drag and keyboard reordering, persist order, and wrap long URLs', { timeout: 60000 }, async t => {
  const { page, context } = await extensionPage(t, 'en-US', 600);
  await context.route('https://**/*', route => route.fulfill({ body: '<p>Mock page</p>', contentType: 'text/html' }));
  await page.getByRole('heading', { name: 'My Portal Extension settings', exact: true }).waitFor();
  assert.ok(await page.locator('#extension-id').evaluate(el => el.clientWidth < el.parentElement.clientWidth));
  assert.ok(await page.locator('#extension-language').evaluate(el => el.clientWidth < el.parentElement.clientWidth));
  const longUrl = 'https://example.com/' + 'long-path-'.repeat(35) + '?mode=compact';
  await page.getByLabel('Page name', { exact: true }).fill('First');
  await page.getByLabel('Page URL', { exact: true }).fill(longUrl);
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  await page.getByLabel('Page name', { exact: true }).nth(1).fill('Second');
  await page.getByLabel('Page URL', { exact: true }).nth(1).fill('https://example.org/');
  // Bring both cards into view for a real HTML drag-and-drop gesture.
  await page.setViewportSize({ width: 600, height: 1200 });
  const handle = page.getByRole('button', { name: 'Reorder page Second', exact: true });
  await handle.dragTo(page.locator('.settings-card').first());
  assert.deepEqual(await page.getByLabel('Page name', { exact: true }).evaluateAll(inputs => inputs.map(input => input.value)), ['Second', 'First']);
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await page.getByLabel('Page name', { exact: true }).evaluateAll(inputs => inputs.map(input => input.value)), ['First', 'Second']);
  await page.keyboard.press('ArrowUp');
  assert.deepEqual(await page.getByLabel('Page name', { exact: true }).evaluateAll(inputs => inputs.map(input => input.value)), ['Second', 'First']);
  await page.setViewportSize({ width: 320, height: 800 });
  const url = page.getByLabel('Page URL', { exact: true }).nth(1);
  assert.equal(await url.evaluate(el => el.tagName), 'TEXTAREA');
  assert.ok(await url.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: '/tmp/my-portal-ext-wrap-reorder.png', fullPage: true });
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.locator('iframe').waitFor();
  assert.deepEqual(await page.locator('#page-switcher-options [data-part=item-text]').allTextContents(), ['Second', 'First']);
  await page.reload();
  await page.locator('iframe').waitFor();
  assert.deepEqual(await page.locator('#page-switcher-options [data-part=item-text]').allTextContents(), ['Second', 'First']);
  await openControls(page);
  await page.getByRole('button', { name: 'Extension settings', exact: true }).click();
  await page.getByLabel('Page URL', { exact: true }).first().fill('chrome://extensions/');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.getByRole('alert').filter({ hasText: 'Chrome internal pages' }).waitFor();
});

test('Blank page names stay editable and use the URL domain in the chooser and frame title', { timeout: 30000 }, async t => {
  const { page, context } = await extensionPage(t);
  await context.route('https://**/*', route => route.fulfill({ body: '<title>A different title</title><p>Example</p>', contentType: 'text/html' }));
  const name = page.getByLabel('Page name', { exact: true });
  assert.equal(await name.inputValue(), '');
  await page.getByLabel('Page URL', { exact: true }).fill('https://example.org/path');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const frame = page.locator('iframe');
  await frame.waitFor();
  assert.equal(await frame.getAttribute('title'), 'example.org');
  assert.deepEqual(await page.locator('#page-switcher-options [data-part=item-text]').allTextContents(), ['example.org']);
  await page.reload();
  await frame.waitFor();
  await openControls(page);
  // Keep this state-restoration check independent of Chromium's stale iframe hit-test regions.
  await page.getByRole('button', { name: 'Extension settings', exact: true }).focus();
  await page.getByRole('button', { name: 'Extension settings', exact: true }).press('Enter');
  assert.equal(await name.inputValue(), '');
  await page.getByLabel('Page URL', { exact: true }).fill('https://other.example/path');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.waitForFunction(() => document.querySelector('iframe')?.title === 'other.example');
  await openControls(page);
  // Keep this state-restoration check independent of Chromium's stale iframe hit-test regions.
  await page.getByRole('button', { name: 'Extension settings', exact: true }).focus();
  await page.getByRole('button', { name: 'Extension settings', exact: true }).press('Enter');
  await name.fill('My page');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.waitForFunction(() => document.querySelector('iframe')?.title === 'My page');
});

test('Visited pages keep their document state; reload, URL edits and deletion affect only the selected page', { timeout: 60000 }, async t => {
  const { page, context } = await extensionPage(t);
  const requests = [];
  await context.route('https://**/*', route => {
    requests.push(route.request().url());
    return route.fulfill({ body: '<!doctype html><input aria-label="Draft"><p>Page</p>', contentType: 'text/html' });
  });
  await page.getByLabel('Page name', { exact: true }).fill('One');
  await page.getByLabel('Page URL', { exact: true }).fill('https://one.example/');
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  await page.getByLabel('Page name', { exact: true }).nth(1).fill('Two');
  await page.getByLabel('Page URL', { exact: true }).nth(1).fill('https://two.example/');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const active = page.locator('iframe:not([hidden])');
  const draft = page.frameLocator('iframe:not([hidden])').getByLabel('Draft');
  await draft.fill('First draft');
  const firstUrl = await active.getAttribute('src');
  await active.evaluate(el => { el.dataset.identity = 'one'; });
  await openControls(page);
  await choosePage(page, { label: 'Two' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.title === 'Two');
  await draft.fill('Second draft');
  assert.equal(requests.length, 2, 'Only visited pages load');
  const secondUrl = await active.getAttribute('src');
  await openControls(page);
  await choosePage(page, { label: 'One' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.title === 'One');
  assert.equal(await draft.inputValue(), 'First draft');
  assert.equal(await active.getAttribute('src'), firstUrl);
  assert.equal(await active.getAttribute('data-identity'), 'one');
  assert.equal(await page.locator('iframe[hidden]').evaluate(el => el.inert), true);
  assert.equal(requests.length, 2, 'Switching back does not request the document again');
  await openControls(page);
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('iframe:not([hidden])')?.dataset.identity);
  await draft.waitFor();
  assert.equal(await draft.inputValue(), '');
  assert.equal(requests.length, 3);
  await openControls(page);
  await choosePage(page, { label: 'Two' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.title === 'Two');
  assert.equal(await draft.inputValue(), 'Second draft');
  assert.equal(await active.getAttribute('src'), secondUrl);
  await openControls(page);
  await page.getByRole('button', { name: 'Extension settings', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByLabel('Page name', { exact: true }).nth(1).fill('Renamed');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await active.waitFor();
  assert.equal(await draft.inputValue(), 'Second draft');
  assert.equal(requests.length, 3, 'Saving labels preserves all documents');
  await openControls(page);
  await page.getByRole('button', { name: 'Extension settings', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByLabel('Page URL', { exact: true }).first().fill('https://changed.example/');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await active.waitFor();
  assert.equal(await page.locator('iframe').count(), 1, 'An edited inactive page is unloaded, not eagerly fetched');
  assert.equal(await draft.inputValue(), 'Second draft');
  await openControls(page);
  await choosePage(page, { label: 'One' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.src === 'https://changed.example/');
  await draft.waitFor();
  assert.equal(await active.getAttribute('src'), 'https://changed.example/');
  await openControls(page);
  await page.getByRole('button', { name: 'Extension settings', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('button', { name: 'Remove page Renamed' }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await active.waitFor();
  assert.equal(await page.locator('iframe').count(), 1);
  assert.equal(await active.getAttribute('src'), 'https://changed.example/');
});

for (const locale of ['en-US', 'ja-JP']) test(`Bookmark import previews only the chosen folder, requires confirmation and preserves the frame (${locale})`, { timeout: 60000 }, async t => {
  const { page, context, id } = await extensionPage(t, locale, 320);
  const tr = key => i18n.t(key, locale.startsWith('ja') ? 'ja' : 'en');
  await context.route('https://**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'script.google.com') return route.fulfill({ contentType: 'text/html', body: '<iframe src="https://abc-script.googleusercontent.com/panel?panelNonce=' + url.searchParams.get('panelNonce') + '"></iframe>' });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><body>Mock portal<script>
      const nonce = new URL(location.href).searchParams.get('panelNonce');
      window.importCalls = [];
      top.postMessage({type:'gas-portal:side-panel-ready',nonce,capabilities:['bookmarks-v1']}, 'chrome-extension://${id}');
      addEventListener('message', event => {
        const request = event.data;
        if (event.origin !== 'chrome-extension://${id}' || request.nonce !== nonce || request.type !== 'my-portal:bookmarks-request') return;
        window.importCalls.push(request);
        const additions = request.payload.bookmarks.filter(item => item.url !== 'https://existing.test/').map((item,i) => ({...item,id:'chrome-'+i}));
        top.postMessage({type:'my-portal:bookmarks-response',nonce,requestId:request.requestId,result:{ok:true,additions,duplicates:1,invalid:0,received:request.payload.bookmarks.length,added:request.operation==='import'?additions.length:undefined,destination:{id:'sheet-1',sheetId:7,title:'Work links',name:'Links'}}}, event.origin);
      });
    </script>` });
  });
  await page.getByLabel(tr('Page URL')).fill(portalUrl);
  await page.getByRole('button', { name: tr('Save and connect') }).click();
  await page.waitForFunction(() => !document.getElementById('import-bookmarks').disabled);
  const iframe = await page.locator('iframe').getAttribute('src');
  await page.evaluate(() => {
    chrome.permissions.request = async () => false;
    chrome.bookmarks = { getTree: async () => [{id:'0',title:'',children:[{id:'1',title:'Work',children:[{id:'2',title:'New link',url:'https://new.test/'},{id:'3',title:'Already exists',url:'https://existing.test/'}]},{id:'4',title:'Private',children:[{id:'5',title:'Private entry',url:'https://private.test/'}]}]}] };
    globalThis.browser.bookmarks = chrome.bookmarks;
  });
  await openControls(page);
  await page.getByRole('button', { name: tr('Import bookmarks'), exact: true }).click();
  // Chromium must remove the hidden cross-origin surface from hit-test regions.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('button', { name: tr('Choose Chrome bookmarks') }).click();
  await page.getByRole('alert').filter({ hasText: tr('Bookmark access was not granted.') }).waitFor();
  await page.evaluate(() => { chrome.permissions.request = async () => true; });
  await page.getByRole('button', { name: tr('Choose Chrome bookmarks') }).click();
  await page.getByLabel(tr('Bookmark folder')).selectOption('1');
  await page.getByLabel(tr('Use folder names as tags')).check();
  await page.getByRole('button', { name: tr('Preview additions') }).click();
  await page.getByRole('link', { name: 'Work links / Links' }).waitFor();
  assert.equal(await page.locator('.bookmark-additions li').count(), 1);
  await page.screenshot({ path: `/tmp/bookmark-import-preview-${locale}.png`, fullPage: true });
  assert.ok(!await page.locator('#bookmark-import').textContent().then(text => text.includes('Private entry')));
  const frame = page.frames().find(f => f.url().startsWith('https://abc-script.googleusercontent.com/'));
  assert.equal(await frame.evaluate(() => window.importCalls.length), 1, 'Preview never writes');
  const request = await frame.evaluate(() => window.importCalls[0]);
  assert.equal(request.payload.bookmarks.length, 2);
  assert.deepEqual(request.payload.bookmarks[0].tags, ['Work']);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: tr('Export TSV') }).click();
  assert.equal((await downloaded).suggestedFilename(), 'links-bookmarks.tsv');
  await page.getByRole('button', { name: tr('Add to spreadsheet') }).click();
  await page.getByRole('heading', { name: tr('Import complete') }).waitFor();
  assert.equal(await frame.evaluate(() => window.importCalls[1].operation), 'import');
  assert.equal(await frame.evaluate(() => window.importCalls[1].payload.destination.id), 'sheet-1');
  await page.getByRole('button', { name: tr('Close import') }).click();
  assert.equal(await page.locator('iframe').getAttribute('src'), iframe, 'Import preserves the portal frame');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});


test('Local HTTP pages load through the packaged CSP and retain state across switches', { timeout: 60000 }, async t => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><input aria-label="Local draft"><p>Local preview</p>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { page } = await extensionPage(t);
  const port = server.address().port;
  const urls = [`http://localhost:${port}/#links`, `http://127.0.0.1:${port}/#links`, `http://preview.localhost:${port}/#links`];
  for (let i = 0; i < urls.length; i++) {
    if (i) await page.getByRole('button', { name: 'Add page', exact: true }).click();
    await page.getByLabel('Page name', { exact: true }).nth(i).fill('Local ' + i);
    await page.getByLabel('Page URL', { exact: true }).nth(i).fill(urls[i]);
  }
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const draft = page.frameLocator('iframe:not([hidden])').getByLabel('Local draft');
  await draft.fill('Keep my draft');
  for (let i = 1; i < urls.length; i++) {
    await openControls(page);
    await choosePage(page, { label: 'Local ' + i });
    await draft.waitFor();
    const request = new URL(await page.locator('iframe:not([hidden])').getAttribute('src'));
    assert.equal(request.searchParams.get('header'), 'external');
    request.search = '';
    assert.equal(request.href, urls[i]);
  }
  await openControls(page);
  await choosePage(page, { label: 'Local 0' });
  assert.equal(await draft.inputValue(), 'Keep my draft');
  assert.equal(await page.locator('#import-bookmarks').isDisabled(), true);
  await page.reload();
  await draft.waitFor();
  const restored = new URL(await page.locator('iframe:not([hidden])').getAttribute('src'));
  restored.search = '';
  assert.equal(restored.href, urls[0]);
});

for (const locale of ['en-US', 'ja-JP']) test(`Connected portal navigation replaces the inner header without reloading and follows internal changes (${locale})`, { timeout: 60000 }, async t => {
  const { page, context, id } = await extensionPage(t, locale, 320);
  const tr = key => i18n.t(key, locale.startsWith('ja') ? 'ja' : 'en');
  await context.route('https://**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'script.google.com') return route.fulfill({ contentType: 'text/html', body: '<iframe src="https://abc-script.googleusercontent.com/panel?panelNonce=' + url.searchParams.get('panelNonce') + '"></iframe>' });
    if (url.hostname !== 'abc-script.googleusercontent.com') return route.fulfill({ contentType: 'text/html', body: '<p>Generic page</p>' });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><header id="inner-header">Portal navigation</header><input aria-label="Draft"><button id="internal-settings">Settings link</button><button id="internal-pin">Pin calendar</button><script>
      const origin = 'chrome-extension://${id}', nonce = new URL(location.href).searchParams.get('panelNonce');
      const state = {selected:'links',pinned:false,attached:false,language:'en',tabs:['links','inbox-and-tasks','calendar','settings'].map((id,i)=>({id,label:['Links','Inbox & Tasks','Calendar','Settings'][i]}))};
      window.navState = state;
      const send = () => top.postMessage({type:'my-portal:navigation-state',nonce,state},origin);
      document.getElementById('internal-pin').onclick=()=>{state.pinned=!state.pinned;send();};
      document.getElementById('internal-settings').onclick=()=>{state.selected='settings';send();};
      window.setJapanese = () => {state.language='ja';state.tabs[2].label='カレンダー';state.tabs[3].label='設定';send();};
      addEventListener('message', event => {
        if(event.origin!==origin || event.source!==top || event.data?.nonce!==nonce || event.data.type!=='my-portal:navigation-command') return;
        const data=event.data;
        if(data.action==='connect') {state.attached=true;document.getElementById('inner-header').hidden=true;}
        else if(data.action==='disconnect') {state.attached=false;document.getElementById('inner-header').hidden=false;}
        else if(data.action==='select') state.selected=data.tab;
        else if(data.action==='pin') state.pinned=data.pinned;
        send();
      });
      top.postMessage({type:'gas-portal:side-panel-ready',nonce,capabilities:['navigation-v1','bookmarks-v1'],navigation:state},origin);
    </script>` });
  });
  await page.getByLabel(tr('Page URL')).fill(portalUrl);
  await page.getByRole('button', { name: tr('Add page'), exact: true }).click();
  await page.getByLabel(tr('Page URL')).nth(1).fill('https://example.com/');
  await page.getByRole('button', { name: tr('Save and connect') }).click();
  const frame = page.frameLocator('iframe:not([hidden])').frameLocator('iframe');
  await frame.locator('#inner-header').waitFor({ state: 'hidden' });
  const nav = page.locator('.portal-navigation');
  assert.equal(await nav.getByRole('radio').count(), 4);
  const src = await page.locator('iframe:not([hidden])').getAttribute('src');
  assert.equal(new URL(src).searchParams.get('header'), 'external');
  await frame.getByLabel('Draft').fill('Keep this draft');
  // Exercise keyboard navigation independently of Chromium's nested-frame pointer regions.
  const calendarTab = nav.getByRole('radio', { name: 'Calendar', exact: true });
  await calendarTab.focus();
  await calendarTab.press('Space');
  await page.waitForFunction(() => document.querySelector('.portal-navigation input:checked')?.getAttribute('aria-label')==='Calendar');
  await calendarTab.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.portal-navigation input:checked')?.getAttribute('aria-label')==='Portal settings');
  await nav.getByRole('radio', { name: 'Portal settings', exact: true }).press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('.portal-navigation input:checked')?.getAttribute('aria-label')==='Calendar');
  assert.equal(await page.locator('#portal-pin, .portal-pin').count(), 0);
  const marker = nav.locator('#portal-tab-calendar .calendar-pinned-mark');
  assert.equal(await marker.count(), 0);
  await frame.locator('#internal-pin').click();
  await marker.waitFor();
  assert.equal(await marker.getAttribute('aria-hidden'), 'true');
  await page.locator('#portal-tab-calendar').hover();
  const hint = page.getByRole('tooltip', { name: 'Calendar · pinned', exact: true });
  await hint.waitFor();
  assert.equal(await hint.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.mouse.move(0, 700);
  await frame.locator('#internal-pin').click();
  await marker.waitFor({ state: 'detached' });
  await frame.locator('#internal-pin').click();
  await marker.waitFor();
  await frame.locator('#internal-settings').click();
  await page.waitForFunction(() => document.querySelector('.portal-navigation input:checked')?.getAttribute('aria-label')==='Portal settings');
  assert.equal(await frame.getByLabel('Draft').inputValue(), 'Keep this draft');
  assert.equal(await page.locator('iframe:not([hidden])').getAttribute('src'), src);
  const inner = page.frames().find(f=>f.url().startsWith('https://abc-script.googleusercontent.com'));
  await inner.evaluate(()=>window.setJapanese());
  await nav.getByRole('radio', {name:'ポータルの設定',exact:true}).waitFor();
  await page.locator('#portal-tab-settings').hover();
  await page.getByRole('tooltip', {name:'ポータルの設定',exact:true}).waitFor();
  await page.mouse.move(0, 700);
  const before = await nav.locator('input:checked').getAttribute('aria-label');
  await page.evaluate(() => dispatchEvent(new MessageEvent('message', {origin:'https://evil.test',source:window,data:{type:'my-portal:navigation-state',nonce:'0'.repeat(32),state:{selected:'links'}}})));
  assert.equal(await nav.locator('input:checked').getAttribute('aria-label'), before);
  await openControls(page);
  await choosePage(page, {label:'example.com'});
  await nav.waitFor({state:'hidden'});
  await openControls(page);
  await choosePage(page, {index:0});
  await nav.waitFor();
  assert.equal(await frame.getByLabel('Draft').inputValue(), 'Keep this draft');
  await page.locator('#privacy-toggle').click();
  assert.equal(await nav.isVisible(), false);
  await page.waitForTimeout(450);
  await page.locator('#privacy-toggle').dblclick();
  await nav.waitFor();
  await openControls(page);
  await page.locator('#panel-controls').getByRole('button', {name:tr('Extension settings'),exact:true}).click();
  assert.equal(await nav.isVisible(), false);
  await page.getByRole('button', {name:tr('Close settings'),exact:true}).click();
  await nav.waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/tmp/portal-external-navigation-'+locale+'.png'});
});

test('An incomplete navigation handshake restores the portal header instead of stranding its controls', { timeout: 30000 }, async t => {
  const { page, context, id } = await extensionPage(t);
  await context.route('https://**/*', route => {
    const nonce = new URL(route.request().url()).searchParams.get('panelNonce');
    return route.fulfill({contentType:'text/html',body:`<header>Original navigation</header><script>
      const nonce='${nonce}',origin='chrome-extension://${id}';
      window.detached=false;
      addEventListener('message',event=>{if(event.data.action==='disconnect') window.detached=true;});
      top.postMessage({type:'gas-portal:side-panel-ready',nonce,capabilities:['navigation-v1'],navigation:{selected:'links',pinned:false,attached:false,language:'en',tabs:['links','inbox-and-tasks','calendar','settings'].map(id=>({id,label:id}))}},origin);
    </script>`});
  });
  await page.getByLabel('Page URL').fill(portalUrl);
  await page.getByRole('button',{name:'Save and connect'}).click();
  await page.locator('.portal-header').waitFor();
  await page.locator('.portal-header').waitFor({state:'hidden',timeout:10000});
  assert.equal(await page.frameLocator('iframe').locator('header').isVisible(),true);
  const frame=page.frames().find(f=>f.url().startsWith('https://script.google.com/'));
  await frame.waitForFunction(()=>window.detached);
  assert.equal(await page.locator('#import-bookmarks').isDisabled(),true);
});

for (const locale of ['en-US', 'ja-JP']) test(`Header menu supports dismissal, keyboard focus and blackout without revealing page details (${locale})`, { timeout: 30000 }, async t => {
  const { page, context } = await extensionPage(t, locale, 320);
  const tr = key => i18n.t(key, locale.startsWith('ja') ? 'ja' : 'en');
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="min-height:700px"><input aria-label="Draft"><p>Ordinary page header stays unchanged</p></body>' }));
  await page.getByLabel(tr('Page name'), { exact: true }).fill('Reference notes');
  await page.getByLabel(tr('Page URL')).fill('https://example.com/');
  await page.getByRole('button', { name: tr('Save and connect') }).click();
  const draft = page.frameLocator('iframe').getByLabel('Draft');
  await draft.fill('Preserve this');
  const menu = page.locator('#panel-controls');
  const trigger = page.locator('#panel-controls-toggle');
  assert.equal(await page.locator('.page-title').innerText(), 'Reference notes');
  assert.equal(await page.locator('footer, .portal-navigation, .extension-name').count(), 0);
  await trigger.hover();
  assert.equal(await menu.isVisible(), false, 'Hover alone never opens the controls');
  await trigger.focus();
  await trigger.press('Enter');
  await menu.waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#page-switcher').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.id === 'panel-controls-toggle');
  await openControls(page);
  await page.locator('.page-title').click();
  await menu.waitFor({ state: 'hidden' });
  await openControls(page);
  await page.mouse.click(20, 500);
  await menu.waitFor({ state: 'hidden' });
  await openControls(page);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `/tmp/my-portal-header-menu-${locale}.png` });
  // Session updates from another panel must also dismiss the top-layer menu.
  await page.evaluate(() => chrome.storage.session.set({ privacyMode: true }));
  await menu.waitFor({ state: 'hidden' });
  await page.locator('.page-title').waitFor({ state: 'hidden' });
  assert.equal(await trigger.isDisabled(), true);
  assert.equal(await page.locator('iframe').isVisible(), false);
  await page.locator('#privacy-toggle').dblclick();
  await draft.waitFor();
  assert.equal(await draft.inputValue(), 'Preserve this');
  assert.equal(await menu.isVisible(), false);
  await openControls(page);
  await menu.getByRole('button', { name: tr('Extension settings'), exact: true }).click();
  await menu.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: tr('Close settings') }).click();
  assert.equal(await draft.inputValue(), 'Preserve this');
});

test('Page dropdown uses themed options, preserves selection on save failure and supports keyboard dismissal', { timeout: 30000 }, async t => {
  const { page, context } = await extensionPage(t);
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<input aria-label="Draft">' }));
  await page.getByLabel('Page name', { exact: true }).fill('First');
  await page.getByLabel('Page URL').fill('https://one.example/');
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  await page.getByLabel('Page name', { exact: true }).nth(1).fill('Second');
  await page.getByLabel('Page URL').nth(1).fill('https://two.example/');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.locator('iframe').waitFor();
  await openControls(page);
  const chooser = page.locator('#page-switcher');
  await chooser.focus();
  await chooser.press('ArrowDown');
  await page.getByRole('listbox').waitFor();
  assert.equal(await page.getByRole('option', { name: 'First', exact: true }).getAttribute('aria-selected'), 'true');
  await page.screenshot({ path: '/tmp/my-portal-page-dropdown.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: '/tmp/my-portal-page-dropdown-dark.png', animations: 'disabled' });
  await page.emulateMedia({ colorScheme: 'light' });
  await chooser.press('Escape');
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#panel-controls').isVisible(), true);
  await page.evaluate(() => {
    window.restoreStorage = chrome.storage.local.set;
    chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); };
  });
  await choosePage(page, { label: 'Second' });
  await page.getByRole('alert').filter({ hasText: 'Could not save' }).waitFor();
  assert.equal(await chooser.inputValue(), 'First');
  assert.equal(await page.locator('iframe').count(), 1);
  await page.evaluate(() => { chrome.storage.local.set = window.restoreStorage; });
  await chooser.focus();
  await chooser.press('ArrowDown');
  await page.getByRole('listbox').waitFor();
  // Opening restores the selected highlight on the next animation frame.
  await page.locator('#page-switcher-options [role=option][data-highlighted]').filter({ hasText: 'First' }).waitFor();
  await chooser.press('End');
  await page.locator('#page-switcher-options [role=option][data-highlighted]').filter({ hasText: 'Second' }).waitFor();
  await chooser.press('Enter');
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.src === 'https://two.example/');
  await openControls(page);
  await chooser.click();
  await page.getByRole('listbox').waitFor();
  await page.evaluate(() => chrome.storage.session.set({ privacyMode: true }));
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('iframe:visible').count(), 0);
});
