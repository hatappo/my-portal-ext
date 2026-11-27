export const COMMENT_DISPLAY_KEY = 'commentDisplayMode';
export const COMMENT_DISPLAY_MODES = ['hidden', 'markers', 'expanded'] as const;
export type CommentDisplayMode = typeof COMMENT_DISPLAY_MODES[number];
export function isCommentDisplayMode(value: unknown): value is CommentDisplayMode {
  return typeof value === 'string' && COMMENT_DISPLAY_MODES.some(mode => mode === value);
}
export function readCommentDisplayMode(value: unknown): CommentDisplayMode {
  return isCommentDisplayMode(value) ? value : 'markers';
}
