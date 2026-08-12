import { setTooltip } from 'obsidian';
import type { Dot, Granularity } from '../api/types';
import { periodUid, type Moment } from '../periodic/resolve';

/** How a numeric contribution from a source is rendered in a cell. */
export type ValueDisplay = 'none' | 'number' | 'intensity';

/**
 * What hovering a cell produces.
 *
 * - `preview` — Obsidian's own page preview of the period's note, plus a plain
 *   tooltip with the period, which is all there is to say when no note exists.
 * - `summary` — a tooltip with what the sources reported for the cell, and no
 *   preview: the view does not fire `hover-link` at all in this mode.
 * - `none` — nothing. Not even a tooltip, which is why the accessible name is
 *   kept out of `aria-label`; see {@link CalendarCell}.
 */
export type HoverMode = 'preview' | 'summary' | 'none';

/**
 * Number of intensity steps. Mirrored by `.calendar-plus-intensity-1…5` in
 * `styles.css`; buckets are used instead of an inline background so themes and
 * snippets stay in control of the actual colors.
 */
export const INTENSITY_BUCKETS = 5;

/** State the calendar itself knows about a cell, as opposed to sources. */
export interface CellFlags {
	isToday?: boolean;
	isActive?: boolean;
	isAdjacentMonth?: boolean;
	isWeekend?: boolean;
	hasNote?: boolean;
}

export interface CellSpec {
	parent: HTMLElement;
	date: Moment;
	granularity: Granularity;
	/** Text shown in the cell — the day number, the week number, `Q3`, `2026`. */
	text: string;
	/**
	 * Base class. For grid cells it is kept identical to the original plugin —
	 * `day` or `week-num` — so existing snippets keep working.
	 */
	cls: string;
	/**
	 * Element to build. A `div` gets a button role and joins the grid's roving
	 * tab stop; a real `button` — the header's period shortcuts — is already
	 * focusable and keeps its natural place in the tab order.
	 */
	tag?: 'div' | 'button';
	/** Accessible name and tooltip base, e.g. `1 August 2026`. */
	label: string;
	valueDisplay: ValueDisplay;
	/** What a hover over this cell produces. */
	hoverMode: HoverMode;
	flags: CellFlags;
}

/**
 * One interactive cell of the calendar.
 *
 * Everything a source may contribute — dots, a number, extra classes, a tooltip
 * — goes through the mutators below. The calendar's own state (today, active,
 * adjacent month, weekend, note exists) is kept separate so a repaint of
 * decorations never clobbers it, and vice versa. Phase 3 only has to call these
 * methods; it does not need to know how the cell is built.
 *
 * **The accessible name is not an `aria-label`.** Obsidian derives its tooltips
 * from that attribute, so a cell carrying its date there would show a tooltip in
 * every hover mode — and `none` has to mean none. The name therefore lives in a
 * visually hidden span, the visible number and value are `aria-hidden` so they
 * do not duplicate it, and the tooltip is left entirely to `setTooltip`.
 */
export class CalendarCell {
	readonly el: HTMLElement;
	readonly date: Moment;
	readonly granularity: Granularity;
	readonly uid: string;

	private readonly dotsEl: HTMLElement;
	/** Visually hidden span that carries the cell's accessible name. */
	private readonly nameEl: HTMLElement;
	private readonly labelBase: string;
	private readonly valueDisplay: ValueDisplay;
	private readonly hoverMode: HoverMode;

	private valueEl: HTMLElement | null = null;
	private sourceClasses: string[] = [];
	private sourceTooltip = '';
	private intensityClass: string | null = null;

	constructor(spec: CellSpec) {
		this.date = spec.date.clone();
		this.granularity = spec.granularity;
		this.uid = periodUid(spec.date, spec.granularity);
		this.labelBase = spec.label;
		this.valueDisplay = spec.valueDisplay;
		this.hoverMode = spec.hoverMode;

		this.el = spec.parent.createEl(spec.tag ?? 'div', { cls: spec.cls });
		if ((spec.tag ?? 'div') === 'div') {
			this.el.setAttribute('role', 'button');
			this.el.tabIndex = -1;
		}
		this.el.dataset.date = this.date.format('YYYY-MM-DD');
		this.el.dataset.granularity = this.granularity;

		const text = this.el.createSpan({ cls: 'calendar-plus-text', text: spec.text });
		// The bare number says nothing a screen reader needs; the hidden name below
		// says all of it, and reading both would just stutter.
		text.setAttribute('aria-hidden', 'true');
		this.nameEl = this.el.createSpan({ cls: 'calendar-plus-a11y-name' });
		this.dotsEl = this.el.createDiv({ cls: 'dot-container' });

		this.setFlags(spec.flags);
		this.refreshLabel();
	}

