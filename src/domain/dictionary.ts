/**
 * The language → dictionary lookup rule, with no dictionaries in it.
 *
 * Kept apart from `src/i18n/index.ts` because that module reads Obsidian's
 * `getLanguage()`, and the rule itself — which is the part with edge cases — has
 * nothing to do with Obsidian.
 */

/**
 * The dictionary for a language code, falling back to `fallback`.
 *
 * Obsidian reports codes like `es` and `pt-BR`, so a regional variant with no
 * dictionary of its own falls back to its base language before the fallback.
 */
export function pickDictionary<T>(
	dictionaries: Record<string, T>,
	language: string,
	fallback: T
): T {
	const base = language.split('-')[0] ?? '';
	return dictionaries[language] ?? dictionaries[base] ?? fallback;
}
