/** A per-frame channel; credentials never cross this boundary. */
export function isPortalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === 'https:' && !url.port &&
      (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com' || url.hostname.endsWith('-script.googleusercontent.com'));
  } catch { return false; }
}
export type PortalChannel = { source: Window; origin: string; nonce: string };
export function readyChannel(event: MessageEvent, nonce: string): PortalChannel | null {
  const data = event.data;
  if (!isPortalOrigin(event.origin) || !event.source || event.source === window || !/^[a-f0-9]{32}$/.test(nonce) ||
    data?.type !== 'gas-portal:side-panel-ready' || data.nonce !== nonce || !Array.isArray(data.capabilities) || !data.capabilities.includes('bookmarks-v1')) return null;
  return { source: event.source as Window, origin: event.origin, nonce };
}
export function requestPortal(channel: PortalChannel, operation: 'preview' | 'import', payload: unknown): Promise<unknown> {
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
