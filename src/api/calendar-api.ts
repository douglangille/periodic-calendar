import type { Menu, TFile } from 'obsidian';
import { sourceClassName } from '../domain/class-names';
import type { CalendarCell } from '../calendar/day-cell';
import type { Moment } from '../periodic/resolve';
import type {
	PeriodicCalendarApi,
	PeriodicCalendarEvents,
	CalendarSource,
	CellMetadata,
	Dot,
	Granularity,
	SummaryCard,
} from './types';

/**
 * How many times in a row a source may throw from `getMetadata` before it is
 * sidelined. A broken source must not be able to break every render.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * A rendered calendar the registry can drive. `CalendarView` satisfies it
 * structurally, so nothing here has to import the view.
 */
export interface CalendarSurface {
	repaint(): void;
	refreshDecorations(): void;
	revealDate(date: Moment, granularity: Granularity): void;
	getDisplayedMonth(): Moment;
}

/** What the registry needs from the plugin, without importing `main.ts`. */
export interface CalendarApiHost {
	/** Every calendar currently open. May be empty. */
	getSurfaces(): readonly CalendarSurface[];
	/**
	 * Opens the calendar view, or reveals it if already open, and resolves only
	 * once {@link getSurfaces} can see it. Backs the public `openView`, which
	 * exists so a consumer never has to name the view type.
	 */
	openView(): Promise<void>;
	/** Whether the user left this source's toggle on in settings. */
	isSourceEnabled(sourceId: string): boolean;
	/** A source was registered or dropped; the settings toggles have to follow. */
	onSourcesChanged(): void;
	/**
	 * The existing note for a period, or null. Backs the public `resolveNote`,
	 * which is what every source uses instead of re-reading the vault's periodic
	 * note configuration for itself.
	 */
	resolveNote(date: Moment, granularity: Granularity): TFile | null;
}

/** A registered source, as the settings tab needs to see it. */
export interface SourceInfo {
	id: string;
	name: string;
	/** True once the source threw too often and stopped being queried. */
	degraded: boolean;
}

interface SourceEntry {
	source: CalendarSource;
	/** Consecutive `getMetadata` throws; reset by any success. */
	failures: number;
	degraded: boolean;
}

/**
 * Everything the enabled sources contributed to a single cell.
 *
 * The combination policy is part of the published contract: dots and classes
 * are concatenated in registration order, tooltips are joined with newlines,
 * and values are summed.
 */
interface Decoration {
	dots: Dot[];
	classes: string[];
	tooltips: string[];
	value: number | null;
	/** Sum of the contributors' `valueScale`s. Only meaningful if none omitted it. */
	scale: number | null;
	/** True as soon as one contributor gives a value without a scale. */
	unscaled: boolean;
}

/** An empty decoration, so every pass starts from the same shape. */
function emptyDecoration(): Decoration {
	return { dots: [], classes: [], tooltips: [], value: null, scale: null, unscaled: false };
}

function isThenable<T>(value: unknown): value is Promise<T> {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

/**
 * Copies the fields the footer renders out of whatever a source handed over.
 *
 * The object belongs to the source, which may keep mutating it, and nothing
 * guarantees it has the declared shape — a card with no label or a numeric
 * `value` would otherwise reach `createSpan` and render `undefined`.
 */
function toCard(raw: unknown): SummaryCard | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const card = raw as Partial<SummaryCard>;
	if (typeof card.label !== 'string' || typeof card.value !== 'string') return null;
	const copy: SummaryCard = { label: card.label, value: card.value };
	if (typeof card.icon === 'string') copy.icon = card.icon;
	if (typeof card.tooltip === 'string') copy.tooltip = card.tooltip;
	// Bound to the original, so a source can write `onClick() { this.… }`.
	if (typeof card.onClick === 'function') copy.onClick = card.onClick.bind(raw);
	return copy;
}

