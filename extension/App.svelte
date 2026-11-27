<script lang="ts">
  import { AppBar, Popover } from '@skeletonlabs/skeleton-svelte';
  import Hint from './Hint.svelte';
  import { tooltipAttributes } from './tooltip-attributes';
  import { i18n } from './i18n.js';
  import { onMount, tick } from 'svelte';
  import PortalNavigation from './PortalNavigation.svelte';
  import PageSwitcher from './PageSwitcher.svelte';
  import { browser } from 'wxt/browser';
  import externalLinkIcon from './assets/external-link.svg?raw';
  import refreshIcon from './assets/refresh-cw.svg?raw';
  import settingsIcon from './assets/settings.svg?raw';
  import lightbulbIcon from './assets/lightbulb.svg?raw';
  import lightbulbOffIcon from './assets/lightbulb-off.svg?raw';
  import BookmarkImport from './BookmarkImport.svelte';
  import CommentsPanel from './CommentsPanel.svelte';
  import CommentVisibility from './CommentVisibility.svelte';
  import type { CommentDraft } from './comments/background';
  import { readyChannel, requestPortal, randomNonce, matchesChannel, readNavigationState, sendNavigation, type NavigationState, type NavigationTab, type PortalChannel } from './portal-bridge';
  import ConnectionSettings from './ConnectionSettings.svelte';
  import { emptyConfig, restoreConfig, pageRequest, pageLabel, isPortalUrl, isLocalPreviewUrl, type PanelConfig } from './config';
  let commenting = $state(false), commentDraft = $state<CommentDraft | null>(null);
  let languagePreference = $state<'auto' | 'ja' | 'en'>('auto');
  let browserLanguages = $state(Array.from(navigator.languages));
  let languageBusy = $state(false);
  let languageStatus = $state('');
  const language = $derived(i18n.resolve(languagePreference, browserLanguages));
  $effect(() => { document.documentElement.lang = language; });
  const t = (key: string) => i18n.t(key, language);
  const extensionId = browser.runtime.id;
  // Conceal content until the session preference has been restored: no startup flash.
  let privacyMode = $state(true), privacyReady = $state(false), privacyBusy = $state(false);
  let privacyError = $state('');
  let lastPrivacyClick: number | undefined;
  let controlsOpen = $state(false);
  function closeControls() { controlsOpen = false; }
  $effect(() => {
    const open = controlsOpen && !concealed;
    void tick().then(() => {
      if (open !== (controlsOpen && !concealed)) return;
      const layer = document.getElementById('panel-controls-layer');
      // Keep the menu above cross-origin iframe compositor surfaces.
      if (open) layer?.showPopover(); else layer?.hidePopover();
    });
  });
  function controlsFinalFocus() {
    // Preserve focus if another action already moved it while the popover closed.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !active.closest('#panel-controls')) return active;
    return document.getElementById('panel-controls-toggle');
  }
  $effect(() => { if (concealed) closeControls(); });
  const concealed = $derived(!privacyReady || privacyMode);
  const privacyLabel = $derived(t(privacyMode ? 'Double-click to show content' : 'Click to hide content'));
  async function togglePrivacy(event: MouseEvent) {
    if (!privacyReady || privacyBusy) return;
    const now = performance.now();
    if (privacyMode && (lastPrivacyClick === undefined || now - lastPrivacyClick > 400)) {
      // Do not treat the second click of a hide gesture as the start of a reveal.
      if (event.detail < 2) lastPrivacyClick = now;
      return;
    }
    lastPrivacyClick = undefined;
    const next = !privacyMode;
    privacyBusy = true;
    privacyError = '';
    // Hiding is immediate; showing waits for a successful save.
    privacyMode = true;
    try {
      await browser.storage.session.set({ privacyMode: next });
      privacyMode = next;
    } catch {
      privacyMode = true;
      privacyError = 'Could not save visibility. Content remains hidden. Double-click to try again.';
    } finally { privacyBusy = false; }
  }
  let config = $state<PanelConfig>(emptyConfig());
  const activePage = $derived(config.pages.find(page => page.id === config.activePageId));
  let frames = $state<{ id: string; sourceUrl: string; url: string; version: number; nonce: string }[]>([]);
  let importing = $state(false);
  // Cross-origin Window handles must never be wrapped in a deep reactive proxy.
  let channels = $state.raw<Record<string, PortalChannel>>({});
  const activeChannel = $derived(activePage ? channels[activePage.id] : undefined);
  let navigation = $state<Record<string, NavigationState>>({});
  const activeNavigation = $derived(activePage ? navigation[activePage.id] : undefined);
  const canImport = $derived(Boolean(activeChannel?.capabilities.includes('bookmarks-v1')));
  const navigationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  function clearNavigationTimer(id: string) { clearTimeout(navigationTimers.get(id)); navigationTimers.delete(id); }
  function forgetNavigation(id: string) { clearNavigationTimer(id); navigation = Object.fromEntries(Object.entries(navigation).filter(([key]) => key !== id)); }
  function commandNavigation(command: {action: 'select'; tab: NavigationTab}) {
    if (!activeChannel || concealed || editing || importing || commenting || !activePage) return;
    try { sendNavigation(activeChannel, command); }
    catch { forgetNavigation(activePage.id); }
  }
  let frameVersion = 0;
  const frameUrl = $derived(frames.find(frame => frame.id === config.activePageId)?.url || '');
  let editing = $state(true), error = $state(''), busy = $state(true), loaded = $state(false);
  function connect(force = false) {
    // Retain visited pages. Removed pages or edited URLs discard only their own frame.
    frames = frames.filter(frame => config.pages.some(page => page.id === frame.id && page.url === frame.sourceUrl));
    for (const id of Object.keys(navigation)) if (!frames.some(frame => frame.id === id)) forgetNavigation(id);
    channels = Object.fromEntries(Object.entries(channels).filter(([id]) => frames.some(frame => frame.id === id)));
    if (!activePage || (!force && frames.some(frame => frame.id === activePage.id))) return;
    const nonce = randomNonce();
    const url = pageRequest(config, nonce);
    if (!url) return;
    forgetNavigation(activePage.id);
    const next = { id: activePage.id, sourceUrl: activePage.url, url, version: ++frameVersion, nonce };
    channels = Object.fromEntries(Object.entries(channels).filter(([id]) => id !== next.id));
    const existing = frames.findIndex(frame => frame.id === next.id);
    if (existing >= 0) frames[existing] = next;
    else frames.push(next);
  }
  async function bookmarkRequest(operation: 'preview' | 'import', payload: unknown) {
    const channel = activeChannel;
    const id = config.activePageId;
    if (!channel || concealed) throw new Error('Could not contact the portal. Reload it and try again.');
    const result = await requestPortal(channel, operation, $state.snapshot(payload));
    if (config.activePageId !== id || channels[id]?.nonce !== channel.nonce) throw new Error('The destination changed. Preview again before importing.');
    return result;
  }
  function closeSettings() { editing = false; }
  async function saveConfig(next: PanelConfig) {
    busy = true;
    try {
      await browser.storage.local.set({ panelConfig: next });
      config = next;
      error = '';
      editing = next.pages.length === 0;
      connect();
    } catch { throw new Error('Could not save the connection. Try again.'); }
    finally { busy = false; }
  }
  async function switchPage(id: string) {
    if (busy || !config.pages.some(page => page.id === id)) return;
    busy = true;
    try {
      const next = { ...$state.snapshot(config), activePageId: id };
      await browser.storage.local.set({ panelConfig: next });
      config = next;
      error = '';
      connect();
      closeControls();
    } catch {
      error = 'Could not save the connection. Try again.';
    } finally { busy = false; }
  }
  function openTab() {
    if (activePage) void browser.tabs.create({ url: activePage.url }).catch(() => { error = 'Could not open the page.'; });
  }
  async function saveLanguage(event: Event) {
    const input = event.currentTarget as HTMLSelectElement;
    const next = input.value;
    if (next !== 'auto' && next !== 'ja' && next !== 'en') return;
    if (languageBusy || busy) { input.value = languagePreference; return; }
    languageBusy = true;
    languageStatus = '';
    try {
      await browser.storage.local.set({ languagePreference: next });
      languagePreference = next;
      languageStatus = 'Saved';
    } catch {
      input.value = languagePreference;
      languageStatus = 'Could not save the language. Please try again.';
    } finally { languageBusy = false; }
  }
  onMount(() => {
    const updateBrowserLanguage = () => { browserLanguages = Array.from(navigator.languages); };
    window.addEventListener('languagechange', updateBrowserLanguage);
    const receiveReady = (event: MessageEvent) => {
      const frame = frames.find(frame => frame.nonce === event.data?.nonce && (isPortalUrl(frame.sourceUrl) || isLocalPreviewUrl(frame.sourceUrl)));
      if (!frame) return;
      const previous = channels[frame.id];
      if (event.data?.type === 'my-portal:navigation-state') {
        if (!previous || !matchesChannel(event, previous) || !previous.capabilities.includes('navigation-v1')) return;
        const state = readNavigationState(event.data.state);
        if (!state) return;
        clearNavigationTimer(frame.id);
        if (state.attached) navigation = { ...navigation, [frame.id]: state };
        else forgetNavigation(frame.id);
        return;
      }
      const local = isLocalPreviewUrl(frame.sourceUrl);
      if (local && !Array.from(document.querySelectorAll('iframe')).some(el => el.src === frame.url && el.contentWindow === event.source)) return;
      const channel = readyChannel(event, frame.nonce, local ? new URL(frame.sourceUrl).origin : undefined);
      if (!channel || (previous && previous.source !== channel.source)) return;
      channels = { ...channels, [frame.id]: channel };
      const state = channel.capabilities.includes('navigation-v1') ? readNavigationState(event.data.navigation) : null;
      if (!state) return;
      navigation = { ...navigation, [frame.id]: state };
      // Render controls before asking the portal to hide its own header.
      void tick().then(() => {
        if (disposed || channels[frame.id] !== channel) return;
        clearNavigationTimer(frame.id);
        navigationTimers.set(frame.id, setTimeout(() => {
          forgetNavigation(frame.id);
          try { sendNavigation(channel, { action: 'disconnect' }); } catch { /* Header remains available if negotiation never succeeded. */ }
        }, 5000));
        try { sendNavigation(channel, { action: 'connect' }); }
        catch { forgetNavigation(frame.id); }
      });
    };
    window.addEventListener('message', receiveReady);
    let disposed = false;
    let privacyChanged = false;
    const syncPrivacy = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'session' || !changes.privacyMode) return;
      privacyChanged = true;
      lastPrivacyClick = undefined;
      privacyMode = changes.privacyMode.newValue !== false;
    };
    browser.storage.onChanged.addListener(syncPrivacy);
    const receiveCommentDraft = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'session' || !changes.commentDraft?.newValue) return;
      commentDraft = changes.commentDraft.newValue as CommentDraft; commenting = true; closeControls();
    };
    browser.storage.onChanged.addListener(receiveCommentDraft);
    void browser.storage.session.get('commentDraft').then(saved => {
      if (!disposed && !commentDraft && saved.commentDraft) { commentDraft = saved.commentDraft as CommentDraft; commenting = true; }
    }).catch(() => {});
    void browser.storage.session.get('privacyMode').then(saved => {
      if (!disposed && !privacyChanged) privacyMode = saved.privacyMode === true;
    }).catch(() => {
      if (!disposed) privacyError = 'Could not restore visibility. Content remains hidden. Double-click to show it.';
    }).finally(() => { if (!disposed) privacyReady = true; });
    void browser.storage.local.get(['panelConfig', 'portalUrl', 'languagePreference']).then(saved => {
      if (disposed) return;
      languagePreference = i18n.preference(saved.languagePreference);
      config = restoreConfig(saved);
      loaded = true;
      if (config.pages.length) { editing = false; connect(); }
    }).catch(() => { if (!disposed) error = 'Could not read the saved settings. Reload the panel to try again.'; })
      .finally(() => { if (!disposed) busy = false; });
    return () => {
      disposed = true;
      for (const channel of Object.values(channels)) { try { sendNavigation(channel, { action: 'disconnect' }); } catch { /* Frame may have gone away. */ } }
      for (const id of navigationTimers.keys()) clearNavigationTimer(id);
      window.removeEventListener('languagechange', updateBrowserLanguage);
      window.removeEventListener('message', receiveReady);
      browser.storage.onChanged.removeListener(syncPrivacy);
      browser.storage.onChanged.removeListener(receiveCommentDraft);
    };
  });
