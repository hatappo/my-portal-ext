import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyConfig, restoreConfig, validateConfig, normalizePageUrl, pageRequest, pageLabel } from '../extension/config.ts';
const nonce = 'a'.repeat(32);

test('Page URLs preserve ordinary queries and fragments while hiding GAS transport parameters', () => {
  assert.equal(normalizePageUrl(' https://example.com/?keep=1#section '), 'https://example.com/?keep=1#section');
  assert.equal(normalizePageUrl('https://example.com/?data={value}'), 'https://example.com/?data={value}');
  const gas = 'https://script.google.com/a/company.example/macros/s/test/exec';
  assert.equal(normalizePageUrl(gas + '?authuser=1&sidePanel=1&panelNonce={nonce}#calendar'), gas + '?authuser=1#calendar');
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/test', 'http://example.com', 'https://user:secret@example.com', 'https://{nonce}.example.com/', 'chrome://settings']) assert.equal(normalizePageUrl(url), null);
});
test('GAS connection parameters are generated internally and are never persisted or added to other sites', () => {
  for (const path of ['/macros/s/test/exec', '/macros/u/2/s/test/exec', '/a/macros/team.example/s/test/exec', '/a/team.example/macros/s/test/exec']) {
    const url = 'https://script.google.com' + path + '?authuser=2#links';
    const config = validateConfig({ pages: [{ id: 'page', name: '', url }], activePageId: 'page' });
    const request = new URL(pageRequest(config, nonce));
    assert.equal(request.searchParams.get('sidePanel'), '1'); assert.equal(request.searchParams.get('panelNonce'), nonce);
    assert.equal(request.searchParams.get('authuser'), '2'); assert.equal(request.hash, '#links');
    assert.equal(config.pages[0].url, url);
    assert.throws(() => pageRequest(config, 'invalid'));
  }
  assert.equal(pageRequest({ pages: [{ id: 'a', name: '', url: 'https://example.com/' }], activePageId: 'a' }, nonce), 'https://example.com/');
  assert.equal(pageRequest(emptyConfig(), nonce), null);
});
test('Previously stored GAS URLs become ordinary URLs when restored', () => {
  const url = 'https://script.google.com/macros/s/test/exec';
  const legacy = restoreConfig({ portalUrl: url + '?sidePanel=1&panelNonce={nonce}#links' });
  assert.equal(legacy.pages[0].url, url + '#links');
  assert.deepEqual(restoreConfig({ panelConfig: legacy }), legacy);
});
test('Page settings reject duplicates, allow blank names and recover a removed active page', () => {
  const config = { pages: [{ id: 'page', name: 'Example', url: 'https://example.com/' }], activePageId: 'page' };
  assert.throws(() => validateConfig({ ...config, pages: [...config.pages, ...config.pages] }));
  const blank = validateConfig({ ...config, pages: [{ ...config.pages[0], name: ' ' }] });
  assert.equal(blank.pages[0].name, '');
  assert.equal(pageLabel(blank.pages[0]), 'example.com');
  assert.equal(pageLabel({ ...blank.pages[0], url: 'https://other.example:8443/path?secret=hidden' }), 'other.example:8443');
  assert.equal(pageLabel({ ...blank.pages[0], name: 'Custom' }), 'Custom');
  assert.equal(validateConfig({ ...config, activePageId: 'deleted' }).activePageId, 'page');
  assert.throws(() => restoreConfig({ panelConfig: null }));
});


test('Local HTTP previews are allowed without granting GAS connection behavior', () => {
  for (const url of ['http://localhost:4173/#links', 'http://preview.localhost:8080/?x=1', 'http://127.0.0.1:4173/#settings', 'http://localhost/']) {
    assert.equal(normalizePageUrl(url), url);
    const config = validateConfig({ pages: [{ id: 'local', name: '', url }], activePageId: 'local' });
    assert.equal(pageRequest(config, nonce), url);
    assert.deepEqual(restoreConfig({ panelConfig: config }), config);
  }
  for (const url of ['http://localhost.example.com/', 'http://evillocalhost/', 'http://127.0.0.1.example.com/', 'http://192.168.1.1/', 'http://0.0.0.0/', 'http://user:secret@localhost/', 'ftp://localhost/']) {
    assert.equal(normalizePageUrl(url), null, url);
  }
});