function toCards(raw: SummaryCard[] | null | undefined): SummaryCard[] {
	if (!Array.isArray(raw)) return [];
	const cards: SummaryCard[] = [];
	for (const item of raw) {
		const card = toCard(item);
		if (card) cards.push(card);
	}
	return cards;
}

/**
 * The source registry behind `PeriodicCalendarApi`.
 *
 * Three things are worth knowing about how it behaves:
 *
 * - **Overlapping repaints.** Every call to {@link decorate} opens a numbered
 *   pass for that cell. A promise returned by a source is only applied if the
 *   cell has not started a newer pass and is still in the document, so a slow
 *   source from a previous render can never paint over the current one.
 * - **Failure containment.** A throw is caught, logged and counted; after
 *   {@link MAX_CONSECUTIVE_FAILURES} in a row the source stops being queried
 *   until it is re-registered or explicitly refreshed.
 * - **Value scaling.** A cell whose contributors all declared a `valueScale` is
 *   painted immediately against that scale. The rest are collected across the
 *   grid and applied in a microtask, once the largest one is known, because the
 *   intensity rendering needs a scale the individual cell cannot know. The
 *   largest is taken **per granularity**: a month button holding the sum of its
 *   days must not flatten every day cell to the palest bucket.
 */
export class CalendarApiRegistry implements PeriodicCalendarApi {
	readonly version = 1 as const;

	private readonly host: CalendarApiHost;
	private readonly entries = new Map<string, SourceEntry>();
	private readonly listeners: { [K in keyof PeriodicCalendarEvents]: Set<PeriodicCalendarEvents[K]> } = {
		'cell-click': new Set(),
		'month-change': new Set(),
		'date-drop': new Set(),
	};
	/** Numeric contributions per cell, kept until the scale can be computed. */
	private readonly values = new Map<CalendarCell, number>();
	/** The pass each cell last started, so stale promises can be recognised. */
	private readonly passes = new WeakMap<CalendarCell, number>();
	private passCounter = 0;
	private scalePending = false;
	/** The footer collection currently in flight, so stale ones can be dropped. */
	private summaryPass = 0;

	constructor(host: CalendarApiHost) {
		this.host = host;
	}

	// ------------------------------------------------------------ public API

	registerSource(source: CalendarSource): () => void {
		if (!source.id) throw new Error('Periodic Calendar: a source needs a non-empty id.');
		const entry: SourceEntry = { source, failures: 0, degraded: false };
		this.entries.set(source.id, entry);
		this.host.onSourcesChanged();
		this.refresh(source.id);
		return () => {
			// A newer source may already have taken this id; unregistering the old
			// one must not remove its replacement.
			if (this.entries.get(source.id) !== entry) return;
			this.entries.delete(source.id);
			this.host.onSourcesChanged();
			this.refresh(source.id);
		};
	}

	refresh(sourceId?: string): void {
		if (sourceId !== undefined) {
			// An explicit refresh means "I have new data": give a sidelined source
			// another chance instead of keeping it dead until the next reload.
			const entry = this.entries.get(sourceId);
			if (entry) {
				entry.failures = 0;
				entry.degraded = false;
			}
		}
		for (const surface of this.host.getSurfaces()) {
			if (sourceId === undefined) surface.repaint();
			else surface.refreshDecorations();
		}
	}

	resolveNote(date: Moment, granularity: Granularity): TFile | null {
		// Cloned before it leaves the caller's hands, for the same reason the
		// cell's date is: the host must not be able to mutate someone else's moment.
		return this.host.resolveNote(date.clone(), granularity);
	}

	openView(): Promise<void> {
		// The view type is deliberately not part of the contract, so opening it is
		// the plugin's job; the registry only forwards the promise, whose whole
		// point is that awaiting it makes `revealDate` below find a surface.
		return this.host.openView();
	}

	revealDate(date: Moment, granularity: Granularity): void {
		for (const surface of this.host.getSurfaces()) surface.revealDate(date, granularity);
	}

