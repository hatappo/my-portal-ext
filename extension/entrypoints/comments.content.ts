import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { pageKey, type PageComment } from '../comments/anchor';
import { selectionAnchor } from '../comments/document';
import { createOverlay } from '../comments/overlay';
import { readCommentDisplayMode, type CommentDisplayMode } from '../comments/display';
export default defineContentScript({
  // An empty match list prevents WXT from adding persistent host permissions.
  matches: [], registration: 'runtime',
  main(ctx) {
    if (window.top !== window || document.contentType !== 'text/html') return;
    const globals = globalThis as typeof globalThis & { myPortalCommentsActive?: boolean };
    if (globals.myPortalCommentsActive) return;
    globals.myPortalCommentsActive = true;
    let currentPage = pageKey(location.href), disposed = false, timer: ReturnType<typeof setTimeout>, generation = 0;
    let missing: string[] = [], renderError = '', lastReport = '';
    function report() {
      const value = JSON.stringify({ page: pageKey(location.href), missing, error: renderError });
      if (value === lastReport) return;
      lastReport = value;
      void browser.runtime.sendMessage({ type: 'my-portal:comments', operation: 'report', missing, error: renderError }).catch(() => {});
    }
    let records: PageComment[] = [], language: 'en' | 'ja' = 'en', displayMode: CommentDisplayMode = 'hidden';
    const overlay = createOverlay(url => { void browser.runtime.sendMessage({ type: 'my-portal:comments', operation: 'edit', url }); });
    const render = () => { try { missing = overlay.show(records, language, displayMode); renderError = ''; } catch { renderError = 'Could not display comments on this page.'; overlay.clear(); } report(); };
    async function load() {
      const request = ++generation;
      try {
        const result = await browser.runtime.sendMessage({ type: 'my-portal:comments', operation: 'list' });
        if (disposed || request !== generation) return;
        records = result?.ok ? result.records.filter((item: PageComment) => pageKey(item.url) === pageKey(location.href)) : [];
        language = result?.language === 'ja' ? 'ja' : 'en'; displayMode = result?.ok ? readCommentDisplayMode(result.displayMode) : 'hidden'; render();
      } catch { if (!disposed && request === generation) { records = []; overlay.clear(); } }
    }
    const receive = (message: { type?: string }, _sender: unknown, reply: (result: unknown) => void) => {
      if (message.type === 'my-portal:comments-capture') {
        try { reply({ url: selectionAnchor() }); } catch (error) { reply({ error: error instanceof Error ? error.message : 'Select some page text first.' }); }
      } else if (message.type === 'my-portal:comments-status') { reply({ missing, error: renderError, count: records.length });
      } else if (message.type === 'my-portal:comments-refresh') { void load(); reply({ ok: true }); }
    };
    browser.runtime.onMessage.addListener(receive);
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = pageKey(location.href);
        if (next !== currentPage) { currentPage = next; records = []; overlay.clear(); void load(); }
        else if (records.length) render();
      }, 400);
    };
    const observer = new MutationObserver(changes => {
      if (changes.some(change => change.type === 'characterData' || change.removedNodes.length || Array.from(change.addedNodes).some(node => !(node instanceof Element && node.hasAttribute('data-my-portal-comments'))))) changed();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    ctx.addEventListener(window, 'popstate', changed); ctx.addEventListener(window, 'hashchange', changed);
    ctx.addEventListener(window, 'wxt:locationchange', changed);
    void load();
    ctx.onInvalidated(() => { disposed = true; clearTimeout(timer); observer.disconnect(); browser.runtime.onMessage.removeListener(receive); overlay.destroy(); delete globals.myPortalCommentsActive; });
  },
});
