/**
 * Calendar Plus public API — the contract other plugins build against.
 *
 * Stability: this file is the published interface. Breaking changes require
 * bumping `CalendarPlusApi.version` and keeping the previous shape working for
 * at least one minor release.
 *
 * Consumers should copy this file (or its published .d.ts) rather than import
 * from the plugin, and must always degrade gracefully when Calendar Plus is
 * absent — see `getCalendarPlusApi` in the README for the recommended pattern.
 */

import type { Menu } from 'obsidian';

/** `moment` is provided globally by Obsidian; we only need the type here. */
type Moment = ReturnType<typeof window.moment>;

/**
 * A period a calendar cell can represent. `day` and `week` are the ones the
 * month grid renders; the coarser ones are reachable from the header.
 */
export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'semester' | 'year';

/** A small colored marker rendered inside a calendar cell. */
export interface Dot {
	/** Appended to the dot element's class list, for CSS targeting. */
	className?: string;
	/**
	 * A CSS color *value or variable*, e.g. `var(--color-accent)`.
	 * Never a literal hex: the calendar must follow the user's theme.
	 */
	color?: string;
	/** Filled dots read as "present"; hollow ones as "pending". */
	isFilled?: boolean;
}

/** What a source contributes to a single calendar cell. */
export interface CellMetadata {
	/** Markers to render in the cell. Keep it to a handful; space is tight. */
	dots?: Dot[];
	/**
	 * A magnitude for this cell. The calendar may render it as a number or map
	 * it to a background intensity, depending on the user's display settings.
	 */
	value?: number;
	/** Extra classes on the cell element, for CSS targeting. */
	classes?: string[];
	/** Tooltip text, shown on hover. Plain text, no markup. */
	tooltip?: string;
}

/**
 * A contributor of per-cell information to the calendar.
 *
 * Sources are called once per visible cell on every render, so `getMetadata`
 * must be cheap: read from an in-memory index, never scan the vault. Returning
 * a promise is allowed; the cell updates when it resolves.
 */
export interface CalendarSource {
	/** Stable, unique. Convention: the contributing plugin's id. */
	id: string;
	/** Human-readable, sentence case. Labels this source's toggle in settings. */
	name: string;

	/**
	 * Information for the cell representing `date` at `granularity`.
	 * Return `null` to contribute nothing to this cell.
	 */
	getMetadata(
		date: Moment,
		granularity: Granularity
	): CellMetadata | null | Promise<CellMetadata | null>;

	/**
	 * Called when something is dropped on a calendar cell. Return `true` if the
	 * drop was handled, which stops other sources from receiving it.
	 * Inspect `evt.dataTransfer` to decide whether the payload is yours.
	 */
	onDrop?(date: Moment, granularity: Granularity, evt: DragEvent): boolean;

	/** Add items to a cell's context menu. Called before the menu is shown. */
	onContextMenu?(date: Moment, granularity: Granularity, menu: Menu): void;
}

/** Events a consumer can subscribe to. */
export interface CalendarPlusEvents {
	'day-click': (date: Moment, granularity: Granularity, evt: MouseEvent) => void;
	'month-change': (displayedMonth: Moment) => void;
	/** Fired after a drop was accepted by some source. */
	'date-drop': (date: Moment, granularity: Granularity) => void;
}

export interface CalendarPlusApi {
	/** Contract version. Check it before using anything below. */
	readonly version: 1;

	/**
	 * Register a source. Returns an unregister function — call it in your
	 * plugin's `onunload`, or pass it to `this.register()`.
	 * Registering an id that already exists replaces the previous source.
	 */
	registerSource(source: CalendarSource): () => void;

	/**
	 * Ask the calendar to re-query sources and repaint. Pass a source id to
	 * signal that only that source's data changed.
	 */
	refresh(sourceId?: string): void;

	/** Scroll/switch the calendar to the period containing `date`. */
	revealDate(date: Moment, granularity: Granularity): void;

	/** The month currently displayed, as a moment at its first day. */
	getDisplayedMonth(): Moment;

	/** Subscribe to a calendar event. Returns an unsubscribe function. */
	on<K extends keyof CalendarPlusEvents>(
		event: K,
		callback: CalendarPlusEvents[K]
	): () => void;
}