	getDisplayedMonth(): Moment {
		const surface = this.host.getSurfaces()[0];
		// With no calendar open there is nothing displayed; the current month is
		// the only answer that is never wrong for the caller's arithmetic.
		return surface ? surface.getDisplayedMonth() : window.moment().startOf('month');
	}

	on<K extends keyof PeriodicCalendarEvents>(event: K, callback: PeriodicCalendarEvents[K]): () => void {
		const set: Set<PeriodicCalendarEvents[K]> = this.listeners[event];
		set.add(callback);
		return () => {
			set.delete(callback);
		};
	}

	// ------------------------------------------------------- used by the plugin

	/** Registered sources, for the per-source toggles in settings. */
	listSources(): SourceInfo[] {
		return [...this.entries.values()].map((entry) => ({
			id: entry.source.id,
			name: entry.source.name,
			degraded: entry.degraded,
		}));
	}

	/**
	 * Applies every enabled source's contribution to one cell. Called by the
	 * view once per visible cell after each repaint.
	 */
	decorate(cell: CalendarCell): void {
		const pass = ++this.passCounter;
		this.passes.set(cell, pass);
		this.values.delete(cell);

		const decoration = emptyDecoration();
		for (const entry of this.activeEntries()) {
			let result: CellMetadata | null | Promise<CellMetadata | null>;
			try {
				// The cell's own date is handed out as a clone: a source that
				// mutated it would silently corrupt the grid.
				result = entry.source.getMetadata(cell.date.clone(), cell.granularity);
			} catch (error) {
				this.recordFailure(entry, error);
				continue;
			}
			if (isThenable(result)) {
				void result.then(
					(metadata) => {
						entry.failures = 0;
						if (this.passes.get(cell) !== pass || !cell.isLive) return;
						this.merge(decoration, entry.source.id, metadata);
						this.apply(cell, decoration);
					},
					(error: unknown) => {
						this.recordFailure(entry, error);
					}
				);
			} else {
				entry.failures = 0;
				this.merge(decoration, entry.source.id, result);
			}
		}
		this.apply(cell, decoration);
	}

	/**
	 * Collects the footer's cards for the period on display, from every enabled
	 * source that implements `getSummary`.
	 *
	 * Unlike {@link decorate} this runs **once per repaint**, not once per cell,
	 * and the same two guarantees apply:
	 *
	 * - **Overlapping repaints.** Each call opens a numbered pass. A promise that
	 *   lands after a newer collection started is dropped, so last month's totals
	 *   can never replace this month's.
	 * - **Failure containment.** A throw is caught and logged and that source
	 *   simply contributes nothing. It is *not* counted towards the degradation
	 *   that sidelines a source, which the contract defines over `getMetadata`:
	 *   one bad figure in the footer is no reason to stop painting dots.
	 *
	 * `apply` is called synchronously with whatever was ready, and again after
	 * each promise resolves. Cards keep registration order regardless of the
	 * order the promises land in, so the strip does not reshuffle itself.
	 */
	collectSummary(from: Moment, to: Moment, apply: (cards: SummaryCard[]) => void): void {
		const pass = ++this.summaryPass;
		const entries = this.activeEntries().filter((entry) => 'getSummary' in entry.source);
		// One slot per source, filled in place: order comes from registration, not
		// from how fast each source answers.
		const slots: SummaryCard[][] = entries.map(() => []);
		const emit = () => {
			apply(slots.flat());
		};

		for (const [index, entry] of entries.entries()) {
			let result: SummaryCard[] | null | Promise<SummaryCard[] | null>;
			try {
				// Cloned like every other date the registry hands out: a source that
				// mutated the range would move the calendar underneath itself.
				result = entry.source.getSummary?.(from.clone(), to.clone()) ?? null;
			} catch (error) {
				this.logError(entry, 'getSummary', error);
				continue;
			}
			if (isThenable<SummaryCard[] | null>(result)) {
				void result.then(
					(cards) => {
						if (this.summaryPass !== pass) return;
						slots[index] = toCards(cards);
						emit();
					},
					(error: unknown) => {
						this.logError(entry, 'getSummary', error);
					}
				);
			} else {
				slots[index] = toCards(result);
			}
		}
		emit();
	}

