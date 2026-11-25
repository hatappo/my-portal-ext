<script lang="ts">
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
  import Hint from './Hint.svelte';
  import { tooltipAttributes } from './tooltip-attributes';
  import { i18n } from './i18n.js';
  import type { NavigationState, NavigationTab } from './portal-bridge';
  import links from './assets/tool-case.svg?raw';
  import tasks from './assets/list-checks.svg?raw';
  import calendar from './assets/calendar-days.svg?raw';
  import settings from './assets/settings.svg?raw';
  import pin from './assets/pin.svg?raw';
  let { state, onselect }: { state: NavigationState; onselect: (tab: NavigationTab) => void } = $props();
  const icons = { links, 'inbox-and-tasks': tasks, calendar, settings };
  const t = (key: string) => i18n.t(key, state.language);
  const label = (tab: NavigationState['tabs'][number]) => tab.id === 'settings' ? t('Portal settings') : tab.label;
</script>

<div class="portal-header" lang={state.language}>
  <SegmentedControl class="portal-navigation segmented-control" name="portal-section" value={state.selected}
    ids={{ item: value => 'portal-tab-' + value }} aria-label={t('Portal sections')}
    onValueChange={({ value }) => { if (state.tabs.some(tab => tab.id === value)) onselect(value as NavigationTab); }}>
    <SegmentedControl.Control>
      <SegmentedControl.Indicator />
      {#each state.tabs as tab (tab.id)}
        <Hint text={tab.id === 'calendar' && state.pinned ? t('Calendar · pinned') : label(tab)} triggerId={'portal-tab-' + tab.id}>
          {#snippet children(attributes)}
            <SegmentedControl.Item {...tooltipAttributes(attributes)} value={tab.id} class="portal-tab">
              <SegmentedControl.ItemHiddenInput aria-label={label(tab)} />
              <SegmentedControl.ItemText>{@html icons[tab.id]}<span class="sr-only">{label(tab)}</span></SegmentedControl.ItemText>
              {#if tab.id === 'calendar' && state.pinned}<span class="calendar-pinned-mark" aria-hidden="true">{@html pin}</span>{/if}
            </SegmentedControl.Item>
          {/snippet}
        </Hint>
      {/each}
    </SegmentedControl.Control>
  </SegmentedControl>
</div>
