import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
const output = path.resolve('extension/.output/chrome-mv3');
const fixtureUrl = 'https://script.google.com/comments-fixture';
async function setup(t, locale = 'en-US') {
  const profile = mkdtempSync(path.join(tmpdir(), 'portal-comments-'));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 800, height: 800 }, locale, args: ['--disable-extensions-except=' + output, '--load-extension=' + output] });
  t.after(async () => { await context.close(); rmSync(profile, { recursive: true, force: true }); });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  await worker.evaluate(languagePreference => chrome.storage.local.set({languagePreference}), locale.startsWith('ja') ? 'ja' : 'en');
  await context.route('https://script.google.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><title>Comment fixture</title><style>body{font:18px/1.8 Georgia,serif;margin:80px;max-width:600px}p{margin:32px 0} .hide{display:none}</style></head><body><h1>A little room for ideas</h1><p>Make space for <strong id="quote">a thoughtful comment</strong> alongside your reading.</p><p id="multiline">A short <em>quotation</em><br>across lines.</p><p id="second">日本語の文章にもコメントを残せます。</p><p class="hide">Hidden text should not be included.</p><textarea>Private editing text</textarea><div style="height:1000px"></div></body></html>` }));
  const page = await context.newPage(); await page.goto(fixtureUrl);
  const panel = await context.newPage(); await panel.goto('chrome-extension://' + id + '/sidepanel.html');
  page.setDefaultTimeout(7000); panel.setDefaultTimeout(7000);
  // Exercise the production packaged content script on an already permitted host.
  // Native context-menu clicks / activeTab grants remain a manual Chrome smoke check.
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.includes('comments-fixture')).id);
  const inject = () => worker.evaluate(async tabId => chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/comments.js'] }), tabId);
  await inject();
  async function capture(selector = '#quote') {
    await page.locator(selector).evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); });
    const result = await worker.evaluate(async tabId => chrome.tabs.sendMessage(tabId, { type: 'my-portal:comments-capture' }), tabId);
    assert.ok(result.url, JSON.stringify(result));
    await panel.evaluate(({url,tabId}) => chrome.storage.session.set({ commentDraft: { url, tabId, requestId: crypto.randomUUID() } }), { url: result.url, tabId });
    return result.url;
  }
  return { context, worker, page, panel, tabId, inject, capture };
}

async function selectMode(panel, mode) {
  await panel.locator('#comment-mode-' + mode).click();
  await panel.waitForFunction(mode => {
    const input = document.querySelector('.comment-display-control input[value="' + mode + '"]');
    return input?.checked && !input.disabled;
  }, mode);
}

