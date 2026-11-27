import { createAnchor, findMatches, parseAnchor } from './anchor';
const EXCLUDED = 'script,style,noscript,template,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-my-portal-comments],svg,canvas,iframe';
const BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;
type Point = { node: Text; offset: number };
export type TextIndex = { text: string; starts: Point[]; ends: Point[] };
/** Build only when needed. The bound prevents a pathological page from monopolizing the UI. */
export function indexDocument(): TextIndex {
  const starts: Point[] = [], ends: Point[] = [], chunks: string[] = [];
  const visible = new Map<Element, boolean>();
  const isVisible = (element: Element): boolean => {
    const cached = visible.get(element); if (cached !== undefined) return cached;
    const style = getComputedStyle(element);
    const result = !element.matches(EXCLUDED) && !element.hasAttribute('hidden') && style.display !== 'none' && style.visibility !== 'hidden' && (!element.parentElement || isVisible(element.parentElement));
    visible.set(element, result); return result;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode(node) {
    if (node instanceof Element) return node.tagName === 'BR' && isVisible(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    return node.parentElement && isVisible(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  } });
  let node: Node | null, previousBlock: Element | null = null, last = '', lineBreak = false;
  while ((node = walker.nextNode())) {
    if (node instanceof Element) { lineBreak = true; continue; }
    const text = node as Text;
    let block = text.parentElement;
    while (block && !BLOCK.test(block.tagName)) block = block.parentElement;
    if (chunks.length && (lineBreak || block !== previousBlock) && last !== ' ') {
      chunks.push(' '); starts.push(ends.at(-1)!); ends.push({ node: text, offset: 0 }); last = ' ';
    }
    previousBlock = block; lineBreak = false;
    for (let offset = 0; offset < text.length; offset++) {
      const value = /\s/u.test(text.data[offset]!) ? ' ' : text.data[offset]!;
      if (value === ' ' && (!chunks.length || last === ' ')) { if (ends.length) ends[ends.length - 1] = { node: text, offset: offset + 1 }; continue; }
      chunks.push(value); starts.push({ node: text, offset }); ends.push({ node: text, offset: offset + 1 }); last = value;
      if (chunks.length > 1000000) throw new Error('This page is too large to annotate.');
    }
  }
  if (chunks.at(-1) === ' ') { chunks.pop(); starts.pop(); ends.pop(); }
  return { text: chunks.join(''), starts, ends };
}
export function selectionAnchor(): string {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed || document.contentType !== 'text/html' || window.top !== window) throw new Error('Select some page text first.');
  const range = selection.getRangeAt(0);
  const index = indexDocument();
  const first = index.starts.findIndex(point => range.comparePoint(point.node, point.offset) === 0);
  if (first < 0) throw new Error('Select some page text first.');
  let last = index.ends.length - 1;
  while (last >= first && range.comparePoint(index.ends[last]!.node, index.ends[last]!.offset) !== 0) last--;
  if (first < 0 || last < first) throw new Error('Select some page text first.');
  return createAnchor(location.href, index.text, first, last + 1);
}
export function resolveAnchor(index: TextIndex, url: string): Range | null {
  const matches = findMatches(index.text, parseAnchor(url), 2);
  if (matches.length !== 1) return null;
  const match = matches[0]!, start = index.starts[match.start], end = index.ends[match.end - 1];
  if (!start || !end) return null;
  const range = document.createRange(); range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
  return range;
}
