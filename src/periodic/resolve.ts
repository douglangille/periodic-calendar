import { getLanguage, normalizePath, type App, type TFile } from 'obsidian';
import type { Granularity, Moment } from '../api/types';
import {
	expandSemesterToken,
	semesterFormatCandidates,
	semesterOfMonth,
	semesterStartMonth,
	type Semester,
} from '../domain/semester';
import { t } from '../i18n';
import { GRANULARITIES, type PeriodicConfig, type PeriodicConfigStore } from './config';

/**
 * `moment` comes from Obsidian's global; we never bundle it. The type is
 * declared once, in the public contract, and re-exported here so the rest of
 * the plugin keeps importing it from the module it already used — there is no
 * second derivation of `ReturnType<typeof window.moment>` to drift from it.
 */
export type { Moment } from '../api/types';

/** The week-start options offered in settings. `locale` keeps moment's own. */
export type WeekStart =
	| 'locale'
	| 'sunday'
	| 'monday'
	| 'tuesday'
	| 'wednesday'
	| 'thursday'
	| 'friday'
	| 'saturday';

const WEEKDAY_NAMES: readonly WeekStart[] = [
	'sunday',
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
];

/** Semester 1 covers January–June, semester 2 July–December. */
export function semesterOf(date: Moment): Semester {
	return semesterOfMonth(date.month());
}

/**
 * First instant of the period `date` falls in.
 *
 * `moment` has no semester unit, so that one is derived from the month.
 */
export function startOfPeriod(date: Moment, granularity: Granularity): Moment {
	const clone = date.clone();
	switch (granularity) {
		case 'day':
			return clone.startOf('day');
		case 'week':
			// Locale-aware on purpose: the week-start setting rewrites the locale.
			return clone.startOf('week');
		case 'month':
			return clone.startOf('month');
		case 'quarter':
			return clone.startOf('quarter');
		case 'semester':
			return clone.month(semesterStartMonth(semesterOf(date))).startOf('month');
		case 'year':
			return clone.startOf('year');
	}
}

/**
 * A stable identity for a period, used as a cell key.
 * Prefixed with the granularity because `2026-01-01` is the start of a day, a
 * month, a quarter, a semester and a year at the same time.
 */
export function periodUid(date: Moment, granularity: Granularity): string {
	return `${granularity}-${startOfPeriod(date, granularity).format('YYYY-MM-DD')}`;
}

/**
 * Expands Periodic Calendar' own format tokens before `moment` sees the string.
 *
 * Only `{semester}` exists today. It is replaced by a bracket-escaped digit so
 * `moment` treats it as a literal instead of a format token — there is no
 * semester token in `moment`, and `S` already means fractional seconds.
 */
export function expandFormatTokens(format: string, date: Moment): string {
	return expandSemesterToken(format, semesterOf(date));
}

/** Basename (no extension) of the note representing this period. */
export function formatPeriod(date: Moment, config: PeriodicConfig): string {
	const start = startOfPeriod(date, config.granularity);
	return start.format(expandFormatTokens(config.format, start));
}

/** Vault path of the note representing this period, whether it exists or not. */
export function periodicNotePath(date: Moment, config: PeriodicConfig): string {
	const basename = formatPeriod(date, config);
	const folder = config.folder.replace(/^\/+|\/+$/g, '');
	return normalizePath(folder ? `${folder}/${basename}.md` : `${basename}.md`);
}

/** The existing note for this period, or null. */
export function getPeriodicNote(app: App, date: Moment, config: PeriodicConfig): TFile | null {
	return app.vault.getFileByPath(periodicNotePath(date, config));
}

/** A short human label for a period, for tooltips and menu titles. */
export function periodLabel(date: Moment, granularity: Granularity): string {
	const start = startOfPeriod(date, granularity);
	switch (granularity) {
		case 'day':
			return start.format('LL');
		case 'week':
			return t('periodWeekLabel', { week: start.week(), year: start.format('gggg') });
		case 'month':
			return start.format('MMMM YYYY');
		case 'quarter':
			return `${start.format('YYYY')} · Q${String(start.quarter())}`;
		case 'semester':
			return `${start.format('YYYY')} · S${String(semesterOf(start))}`;
		case 'year':
			return start.format('YYYY');
	}
}

/** Folder path as Obsidian reports it for a file's parent (root is `/`). */
function configFolderPath(config: PeriodicConfig): string {
	const folder = config.folder.replace(/^\/+|\/+$/g, '');
	return folder ? normalizePath(folder) : '/';
}

/**
 * Which period, if any, a file represents.
 *
 * Used to highlight the cell of the active note. Matching is done by folder plus
 * a strict parse of the basename, so a stray note in the daily folder is not
 * mistaken for a daily note.
 */
export function parsePeriodicNote(
	file: TFile,
	store: PeriodicConfigStore
): { granularity: Granularity; date: Moment } | null {
	const parentPath = file.parent?.path ?? '/';
	for (const granularity of GRANULARITIES) {
		const config = store.get(granularity);
		if (!config.enabled) continue;
		if (configFolderPath(config) !== parentPath) continue;
		const parsed = parseBasename(file.basename, config);
		if (parsed) return { granularity, date: parsed };
	}
	return null;
}

