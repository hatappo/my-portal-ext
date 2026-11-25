<script lang="ts">
  import { Combobox, useListCollection } from '@skeletonlabs/skeleton-svelte';
  import { pageLabel, type PanelConfig } from './config';
  let { pages, value, label, disabled, active, concealed, onselect }: {
    pages: PanelConfig['pages']; value: string; label: string; disabled: boolean;
    active: boolean; concealed: boolean; onselect: (id: string) => void;
  } = $props();
  let open = $state(false);
  const items = $derived(pages.map(page => ({ value: page.id, label: concealed ? '•••' : pageLabel(page) })));
  const collection = $derived(useListCollection({ items }));
  const selectedLabel = $derived(items.find(item => item.value === value)?.label ?? '');
  $effect(() => { if (!active || disabled) open = false; });
</script>

<Combobox class="page-switcher" {collection} value={[value]} inputValue={selectedLabel}
  open={open && active && !disabled} {disabled} openOnClick
  ids={{ input: 'page-switcher', content: 'page-switcher-options' }}
  positioning={{ placement: 'bottom-start', sameWidth: true, gutter: 4, strategy: 'fixed' }}
  onOpenChange={event => { open = event.open; }}
  onValueChange={event => { const id = event.value[0]; if (id && id !== value) onselect(id); }}>
  <Combobox.Label>{label}</Combobox.Label>
  <Combobox.Control>
    <Combobox.Input readonly class="field-sm" />
    <Combobox.Trigger aria-label={label} />
  </Combobox.Control>
  <Combobox.Positioner class="page-switcher-positioner">
    <Combobox.Content class="page-switcher-options shadow-lg">
      {#each items as item (item.value)}
        <Combobox.Item {item}>
          <Combobox.ItemText>{item.label}</Combobox.ItemText>
          <Combobox.ItemIndicator />
        </Combobox.Item>
      {/each}
    </Combobox.Content>
  </Combobox.Positioner>
</Combobox>
