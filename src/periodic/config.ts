import { normalizePath, type App } from 'obsidian';
import type { Granularity } from '../api/types';

/** Every granularity the calendar knows about, finest first. */
export const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'semester', 'year'] as const;

/**
 * The coarse granularities reachable from the header, **coarsest first**:
 * `2026 · S2 · Q3 · Aug`.
 *
 * The order is the rendering order and, because the buttons are real `<button>`
 * elements with no `tabindex` of their own, it is also the tab order. Reversing
 * this array is therefore the whole change — there is no second place where the
 * sequence is written down.
 */
export const HEADER_GRANULARITIES = ['year', 'semester', 'quarter', 'month'] as const;

/**
 * Fallback `moment` formats, matching the Periodic Notes plugin's own defaults
 * so that an empty `format` in its configuration resolves to the same filename
 * it would produce.
 *
 * `semester` has no Periodic Notes equivalent, so its format is a Calendar Plus
 * convention: `{semester}` is our own token and expands to `1` or `2` before the
 * rest of the string is handed to `moment`.
 */
export const DEFAULT_FORMATS: Record<Granularity, string> = {
	day: 'YYYY-MM-DD',
	week: 'gggg-[W]ww',
	month: 'YYYY-MM',
	quarter: 'YYYY-[Q]Q',
	semester: 'YYYY-[S]{semester}',
	year: 'YYYY',
};

/** Where a resolved configuration came from. Surfaced in the settings tab. */
export type ConfigOrigin = 'periodic-notes' | 'daily-notes' | 'settings' | 'default';

/** Everything needed to turn a date into a note path, and back. */
export interface PeriodicConfig {
	granularity: Granularity;
	/** False when no vault configuration provides this granularity. */
	enabled: boolean;
	/** Vault-relative folder. An empty string means the vault root. */
	folder: string;
	/** `moment` format for the file basename, never empty. */
	format: string;
	/** Vault path of the template, or an empty string when there is none. */
	template: string;
	origin: ConfigOrigin;
}

/**
 * The slice of the plugin settings this module needs. Declared here (rather
 * than imported from `settings.ts`) to keep the dependency one-way.
 */
export interface SemesterSettings {
	semesterEnabled: boolean;
	semesterFolder: string;
	semesterFormat: string;
	semesterTemplate: string;
}

/** Periodic Notes' key for each granularity. It has no semester tier. */
const PERIODIC_NOTES_KEYS: Partial<Record<Granularity, string>> = {
	day: 'daily',
	week: 'weekly',
	month: 'monthly',
	quarter: 'quarterly',
	year: 'yearly',
};

interface RawEntry {
	format?: unknown;
	folder?: unknown;
	template?: unknown;
	enabled?: unknown;
}

function asTrimmedString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function asRawEntry(value: unknown): RawEntry | null {
	return isRecord(value) ? value : null;
}

/**
 * Reads the vault's real periodic note configuration — core **Daily notes** and
 * the **Periodic Notes** plugin — and caches it.
 *
 * Nothing here depends on `obsidian-daily-notes-interface`: the two JSON files
 * live inside the vault and are read through the vault adapter.
 */
export class PeriodicConfigStore {
	private configs: Record<Granularity, PeriodicConfig>;
	/** Serialized snapshot of the last load, to detect real changes cheaply. */
	private snapshot = '';

	constructor(
		private readonly app: App,
		private readonly getSemesterSettings: () => SemesterSettings
	) {
		this.configs = this.build(null, null, false);
	}

	/** Resolved configuration for a granularity. Always defined. */
	get(granularity: Granularity): PeriodicConfig {
		return this.configs[granularity];
	}

	/** Whether notes of this granularity can be resolved and created. */
	isEnabled(granularity: Granularity): boolean {
		return this.configs[granularity].enabled;
	}

