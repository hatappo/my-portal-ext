import type { HTMLAttributes } from 'svelte/elements';
/** Preserve the target component's anatomy and selected state when composing triggers. */
export const tooltipAttributes = (attributes: HTMLAttributes<HTMLElement>) =>
  Object.fromEntries(Object.entries(attributes).filter(([name]) =>
    !['data-scope', 'data-part', 'data-state', 'data-ownedby'].includes(name)));
