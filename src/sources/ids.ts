/**
 * Ids of the built-in sources.
 *
 * They are here rather than only on the classes because `settings.ts` needs to
 * name two of them — the ones that ship turned off — and a plugin id typed twice
 * is a plugin id that will eventually be typed differently. Nothing is imported
 * here, so `settings.ts` can depend on this without dragging in the sources.
 */

export const NOTES_EXIST_SOURCE_ID = 'periodic-calendar-notes-exist';
export const WORD_COUNT_SOURCE_ID = 'periodic-calendar-word-count';
export const TAGS_SOURCE_ID = 'periodic-calendar-tags';
