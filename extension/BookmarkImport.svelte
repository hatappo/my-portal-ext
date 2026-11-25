<script lang="ts">
  import { browser } from 'wxt/browser';
  import { bookmarkFolders, collectBookmarks, bookmarkTsv, importResult, type BookmarkNode, type ImportPreview } from './bookmarks';
  let { t, pageName, request, onclose }: {
    t: (key: string) => string; pageName: string;
    request: (operation: 'preview' | 'import', payload: unknown) => Promise<unknown>;
    onclose: () => void;
  } = $props();
  let nodes = $state<BookmarkNode[]>([]), loaded = $state(false), folder = $state(''), folderTags = $state(false);
  let busy = $state(false), error = $state(''), completed = $state(false);
  let preview = $state<ImportPreview | null>(null);
  const folders = $derived(bookmarkFolders(nodes));
  const entries = $derived(collectBookmarks(nodes, folder, folderTags));
  const errors: Record<string, string> = {
    BOOKMARK_INVALID_INPUT: 'Choose at most 1,000 bookmarks. Titles and folder names must fit the import limits.',
    BOOKMARK_DESTINATION_CHANGED: 'The destination changed. Preview again before importing.',
    SPREADSHEET_NOT_CONFIGURED: 'Configure a Links spreadsheet in the portal first.',
    SHEET_NOT_FOUND: 'The configured sheet was not found. Check the portal settings.',
    INVALID_SHEET_HEADERS: 'The sheet needs unique id, name and url column headers.',
    BOOKMARK_READ_FAILED: 'Could not read the spreadsheet. Check its access and the portal authorization.',
    BOOKMARK_WRITE_FAILED: 'Could not confirm the write. Preview again to check for additions. Direct import requires a spreadsheet this app can edit; you can also export TSV.',
    BOOKMARK_BUSY: 'The portal is processing another import. Try again shortly.',
    BOOKMARK_REQUEST_FAILED: 'Could not contact the portal. Reload it and try again.',
  };
  function report(reason: unknown) { const message = reason instanceof Error ? reason.message : 'BOOKMARK_REQUEST_FAILED'; error = errors[message] || message; }
  function reset() { preview = null; completed = false; error = ''; }
  async function loadBookmarks() {
    busy = true; reset();
    try {
      if (!await browser.permissions.request({ permissions: ['bookmarks'] })) throw new Error('Bookmark access was not granted.');
      nodes = await browser.bookmarks.getTree(); loaded = true;
    } catch (reason) { report(reason); }
    finally { busy = false; }
  }
  async function inspect() {
    busy = true; reset();
    try { preview = importResult(await request('preview', { bookmarks: entries })); }
    catch (reason) { report(reason); }
    finally { busy = false; }
  }
  async function commit() {
    if (!preview || completed) return;
    busy = true; error = '';
    try {
      preview = importResult(await request('import', { bookmarks: entries, destination: preview.destination }));
      completed = true;
    } catch (reason) { report(reason); }
    finally { busy = false; }
  }
  function download() {
    const selected = preview?.additions ?? entries.filter(entry => {
      try { const url = new URL(entry.url); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
    }).map(entry => ({ ...entry, name: entry.name.trim() || entry.url, id: 'chrome-' + crypto.randomUUID() }));
    const url = URL.createObjectURL(new Blob(['\uFEFF' + bookmarkTsv(selected)], { type: 'text/tab-separated-values;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'links-bookmarks.tsv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>
<main id="bookmark-import" aria-busy={busy}>
  <div class="settings-title-row"><h1>{t('Import bookmarks')}</h1><button class="btn icon-button" disabled={busy} onclick={onclose} aria-label={t('Close import')} title={t('Close import')}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
  <p class="help">{pageName}</p>
  <p>{t('Add new URLs to Links. Existing entries stay unchanged.')}</p>
  {#if !loaded}<button class="btn preset-filled-primary-500" disabled={busy} onclick={loadBookmarks}>{t('Choose Chrome bookmarks')}</button>{/if}
  {#if loaded}
    <fieldset disabled={busy}>
      <label for="bookmark-folder">{t('Bookmark folder')}</label>
      <select id="bookmark-folder" class="select" bind:value={folder} onchange={reset}>
        <option value="">{t('Choose a folder')}</option>
        {#each folders as item}<option value={item.id}>{item.label}</option>{/each}
      </select>
      <label class="bookmark-option"><input class="checkbox" type="checkbox" bind:checked={folderTags} onchange={reset} />{t('Use folder names as tags')}</label>
      <p class="help">{t('Includes subfolders. Up to 1,000 bookmarks per import.')} {t('Selected')}: {entries.length}</p>
      <button class="btn preset-tonal" disabled={!entries.length || entries.length > 1000} onclick={inspect}>{t('Preview additions')}</button>
      {#if !preview}<button class="btn preset-tonal" disabled={!entries.length || entries.length > 1000} onclick={download}>{t('Export TSV')}</button>{/if}
    </fieldset>
  {/if}
  {#if error}<p class="error" role="alert">{t(error)}</p>{/if}
  {#if preview}
    <section class="bookmark-preview" aria-labelledby="bookmark-preview-title">
      <h2 id="bookmark-preview-title">{t(completed ? 'Import complete' : 'Destination')}</h2>
      <a class="link" href={'https://docs.google.com/spreadsheets/d/' + preview.destination.id + '/edit#gid=' + preview.destination.sheetId} target="_blank" rel="noopener noreferrer">{preview.destination.title} / {preview.destination.name}</a>
      <ul class="bookmark-counts" aria-live="polite">
        <li>{t(completed ? 'Added' : 'New')}: {completed ? preview.added : preview.additions.length}</li>
        <li>{t('Already registered')}: {preview.duplicates}</li><li>{t('Unsupported or invalid')}: {preview.invalid}</li>
      </ul>
      {#if preview.additions.length}
        <ul class="bookmark-additions">{#each preview.additions as entry}<li><strong>{entry.name}</strong><span>{entry.url}</span>{#if entry.tags.length}<small>{entry.tags.join(' · ')}</small>{/if}</li>{/each}</ul>
      {/if}
      {#if !completed}<div class="actions">
        <button class="btn preset-filled-primary-500" disabled={busy || !preview.additions.length} onclick={commit}>{t('Add to spreadsheet')}</button>
        <button class="btn preset-tonal" disabled={busy || !preview.additions.length} onclick={download}>{t('Export TSV')}</button>
      </div>{/if}
    </section>
  {/if}
</main>
