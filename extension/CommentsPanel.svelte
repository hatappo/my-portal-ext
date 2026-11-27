<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { browser } from 'wxt/browser';
  import { pageKey, quoteLabel, type PageComment } from './comments/anchor';
  import type { CommentDraft } from './comments/background';
  let { t, draft, onclose }: { t: (key: string) => string; draft: CommentDraft | null; onclose: () => void } = $props();
  let records = $state<PageComment[]>([]), selected = $state(''), comment = $state('');
  let original = $state<PageComment | null>(null), busy = $state(true), error = $state(''), status = $state('');
  let pageStatus = $state<{page: string; missing: string[]; error: string} | null>(null);
  let handled = '', initialized = $state(false), pending = $state<CommentDraft | null>(null);
  const dirty = $derived(Boolean(selected) && comment !== (original?.comment ?? ''));
  async function request(operation: string, extra: Record<string, unknown> = {}) {
    const result = await browser.runtime.sendMessage({ type: 'my-portal:comments', operation, ...extra });
    if (!result?.ok) throw new Error(result?.error || 'Could not save or load comments. Please try again.');
    return result;
  }
  async function refresh() { const result = await request('list'); records = result.records; }
  async function select(url: string) {
    busy = true;
    try {
      await refresh();
      original = records.find(record => record.url === url) ?? null;
      selected = url; comment = original?.comment ?? ''; status = ''; error = '';
    } catch { error = 'Could not save or load comments. Please try again.'; }
    finally { busy = false; }
    await tick(); document.getElementById('comment-body')?.focus();
  }
  async function applyDraft(value: CommentDraft) {
    pending = null;
    if (value.error) { error = value.error; return; }
    busy = true;
    try { if (value.url) await select(value.url); else await refresh(); }
    catch { error = 'Could not save or load comments. Please try again.'; }
    finally { busy = false; }
  }
  $effect(() => {
    if (!initialized || !draft || draft.requestId === handled) return;
    handled = draft.requestId;
    if (dirty) pending = draft; else void applyDraft(draft);
  });
  onMount(() => {
    if (!draft) document.getElementById('comments-heading')?.focus();
    void refresh().catch(() => { error = 'Could not save or load comments. Please try again.'; }).finally(() => { busy = false; initialized = true; });
    void browser.storage.session.get('commentPageStatus').then(saved => { pageStatus = saved.commentPageStatus as typeof pageStatus ?? null; }).catch(() => {});
    const statusChanged = (changes: Record<string, {newValue?: unknown}>, area: string) => { if (area === 'session' && changes.commentPageStatus) pageStatus = changes.commentPageStatus.newValue as typeof pageStatus ?? null; };
    browser.storage.onChanged.addListener(statusChanged);
    return () => browser.storage.onChanged.removeListener(statusChanged);
  });
  async function save() {
    if (busy || !selected || !comment.trim()) return;
    busy = true; error = ''; status = '';
    try {
      await request('save', { record: { url: selected, comment, updatedAt: new Date().toISOString() }, expectedRevision: original?.updatedAt ?? null });
      await refresh(); original = records.find(record => record.url === selected) ?? null; status = 'Saved';
    } catch (failure) { error = failure instanceof Error ? failure.message : 'Could not save or load comments. Please try again.'; }
    finally { busy = false; }
  }
  async function remove() {
    if (!original || busy || !confirm(t('Delete this comment?'))) return;
    busy = true; error = '';
    try { await request('delete', { record: $state.snapshot(original), expectedRevision: original.updatedAt }); await refresh(); selected = ''; original = null; comment = ''; }
    catch (failure) { error = failure instanceof Error ? failure.message : 'Could not save or load comments. Please try again.'; }
    finally { busy = false; }
  }
  function mayLeave() { return !dirty || confirm(t('Discard unsaved changes?')); }
  function exportComments() {
    const url = URL.createObjectURL(new Blob([JSON.stringify($state.snapshot(records), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'my-portal-comments.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>
<main id="page-comments">
  <div class="settings-title-row"><h1 id="comments-heading" tabindex="-1">{t('Page comments')}</h1><button class="btn icon-button" aria-label={t('Close comments')} onclick={() => { if (mayLeave()) onclose(); }} disabled={busy}>×</button></div>
  <p class="help">{t('Select text on a page, then right-click to add a comment.')}</p>
  <p class="help">{t('Saved on this device. Removing the extension deletes its comments.')}</p>
  {#if pending}<div class="comment-pending"><p>{t('A new selection is waiting. Save your current comment or discard its changes.')}</p><button class="btn preset-tonal" disabled={busy} onclick={() => { if (mayLeave() && pending) void applyDraft(pending); }}>{t('Open new selection')}</button></div>{/if}
  {#if error}<p class="error" role="alert">{t(error)}</p>{/if}
  {#if selected}
    {#if pageStatus?.page === pageKey(selected) && (pageStatus.error || pageStatus.missing.includes(selected))}<p class="error" role="status">{t(pageStatus.error || 'The text could not be located. The comment is still saved.')}</p>{/if}
    <form onsubmit={event => { event.preventDefault(); void save(); }}>
      <a class="comment-page" href={selected} target="_blank" rel="noreferrer">{new URL(selected).hostname} ↗</a>
      <blockquote class="comment-quote">{quoteLabel(selected)}</blockquote>
      <label for="comment-body">{t('Comment')}</label>
      <textarea id="comment-body" class="textarea" rows="6" maxlength="10000" bind:value={comment} disabled={busy}></textarea>
      <div class="actions"><button type="submit" class="btn preset-filled-primary-500" disabled={busy || !comment.trim()}>{t('Save comment')}</button><button type="button" class="btn preset-tonal" disabled={busy} onclick={() => { if (mayLeave()) { selected = ''; original = null; } }}>{t('Cancel')}</button>{#if original}<button type="button" class="btn hover:preset-tonal-error" disabled={busy} onclick={remove}>{t('Delete')}</button>{/if}</div>
      <p role="status" class="help">{t(status)}</p>
    </form>
  {/if}
  <div class="section-heading"><h2>{t('Saved comments')} <span class="help">{records.length}</span></h2><button class="btn btn-sm preset-tonal" disabled={busy || !records.length} onclick={exportComments}>{t('Export JSON')}</button></div>

  {#if !busy && !records.length}<p class="help">{t('No comments yet.')}</p>{/if}
  <ul class="comment-list">
    {#each records.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)) as record (record.url)}
      <li><button class="comment-row" disabled={busy} onclick={() => { if (mayLeave()) void select(record.url); }}><span class="comment-origin">{new URL(pageKey(record.url)).hostname}</span><span class="comment-excerpt">{quoteLabel(record.url)}</span><span class="comment-preview">{record.comment}</span></button></li>
    {/each}
  </ul>
</main>
<style>
  #page-comments{flex:1;min-height:0}.comment-page{font-size:12px;color:var(--color-primary-700-300);overflow-wrap:anywhere}
  .comment-quote{margin:12px 0;border-left:3px solid var(--color-primary-400);padding:8px 12px;background:var(--color-surface-100-900);border-radius:0 6px 6px 0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;max-height:140px;overflow:auto}
  .comment-list{list-style:none;padding:0;margin:8px 0}.comment-list li{border-bottom:1px solid var(--color-surface-200-800)}
  .comment-row{text-align:left;width:100%;display:grid;gap:5px;padding:12px 8px;border-radius:6px}.comment-row:hover{background:var(--color-surface-100-900)}
  .comment-origin{font-size:10px;color:var(--color-surface-600-400)}.comment-excerpt,.comment-preview{display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.comment-excerpt{font-size:12px;font-weight:600}.comment-preview{font-size:12px;color:var(--color-surface-600-400)}
  #comments-heading:focus{outline:none}
  .comment-pending{padding:10px;border:1px solid var(--color-warning-400);border-radius:6px}
</style>