</script>

<Popover open={controlsOpen && !concealed} onOpenChange={event => { controlsOpen = event.open && !concealed; }}
  ids={{ trigger: 'panel-controls-toggle', content: 'panel-controls', positioner: 'panel-controls-layer' }} autoFocus={false} finalFocusEl={controlsFinalFocus} portalled={false}
  positioning={{ placement: 'bottom-end', gutter: 8, overflowPadding: 8, strategy: 'fixed' }}>
<AppBar class={'extension-header' + (concealed ? ' concealed' : '')}>
  <AppBar.Toolbar class="header-toolbar">
  <AppBar.Headline class="header-content" inert={concealed} aria-hidden={concealed}>
    {#if !editing && !importing && !commenting && activeNavigation}
      <PortalNavigation state={activeNavigation} onselect={tab => commandNavigation({ action: 'select', tab })} />
    {:else}
      <span class="page-title" title={activePage ? pageLabel(activePage) : ''}>{commenting ? t('Page comments') : editing ? t('Extension settings') : importing ? t('Import bookmarks') : activePage ? pageLabel(activePage) : ''}</span>
    {/if}
  </AppBar.Headline>
  <AppBar.Trail class="header-actions" aria-label={t('Side panel controls')}>
    <CommentVisibility {t} {concealed} disabled={controlsOpen} />
    <Hint text={privacyLabel} triggerId="privacy-toggle" disabled={controlsOpen}>
      {#snippet children(attributes)}
    <button {...attributes} id="privacy-toggle" class="btn-icon btn-icon-base header-icon hover:preset-tonal" disabled={!privacyReady || privacyBusy} aria-pressed={privacyMode} aria-label={privacyLabel} aria-describedby="privacy-keyboard-help" onclick={togglePrivacy} onblur={() => { lastPrivacyClick = undefined; }} onkeydown={(event) => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); }}>
      <span class="privacy-current" aria-hidden="true">{@html privacyMode ? lightbulbOffIcon : lightbulbIcon}</span>
      <span class="privacy-action" aria-hidden="true">{@html privacyMode ? lightbulbIcon : lightbulbOffIcon}</span>
    </button>
      {/snippet}
    </Hint>
    <Hint text={t('More options')} triggerId="panel-controls-toggle" disabled={controlsOpen || concealed}>
      {#snippet children(attributes)}
        <Popover.Trigger {...tooltipAttributes(attributes)} id="panel-controls-toggle" class="btn-icon btn-icon-base header-icon hover:preset-tonal aria-expanded:preset-tonal" disabled={concealed || busy} aria-label={t('More options')}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
        </Popover.Trigger>
      {/snippet}
    </Hint>
  </AppBar.Trail>
  </AppBar.Toolbar>
  {#if controlsOpen && !concealed}<button class="controls-dismiss" tabindex="-1" aria-label={t('Close options')} onclick={closeControls}></button>{/if}
  <Popover.Positioner popover="manual" class="controls-positioner">
    <Popover.Content id="panel-controls" class="controls-sheet card preset-filled-surface-50-950 preset-outlined-surface-200-800 shadow-xl" aria-label={t('Side panel controls')}>
      {#if config.pages.length}
      <div class="page-chooser">
        <PageSwitcher pages={config.pages} value={config.activePageId} label={t('Switch page')}
          disabled={concealed || editing || importing || commenting || busy} active={controlsOpen} {concealed} onselect={switchPage} />
      </div>
    {/if}
    <div class="control-list" aria-label={t('Side panel controls')}>
      <button class="btn btn-sm hover:preset-tonal control-item" disabled={!activePage || editing || importing || commenting || concealed} onclick={() => { closeControls(); connect(true); }}>{@html refreshIcon}<span>{t('Reload')}</span></button>
      <button class="btn btn-sm hover:preset-tonal control-item" disabled={!activePage || concealed} onclick={() => { closeControls(); openTab(); }}>{@html externalLinkIcon}<span>{t('Open tab')}</span></button>
      <button id="import-bookmarks" class="btn btn-sm hover:preset-tonal control-item" disabled={!canImport || importing || editing || commenting || concealed || busy} onclick={() => { closeControls(); importing = true; }} aria-label={t('Import bookmarks')} title={t(canImport ? 'Import bookmarks' : 'Open an updated portal to import bookmarks.')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2zM12 6v7m-3-3 3 3 3-3" /></svg><span>{t('Import bookmarks')}</span></button>
      <button class="btn btn-sm hover:preset-tonal control-item" disabled={concealed || importing || commenting || busy} onclick={() => { closeControls(); commenting = true; }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg><span>{t('Page comments')}</span></button>
      <hr class="hr my-1" />
      <button class="btn btn-sm hover:preset-tonal control-item settings-control" disabled={concealed || importing || commenting || busy} aria-expanded={editing} aria-controls="extension-settings" onclick={() => { closeControls(); editing = !editing; }}>{@html settingsIcon}<span>{t('Extension settings')}</span></button>
    </div>
    </Popover.Content>
  </Popover.Positioner>
  <span id="privacy-keyboard-help" class="sr-only">{t('Press Enter or Space once to hide content, twice to show it.')}</span>
  {#if privacyError}<p class="privacy-error" role="alert">{t(privacyError)}</p>{/if}
</AppBar>
</Popover>

<div class="panel-content" class:concealed>
<div class="panel-body" inert={concealed || controlsOpen} aria-hidden={concealed}>
{#if commenting}
  <CommentsPanel {t} draft={commentDraft} onclose={() => { commenting = false; commentDraft = null; void browser.storage.session.remove('commentDraft'); }} />
{/if}
<div class="retained-screens" hidden={commenting} inert={commenting}>
{#if importing}
  <BookmarkImport {t} pageName={activePage ? pageLabel(activePage) : ''} request={bookmarkRequest} onclose={() => { importing = false; }} />
{:else if editing}
  <main id="extension-settings">
    <div class="settings-title-row"><h1>{t('My Portal Extension settings')}</h1><button class="btn icon-button" type="button" disabled={busy} onclick={closeSettings} aria-label={t('Close settings')} title={t('Close settings')}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
    {#if loaded}
      <ConnectionSettings {config} {t} onsave={saveConfig} oncancel={closeSettings} />
    {/if}
    <section class="extension-id-settings">
    <label for="extension-id">{t('Extension ID')}</label>
    <input id="extension-id" class="input" readonly value={extensionId} onclick={(event) => event.currentTarget.select()} onfocus={(event) => event.currentTarget.select()} />
    </section>
    <section class="language-settings" aria-labelledby="extension-language-label">
      <label id="extension-language-label" for="extension-language">{t('Language')}</label>
      <select id="extension-language" class="select" value={languagePreference} disabled={busy || languageBusy} onchange={saveLanguage} aria-describedby="extension-language-status">
        <option value="auto">{t('Automatic (browser)')}</option>
        <option value="ja" lang="ja">日本語</option>
        <option value="en" lang="en">English</option>
      </select>
      <p id="extension-language-status" class:error={languageStatus !== '' && languageStatus !== 'Saved'} role="status" aria-live="polite">{t(languageStatus)}</p>
    </section>
  </main>
{/if}
</div>
{#if error}<p class="status error" role="alert">{t(error)}</p>{/if}
{#each frames as frame (frame.id)}
  {#key frame.version}<iframe src={frame.url} title={pageLabel(config.pages.find(page => page.id === frame.id)!)} hidden={editing || importing || commenting || frame.id !== config.activePageId} inert={editing || importing || commenting || frame.id !== config.activePageId} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" referrerpolicy="no-referrer"></iframe>{/key}
{/each}
{#if !editing && !importing && !commenting && !frameUrl}<main class="empty-panel"><p>{t('No pages yet.')}</p><button class="btn preset-tonal" onclick={() => { editing = true; }}>{t('Open settings')}</button></main>{/if}

</div>
</div>
