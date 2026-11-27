import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnchor, parseAnchor, findMatches, pageKey, quoteLabel, readComment } from '../extension/comments/anchor.ts';
const page = 'https://example.test/article?q=1#/section';
test('Short selections store the entire quote, escaping fragment grammar and retaining routes', () => {
  const text = 'Before A,B & C-D! After';
  const url = createAnchor(page, text, 7, 17);
  assert.equal(pageKey(url), page);
  assert.deepEqual(findMatches(text, parseAnchor(url)), [{ start: 7, end: 17 }]);
  assert.match(url, /%2C/); assert.match(url, /%26/); assert.match(url, /%2D/);
  assert.equal(quoteLabel(url), 'A,B & C-D!');
});
test('Long Japanese selections use 30-grapheme edges without persisting the full quote', () => {
  const text = '始まり' + 'あ'.repeat(60) + '途中'.repeat(70) + 'い'.repeat(60) + '終わり';
  const url = createAnchor(page, text, 0, text.length);
  const directive = parseAnchor(url);
  assert.equal([...directive.start].length, 30); assert.equal([...directive.end].length, 30);
  assert.ok(!url.includes(encodeURIComponent('途中')));
  assert.deepEqual(findMatches(text, directive), [{ start: 0, end: text.length }]);
});
test('Repeated quotes add standard context; stale or ambiguous anchors are not silently reassigned', () => {
  const text = 'First: same sentence. Second: same sentence.';
  const start = text.lastIndexOf('same');
  const url = createAnchor(page, text, start, text.length);
  assert.ok(parseAnchor(url).prefix);
  assert.deepEqual(findMatches(text, parseAnchor(url)), [{ start, end: text.length }]);
  assert.equal(findMatches('The selected text was deleted.', parseAnchor(url)).length, 0);
  assert.equal(findMatches('same sentence. same sentence.', { start: 'same sentence.' }).length, 2);
});
test('Grapheme clusters and whole-word edges survive URL round trips', () => {
  const text = ('🌿👨‍👩‍👧‍👦e\u0301').repeat(40) + '終わり';
  const url = createAnchor(page, text, 0, text.length);
  assert.deepEqual(findMatches(text, parseAnchor(url)), [{ start: 0, end: text.length }]);
  assert.equal(quoteLabel(createAnchor(page, 'hello wonderful world', 7, 12)), 'wonderful');
});
test('Records reject unsafe URLs, malformed selectors and invalid data; text remains plain text', () => {
  const record = { url: createAnchor(page, 'hello', 0, 5), comment: '<img src=x onerror=alert(1)>', updatedAt: new Date().toISOString() };
  assert.deepEqual(readComment(record), record);
  assert.deepEqual(readComment({ ...record, alwaysVisible: true }), record, 'Old per-comment display flags do not affect the record');
  for (const url of ['javascript:alert(1)', 'https://user:password@example.test/#:~:text=x', 'https://example.test/#:~:text=%XX', 'https://example.test/#:~:text=x&text=y']) assert.throws(() => readComment({ ...record, url }));
  assert.throws(() => readComment({ ...record, comment: '' }));
  assert.throws(() => readComment({ ...record, comment: 'x'.repeat(10001) }));
});

test('An ordinary page and its text fragment share the same page key', () => {
  const url = createAnchor('https://example.test/article', 'Hello world', 0, 11);
  assert.equal(pageKey(url), 'https://example.test/article');
  assert.equal(pageKey('https://example.test/article#'), 'https://example.test/article');
});

 test('Comment display modes default to markers and accept only the three documented values', async () => {
  const {readCommentDisplayMode,isCommentDisplayMode}=await import('../extension/comments/display.ts');
  for(const mode of ['hidden','markers','expanded']) { assert.ok(isCommentDisplayMode(mode)); assert.equal(readCommentDisplayMode(mode),mode); }
  for(const value of [undefined,null,true,'invalid']) { assert.equal(isCommentDisplayMode(value),false); assert.equal(readCommentDisplayMode(value),'markers'); }
});