	/**
	 * Whether some enabled source would take this drag on this cell.
	 *
	 * Consulted on `dragover`, so it stays synchronous: a source that declares no
	 * `canDrop` is assumed interested in anything, which is what the calendar did
	 * before the hook existed.
	 */
	acceptsDrop(date: Moment, granularity: Granularity, evt: DragEvent): boolean {
		return this.activeEntries().some((entry) => this.wouldAccept(entry, date, granularity, evt));
	}

	/** Offers a drop to each enabled source; the first taker consumes it. */
	handleDrop(date: Moment, granularity: Granularity, evt: DragEvent): boolean {
		for (const entry of this.activeEntries()) {
			// A source that just said it does not want this payload does not get
			// offered it: `canDrop` would otherwise be a lie told to the user only.
			if (!this.wouldAccept(entry, date, granularity, evt)) continue;
			let handled = false;
			try {
				handled = entry.source.onDrop?.(date.clone(), granularity, evt) ?? false;
			} catch (error) {
				this.logError(entry, 'onDrop', error);
				continue;
			}
			if (!handled) continue;
			this.emitDateDrop(date, granularity);
			return true;
		}
		return false;
	}

	/** Lets each enabled source add items to a cell's context menu. */
	decorateMenu(date: Moment, granularity: Granularity, menu: Menu): void {
		for (const entry of this.activeEntries()) {
			if (!('onContextMenu' in entry.source)) continue;
			try {
				entry.source.onContextMenu?.(date.clone(), granularity, menu);
			} catch (error) {
				this.logError(entry, 'onContextMenu', error);
			}
		}
	}

	/** A cell was activated, by mouse or by keyboard, at any granularity. */
	emitCellClick(date: Moment, granularity: Granularity, evt: MouseEvent | KeyboardEvent): void {
		this.dispatch('cell-click', (callback) => {
			callback(date.clone(), granularity, evt);
		});
	}

	emitMonthChange(displayedMonth: Moment): void {
		this.dispatch('month-change', (callback) => {
			callback(displayedMonth.clone());
		});
	}

	// ------------------------------------------------------------- internals

	private emitDateDrop(date: Moment, granularity: Granularity): void {
		this.dispatch('date-drop', (callback) => {
			callback(date.clone(), granularity);
		});
	}

	private dispatch<K extends keyof PeriodicCalendarEvents>(
		event: K,
		invoke: (callback: PeriodicCalendarEvents[K]) => void
	): void {
		// A copy, so a listener that unsubscribes itself cannot break the loop.
		for (const callback of [...this.listeners[event]]) {
			try {
				invoke(callback);
			} catch (error) {
				console.error(`Periodic Calendar: a "${event}" listener threw`, error);
			}
		}
	}

	private activeEntries(): SourceEntry[] {
		const active: SourceEntry[] = [];
		for (const entry of this.entries.values()) {
			if (entry.degraded) continue;
			if (!this.host.isSourceEnabled(entry.source.id)) continue;
			active.push(entry);
		}
		return active;
	}

	/**
	 * Whether `entry` would take this drag. A source with no `onDrop` never
	 * would; one with no `canDrop` always would.
	 */
	private wouldAccept(
		entry: SourceEntry,
		date: Moment,
		granularity: Granularity,
		evt: DragEvent
	): boolean {
		// `in` rather than reading the property: the hook is only ever called
		// through the source, so its `this` is never separated from it.
		if (!('onDrop' in entry.source)) return false;
		if (!('canDrop' in entry.source)) return true;
		try {
			return entry.source.canDrop?.(date.clone(), granularity, evt) ?? true;
		} catch (error) {
			this.logError(entry, 'canDrop', error);
			return false;
		}
	}

