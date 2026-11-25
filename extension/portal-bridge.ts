import { isLocalPreviewUrl } from './config.ts';
/** A per-frame channel; credentials never cross this boundary. */
export function isPortalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === 'https:' && !url.port &&
      (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com' || url.hostname.endsWith('-script.googleusercontent.com'));
  } catch { return false; }
}
export type PortalChannel = { source: Window; origin: string; nonce: string; capabilities: string[] };
export function readyChannel(event: MessageEvent, nonce: string, previewOrigin?: string): PortalChannel | null {
  const data = event.data;
  const local = previewOrigin !== undefined;
  if (local && (!isLocalPreviewUrl(previewOrigin) || event.origin !== previewOrigin)) return null;
  if ((!local && !isPortalOrigin(event.origin)) || !event.source || event.source === window || !/^[a-f0-9]{32}$/.test(nonce) ||
    data?.type !== 'gas-portal:side-panel-ready' || data.nonce !== nonce || !Array.isArray(data.capabilities)) return null;
  const capabilities = ['navigation-v1', ...(!local ? ['bookmarks-v1'] : [])].filter(value => data.capabilities.includes(value));
  if (!capabilities.length) return null;
  return { source: event.source as Window, origin: event.origin, nonce, capabilities };
}
export const navigationTabs = ['links', 'inbox-and-tasks', 'calendar', 'settings'] as const;
export type NavigationTab = typeof navigationTabs[number];
export type NavigationState = { selected: NavigationTab; pinned: boolean; language: 'en' | 'ja'; attached: boolean; tabs: {id: NavigationTab; label: string}[] };
export function readNavigationState(value: unknown): NavigationState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as NavigationState;
  if (!navigationTabs.includes(state.selected) || typeof state.pinned !== 'boolean' || typeof state.attached !== 'boolean' ||
    !['en', 'ja'].includes(state.language) || !Array.isArray(state.tabs) || state.tabs.length !== navigationTabs.length ||
    !state.tabs.every((tab, index) => tab?.id === navigationTabs[index] && typeof tab.label === 'string' && tab.label.length > 0 && tab.label.length <= 100)) return null;
  return { selected: state.selected, pinned: state.pinned, attached: state.attached, language: state.language, tabs: state.tabs.map(({id,label}) => ({id,label})) };
}
export function matchesChannel(event: MessageEvent, channel: PortalChannel): boolean {
  return event.source === channel.source && event.origin === channel.origin && event.data?.nonce === channel.nonce;
}
export function sendNavigation(channel: PortalChannel, command: {action: 'connect' | 'disconnect'} | {action: 'select'; tab: NavigationTab} | {action: 'pin'; pinned: boolean}) {
  if (!channel.capabilities.includes('navigation-v1')) return;
  channel.source.postMessage({ type: 'my-portal:navigation-command', nonce: channel.nonce, ...command }, channel.origin);
}
export function requestPortal(channel: PortalChannel, operation: 'preview' | 'import', payload: unknown): Promise<unknown> {
  if (!channel.capabilities.includes('bookmarks-v1') || !isPortalOrigin(channel.origin)) return Promise.reject(new Error('Could not contact the portal. Reload it and try again.'));
  const requestId = randomNonce();
  return new Promise((resolve, reject) => {
    const finish = (result: unknown, error?: Error) => {
      clearTimeout(timer); window.removeEventListener('message', receive);
      if (error) reject(error); else resolve(result);
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== channel.source || event.origin !== channel.origin || event.data?.type !== 'my-portal:bookmarks-response' || event.data.nonce !== channel.nonce || event.data.requestId !== requestId) return;
      finish(event.data.result);
    };
    const timer = setTimeout(() => finish(null, new Error('The portal did not respond. Preview again before retrying an import.')), 60000);
    window.addEventListener('message', receive);
    try { channel.source.postMessage({ type: 'my-portal:bookmarks-request', nonce: channel.nonce, requestId, operation, payload }, channel.origin); }
    catch { finish(null, new Error('Could not contact the portal. Reload it and try again.')); }
  });
}
export function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
}
