import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectBookmarks, bookmarkFolders, bookmarkTsv, importResult } from '../extension/bookmarks.ts';
import { isPortalOrigin, readyChannel, requestPortal, readNavigationState, matchesChannel, sendNavigation } from '../extension/portal-bridge.ts';
const tree = [{ id: '0', title: '', children: [{ id: '1', title: 'Work', children: [{ id: '2', title: 'A', url: 'https://a.test/' }, { id: '3', title: 'Sub,folder', children: [{ id: '4', title: 'B', url: 'https://b.test/' }] }] }, { id: '5', title: 'Private', children: [{ id: '6', title: 'Secret', url: 'https://private.test/' }] }] }];
test('Only the chosen folder and descendants are collected, with optional folder tags', () => {
  assert.equal(bookmarkFolders(tree).length, 3);
  assert.deepEqual(collectBookmarks(tree, '', true), []);
  assert.deepEqual(collectBookmarks(tree, '1', false).map(e => e.tags), [[], []]);
  const entries = collectBookmarks(tree, '1', true);
  assert.deepEqual(entries.map(e => e.name), ['A', 'B']);
  assert.deepEqual(entries[1].tags, ['Work', 'Sub folder']);
});
test('TSV protects formula-like titles and quotes tabs, quotes and newlines', () => {
  const text = bookmarkTsv([{ id: 'a', name: '=IMPORTXML("x")\nNext\tTab', url: 'https://a.test/', tags: ['Work'] }]);
  assert.match(text, /"'=IMPORTXML\(""x""\)\nNext\tTab"/);
  assert.equal(text.split('\n')[0], 'id\thidden\ttags\ticon\tname\turl\tdescription');
});
test('Bridge rejects non-GAS origins and malformed import responses', () => {
  for (const origin of ['https://evil.test', 'https://abc.googleusercontent.com', 'https://script.google.com.evil.test', 'null']) assert.equal(isPortalOrigin(origin), false);
  assert.ok(isPortalOrigin('https://abc-script.googleusercontent.com'));
  assert.throws(() => importResult({ ok: false, error: 'BOOKMARK_READ_FAILED' }), /BOOKMARK_READ_FAILED/);
  assert.throws(() => importResult({ ok: true, additions: [], destination: { id: '../escape', sheetId: 0 } }));
});

test('Import replies must match the bound frame, origin, nonce and request ID', async t => {
  const original = globalThis.window;
  const window = new EventTarget(); globalThis.window = window;
  t.after(() => { if (original === undefined) delete globalThis.window; else globalThis.window = original; });
  let sent;
  const source = { postMessage(message, origin) { sent = { message, origin }; } };
  const origin = 'https://abc-script.googleusercontent.com', nonce = 'a'.repeat(32);
  const ready = { source, origin, data: { type: 'gas-portal:side-panel-ready', nonce, capabilities: ['bookmarks-v1'] } };
  assert.equal(readyChannel({ ...ready, origin: 'https://evil.test' }, nonce), null);
  assert.equal(readyChannel({ ...ready, data: { ...ready.data, nonce: 'b'.repeat(32) } }, nonce), null);
  const channel = readyChannel(ready, nonce);
  let settled = false;
  const result = requestPortal(channel, 'preview', { bookmarks: [] }).then(result => { settled = true; return result; });
  assert.equal(sent.origin, origin); assert.equal(sent.message.operation, 'preview');
  const valid = { source, origin, data: { type: 'my-portal:bookmarks-response', nonce, requestId: sent.message.requestId, result: { ok: true } } };
  const dispatch = properties => { const event = new Event('message'); Object.assign(event, properties); window.dispatchEvent(event); };
  dispatch({ ...valid, source: {} }); dispatch({ ...valid, origin: 'https://evil.test' });
  dispatch({ ...valid, data: { ...valid.data, requestId: '0'.repeat(32) } });
  dispatch({ ...valid, data: { ...valid.data, nonce: '0'.repeat(32) } });
  await Promise.resolve(); assert.equal(settled, false);
  dispatch(valid); assert.deepEqual(await result, { ok: true });
});


test('Navigation state is bounded and local channels never receive bookmark authority', async t => {
  const previous = globalThis.window; globalThis.window = {};
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const nonce = 'a'.repeat(32), source = { postMessage() {} };
  const event = { source, origin: 'http://localhost:4173', data: { type: 'gas-portal:side-panel-ready', nonce, capabilities: ['navigation-v1', 'bookmarks-v1'] } };
  assert.equal(readyChannel(event, nonce), null);
  assert.equal(readyChannel(event, nonce, 'http://localhost:4174'), null);
  assert.equal(readyChannel({ ...event, origin: 'https://script.google.com' }, nonce, event.origin), null, 'A local page redirect must not acquire production capabilities');
  assert.equal(readyChannel({ ...event, origin: 'https://evil.test' }, nonce, 'https://evil.test'), null);
  const channel = readyChannel(event, nonce, event.origin);
  assert.deepEqual(channel.capabilities, ['navigation-v1']);
  await assert.rejects(requestPortal(channel, 'import', {}));
  assert.equal(matchesChannel(event, channel), true);
  assert.equal(matchesChannel({ ...event, source: {} }, channel), false);
  assert.equal(matchesChannel({ ...event, data: { ...event.data, nonce: 'b'.repeat(32) } }, channel), false);
  const state = { selected: 'links', language: 'ja', attached: false, pinned: false, tabs: ['links','inbox-and-tasks','calendar','settings'].map(id => ({ id, label: id })) };
  assert.deepEqual(readNavigationState(state), state);
  for (const invalid of [null, { ...state, selected: 'arbitrary' }, { ...state, attached: 'true' }, { ...state, tabs: [...state.tabs, state.tabs[0]] }, { ...state, tabs: state.tabs.map(tab => ({...tab,label:'x'.repeat(101)})) }]) assert.equal(readNavigationState(invalid), null);
  let sent; source.postMessage = (data, origin) => { sent = {data,origin}; };
  sendNavigation(channel, { action: 'select', tab: 'settings' });
  assert.equal(sent.origin, event.origin); assert.equal(sent.data.nonce, nonce);
});