function parseBasename(basename: string, config: PeriodicConfig): Moment | null {
	const { moment } = window;
	if (config.granularity === 'semester') {
		// Two candidates only, so trying both beats writing a parser.
		for (const candidate of semesterFormatCandidates(config.format)) {
			const parsed = moment(basename, candidate.format, true);
			if (parsed.isValid()) {
				return parsed.month(semesterStartMonth(candidate.semester)).startOf('month');
			}
		}
		return null;
	}
	const parsed = moment(basename, config.format, true);
	if (!parsed.isValid()) return null;
	return startOfPeriod(parsed, config.granularity);
}

/**
 * Obsidian's language codes are not always moment locale codes. This is the
 * original Calendar plugin's mapping, kept verbatim so that a user switching
 * over keeps the same week start — Obsidian's "English" maps to `en-gb`, whose
 * week starts on Monday.
 */
const LANGUAGE_TO_MOMENT_LOCALE: Record<string, string> = {
	en: 'en-gb',
	zh: 'zh-cn',
	'zh-TW': 'zh-tw',
	ru: 'ru',
	ko: 'ko',
	it: 'it',
	id: 'id',
	ro: 'ro',
	'pt-BR': 'pt-br',
	cz: 'cs',
	da: 'da',
	de: 'de',
	es: 'es',
	fr: 'fr',
	no: 'nn',
	pl: 'pl',
	pt: 'pt',
	tr: 'tr',
	hi: 'hi',
	nl: 'nl',
	ar: 'ar',
	ja: 'ja',
};

/** Pristine week specs, per locale, so `locale` mode can always be restored. */
interface WeekSpecStore extends Window {
	_periodicCalendarWeekSpecs?: Record<string, unknown>;
}

/**
 * Rewrites moment's global locale to honour the user's preferences.
 *
 * This is global state, exactly as in the original Calendar plugin: Obsidian
 * exposes a single `moment` instance, and week arithmetic has to agree with what
 * the grid shows. Unlike the original, the pristine week spec is remembered per
 * locale, so switching the locale override and the week start in any order
 * always restores the right one.
 */
export function applyLocalePreferences(localeOverride: string, weekStart: WeekStart): string {
	const { moment } = window;
	const language = getLanguage() || 'en';
	const systemLanguage = navigator.language?.toLowerCase() ?? '';

	let target = LANGUAGE_TO_MOMENT_LOCALE[language] ?? language;
	if (localeOverride && localeOverride !== 'system-default') {
		target = localeOverride;
	} else if (systemLanguage.startsWith(language)) {
		// The system locale is more specific (en-gb vs en); prefer it.
		target = systemLanguage;
	}

	const resolved = moment.locale(target);

	const store = window as WeekSpecStore;
	const specs = (store._periodicCalendarWeekSpecs ??= {});

	if (weekStart === 'locale') {
		// Only restore if we ever changed it; an untouched locale needs no help.
		const pristine = specs[resolved];
		if (pristine) moment.updateLocale(resolved, { week: pristine } as never);
	} else {
		const localeData = moment.localeData() as unknown as { _week?: unknown };
		specs[resolved] ??= localeData._week;
		const dow = WEEKDAY_NAMES.indexOf(weekStart);
		moment.updateLocale(resolved, { week: { dow: dow < 0 ? 0 : dow } });
	}
	return resolved;
}

/** Localized short weekday names, already rotated to the configured week start. */
export function weekdayLabels(): string[] {
	return window.moment.weekdaysShort(true);
}

/**
 * The narrowest localized weekday names — `Mo`, `Tu` — rotated the same way.
 *
 * Below roughly 270 px of sidebar the three-letter names stop fitting in a
 * column and bleed into their neighbours, so both labels go into the DOM and a
 * container query picks one. Taking them from `moment` keeps the abbreviation
 * correct in every locale instead of slicing the short name and hoping.
 */
export function weekdayLabelsMin(): string[] {
	return window.moment.weekdaysMin(true);
}

/** Full localized weekday names, for the header's accessible name. */
export function weekdayLabelsFull(): string[] {
	return window.moment.weekdays(true);
}

/** Saturday and Sunday, independent of where the week starts. */
export function isWeekend(date: Moment): boolean {
	const iso = date.isoWeekday();
	return iso === 6 || iso === 7;
}

/**
 * The six-week window the month grid renders: always 42 days starting at the
 * week containing the 1st, so the grid never changes height between months.
 */
export function monthGridDays(displayedMonth: Moment): Moment[][] {
	const startOfMonth = displayedMonth.clone().date(1);
	const cursor = startOfMonth.clone().subtract(startOfMonth.weekday(), 'days');
	const weeks: Moment[][] = [];
	for (let index = 0; index < 42; index++) {
		if (index % 7 === 0) weeks.push([]);
		weeks[weeks.length - 1]?.push(cursor.clone());
		cursor.add(1, 'day');
	}
	return weeks;
}
