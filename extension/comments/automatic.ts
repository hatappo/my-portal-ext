import { browser } from 'wxt/browser';
import { pageKey, type PageComment } from './anchor';
import { COMMENT_DISPLAY_KEY, readCommentDisplayMode } from './display';
const SCRIPT_ID = 'my-portal-comments-auto';
/** Chrome site matches use exact hostnames (all ports), never wildcard subdomains. */
function sitePattern(url: string): string {
  const parsed = new URL(pageKey(url));
  return parsed.protocol + '//' + parsed.hostname + '/*';
}
let reconciliation = Promise.resolve();
export function syncAutomatic(records: PageComment[]): Promise<void> {
  const run = async () => {
    // Host access is required; execution is still limited to saved-comment sites.
    const mode = readCommentDisplayMode((await browser.storage.local.get(COMMENT_DISPLAY_KEY))[COMMENT_DISPLAY_KEY]);
    const matches = mode !== 'hidden' ? [...new Set(records.map(record => sitePattern(record.url)))].sort() : [];
    const existing = (await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }))[0];
    if (!matches.length) { if (existing) await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }); return; }
    const script = { id: SCRIPT_ID, matches, js: ['content-scripts/comments.js'], allFrames: false, runAt: 'document_idle' as const, persistAcrossSessions: true };
    if (!existing) await browser.scripting.registerContentScripts([script]);
    else if (JSON.stringify(existing.matches?.toSorted()) !== JSON.stringify(matches)) await browser.scripting.updateContentScripts([script]);
  };
  const next = reconciliation.then(run); reconciliation = next.catch(() => {}); return next;
}