	private merge(into: Decoration, sourceId: string, metadata: CellMetadata | null): void {
		if (!metadata) return;
		for (const dot of metadata.dots ?? []) {
			// Rebuilt rather than mutated: the object belongs to the source.
			const namespaced: Dot = { color: dot.color, isFilled: dot.isFilled };
			const className = dot.className ? sourceClassName(sourceId, dot.className) : null;
			if (className) namespaced.className = className;
			into.dots.push(namespaced);
		}
		for (const cls of metadata.classes ?? []) {
			const namespaced = sourceClassName(sourceId, cls);
			if (namespaced) into.classes.push(namespaced);
		}
		if (metadata.tooltip) into.tooltips.push(metadata.tooltip);
		if (typeof metadata.value === 'number' && Number.isFinite(metadata.value)) {
			// Several sources may contribute a magnitude; the cell shows one, so
			// they add up — and so do their declared maxima.
			into.value = (into.value ?? 0) + metadata.value;
			const scale = metadata.valueScale;
			if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) {
				into.scale = (into.scale ?? 0) + scale;
			} else {
				into.unscaled = true;
			}
		}
	}

	private apply(cell: CalendarCell, decoration: Decoration): void {
		cell.setDots(decoration.dots);
		cell.setSourceClasses(decoration.classes);
		cell.setSourceTooltip(decoration.tooltips.length > 0 ? decoration.tooltips.join('\n') : null);
		if (decoration.value === null) {
			this.values.delete(cell);
			cell.setValue(null);
			return;
		}
		// Every contributor declared its own maximum, so this cell needs nothing
		// from its neighbours and can be painted now — and it will shade the same
		// in every month, which is the point of `valueScale`.
		if (!decoration.unscaled && decoration.scale !== null) {
			this.values.delete(cell);
			cell.setValue(decoration.value, decoration.scale);
			return;
		}
		this.values.set(cell, decoration.value);
		this.scheduleScale();
	}

	/**
	 * Intensity needs the largest value on screen, which no single cell knows.
	 * Values are therefore applied once the synchronous decoration loop is over.
	 */
	private scheduleScale(): void {
		if (this.scalePending) return;
		this.scalePending = true;
		queueMicrotask(() => {
			this.scalePending = false;
			this.applyValues();
		});
	}

	private applyValues(): void {
		// One scale per granularity: day cells are compared with day cells, and a
		// header button carrying a whole month's total does not drown them out.
		const scales = new Map<Granularity, number>();
		for (const [cell, value] of this.values) {
			// Cells from previous grids are detached; drop them instead of letting
			// them keep a whole rendered month alive.
			if (!cell.isLive) {
				this.values.delete(cell);
				continue;
			}
			if (value > (scales.get(cell.granularity) ?? 0)) scales.set(cell.granularity, value);
		}
		for (const [cell, value] of this.values) {
			const scale = scales.get(cell.granularity) ?? 0;
			cell.setValue(value, scale > 0 ? scale : 1);
		}
	}

	private recordFailure(entry: SourceEntry, error: unknown): void {
		entry.failures += 1;
		console.error(`Periodic Calendar: source "${entry.source.id}" threw from getMetadata`, error);
		if (entry.degraded || entry.failures < MAX_CONSECUTIVE_FAILURES) return;
		entry.degraded = true;
		console.error(
			`Periodic Calendar: source "${entry.source.id}" stopped being queried after ${String(
				MAX_CONSECUTIVE_FAILURES
			)} consecutive failures. It will be retried when it calls refresh() or is registered again.`
		);
	}

	private logError(entry: SourceEntry, hook: string, error: unknown): void {
		// Drop and menu hooks are not on the render path, so they only get logged;
		// one bad menu item is not a reason to stop querying the source.
		console.error(`Periodic Calendar: source "${entry.source.id}" threw from ${hook}`, error);
	}
}
