/** One standard text directive per comment. No independent selector is persisted. */
export type TextDirective = { start: string; end?: string; prefix?: string; suffix?: string };
export const FULL_TEXT_LIMIT = 100;
export const EDGE_LENGTH = 30;
export const MAX_URL_LENGTH = 24000;
export function normalizeText(value: string): string { return value.replace(/\s+/gu, ' ').trim(); }
export function pageKey(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported page.');
  // Retain query parameters and SPA routes; only discard text directives.
  const fragment = url.hash.split(':~:')[0] ?? '';
  url.hash = fragment === '#' ? '' : fragment;
  return url.href;
}
const encode = (value: string) => encodeURIComponent(value).replace(/[-!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
export function directiveUrl(page: string, directive: TextDirective): string {
  const base = pageKey(page);
  return base + (new URL(base).hash ? '' : '#') + ':~:text=' +
    (directive.prefix ? encode(directive.prefix) + '-,' : '') + encode(directive.start) +
    (directive.end ? ',' + encode(directive.end) : '') + (directive.suffix ? ',-' + encode(directive.suffix) : '');
}
export function parseAnchor(value: string): TextDirective {
  if (value.length > MAX_URL_LENGTH) throw new Error('The selected text cannot be linked reliably.');
  pageKey(value);
  const hash = new URL(value).hash;
  const raw = hash.slice(hash.indexOf(':~:') + 3);
  if (!hash.includes(':~:') || !raw.startsWith('text=') || raw.includes('&')) throw new Error('Invalid comment URL.');
  const parts = raw.slice(5).split(',');
  const prefix = parts.length > 1 && parts[0]!.endsWith('-') ? decodeURIComponent(parts.shift()!.slice(0, -1)) : undefined;
  const suffix = parts.length > 1 && parts.at(-1)!.startsWith('-') ? decodeURIComponent(parts.pop()!.slice(1)) : undefined;
  if (parts.length < 1 || parts.length > 2) throw new Error('Invalid comment URL.');
  const start = decodeURIComponent(parts[0]!), end = parts.length === 2 ? decodeURIComponent(parts[1]!) : undefined;
  if (![start, end, prefix, suffix].filter(v => v !== undefined).every(v => v && normalizeText(v) === v)) throw new Error('Invalid comment URL.');
  return { start, ...(end ? { end } : {}), ...(prefix ? { prefix } : {}), ...(suffix ? { suffix } : {}) };
}
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const equal = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
function wordBoundary(text: string, offset: number): boolean {
  // Latin/Cyrillic/Greek words cannot be cut in half. CJK text may have no spaces.
  const word = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}_]/u;
  return offset <= 0 || offset >= text.length || !word.test(text[offset - 1]!) || !word.test(text[offset]!);
}
export function findMatches(text: string, directive: TextDirective, limit = 500): { start: number; end: number }[] {
  const matches: { start: number; end: number }[] = [];
  const re = new RegExp(escaped(directive.start), 'giu');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) && matches.length < limit) {
    const start = match.index;
    if (!wordBoundary(text, start)) continue;
    const before = text.slice(0, start).trimEnd();
    if (directive.prefix && !equal(before.slice(-directive.prefix.length), directive.prefix)) continue;
    let end = start + match[0].length;
    if (directive.end) {
      const endRe = new RegExp(escaped(directive.end), 'giu'); endRe.lastIndex = end;
      let last: RegExpExecArray | null, found = false;
      while ((last = endRe.exec(text))) {
        end = last.index + last[0].length;
        if (!wordBoundary(text, end)) continue;
        if (directive.suffix && !equal(text.slice(end).trimStart().slice(0, directive.suffix.length), directive.suffix)) continue;
        found = true; break;
      }
      if (!found) continue;
    }
    if (!wordBoundary(text, end)) continue;
    if (directive.suffix && !equal(text.slice(end).trimStart().slice(0, directive.suffix.length), directive.suffix)) continue;
    matches.push({ start, end });
  }
  return matches;
}
const segments = (value: string) => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), part => part.segment);
function edge(value: string, count: number, fromEnd = false): string {
  const chars = segments(value);
  let result = (fromEnd ? chars.slice(-count) : chars.slice(0, count)).join('');
  // Extend to a word boundary, rather than making partial-word text directives.
  if (fromEnd) { let index = value.length - result.length; while (index > 0 && !wordBoundary(value, index)) index--; result = value.slice(index); }
  else { let index = result.length; while (index < value.length && !wordBoundary(value, index)) index++; result = value.slice(0, index); }
  return result.trim();
}
export function createAnchor(page: string, text: string, start: number, end: number): string {
  while (start > 0 && !wordBoundary(text, start)) start--;
  while (end < text.length && !wordBoundary(text, end)) end++;
  while (start < end && /\s/u.test(text[start]!)) start++;
  while (end > start && /\s/u.test(text[end - 1]!)) end--;
  const selected = text.slice(start, end);
  if (!selected || selected.length > 100000) throw new Error('Select some page text first.');
  const short = segments(selected).length <= FULL_TEXT_LIMIT;
  for (const size of [EDGE_LENGTH, 60, 100]) {
    const base: TextDirective = short ? { start: selected } : { start: edge(selected, size), end: edge(selected, size, true) };
    if (base.end && base.start.length + base.end.length >= selected.length) { base.start = selected; delete base.end; }
    for (const context of [0, 30, 60, 120, 240]) {
      const directive = { ...base, ...(context && start ? { prefix: edge(text.slice(0, start).trimEnd(), context, true) } : {}), ...(context && end < text.length ? { suffix: edge(text.slice(end).trimStart(), context) } : {}) };
      const found = findMatches(text, directive, 2);
      if (found.length === 1 && found[0]!.start === start && found[0]!.end === end) {
        const url = directiveUrl(page, directive);
        if (url.length <= MAX_URL_LENGTH) return url;
      }
    }
    if (short) break;
  }
  throw new Error('The selected text cannot be linked reliably.');
}
export function quoteLabel(url: string): string {
  const directive = parseAnchor(url);
  return directive.start + (directive.end ? ' … ' + directive.end : '');
}
export type PageComment = { url: string; comment: string; updatedAt: string };
export function readComment(value: unknown): PageComment {
  if (!value || typeof value !== 'object') throw new Error('Invalid comment.');
  const item = value as PageComment;
  if (typeof item.url !== 'string' || typeof item.comment !== 'string' || !item.comment.trim() || item.comment.length > 10000 || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('Invalid comment.');
  const directive = parseAnchor(item.url);
  return { url: directiveUrl(pageKey(item.url), directive), comment: item.comment, updatedAt: item.updatedAt };
}
