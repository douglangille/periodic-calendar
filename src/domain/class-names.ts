/**
 * Turning a source's own strings into CSS classes that are safe to put in the
 * DOM. Extracted from the registry so it can be exercised without an app.
 */

/** Anything that cannot appear in a CSS class name becomes a hyphen. */
const INVALID_CLASS_CHARS = /[^\p{L}\p{N}_-]+/gu;

/**
 * Reduces a string to something usable inside a CSS class name: letters,
 * digits, `_` and `-`, with no runs of hyphens and none at the ends.
 */
export function slugifyClass(value: string): string {
	return value
		.replace(INVALID_CLASS_CHARS, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * The class a source's `className` actually reaches the DOM as.
 *
 * Two sources may reasonably pick the same name — `dot`, `busy`, `done` — so the
 * source id goes in front of it; and neither the id nor the name is guaranteed
 * to be a legal class, so both are sanitized. A token that would start with a
 * digit is prefixed, because CSS cannot select those. Returns `null` when
 * nothing usable is left, so an empty string adds no class at all.
 */
export function sourceClassName(sourceId: string, className: string): string | null {
	const name = slugifyClass(className);
	if (!name) return null;
	const namespace = slugifyClass(sourceId) || 'source';
	const token = `${namespace}-${name}`;
	return /^\d/.test(token) ? `_${token}` : token;
}