	/** Replaces the calendar's own state classes. */
	setFlags(flags: CellFlags): void {
		this.el.toggleClass('today', flags.isToday === true);
		this.el.toggleClass('active', flags.isActive === true);
		this.el.toggleClass('adjacent-month', flags.isAdjacentMonth === true);
		this.el.toggleClass('weekend', flags.isWeekend === true);
		this.el.toggleClass('has-note', flags.hasNote === true);
	}

	/** Whether this cell is the one for the currently active note. */
	setActive(active: boolean): void {
		this.el.toggleClass('active', active);
	}

	setToday(isToday: boolean): void {
		this.el.toggleClass('today', isToday);
	}

	setHasNote(hasNote: boolean): void {
		this.el.toggleClass('has-note', hasNote);
	}

	/** Markers contributed by sources. Replaces any previous set. */
	setDots(dots: readonly Dot[]): void {
		this.dotsEl.empty();
		for (const dot of dots) {
			const el = this.dotsEl.createSpan({ cls: 'dot' });
			el.toggleClass('filled', dot.isFilled !== false);
			el.toggleClass('hollow', dot.isFilled === false);
			if (dot.className) el.addClass(dot.className);
			if (dot.color) {
				// A dynamic custom property, so themes can still override it.
				el.style.setProperty('--calendar-plus-dot-color', dot.color);
			}
		}
	}

	/**
	 * A magnitude for this cell, rendered as a number or as a background
	 * intensity depending on the user's display setting. `scale` is the value
	 * that should read as "full"; it defaults to 1 so ratios can be passed in.
	 *
	 * Intensity applies to **day cells only** — see the comment at the bucket
	 * arithmetic below.
	 */
	setValue(value: number | null, scale = 1): void {
		if (this.intensityClass) {
			this.el.removeClass(this.intensityClass);
			this.intensityClass = null;
		}
		this.valueEl?.remove();
		this.valueEl = null;
		this.el.toggleClass('has-value', value !== null && value !== 0);
		if (value === null || this.valueDisplay === 'none') return;

		if (this.valueDisplay === 'number') {
			this.valueEl = this.el.createDiv({
				cls: 'calendar-plus-value',
				text: String(value),
			});
			// The figure is already in the cell's accessible name, through the
			// source's tooltip, and with more context than a bare number.
			this.valueEl.setAttribute('aria-hidden', 'true');
			return;
		}

		// Intensity is for **day cells only**. A week number is a 2.2em column and
		// the header's period buttons are wide blocks: shading those alongside the
		// days turned the grid into stripes and made a whole row read as selected,
		// which is the opposite of a heatmap. Coarser cells keep their tooltip, which
		// is where their figure was already available.
		if (this.granularity !== 'day') return;

		const ratio = scale > 0 ? value / scale : 0;
		const bucket = Math.min(INTENSITY_BUCKETS, Math.max(1, Math.ceil(ratio * INTENSITY_BUCKETS)));
		if (value > 0) {
			this.intensityClass = `calendar-plus-intensity-${String(bucket)}`;
			this.el.addClass(this.intensityClass);
		}
	}

	/** Extra classes contributed by sources. Replaces any previous set. */
	setSourceClasses(classes: readonly string[]): void {
		for (const cls of this.sourceClasses) this.el.removeClass(cls);
		this.sourceClasses = [...classes];
		for (const cls of this.sourceClasses) this.el.addClass(cls);
	}

	/** Extra tooltip text contributed by sources, appended to the period label. */
	setSourceTooltip(text: string | null): void {
		this.sourceTooltip = text ?? '';
		this.refreshLabel();
	}

	/** Drops everything sources contributed, keeping the calendar's own state. */
	clearDecoration(): void {
		this.setDots([]);
		this.setValue(null);
		this.setSourceClasses([]);
		this.setSourceTooltip(null);
	}

	/** Whether this cell is still part of the rendered grid. */
	get isLive(): boolean {
		return this.el.isConnected;
	}

	/**
	 * Keeps the accessible name and the tooltip in step with what the sources
	 * have contributed so far.
	 *
	 * The name always carries everything — a screen reader user has no hover, so
	 * the hover setting must not take information away from them. The tooltip is
	 * what the setting governs: the period alone while the preview is doing the
	 * talking, the full summary when it is the only thing on offer, and nothing
	 * at all when the user asked for nothing.
	 */
	private refreshLabel(): void {
		const full = this.sourceTooltip
			? `${this.labelBase}\n${this.sourceTooltip}`
			: this.labelBase;
		// Newlines read as line breaks in a tooltip but as nothing in a name.
		this.nameEl.setText(full.split('\n').join(' · '));
		if (this.hoverMode === 'none') return;
		setTooltip(this.el, this.hoverMode === 'summary' ? full : this.labelBase, {
			placement: 'top',
		});
	}
}
