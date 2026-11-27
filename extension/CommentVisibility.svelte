<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
  import { browser } from 'wxt/browser';
  import { COMMENT_DISPLAY_KEY, isCommentDisplayMode, readCommentDisplayMode, type CommentDisplayMode } from './comments/display';
  import Hint from './Hint.svelte';
  import { tooltipAttributes } from './tooltip-attributes';
  import hiddenIcon from './assets/eye-closed.svg?raw';
  import markerIcon from './assets/comment-marker.svg?raw';
  import expandedIcon from './assets/message-text.svg?raw';
  const options = [{value: 'hidden', label: 'Hide comments', icon: hiddenIcon}, {value: 'markers', label: 'Show comment markers', icon: markerIcon}, {value: 'expanded', label: 'Show comment text', icon: expandedIcon}];
  let { t, disabled = false, concealed = false }: { t: (key: string) => string; disabled?: boolean; concealed?: boolean } = $props();
  let mode = $state<CommentDisplayMode>('markers'), ready = $state(false), busy = $state(false), error = $state('');
  let root: HTMLDivElement;
  function restoreInputSelection() {
    // Native radios change immediately; keep them aligned with the persisted selection.
    root?.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach(input => { input.checked = input.value === mode; });
  }
  onMount(() => {
    let disposed = false, changed = false;
    const sync = (changes: Record<string, {newValue?: unknown}>, area: string) => {
      if (area === 'local' && changes[COMMENT_DISPLAY_KEY]) {
        changed = true; mode = readCommentDisplayMode(changes[COMMENT_DISPLAY_KEY].newValue);
      }
    };
    browser.storage.onChanged.addListener(sync);
    void browser.storage.local.get(COMMENT_DISPLAY_KEY).then(saved => {
      if (disposed) return;
      if (!changed) mode = readCommentDisplayMode(saved[COMMENT_DISPLAY_KEY]);
      ready = true;
    }).catch(() => { if (!disposed) error = 'Could not load comment display settings. Reload the panel to try again.'; });
    return () => { disposed = true; browser.storage.onChanged.removeListener(sync); };
  });
  async function change(value: string | null) {
    if (!isCommentDisplayMode(value) || !ready || busy || disabled || concealed) return;
    busy = true; error = '';
    try {
      const result = await browser.runtime.sendMessage({type: 'my-portal:comments', operation: 'display-mode', mode: value});
      if (!result?.ok) throw new Error('Save failed');
      mode = value;
    } catch { error = 'Could not save comment display settings. Please try again.'; }
    finally { busy = false; await tick(); restoreInputSelection(); }
  }
</script>
<div bind:this={root} class="comment-visibility" class:concealed aria-hidden={concealed}>
  <SegmentedControl class="comment-display-control segmented-control" name="comment-display" value={mode}
    disabled={!ready || busy || disabled || concealed} aria-label={t('Comment display')}
    ids={{ item: value => 'comment-mode-' + value }} onValueChange={({ value }) => { void change(value); }}>
    <SegmentedControl.Control>
      <SegmentedControl.Indicator />
      {#each options as option (option.value)}
        <Hint text={t(option.label)} triggerId={'comment-mode-' + option.value} disabled={disabled || concealed}>
          {#snippet children(attributes)}
            <SegmentedControl.Item {...tooltipAttributes(attributes)} value={option.value}>
              <SegmentedControl.ItemHiddenInput aria-label={t(option.label)} onchange={restoreInputSelection} />
              <SegmentedControl.ItemText>{@html option.icon}<span class="sr-only">{t(option.label)}</span></SegmentedControl.ItemText>
            </SegmentedControl.Item>
          {/snippet}
        </Hint>
      {/each}
    </SegmentedControl.Control>
  </SegmentedControl>
  {#if error && !concealed}<p class="comment-visibility-error error" role="alert">{t(error)}</p>{/if}
</div>
<style>
  .comment-visibility{position:relative;flex:none}.concealed{visibility:hidden}
  :global(.comment-display-control [data-part="control"]){padding:2px;gap:1px}
  :global(.comment-display-control [data-part="item"]){width:26px;min-width:26px;height:30px;padding:4px}
  :global(.comment-display-control [data-part="item-text"]){display:flex;align-items:center;justify-content:center}
  :global(.comment-display-control svg){width:17px;height:17px;flex:none}
  .comment-visibility-error{position:absolute;top:100%;right:0;width:min(260px,80vw);z-index:10;padding:10px;border:1px solid var(--color-error-400);border-radius:6px;background:var(--color-surface-50-950);font-size:12px}
</style>