	/**
	 * Re-reads both configuration files. Returns true when the resolved
	 * configuration actually changed, so callers can skip needless repaints.
	 */
	async reload(): Promise<boolean> {
		const configDir = this.app.vault.configDir;
		const [core, periodic] = await Promise.all([
			this.readJson(`${configDir}/daily-notes.json`),
			this.readJson(`${configDir}/plugins/periodic-notes/data.json`),
		]);
		this.configs = this.build(core, periodic, this.isPeriodicNotesEnabled());
		const next = JSON.stringify(this.configs);
		const changed = next !== this.snapshot;
		this.snapshot = next;
		return changed;
	}

	/**
	 * Recomputes only what depends on our own settings. Cheap and synchronous,
	 * so the settings tab can call it on every change.
	 */
	applySemesterSettings(): void {
		this.configs = {
			...this.configs,
			semester: this.buildSemester(),
		};
		this.snapshot = JSON.stringify(this.configs);
	}

	private build(
		core: Record<string, unknown> | null,
		periodic: Record<string, unknown> | null,
		periodicEnabled: boolean
	): Record<Granularity, PeriodicConfig> {
		const fromPeriodic = (granularity: Granularity): PeriodicConfig | null => {
			const key = PERIODIC_NOTES_KEYS[granularity];
			if (!key || !periodic || !periodicEnabled) return null;
			const entry = asRawEntry(periodic[key]);
			if (!entry || entry.enabled !== true) return null;
			return {
				granularity,
				enabled: true,
				folder: asTrimmedString(entry.folder),
				format: asTrimmedString(entry.format) || DEFAULT_FORMATS[granularity],
				template: asTrimmedString(entry.template),
				origin: 'periodic-notes',
			};
		};

		const fallback = (granularity: Granularity, enabled: boolean): PeriodicConfig => ({
			granularity,
			enabled,
			folder: '',
			format: DEFAULT_FORMATS[granularity],
			template: '',
			origin: 'default',
		});

		// Core Daily notes is the fallback for `day`, and always considered
		// available: Obsidian can create a daily note with no configuration.
		const coreDay: PeriodicConfig = core
			? {
					granularity: 'day',
					enabled: true,
					folder: asTrimmedString(core['folder']),
					format: asTrimmedString(core['format']) || DEFAULT_FORMATS.day,
					template: asTrimmedString(core['template']),
					origin: 'daily-notes',
				}
			: fallback('day', true);

		return {
			day: fromPeriodic('day') ?? coreDay,
			week: fromPeriodic('week') ?? fallback('week', false),
			month: fromPeriodic('month') ?? fallback('month', false),
			quarter: fromPeriodic('quarter') ?? fallback('quarter', false),
			semester: this.buildSemester(),
			year: fromPeriodic('year') ?? fallback('year', false),
		};
	}

	/**
	 * Periodic Notes has no semester tier, so this one comes from our own
	 * settings and is opt-in.
	 */
	private buildSemester(): PeriodicConfig {
		const settings = this.getSemesterSettings();
		return {
			granularity: 'semester',
			enabled: settings.semesterEnabled,
			folder: settings.semesterFolder.trim(),
			format: settings.semesterFormat.trim() || DEFAULT_FORMATS.semester,
			template: settings.semesterTemplate.trim(),
			origin: 'settings',
		};
	}

	private isPeriodicNotesEnabled(): boolean {
		const plugins = (this.app as App & { plugins?: { enabledPlugins?: Set<string> } }).plugins;
		// When the internal registry is unavailable we trust the data file
		// rather than silently disabling every coarse granularity.
		if (!plugins?.enabledPlugins) return true;
		return plugins.enabledPlugins.has('periodic-notes');
	}

	private async readJson(path: string): Promise<Record<string, unknown> | null> {
		const adapter = this.app.vault.adapter;
		const normalized = normalizePath(path);
		try {
			if (!(await adapter.exists(normalized))) return null;
			const parsed: unknown = JSON.parse(await adapter.read(normalized));
			return isRecord(parsed) ? parsed : null;
		} catch (err) {
			console.warn(`Calendar Plus: could not read ${normalized}`, err);
			return null;
		}
	}
}
