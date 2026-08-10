/**
 * The pure computations behind the built-in sources in `src/sources/`.
 *
 * The sources themselves are `Component`s that listen to the vault; what they
 * compute — how many words a note has, what a tag looks like, what a deleted
 * path takes with it — needs nothing from Obsidian and lives here, where it can
 * be unit-tested.
 */

/** YAML frontmatter is metadata, not prose, so it is not counted. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** Words in a note's body. Deliberately crude and fast; it runs off-render. */
export function countWords(markdown: string): number {
	const body = markdown.replace(FRONTMATTER, '');
	const matches = body.match(/\S+/g);
	return matches ? matches.length : 0;
}

/**
 * Obsidian's own accent-independent palette. Literal colors are forbidden, and
 * these variables exist in every theme in both light and dark mode.
 */
export const TAG_COLORS = [
	'var(--color-red)',
	'var(--color-orange)',
	'var(--color-yellow)',
	'var(--color-green)',
	'var(--color-cyan)',
	'var(--color-blue)',
	'var(--color-purple)',
	'var(--color-pink)',
] as const;

/** A stable color per tag name, so the same tag always looks the same. */
export function tagColor(tag: string): string {
	let hash = 0;
	for (let index = 0; index < tag.length; index++) {
		hash = (hash * 31 + tag.charCodeAt(index)) % 1_000_003;
	}
	return TAG_COLORS[hash % TAG_COLORS.length] ?? TAG_COLORS[0];
}

/** `#work/deep-focus` → `work-deep-focus`, safe to use in a class name. */
export function tagSlug(tag: string): string {
	return tag
		.replace(/^#/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** The part of `Map` and `Set` that {@link forgetPath} needs. */
export interface PathIndex {
	delete(key: string): boolean;
	keys(): IterableIterator<string>;
}

/**
 * Drops `path` and anything under it from an index. Deleting a folder only
 * reports the folder, so the prefix sweep is not optional.
 */
export function forgetPath(index: PathIndex, path: string): boolean {
	let changed = index.delete(path);
	const prefix = `${path}/`;
	for (const key of index.keys()) {
		if (key.startsWith(prefix)) {
			index.delete(key);
			changed = true;
		}
	}
	return changed;
}
