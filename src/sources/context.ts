import { Component, TFile, debounce, type App } from 'obsidian';
import type { PeriodicCalendarApi, CalendarSource, CellMetadata, Granularity } from '../api/types';
import { t, type TranslationKey } from '../i18n';
import type { Moment } from '../periodic/resolve';

/** How long an index waits after the last change before repainting. */
const REFRESH_DEBOUNCE_MS = 300;

/**
 * Upper bound on the days a footer figure will walk. The calendar asks about one
 * month, so this is only a stop against a range that arrives inverted or absurd:
 * `getSummary` runs on the render path and must never become a long loop.
 */
const MAX_SUMMARY_DAYS = 400;

/**
 * Everything a built-in source is handed. Nothing here is privileged.
 *
 * There is no date ⇄ note resolver any more: `api.resolveNote()` is part of the
 * public contract, so the built-in sources get the mapping the same way an
 * external plugin does. `getWordsPerDot` is not privileged either — it is this
 * plugin's own setting, and the word count source happens to belong to it.
 */
export interface SourceContext {
	readonly app: App;
	readonly api: PeriodicCalendarApi;
	/** How many words each dot of the word count source stands for. */
	getWordsPerDot(): number;
}

/**
 * Base for the built-in sources.
 *
 * A source is a `Component`, so the plugin adds it as a child and everything it
 * registers — including its own unregistration from the API — is undone when
 * the plugin unloads. This is exactly the shape an external plugin would use.
 *
 * `getMetadata` runs once per visible cell on every repaint, so subclasses only
 * ever read from their in-memory index; the index is what listens to the vault.
 */
export abstract class IndexedSource extends Component implements CalendarSource {
	abstract readonly id: string;
	/** Dictionary key for the name shown on this source's toggle in settings. */
	abstract readonly nameKey: TranslationKey;

	/** Resolved on read, so the name follows Obsidian's language. */
	get name(): string {
		return t(this.nameKey);
	}

	protected readonly ctx: SourceContext;

	/** Coalesces bursts of vault events into a single repaint. */
	protected readonly signalChange = debounce(
		() => {
			this.ctx.api.refresh(this.id);
		},
		REFRESH_DEBOUNCE_MS,
		true
	);

	constructor(ctx: SourceContext) {
		super();
		this.ctx = ctx;
	}

	override onload(): void {
		// Registration is immediate — the settings tab reads the source list when
		// it is built, and a source that appears later would miss its toggle.
		this.register(this.ctx.api.registerSource(this));

		const { vault, metadataCache } = this.ctx.app;
		this.registerEvent(
			vault.on('create', (file) => {
				if (file instanceof TFile) this.onFileChanged(file);
			})
		);
		this.registerEvent(
			vault.on('modify', (file) => {
				if (file instanceof TFile) this.onFileChanged(file);
			})
		);
		this.registerEvent(
			vault.on('delete', (file) => {
				this.onPathRemoved(file.path);
			})
		);
		this.registerEvent(
			vault.on('rename', (file, oldPath) => {
				this.onPathRemoved(oldPath);
				if (file instanceof TFile) this.onFileChanged(file);
			})
		);
		// `metadataCache` has no rename event on purpose — the typings say so —
		// which is why the vault events above are the ones that purge paths.
		this.registerEvent(
			metadataCache.on('changed', (file) => {
				this.onFileChanged(file);
			})
		);

		// Indexing, on the other hand, waits for the caches to be warm.
		this.ctx.app.workspace.onLayoutReady(() => {
			this.rebuild();
		});
	}

	abstract getMetadata(date: Moment, granularity: Granularity): CellMetadata | null;

	/** Builds the index from scratch. */
	protected abstract rebuild(): void;
	/** A file appeared or changed. */
	protected abstract onFileChanged(file: TFile): void;
	/** A path disappeared. `path` may be a folder. */
	protected abstract onPathRemoved(path: string): void;

	/**
	 * The note for a period, through the public API.
	 *
	 * The API only maps date → note, never the other way round, so a source
	 * cannot ask "is this file a periodic note?". That turns out to be the right
	 * shape: instead of indexing the vault up front, a source indexes the notes
	 * the calendar actually asks it about, which is at most a screenful.
	 */
	protected noteFor(date: Moment, granularity: Granularity): TFile | null {
		return this.ctx.api.resolveNote(date, granularity);
	}

	/**
	 * Walks every day of a `getSummary` range and returns how many there were.
	 *
	 * All three built-in figures are "something per day of the period", and the
	 * API maps date → note only, so each of them would otherwise write the same
	 * loop. `visit` receives one **reused** moment: read it, do not keep it —
	 * `resolveNote` clones what it is given, so passing it straight through is
	 * safe.
	 */
	protected eachDay(from: Moment, to: Moment, visit: (date: Moment) => void): number {
		const cursor = from.clone().startOf('day');
		const last = to.clone().startOf('day');
		let days = 0;
		while (!cursor.isAfter(last, 'day') && days < MAX_SUMMARY_DAYS) {
			visit(cursor);
			days += 1;
			cursor.add(1, 'day');
		}
		return days;
	}
}
