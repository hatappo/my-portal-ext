import { browser } from 'wxt/browser';
import { syncAutomatic } from './automatic';
import { COMMENT_DISPLAY_KEY, isCommentDisplayMode, readCommentDisplayMode } from './display';
import { i18n } from '../i18n.js';
import { pageKey, readComment, type PageComment } from './anchor';
export const COMMENT_PREFIX = 'page-comment:';
export type CommentDraft = { url?: string; tabId?: number; requestId: string; error?: string };
const ADD = 'my-portal-add-comment', SHOW = 'my-portal-show-comments';
let writeQueue = Promise.resolve();
async function records(page?: string): Promise<PageComment[]> {
  const saved = await browser.storage.local.get(null);
  return Object.entries(saved).flatMap(([key, value]) => {
    if (!key.startsWith(COMMENT_PREFIX)) return [];
    try { const record = readComment(value); return !page || pageKey(record.url) === page ? [record] : []; } catch { return []; }
  });
}
async function language() {
  const saved = await browser.storage.local.get('languagePreference');
  return i18n.resolve(saved.languagePreference, await browser.i18n.getAcceptLanguages());
}
async function draft(value: Omit<CommentDraft, 'requestId'>) {
  await browser.storage.session.set({ commentDraft: { ...value, requestId: crypto.randomUUID() } });
}
async function notifyTabs() {
  const mode = readCommentDisplayMode((await browser.storage.local.get(COMMENT_DISPLAY_KEY))[COMMENT_DISPLAY_KEY]);
  const pages = new Set((await records()).map(record => pageKey(record.url)));
  await Promise.all((await browser.tabs.query({})).map(async tab => {
    if (tab.id === undefined) return;
    let savedPage = false;
    try { savedPage = !!tab.url && pages.has(pageKey(tab.url)); } catch { /* Browser-internal pages are unsupported. */ }
    // Enabling comments also works on pages that were already open while hidden.
    if (mode !== 'hidden' && savedPage) await browser.scripting.executeScript({ target: {tabId: tab.id}, files: ['content-scripts/comments.js'] }).catch(() => {});
    await browser.tabs.sendMessage(tab.id, {type: 'my-portal:comments-refresh'}, {frameId: 0}).catch(() => {});
  }));
}
async function updateMenu() {
  const lang = await language();
  for (const id of [ADD, SHOW]) await browser.contextMenus.remove(id).catch(() => {});
  browser.contextMenus.create({ id: ADD, title: i18n.t('Add page comment', lang), contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
  browser.contextMenus.create({ id: SHOW, title: i18n.t('Show page comments', lang), contexts: ['page'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
}
export function setupCommentBackground() {
  // Scripts request only their current page; they cannot read extension settings directly.
  void browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const reconcile = () => { void records().then(syncAutomatic).catch(() => {}); };
  browser.runtime.onInstalled.addListener(() => { void updateMenu(); reconcile(); });
  browser.runtime.onStartup.addListener(() => { void updateMenu(); reconcile(); });
  browser.permissions.onRemoved.addListener(reconcile);
  browser.permissions.onAdded.addListener(reconcile);
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (![ADD, SHOW].includes(String(info.menuItemId)) || tab?.id === undefined) return;
    const tabId = tab.id;
    if (info.menuItemId === ADD) void browser.sidePanel.open({ tabId }).catch(() => {});
    void (async () => {
      if (info.frameId && info.frameId !== 0) throw new Error('Comments currently support top-level HTML pages only.');
      if (info.menuItemId === SHOW && readCommentDisplayMode((await browser.storage.local.get(COMMENT_DISPLAY_KEY))[COMMENT_DISPLAY_KEY]) === 'hidden') await browser.storage.local.set({[COMMENT_DISPLAY_KEY]: 'markers'});
      await browser.scripting.executeScript({ target: { tabId }, files: ['content-scripts/comments.js'] });
      if (info.menuItemId === SHOW) return;
      const result = await browser.tabs.sendMessage(tabId, { type: 'my-portal:comments-capture' }, { frameId: 0 });
      if (!result?.url) throw new Error(result?.error || 'Select some page text first.');
      await draft({ url: result.url, tabId });
    })().catch(error => draft({ tabId, error: error instanceof Error && ['Select some page text first.', 'The selected text cannot be linked reliably.', 'This page is too large to annotate.', 'Comments currently support top-level HTML pages only.'].includes(error.message) ? error.message : 'Could not access this page. Try a regular HTML page.' }));
  });
  browser.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== 'my-portal:comments') return;
    const panel = sender.id === browser.runtime.id && sender.url?.split(/[?#]/)[0] === `chrome-extension://${browser.runtime.id}/sidepanel.html`;
    let page: string | undefined;
    if (!panel && sender.id === browser.runtime.id && sender.tab?.id !== undefined && sender.frameId === 0 && sender.url) {
      try { page = pageKey(sender.url); } catch { /* Unsupported sender. */ }
    }
    if (!panel && !page) { reply({ ok: false, error: 'Comment access denied.' }); return; }
    if (page && message.operation === 'edit' && sender.tab?.id !== undefined) void browser.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    const run = async () => {
      if (message.operation === 'report' && page && Array.isArray(message.missing) && message.missing.length <= 1000 && message.missing.every((url: unknown) => typeof url === 'string' && url.length <= 24000 && pageKey(url) === page)) {
        await browser.storage.session.set({ commentPageStatus: { page, missing: message.missing, error: message.error === 'Could not display comments on this page.' ? message.error : '' } }); return {};
      }
      if (message.operation === 'list') { const items = await records(panel ? undefined : page); return { records: items, displayMode: readCommentDisplayMode((await browser.storage.local.get(COMMENT_DISPLAY_KEY))[COMMENT_DISPLAY_KEY]), language: await language() }; }
      if (message.operation === 'edit' && page && typeof message.url === 'string' && pageKey(message.url) === page) {
        if (!(await records(page)).some(record => record.url === message.url)) throw new Error('Comment access denied.');
        await draft({ url: message.url, tabId: sender.tab!.id }); return {};
      }
      if (!panel) throw new Error('Comment access denied.');
      if (message.operation === 'display-mode') {
        if (!isCommentDisplayMode(message.mode)) throw new Error('Invalid comment.');
        await browser.storage.local.set({[COMMENT_DISPLAY_KEY]: message.mode});
        return {};
      }
      if (message.operation === 'save' || message.operation === 'delete') {
        const action = async () => {
          const record = readComment(message.record), key = COMMENT_PREFIX + record.url;
          const current = (await browser.storage.local.get(key))[key] as PageComment | undefined;
          if ((current?.updatedAt ?? null) !== message.expectedRevision) throw new Error('This comment changed in another window. Reopen it before saving.');
          if (message.operation === 'delete') await browser.storage.local.remove(key);
          else await browser.storage.local.set({ [key]: { ...record, updatedAt: new Date().toISOString() } });
        };
        const write = writeQueue.then(action); writeQueue = write.catch(() => {}); await write; return {};
      }
      throw new Error('Comment access denied.');
    };
    void run().then(result => reply({ ok: true, ...result })).catch(error => reply({ ok: false, error: error instanceof Error && ['Comment access denied.', 'This comment changed in another window. Reopen it before saving.', 'Invalid comment.', 'Invalid comment URL.'].includes(error.message) ? error.message : 'Could not save or load comments. Please try again.' }));
    return true;
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.languagePreference) void updateMenu();
    if (changes.languagePreference || changes[COMMENT_DISPLAY_KEY] || Object.keys(changes).some(key => key.startsWith(COMMENT_PREFIX))) void notifyTabs();
    if (changes[COMMENT_DISPLAY_KEY] || Object.keys(changes).some(key => key.startsWith(COMMENT_PREFIX))) reconcile();
  });
}