test('Selected text can be saved, hovered, pinned, edited and deleted without page markup injection', { timeout: 60000 }, async t => {
  const { page, panel, capture } = await setup(t);
  const errors = []; page.on('pageerror', error => errors.push(error.message)); panel.on('pageerror', error => errors.push(error.message));
  const url = await capture();
  assert.match(url, /text=a%20thoughtful%20comment/);
  await panel.getByLabel('Comment', { exact: true }).fill('A useful note.\n<img src=x onerror=alert(1)>');
  await panel.getByRole('button', { name: 'Save comment', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
  const marker = page.getByRole('button', { name: 'Show comment', exact: true });
  await marker.waitFor();
  const bubble = page.locator('[data-my-portal-comments] .bubble');
  assert.equal(await bubble.isVisible(), false);
  await marker.hover(); await bubble.waitFor();
  assert.match(await bubble.innerText(), /<img src=x onerror=alert\(1\)>/);
  assert.equal(await bubble.locator('img').count(), 0);
  await page.mouse.move(10, 10); await bubble.waitFor({ state: 'hidden' });
  await marker.click(); await bubble.waitFor(); await page.mouse.move(10, 10); assert.ok(await bubble.isVisible());
  await panel.setViewportSize({width:360,height:850});
  await panel.screenshot({ path: '/tmp/my-portal-comment-editor.png' });
  await bubble.evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  await page.screenshot({ path: '/tmp/my-portal-comment-bubble.png' });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await selectMode(panel, 'expanded');
  await panel.getByRole('button', { name: 'Save comment', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
  const saved = await panel.evaluate(() => chrome.storage.local.get(null));
  const [key, record] = Object.entries(saved).find(([key]) => key.startsWith('page-comment:'));
  assert.equal(key, 'page-comment:' + url);
  assert.deepEqual(Object.keys(record).sort(), ['comment','updatedAt','url']);
  assert.equal(saved.commentDisplayMode, 'expanded');
  panel.once('dialog', dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Delete', exact: true }).click();
  await marker.waitFor({ state: 'detached' });
  assert.equal((await panel.evaluate(key => chrome.storage.local.get(key), key))[key], undefined);
  assert.deepEqual(errors, []);
});

test('Comments return automatically after reload; stale selections never attach to unrelated text', { timeout: 40000 }, async t => {
  const { page, panel, capture, inject } = await setup(t);
  const url = await capture();
  await panel.getByLabel('Comment', { exact: true }).fill('Keep this note');
  await selectMode(panel, 'expanded');
  await panel.getByRole('button', { name: 'Save comment', exact: true }).click();
  await page.getByRole('button', { name: 'Show comment', exact: true }).waitFor();
  await page.reload();
  await page.locator('[data-my-portal-comments] .bubble').waitFor();
  await inject(); assert.equal(await page.locator('[data-my-portal-comments] .marker').count(), 1, 'Repeated activation is idempotent');
  await page.locator('#quote').evaluate(element => element.textContent = 'a different paragraph');
  await page.locator('[data-my-portal-comments] .marker').waitFor({ state: 'detached' });
  assert.ok((await panel.evaluate(() => chrome.storage.local.get(null)))['page-comment:' + url]);
  await panel.getByRole('status').filter({hasText:'The text could not be located'}).waitFor();
});

test('Japanese editor handles unsaved selections and rejects stale updates', { timeout: 40000 }, async t => {
  const { panel, capture } = await setup(t, 'ja-JP');
  const first = await capture();
  await panel.getByLabel('コメント', { exact: true }).fill('下書きを保持します');
  await capture('#second');
  await panel.getByRole('button', { name: '新しい選択箇所を開く' }).waitFor();
  assert.equal(await panel.getByLabel('コメント', { exact: true }).inputValue(), '下書きを保持します');
  await panel.getByRole('button', { name: 'コメントを保存', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: '保存しました' }).waitFor();
  const record = await panel.evaluate(async url => (await chrome.storage.local.get('page-comment:' + url))['page-comment:' + url], first);
  await panel.evaluate(record => chrome.storage.local.set({ ['page-comment:' + record.url]: { ...record, comment: 'Another editor', updatedAt: '2099-01-01T00:00:00.000Z' } }), record);
  await panel.getByLabel('コメント', { exact: true }).fill('Do not overwrite');
  await panel.getByRole('button', { name: 'コメントを保存', exact: true }).click();
  await panel.getByRole('alert').filter({ hasText: '別の画面で' }).waitFor();
  assert.equal((await panel.evaluate(async url => (await chrome.storage.local.get('page-comment:' + url))['page-comment:' + url], first)).comment, 'Another editor');
  panel.once('dialog', dialog => dialog.accept());
  await panel.locator('.comment-row').first().click();
  assert.equal(await panel.getByLabel('コメント', {exact:true}).inputValue(), 'Another editor');
});

test('Website scripts cannot access extension storage or cause saves through postMessage', { timeout: 30000 }, async t => {
  const { page, panel, capture, worker, tabId } = await setup(t);
  await capture();
  const result = await worker.evaluate(async tabId => chrome.scripting.executeScript({ target: { tabId }, func: async () => { try { await chrome.storage.local.get(null); return 'accessible'; } catch { return 'denied'; } } }), tabId);
  assert.equal(result[0].result, 'denied');
  await page.evaluate(() => window.postMessage({ type: 'my-portal:comments', operation: 'save', record: { comment: 'malicious' } }, '*'));
  assert.equal(Object.keys(await panel.evaluate(() => chrome.storage.local.get(null))).filter(key => key.startsWith('page-comment:')).length, 0);
});

test('Multiline selections retain word boundaries and page-scoped reads exclude other pages', { timeout: 30000 }, async t => {
  const { page, panel, capture, worker, tabId } = await setup(t);
  const url = await capture('#multiline');
  assert.match(decodeURIComponent(url), /text=A short quotation across lines\./);
  await panel.getByLabel('Comment', {exact:true}).fill('One note');
  await panel.getByRole('button', {name:'Save comment',exact:true}).click();
  await page.getByRole('button', {name:'Show comment',exact:true}).waitFor();
  await panel.evaluate(() => chrome.storage.local.set({'page-comment:https://example.test/#:~:text=secret': {url:'https://example.test/#:~:text=secret',comment:'Another page',updatedAt:new Date().toISOString()}}));
  const result = await worker.evaluate(async tabId => chrome.scripting.executeScript({target:{tabId},func:async()=>chrome.runtime.sendMessage({type:'my-portal:comments',operation:'list'})}), tabId);
  assert.equal(result[0].result.records.length, 1);
  assert.equal(result[0].result.records[0].url, url);
});

test('Opening comments from the menu dismisses the tooltip and moves focus into the screen', { timeout: 30000 }, async t => {
  const { panel } = await setup(t, 'ja-JP');
  const trigger = panel.getByRole('button', {name:'その他の操作',exact:true});
  await trigger.hover(); await panel.getByRole('tooltip').waitFor();
  await trigger.click(); await panel.locator('#panel-controls').waitFor(); await panel.screenshot();
  await panel.getByRole('button', {name:'ページコメント',exact:true}).click();
  await panel.locator('#page-comments').waitFor();
  await panel.mouse.move(100, 200);
  await panel.getByRole('tooltip').waitFor({state:'hidden'});
  assert.ok(await panel.evaluate(() => !!document.activeElement?.closest('#page-comments')));
});

test('One global body preference applies to existing and new notes without changing records or drafts', {timeout:40000}, async t => {
  const {panel, page, capture, inject, worker, tabId} = await setup(t);
  await capture();
  const toggle = panel.getByRole('radio', {name:'Show comment markers',exact:true});
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(),true,'Default is collapsed, even before saving any comments');
  await panel.getByLabel('Comment',{exact:true}).fill('First note');
  await panel.getByRole('button',{name:'Save comment',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Saved'}).waitFor();
  await capture('#second'); await panel.getByLabel('Comment',{exact:true}).fill('Second note');
  await panel.getByRole('button',{name:'Save comment',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Saved'}).waitFor();
  assert.equal(await panel.getByText('Always show the comment',{exact:true}).count(),0);
  const savedRecords = () => panel.evaluate(async()=>Object.fromEntries(Object.entries(await chrome.storage.local.get(null)).filter(([key])=>key.startsWith('page-comment:'))));
  const before = await savedRecords();
  await panel.getByLabel('Comment',{exact:true}).fill('Unsaved second note');
  await selectMode(panel,'expanded');
  await page.waitForFunction(()=>Array.from(document.querySelector('div[data-my-portal-comments]').shadowRoot.querySelectorAll('.bubble')).filter(el=>!el.hidden).length===2);
  assert.deepEqual(await savedRecords(),before,'The global preference never rewrites notes or revisions');
  assert.equal(await panel.getByLabel('Comment',{exact:true}).inputValue(),'Unsaved second note');
  assert.equal(await page.getByRole('button',{name:'Close',exact:true}).count(),0,'Global ON has no per-comment hiding override');
  await panel.getByRole('button',{name:'Save comment',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Saved'}).waitFor();
  await capture('#multiline'); await panel.getByLabel('Comment',{exact:true}).fill('New note inherits the preference');
  await panel.getByRole('button',{name:'Save comment',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Saved'}).waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelector('div[data-my-portal-comments]').shadowRoot.querySelectorAll('.bubble')).filter(el=>!el.hidden).length===3);
  await page.reload(); await inject();
  await page.waitForFunction(()=>Array.from(document.querySelector('div[data-my-portal-comments]').shadowRoot.querySelectorAll('.bubble')).filter(el=>!el.hidden).length===3);
  await panel.reload();
  // Restored draft opens the comments screen after the side panel reloads.
  await toggle.waitFor();
  assert.equal(await panel.getByRole('radio',{name:'Show comment text',exact:true}).isChecked(),true);
  await selectMode(panel,'markers');
  await page.waitForFunction(()=>Array.from(document.querySelector('div[data-my-portal-comments]').shadowRoot.querySelectorAll('.bubble')).every(el=>el.hidden));
  const denied = await worker.evaluate(async tabId => chrome.scripting.executeScript({target:{tabId},func:async()=>chrome.runtime.sendMessage({type:'my-portal:comments',operation:'display-mode',mode:'expanded'})}),tabId);
  assert.equal(denied[0].result.ok,false,'Page scripts cannot change the global preference');
  await page.getByRole('button',{name:'Show comment',exact:true}).first().hover();
  await page.locator('[data-my-portal-comments] .bubble').first().waitFor();
});

test('Three modes control restored comments, highlights and automatic registration on saved sites only', {timeout:40000}, async t=>{
  const {page,panel,capture,worker,context}=await setup(t);
  await capture('#multiline'); await panel.getByLabel('Comment',{exact:true}).fill('Automatically restored');
  await panel.getByRole('button',{name:'Save comment',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Saved'}).waitFor();
  const marker=page.getByRole('button',{name:'Show comment',exact:true}); await marker.waitFor();
  assert.equal(await worker.evaluate(()=>chrome.permissions.contains({origins:['http://*/*','https://*/*']})),true);
  // The marker follows the first line, never the last line of a multi-line selection.
  const markerBox=await marker.boundingBox(), quoteBox=await page.locator('#multiline').boundingBox();
  assert.ok(Math.abs(markerBox.y-quoteBox.y)<8);
  assert.ok(markerBox.x<quoteBox.x);
  assert.equal(await marker.locator('svg').count(),2,'Speech bubble contains the Alcove letter artwork');
  await page.reload(); await marker.waitFor();
  let scripts=await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts());
  assert.equal(scripts.length,1); assert.deepEqual(scripts[0].matches,['https://script.google.com/*']);
  assert.equal(scripts[0].persistAcrossSessions,true); assert.equal(scripts[0].allFrames,false);
  await context.route('https://example.test/**',route=>route.fulfill({body:'<p>Unrelated site</p>',contentType:'text/html'}));
  const unrelated=await context.newPage(); await unrelated.goto('https://example.test/');
  assert.equal(await unrelated.locator('[data-my-portal-comments]').count(),0);
  await selectMode(panel,'hidden');
  await marker.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>CSS.highlights.has('my-portal-comments')),false);
  await page.reload(); assert.equal(await page.locator('div[data-my-portal-comments]').count(),0);
  // Selecting visible injects into this already-open page without a reload.
  await selectMode(panel,'markers'); await marker.waitFor();
  assert.equal(await page.locator('[data-my-portal-comments] .bubble').isVisible(),false);
  await marker.click(); await page.locator('[data-my-portal-comments] .bubble').waitFor();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await selectMode(panel,'expanded'); await page.locator('[data-my-portal-comments] .bubble').waitFor();
  await page.locator('[data-my-portal-comments] .bubble').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  await page.screenshot({path:'/tmp/my-portal-comment-popover.png'});
});

test('Invalid display modes and untrusted changes are rejected', {timeout:30000}, async t=>{
  const {panel,worker,tabId}=await setup(t);
  for(const mode of ['invalid',true,null]) {
    const result=await panel.evaluate(mode=>chrome.runtime.sendMessage({type:'my-portal:comments',operation:'display-mode',mode}),mode);
    assert.equal(result.ok,false);
  }
  const result=await worker.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>chrome.runtime.sendMessage({type:'my-portal:comments',operation:'display-mode',mode:'hidden'})}),tabId);
  assert.equal(result[0].result.ok,false);
});

test('Header display modes work outside comments, synchronize panels and retain selection on failure', {timeout:30000}, async t=>{
  const {panel,context}=await setup(t);
  await panel.getByRole('radio',{name:'Show comment markers',exact:true}).waitFor();
  assert.equal(await panel.locator('#page-comments').count(),0);
  assert.equal(await panel.locator('.extension-header .comment-display-control').getByRole('radio').count(),3);
  await selectMode(panel,'expanded');
  const other=await context.newPage(); await other.goto(panel.url());
  await other.waitForFunction(()=>document.querySelector('.comment-display-control input[value="expanded"]')?.checked);
  await selectMode(other,'hidden');
  await panel.waitForFunction(()=>document.querySelector('.comment-display-control input[value="hidden"]')?.checked);
  await panel.evaluate(()=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=message=>message.operation==='display-mode'?Promise.resolve({ok:false}):send(message);});
  await panel.getByRole('radio',{name:'Hide comments',exact:true}).press('ArrowRight');
  await panel.getByRole('alert').filter({hasText:'Could not save comment display settings'}).waitFor();
  assert.equal(await panel.getByRole('radio',{name:'Hide comments',exact:true}).isChecked(),true);
  await panel.locator('#privacy-toggle').click();
  assert.equal(await panel.locator('.comment-display-control').isVisible(),false);
  assert.equal(await panel.getByRole('alert').count(),0);
});


test('Comment text remains readable in both light and dark appearances', {timeout:30000}, async t=>{
  const {page,panel,capture}=await setup(t,'ja-JP');
  await capture(); await panel.getByLabel('コメント',{exact:true}).fill('読みやすさを確認するコメント本文です。\n次の行もはっきり読めるように表示します。');
  await panel.getByRole('button',{name:'コメントを保存',exact:true}).click();
  await selectMode(panel,'expanded');
  const body=page.locator('[data-my-portal-comments] .body'); await body.waitFor();
  const samples=[];
  for(const scheme of ['light','dark']) {
    await page.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});
    const sample=await body.evaluate(el=>{
      const text=getComputedStyle(el), card=getComputedStyle(el.closest('.bubble'));
      const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(channel=>{const c=channel/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
      const foreground=luminance(text.color),background=luminance(card.backgroundColor);
      return {color:text.color,background:card.backgroundColor,fontSize:parseFloat(text.fontSize),lineHeight:parseFloat(text.lineHeight),contrast:(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)};
    });
    samples.push({scheme,...sample});
    await page.screenshot({path:'/tmp/my-portal-comment-text-'+scheme+'.png'});
  }
  t.diagnostic(JSON.stringify(samples));
  for(const sample of samples) {
    assert.ok(sample.contrast>=7,`${sample.scheme}: text contrast is ${sample.contrast.toFixed(2)}`);
    assert.ok(sample.fontSize>=14,`${sample.scheme}: body text is too small`);
    assert.ok(sample.lineHeight>=sample.fontSize*1.6);
  }
});
