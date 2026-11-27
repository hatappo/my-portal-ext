<script lang="ts">
  import { Tooltip } from '@skeletonlabs/skeleton-svelte';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  let { text, triggerId, disabled = false, children }: {
    text: string; triggerId?: string; disabled?: boolean; children: Snippet<[HTMLAttributes<HTMLElement>]>;
  } = $props();
  let open = $state(false);
  const id = $props.id();
  const contentId = id + '-hint';
  $effect(() => { if (disabled) open = false; });
</script>
<Tooltip {disabled} ids={{ trigger: triggerId, content: contentId }} open={open && !disabled && !!text}
  onOpenChange={event => { open = event.open && !disabled; }} openDelay={350} closeDelay={100}
  positioning={{ placement: 'bottom', gutter: 8, overflowPadding: 12, strategy: 'fixed' }}>
  <Tooltip.Trigger onfocusin={(event) => { open = !disabled && event.currentTarget.matches(':focus-visible'); }} onfocusout={() => { open = false; }}>
    {#snippet element(attributes)}{@render children({ ...attributes, 'aria-describedby': open && !disabled ? contentId : undefined } as HTMLAttributes<HTMLElement>)}{/snippet}
  </Tooltip.Trigger>
  {#if open && !disabled && text}<Tooltip.Positioner class="hint-positioner"><Tooltip.Content class="portal-tooltip card preset-filled shadow-md">{text}</Tooltip.Content></Tooltip.Positioner>{/if}
</Tooltip>
