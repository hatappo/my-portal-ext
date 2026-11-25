import assert from 'node:assert/strict';
import { test } from 'node:test';
import { i18n } from '../extension/i18n.js';

test('Language follows browser preferences unless explicitly chosen, with an English fallback', () => {
  assert.equal(i18n.resolve('auto', ['ja-JP', 'en']), 'ja');
  assert.equal(i18n.resolve('auto', ['en-US', 'ja']), 'en');
  assert.equal(i18n.resolve('auto', ['fr']), 'en');
  assert.equal(i18n.resolve('en', ['ja-JP']), 'en');
  assert.equal(i18n.resolve('ja', ['en-US']), 'ja');
  assert.equal(i18n.t('My Portal Extension settings'), 'My Portal Extension settings');
  assert.equal(i18n.t('My Portal Extension settings', 'ja'), 'My Portal Extension 設定');
  assert.equal(i18n.t('Unknown message', 'ja'), 'Unknown message');
});

test('Bookmark import instructions and failures are localized', () => {
  for (const key of ['Import bookmarks', 'Use folder names as tags', 'Add to spreadsheet', 'Bookmark access was not granted.']) assert.notEqual(i18n.t(key, 'ja'), key);
});

test('Portal and extension settings have distinct localized names', () => {
  assert.equal(i18n.t('Portal settings', 'ja'), 'ポータルの設定');
  assert.equal(i18n.t('Extension settings', 'ja'), '拡張機能の設定');
  assert.equal(i18n.t('Portal settings', 'en'), 'Portal settings');
  assert.equal(i18n.t('Extension settings', 'en'), 'Extension settings');
});
