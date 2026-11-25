export interface BookmarkNode { id: string; title: string; url?: string; children?: BookmarkNode[] }
export interface BookmarkEntry { name: string; url: string; tags: string[] }
export interface ImportPreview {
  ok: true;
  additions: (BookmarkEntry & {id: string})[];
  duplicates: number; invalid: number; received: number; added?: number;
  destination: { id: string; sheetId: number; name: string; title: string };
}
export function bookmarkFolders(nodes: BookmarkNode[], ancestors: string[] = []): { id: string; label: string }[] {
  return nodes.flatMap(node => {
    if (node.url) return [];
    const names = node.title ? [...ancestors, node.title] : ancestors;
    return [...(node.id !== '0' ? [{ id: node.id, label: names.join(' / ') }] : []), ...bookmarkFolders(node.children || [], names)];
  });
}
/** Only the selected folder is sent. Unsupported URLs are reported by the portal. */
export function collectBookmarks(nodes: BookmarkNode[], selected: string, folderTags: boolean): BookmarkEntry[] {
  function find(nodes: BookmarkNode[]): BookmarkNode | undefined {
    for (const node of nodes) { if (node.id === selected) return node; const found = find(node.children || []); if (found) return found; }
  }
  const root = find(nodes);
  if (!root || root.url) return [];
  function collect(node: BookmarkNode, path: string[]): BookmarkEntry[] {
    if (node.url) return [{ name: node.title, url: node.url, tags: folderTags ? path : [] }];
    // One folder name must remain one tag in the spreadsheet's comma-separated format.
    const name = node.title.replace(/[,、\r\n]+/g, ' ').trim();
    const tags = name ? [...path, name] : path;
    return (node.children || []).flatMap(child => collect(child, tags));
  }
  return collect(root, []);
}
/** Quote TSV cells and neutralize spreadsheet formulas for manual paste/import. */
export function bookmarkTsv(entries: (BookmarkEntry & {id: string})[]): string {
  const cell = (value: string) => {
    const text = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
    return /[\t\r\n"]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  return ['id\thidden\ttags\ticon\tname\turl\tdescription', ...entries.map(entry =>
    [entry.id, 'FALSE', entry.tags.join(', '), '', entry.name, entry.url, ''].map(cell).join('\t'))].join('\n');
}
export function importResult(value: unknown): ImportPreview {
  const result = value as ImportPreview;
  if (!result?.ok) throw new Error((value as {error?: string})?.error || 'BOOKMARK_REQUEST_FAILED');
  if (!Array.isArray(result.additions) || !result.destination || typeof result.destination.id !== 'string' || !/^[\w-]+$/.test(result.destination.id) || !Number.isInteger(result.destination.sheetId) || result.destination.sheetId < 0 || typeof result.destination.name !== 'string' || typeof result.destination.title !== 'string' ||
    (result.added !== undefined && (!Number.isInteger(result.added) || result.added < 0)) ||
    ![result.duplicates, result.invalid, result.received].every(n => Number.isInteger(n) && n >= 0) ||
    result.additions.some(item => typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.url !== 'string' || !Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== 'string'))) throw new Error('BOOKMARK_REQUEST_FAILED');
  return result;
}
