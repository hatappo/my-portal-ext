import type { PageComment } from './anchor';
import { indexDocument, resolveAnchor } from './document';
import { i18n } from '../i18n.js';
import markerIcon from '../assets/comment-marker.svg?raw';
import type { CommentDisplayMode } from './display';
/** The host never changes the page's layout; comment content is always plain text. */
export function createOverlay(onedit: (url: string) => void) {
  const host = document.createElement('div'); host.dataset.myPortalComments = '';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{color-scheme:light;--comment-text:#1f2937;--card:#fff;--border:#dce1e5;--muted:#63717f;--hover:#f1f4f6}
    *{box-sizing:border-box}button{font:inherit;cursor:pointer;color:inherit}
    .marker{position:fixed;width:30px;height:30px;border:0;background:transparent;pointer-events:auto;display:grid;place-items:center;padding:0;filter:drop-shadow(0 2px 3px #22222218);border-radius:6px;transition:transform .16s ease,filter .16s ease}
    .marker svg{width:100%;height:100%}.marker:hover{transform:translateY(-1px);filter:drop-shadow(0 3px 5px #22222230)}
    .marker:focus-visible{outline:2px solid #9e773e;outline-offset:3px}
    .marker[aria-expanded=true]{filter:drop-shadow(0 2px 5px #98703940)}
    .bubble{font:400 15px/1.75 system-ui,"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;color:var(--comment-text);position:fixed;width:min(320px,calc(100vw - 24px));max-height:min(380px,calc(100vh - 24px));overflow:auto;padding:16px;background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:0 18px 48px -12px #18232f38,0 3px 12px #18232f14;pointer-events:auto;transform-origin:var(--origin-x,16px) var(--origin-y,0px);animation:arrive .2s cubic-bezier(.16,1,.3,1)}
    .bubble[hidden],.marker[hidden]{display:none}.body{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;line-height:1.75}
    .tools{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px;border-top:1px solid var(--border);padding-top:8px;font-size:12px;color:var(--muted)}
    .tools button{border:0;background:transparent;padding:4px 8px;border-radius:6px}.tools button:hover{background:var(--hover)}
    .tools button:focus-visible{outline:2px solid #9e773e;outline-offset:2px}
    @keyframes arrive{from{opacity:0;transform:scale(.76)}to{opacity:1;transform:scale(1)}}
    @media(prefers-color-scheme:dark){:host{--comment-text:#f1f5f9;--card:#222830;--border:#404851;--muted:#aab5c0;--hover:#323b45}}
    @media(prefers-reduced-motion:reduce){.bubble{animation:none}.marker{transition:none}}
  `;
  root.append(style); document.documentElement.append(host);
  const highlightStyle = document.createElement('style'); highlightStyle.dataset.myPortalComments = '';
  highlightStyle.textContent = '::highlight(my-portal-comments){background-color:#edc46655;text-decoration:underline;text-decoration-color:#b2893b}';
  document.head.append(highlightStyle);
  let language: 'en' | 'ja' = 'en';
  let layout = () => {};
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; layout(); }); };
  window.addEventListener('scroll', schedule, { capture: true, passive: true }); window.addEventListener('resize', schedule);
  const cleanups: (() => void)[] = [];
  const states = new Map<string, boolean>();
  const revisions = new Map<string, string>();
  let displayMode: CommentDisplayMode = 'hidden';
  function show(records: PageComment[], lang: 'en' | 'ja', mode: CommentDisplayMode) {
    if (displayMode !== mode) states.clear();
    displayMode = mode;
    const alwaysVisible = mode === 'expanded';
    language = lang;
    for (const cleanup of cleanups.splice(0)) cleanup();
    root.querySelectorAll('.marker,.bubble').forEach(element => element.remove());
    if (mode === 'hidden' || !records.length) { layout = () => {}; CSS.highlights.delete('my-portal-comments'); return []; }
    const index = indexDocument(), ranges: Range[] = [], entries: { range: Range; block: Element; marker: HTMLButtonElement; bubble: HTMLElement; expanded: () => boolean }[] = [];
    const missing: string[] = [];
    const t = (key: string) => i18n.t(key, language);
    for (const record of records) {
      if (revisions.get(record.url) !== record.updatedAt) states.delete(record.url);
      revisions.set(record.url, record.updatedAt);
      const range = resolveAnchor(index, record.url);
      if (!range) { missing.push(record.url); continue; }
      ranges.push(range);
      let block = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement!;
      while (block.parentElement && ['inline', 'contents'].includes(getComputedStyle(block).display)) block = block.parentElement;
      const marker = document.createElement('button'); marker.className = 'marker'; marker.type = 'button';
      marker.setAttribute('aria-label', t('Show comment')); marker.innerHTML = markerIcon;
      const bubble = document.createElement('section'); bubble.className = 'bubble'; bubble.setAttribute('aria-label', t('Page comment')); bubble.hidden = true; bubble.id = 'comment-' + crypto.randomUUID(); bubble.setAttribute('role', 'dialog'); marker.setAttribute('aria-controls', bubble.id); marker.setAttribute('aria-haspopup', 'dialog');
      const body = document.createElement('p'); body.className = 'body'; body.textContent = record.comment;
      const tools = document.createElement('div'); tools.className = 'tools';
      const edit = document.createElement('button'); edit.textContent = t('Edit'); edit.onclick = () => onedit(record.url);
      const close = document.createElement('button'); close.textContent = t('Close');
      tools.append(edit); if (!alwaysVisible) tools.append(close); bubble.append(body, tools); root.append(marker, bubble);
      let pinned = states.get(record.url) ?? false, hovered = false;
      let openTimer: ReturnType<typeof setTimeout>, closeTimer: ReturnType<typeof setTimeout>;
      const expanded = () => alwaysVisible || pinned || hovered;
      const update = () => { marker.setAttribute('aria-expanded', String(expanded())); schedule(); };
      const enter = () => { clearTimeout(closeTimer); openTimer = setTimeout(() => { hovered = true; update(); }, 150); };
      const leave = () => { clearTimeout(openTimer); closeTimer = setTimeout(() => { hovered = false; update(); }, 180); };
      marker.onmouseenter = enter; marker.onmouseleave = leave; bubble.onmouseenter = enter; bubble.onmouseleave = leave;
      marker.onclick = () => { if (alwaysVisible) return; pinned = !pinned; states.set(record.url, pinned); hovered = false; clearTimeout(openTimer); update(); };
      close.onclick = () => { pinned = false; hovered = false; states.set(record.url, false); clearTimeout(openTimer); clearTimeout(closeTimer); update(); marker.focus(); };
      bubble.onkeydown = event => { if (!alwaysVisible && event.key === 'Escape') { event.stopPropagation(); close.click(); } };
      cleanups.push(() => { clearTimeout(openTimer); clearTimeout(closeTimer); });
      entries.push({ range, block, marker, bubble, expanded }); update();
    }
    CSS.highlights.set('my-portal-comments', new Highlight(...ranges));
    layout = () => {
      for (const { range, block, marker, bubble, expanded } of entries) {
        const rect = Array.from(range.getClientRects()).find(rect => rect.width > 0 && rect.height > 0);
        const visible = rect && rect.bottom >= 0 && rect.top < innerHeight && rect.right >= 0 && rect.left < innerWidth;
        marker.hidden = !visible; bubble.hidden = !visible || !expanded();
        if (!rect || !visible) continue;
        // Avoid covering text immediately before a selection that begins mid-line.
        const above = rect.left < 38 || rect.left - block.getBoundingClientRect().left > 30;
        const x = Math.max(4, Math.min(innerWidth - 34, above ? rect.left : rect.left - 34));
        const y = Math.max(4, Math.min(innerHeight - 34, above ? rect.top - 32 : rect.top - 3));
        marker.style.left = x + 'px'; marker.style.top = y + 'px';
        const left = Math.max(12, Math.min(innerWidth - bubble.offsetWidth - 12, x));
        const top = Math.max(12, Math.min(innerHeight - bubble.offsetHeight - 12, Math.max(y + 36, rect.bottom + 6)));
        bubble.style.left = left + 'px'; bubble.style.top = top + 'px';
        bubble.style.setProperty('--origin-x', (x + 15 - left) + 'px');
        bubble.style.setProperty('--origin-y', (y + 15 - top) + 'px');
      }
    };
    schedule(); return missing;
  }
  return { show, clear() { layout = () => {}; for (const cleanup of cleanups.splice(0)) cleanup(); root.querySelectorAll('.marker,.bubble').forEach(element => element.remove()); CSS.highlights.delete('my-portal-comments'); }, destroy() {
    for (const cleanup of cleanups) cleanup(); cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule);
    CSS.highlights.delete('my-portal-comments'); host.remove(); highlightStyle.remove();
  } };
}
