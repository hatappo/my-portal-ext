export interface PanelPage { id: string; name: string; url: string }
export interface PanelConfig { pages: PanelPage[]; activePageId: string }
export const emptyConfig = (): PanelConfig => ({ pages: [], activePageId: '' });

/** A display-only fallback: never overwrite an intentionally blank saved name. */
export function pageLabel(page: PanelPage): string {
  if (page.name.trim()) return page.name.trim();
  try { return new URL(page.url).host; } catch { return ''; }
}

/** Identify deployed GAS web apps, including both Workspace URL forms. */
export function isPortalUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.origin === 'https://script.google.com' && !url.username && !url.password &&
      /^\/(?:macros\/(?:u\/\d+\/)?|a\/(?:macros\/[^/]+\/|[^/]+\/macros\/))s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname);
  } catch { return false; }
}
/** Local development pages may negotiate UI navigation, never bookmark writes. */
export function isLocalPreviewUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname === '127.0.0.1');
  } catch { return false; }
}
/** Persist the ordinary page URL, never transport parameters or nonce templates. */
export function normalizePageUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname === '127.0.0.1');
    if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password) return null;
    if (isPortalUrl(url.href) || isLocalPreviewUrl(url.href)) {
      url.searchParams.delete('header');
      url.searchParams.delete('sidePanel');
      url.searchParams.delete('panelNonce');
    }
    if (/[{}]/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
export function validateConfig(input: PanelConfig): PanelConfig {
  if (!Array.isArray(input.pages) || input.pages.length > 20) throw new Error('You can save up to 20 pages.');
  const ids = new Set<string>();
  const pages = input.pages.map(page => {
    if (!page.id || ids.has(page.id) || typeof page.name !== 'string') throw new Error('Invalid page settings.');
    ids.add(page.id);
    if (/^chrome:/i.test(page.url.trim())) throw new Error('Chrome internal pages cannot be displayed in a side panel. Open them in a browser tab.');
    const url = normalizePageUrl(page.url);
    if (!url) throw new Error('Enter an HTTPS URL or a local HTTP URL (localhost or 127.0.0.1), without a username or password.');
    return { id: page.id, name: page.name.trim(), url };
  });
  return { pages, activePageId: pages.some(page => page.id === input.activePageId) ? input.activePageId : pages[0]?.id || '' };
}
/** Restore saved pages and normalize older GAS URLs at the boundary. */
export function restoreConfig(saved: { panelConfig?: unknown; portalUrl?: unknown }): PanelConfig {
  if (saved.panelConfig !== undefined) return validateConfig(saved.panelConfig as PanelConfig);
  if (typeof saved.portalUrl === 'string' && normalizePageUrl(saved.portalUrl)) {
    return validateConfig({ pages: [{ id: 'portal', name: 'My Portal', url: saved.portalUrl }], activePageId: 'portal' });
  }
  return emptyConfig();
}
export function pageRequest(config: PanelConfig, nonce: string): string | null {
  const page = config.pages.find(page => page.id === config.activePageId);
  if (!page) return null;
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid panel nonce');
  const url = new URL(page.url);
  if (isPortalUrl(page.url) || isLocalPreviewUrl(page.url)) {
    url.searchParams.set('header', 'external');
    url.searchParams.set('sidePanel', '1');
    url.searchParams.set('panelNonce', nonce);
  }
  return url.href;
}
