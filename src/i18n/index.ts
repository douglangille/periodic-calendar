import { getLanguage } from 'obsidian';
import { pickDictionary } from '../domain/dictionary';
import en from './en';
import es from './es';

/** Every key the interface can ask for. Derived from the English dictionary. */
export type TranslationKey = keyof typeof en;

/** A complete dictionary. Partial ones are rejected at compile time. */
export type Translations = Record<TranslationKey, string>;

/**
 * The dictionaries that ship with the plugin.
 *
 * English is the default because the community catalogue expects it; Spanish is
 * here because the author works in it. Adding a language is one more entry.
 */
const DICTIONARIES: Record<string, Translations> = { en, es };

/** Resolved once and cached; Obsidian reloads the app when the language changes. */
let active: Translations | null = null;

/**
 * The dictionary for a language code, falling back to English.
 *
 * Obsidian reports codes like `es` and `pt-BR`, so a regional variant with no
 * dictionary of its own falls back to its base language before English.
 * Exported so it can be exercised without an app.
 */
export function resolveDictionary(language: string): Translations {
	return pickDictionary(DICTIONARIES, language, en);
}

/**
 * A translated string, with `{name}` placeholders replaced by `params`.
 *
 * The language comes from Obsidian's own `getLanguage()` — never from
 * `localStorage` or a detection library, which the linter forbids and which
 * would disagree with the rest of the interface.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
	active ??= resolveDictionary(getLanguage());
	const template = active[key];
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match: string, name: string) =>
		name in params ? String(params[name]) : match
	);
}

/**
 * Forgets the cached language, so the next `t()` reads it again.
 *
 * Changing the language in Obsidian normally restarts the app, but a plugin
 * reload is cheaper than a restart during development and this makes it enough.
 */
export function resetLanguage(): void {
	active = null;
}
