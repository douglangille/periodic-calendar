import {
	ItemView,
	Keymap,
	Menu,
	Platform,
	TFile,
	debounce,
	type HoverParent,
	type HoverPopover,
	type WorkspaceLeaf,
} from 'obsidian';
import type { Granularity, SummaryCard } from '../api/types';
import { t } from '../i18n';
import type { PeriodicConfigStore } from '../periodic/config';
import { openPeriodicNote } from '../periodic/create';
import {
	getPeriodicNote,
	parsePeriodicNote,
	periodLabel,
	periodUid,
	startOfPeriod,
	type Moment,
} from '../periodic/resolve';
import type { PeriodicCalendarSettings } from '../settings';
import type { CalendarCell } from './day-cell';
import { renderFooter } from './footer';
import { renderHeader } from './header';
import { renderPreview } from './preview';
import {
	focusCell,
	locateCell,
	moveFocus,
	renderMonthGrid,
	setTabStop,
	type MonthGrid,
} from './month-grid';

export const CALENDAR_VIEW_TYPE = 'periodic-calendar-plus';

/** How often "today" is re-checked so the highlight survives midnight. */
const HEARTBEAT_MS = 60_000;

/**
 * Every element that is a cell, for the delegated listeners.
 *
 * The header's period buttons are in here with the days and the week numbers:
 * they are `CalendarCell`s of a real granularity, so clicking, right-clicking,
 * hovering and dropping on them has to work exactly as it does on a day. Leaving
 * them out is what used to make them look like cells and refuse drops.
 */
const CELL_SELECTOR = '.day, .week-num, .periodic-calendar-period';

/**
 * What the view needs from the plugin. Declared as an interface so the view
 * never imports `main.ts`, and so tests can drive it with a stub.
 */
export interface CalendarViewHost {
	settings: PeriodicCalendarSettings;
	configs: PeriodicConfigStore;
	/** Re-reads the vault's periodic note configuration. True when it changed. */
	refreshConfigs(): Promise<boolean>;
	/**
	 * Called once per visible cell after every repaint, and again whenever a
	 * source signals new data. Everything a source can contribute (dots, a
	 * value, classes, a tooltip) is applied through the cell's own mutators.
	 */
	decorateCell?(cell: CalendarCell): void;
	/** Lets sources add items to a cell's context menu before it is shown. */
	decorateMenu?(date: Moment, granularity: Granularity, menu: Menu): void;
	/**
	 * Whether some source would take the drag in progress on this cell. Asked on
	 * every `dragover`, so it must be synchronous; the cell only presents itself
	 * as a drop target when it answers true.
	 */
	acceptsDrop?(date: Moment, granularity: Granularity, evt: DragEvent): boolean;
	/** Offers a drop to the sources. True when one of them consumed it. */
	handleDrop?(date: Moment, granularity: Granularity, evt: DragEvent): boolean;
	/** Forwarded to the public API's `cell-click` event, mouse or keyboard. */
	notifyCellClick?(
		date: Moment,
		granularity: Granularity,
		evt: MouseEvent | KeyboardEvent
	): void;
	/** Forwarded to the public API's `month-change` event. */
	notifyMonthChange?(displayedMonth: Moment): void;
	/**
	 * Asks the sources for the footer's figures for `from`..`to` inclusive, once
	 * per repaint. `apply` runs synchronously with what was ready and again as
	 * slower sources answer; the registry drops answers from a superseded call.
	 */
	collectSummary?(
		from: Moment,
		to: Moment,
		apply: (cards: readonly SummaryCard[]) => void
	): void;
}

export class CalendarView extends ItemView implements HoverParent {
	override icon = 'calendar-days';
	hoverPopover: HoverPopover | null = null;

	private readonly host: CalendarViewHost;
	private displayedMonth: Moment;
	private today: Moment;
	private headerEl: HTMLElement | null = null;
	private gridEl: HTMLElement | null = null;
	private footerEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	/** The period last picked in `preview` mode; null until something is clicked. */
	private selected: { granularity: Granularity; date: Moment } | null = null;
	/** The note the preview currently shows, so edits to it can refresh it. */
	private previewPath: string | null = null;
	private previewToken = 0;
	private grid: MonthGrid | null = null;
	/** The header's period buttons, which are decorated like any other cell. */
	private headerCells: CalendarCell[] = [];
	private activePeriod: { granularity: Granularity; date: Moment } | null = null;
	private dropTarget: CalendarCell | null = null;
	private readonly repaintSoon = debounce(() => this.repaint(), 120, true);
	private readonly refreshPreviewSoon = debounce(() => void this.refreshPreview(), 200, true);

	constructor(leaf: WorkspaceLeaf, host: CalendarViewHost) {
		super(leaf);
		this.host = host;
		this.today = window.moment().startOf('day');
		this.displayedMonth = this.today.clone().startOf('month');
	}

	override getViewType(): string {
		return CALENDAR_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return t('viewTitle');
	}

	// Not `async`: there is nothing to await in here, and the linter the community
	// directory runs reports an async function without an `await` as a promise that
	// promises nothing. Obsidian only needs the `Promise` back.
	protected override onOpen(): Promise<void> {
		const root = this.contentEl.createDiv({ cls: 'container periodic-calendar-view' });
		root.toggleClass('is-mobile', Platform.isMobile);
		this.headerEl = root.createDiv({ cls: 'periodic-calendar-header' });
		this.gridEl = root.createDiv({ cls: 'periodic-calendar-grid' });
		// Created once and emptied on every repaint, like the header and the grid,
		// so the strip can never end up duplicated below the calendar.
		this.footerEl = root.createDiv({ cls: 'periodic-calendar-footer is-empty' });
		this.previewEl = root.createDiv({ cls: 'periodic-calendar-preview' });

		// One delegated listener per event type on a container that outlives every
		// repaint, so rebuilding the grid can never leak handlers.
		this.registerDomEvent(this.contentEl, 'click', (evt) => this.onCellClick(evt));
		this.registerDomEvent(this.contentEl, 'contextmenu', (evt) => this.onCellContextMenu(evt));
		this.registerDomEvent(this.contentEl, 'pointerover', (evt) => this.onCellHover(evt));
		this.registerDomEvent(this.contentEl, 'keydown', (evt) => this.onKeyDown(evt));
		this.registerDomEvent(this.contentEl, 'focusin', (evt) => this.onFocusIn(evt));
		this.registerDomEvent(this.contentEl, 'dragover', (evt) => this.onCellDragOver(evt));
		this.registerDomEvent(this.contentEl, 'dragleave', () => this.clearDropTarget());
		this.registerDomEvent(this.contentEl, 'dragend', () => this.clearDropTarget());
		this.registerDomEvent(this.contentEl, 'drop', (evt) => this.onCellDrop(evt));

		this.registerEvent(this.app.workspace.on('file-open', () => this.refreshActiveState()));
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => this.refreshActiveState())
		);
		this.registerEvent(
			this.app.vault.on('create', () => {
				this.repaintSoon();
				this.refreshPreviewSoon();
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', () => {
				this.repaintSoon();
				this.refreshPreviewSoon();
			})
		);
		this.registerEvent(
			this.app.vault.on('rename', () => {
				this.repaintSoon();
				this.refreshPreviewSoon();
			})
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file.path === this.previewPath) this.refreshPreviewSoon();
			})
		);

		// The heartbeat keeps "today" honest across midnight and picks up changes
		// to the periodic note configuration without a reload.
		this.registerInterval(window.setInterval(() => void this.tick(), HEARTBEAT_MS));

		this.repaint();
		return Promise.resolve();
	}

	// Not `async`: there is nothing to await in here, and the linter the community
	// directory runs reports an async function without an `await` as a promise that
	// promises nothing. Obsidian only needs the `Promise` back.
	protected override onClose(): Promise<void> {
		this.dropTarget = null;
		this.grid = null;
		this.headerCells = [];
		this.headerEl = null;
		this.gridEl = null;
		this.footerEl = null;
		this.previewEl = null;
		this.contentEl.empty();
		return Promise.resolve();
	}

	// ---------------------------------------------------------------- public API

	/** The month currently on screen, as a moment at its first day. */
	getDisplayedMonth(): Moment {
		return this.displayedMonth.clone();
	}

	/**
	 * Every cell currently rendered, header period buttons included: sources
	 * decorate all of them, which is what makes the coarse granularities of the
	 * `Granularity` type real rather than decorative.
	 */
	getCells(): readonly CalendarCell[] {
		return [...(this.grid?.cells ?? []), ...this.headerCells];
	}

	/** The rendered cell for a period, if it is on screen. */
	getCell(date: Moment, granularity: Granularity): CalendarCell | null {
		const uid = periodUid(date, granularity);
		return (
			this.grid?.byUid.get(uid) ?? this.headerCells.find((cell) => cell.uid === uid) ?? null
		);
	}

	/** Brings the month containing `date` on screen and focuses its cell. */
	revealDate(date: Moment, granularity: Granularity): void {
		this.setDisplayedMonth(startOfPeriod(date, 'month').clone());
		const cell = this.getCell(date, granularity);
		if (cell && this.grid) setTabStop(this.grid, cell);
	}

	/** Re-renders header and grid from scratch. */
	repaint(): void {
		if (!this.headerEl || !this.gridEl) return;
		this.syncLocale();
		this.readActivePeriod();

		this.headerCells = renderHeader(this.headerEl, {
			displayedMonth: this.displayedMonth,
			today: this.today,
			showPeriodShortcuts: this.host.settings.showPeriodShortcuts,
			valueDisplay: this.host.settings.valueDisplay,
			hoverMode: this.host.settings.hoverMode,
			isAvailable: (granularity) => this.host.configs.isEnabled(granularity),
			hasNote: (date, granularity) => this.noteExists(date, granularity),
			isActive: (date, granularity) => this.isActivePeriod(date, granularity),
			onPrevious: () => this.shiftMonth(-1),
			onNext: () => this.shiftMonth(1),
			onToday: () => this.goToToday(),
		});

		const focusedEl = this.contentEl.ownerDocument.activeElement;
		const hadCellFocus = this.grid?.cells.some((cell) => cell.el === focusedEl) ?? false;
		const previousFocusUid = this.grid?.cells.find((cell) => cell.el.tabIndex === 0)?.uid;
		this.grid = renderMonthGrid(this.gridEl, {
			displayedMonth: this.displayedMonth,
			today: this.today,
			showWeekNumbers: this.host.settings.showWeekNumbers,
			weekEnabled: this.host.configs.isEnabled('week'),
			valueDisplay: this.host.settings.valueDisplay,
			hoverMode: this.host.settings.hoverMode,
			hasNote: (date, granularity) => this.noteExists(date, granularity),
			isActive: (date, granularity) => this.isActivePeriod(date, granularity),
		});

		// The grid is rebuilt from scratch, so the tab stop — and keyboard focus,
		// if it was on a cell — has to be put back on an equivalent cell.
		const restored = previousFocusUid ? this.grid.byUid.get(previousFocusUid) : undefined;
		const fallback =
			this.grid.cells.find((cell) => cell.el.hasClass('today')) ??
			this.getCell(this.displayedMonth, 'day');
		const tabStop = restored ?? fallback ?? null;
		setTabStop(this.grid, tabStop);
		if (hadCellFocus && tabStop) focusCell(this.grid, tabStop);

		this.refreshDecorations();
		// Not on every repaint: moving between months must not re-render the note.
		// Only when the mode changed under the pane, or the pane was never filled.
		const preview = this.host.settings.clickAction === 'preview';
		if (preview !== (this.previewEl?.childElementCount !== 0)) void this.refreshPreview();
	}

	/** Re-queries the decoration seam for every visible cell, and the footer. */
	refreshDecorations(): void {
		const decorate = this.host.decorateCell?.bind(this.host);
		for (const cell of this.getCells()) {
			cell.clearDecoration();
			decorate?.(cell);
		}
		this.refreshSummary();
	}

	/**
	 * Rebuilds the footer from what the sources report for the displayed period.
	 *
	 * The range is the **displayed month**, not the 42 days the grid draws: the
	 * header says "August 2026", and a figure that quietly counted three days of
	 * July would not match it. Cells are decorated for the adjacent days; the
	 * footer summarises the period the calendar is about.
	 */
	private refreshSummary(): void {
		const footer = this.footerEl;
		if (!footer) return;
		if (!this.host.settings.showFooter || !this.host.collectSummary) {
			footer.empty();
			footer.addClass('is-empty');
			return;
		}
		const from = this.displayedMonth.clone().startOf('month');
		const to = this.displayedMonth.clone().endOf('month');
		this.host.collectSummary(from, to, (cards) => {
			// A promise from a repaint whose footer has since been thrown away.
			if (!footer.isConnected) return;
			renderFooter(footer, { cards, maxCards: this.host.settings.maxSummaryCards });
		});
	}

	/** Updates only the "active note" highlight, without rebuilding anything. */
	refreshActiveState(): void {
		this.readActivePeriod();
		for (const cell of this.getCells()) {
			cell.setActive(this.isActivePeriod(cell.date, cell.granularity));
		}
	}

	// ----------------------------------------------------------------- internals

	/**
	 * A `moment` instance keeps the locale it was created with, so after a locale
	 * change the stored dates have to be re-localed or the header would keep
	 * formatting month names in the old language.
	 */
	private syncLocale(): void {
		const locale = window.moment.locale();
		if (this.today.locale() !== locale) this.today = this.today.clone().locale(locale);
		if (this.displayedMonth.locale() !== locale) {
			this.displayedMonth = this.displayedMonth.clone().locale(locale);
		}
	}

	private async tick(): Promise<void> {
		const now = window.moment().startOf('day');
		const dayChanged = !now.isSame(this.today, 'day');
		if (dayChanged) this.today = now;
		const configChanged = await this.host.refreshConfigs();
		if (dayChanged || configChanged) this.repaint();
	}

	/**
	 * Single entry point for changing the month, so `month-change` is announced
	 * exactly once per real change, whatever triggered it.
	 */
	private setDisplayedMonth(month: Moment): void {
		const changed = !month.isSame(this.displayedMonth, 'month');
		this.displayedMonth = month;
		this.repaint();
		if (changed) this.host.notifyMonthChange?.(this.displayedMonth);
	}

	private shiftMonth(delta: number): void {
		this.setDisplayedMonth(this.displayedMonth.clone().add(delta, 'month').startOf('month'));
	}

	private goToToday(): void {
		this.today = window.moment().startOf('day');
		this.setDisplayedMonth(this.today.clone().startOf('month'));
		const cell = this.getCell(this.today, 'day');
		if (cell && this.grid) focusCell(this.grid, cell);
	}

	private readActivePeriod(): void {
		// In preview mode the ring marks what you picked, not the note that happens
		// to be open in the main pane.
		if (this.host.settings.clickAction === 'preview') {
			const { date, granularity } = this.selected ?? { date: this.today, granularity: 'day' as const };
			this.activePeriod = { granularity, date: startOfPeriod(date, granularity) };
			return;
		}
		const file = this.app.workspace.getActiveFile();
		this.activePeriod = file ? parsePeriodicNote(file, this.host.configs) : null;
	}

	private isActivePeriod(date: Moment, granularity: Granularity): boolean {
		const active = this.activePeriod;
		if (!active || active.granularity !== granularity) return false;
		return active.date.isSame(startOfPeriod(date, granularity), 'day');
	}

	private noteExists(date: Moment, granularity: Granularity): boolean {
		const config = this.host.configs.get(granularity);
		if (!config.enabled) return false;
		return getPeriodicNote(this.app, date, config) !== null;
	}

	/**
	 * The cell an event happened in — a day, a week number or a header period
	 * button. Every delegated listener that treats cells alike goes through here.
	 */
	private findCell(target: EventTarget | null): CalendarCell | null {
		if (!target || !(target as Node).instanceOf(Element)) return null;
		const el = (target as Element).closest<HTMLElement>(CELL_SELECTOR);
		if (!el) return null;
		return (
			this.grid?.byElement.get(el) ?? this.headerCells.find((cell) => cell.el === el) ?? null
		);
	}

	/**
	 * The cell an event happened in, but only if it is part of the month grid.
	 *
	 * Roving focus and arrow navigation are grid arithmetic: a header button has
	 * no row and no column, it is a real `<button>` that is already in the tab
	 * order, and it activates on Enter and Space by itself. Handing it to
	 * `setTabStop` would take the tab stop away from the grid, and handling its
	 * Enter here would open the note twice.
	 */
	private findGridCell(target: EventTarget | null): CalendarCell | null {
		const cell = this.findCell(target);
		if (!cell || !this.grid?.byElement.has(cell.el)) return null;
		return cell;
	}

	private onCellClick(evt: MouseEvent): void {
		const cell = this.findCell(evt.target);
		if (!cell) return;
		this.activatePeriod(cell.date, cell.granularity, evt);
	}

	/**
	 * The single path for "the user activated this period", whatever activated it
	 * — a click on a day, a click on a header button, or Enter on a focused cell.
	 * `cell-click` is announced exactly once per activation, at every granularity.
	 */
	private activatePeriod(
		date: Moment,
		granularity: Granularity,
		evt: MouseEvent | KeyboardEvent
	): void {
		this.host.notifyCellClick?.(date, granularity, evt);
		// Preview mode is two clicks: the first selects the period and shows its note,
		// a second on the ringed cell opens it (or offers to create it). Cmd/Ctrl-click
		// opens at once, in a new tab, without selecting first.
		if (
			this.host.settings.clickAction === 'preview' &&
			!Keymap.isModEvent(evt) &&
			!this.isActivePeriod(date, granularity)
		) {
			this.select(date, granularity);
			return;
		}
		void this.openPeriod(date, granularity, evt);
	}

	/** `preview` mode: make this period the selected one and show its note. */
	private select(date: Moment, granularity: Granularity): void {
		this.selected = { granularity, date: startOfPeriod(date, granularity).clone() };
		this.refreshActiveState();
		void this.refreshPreview();
	}

	/** Renders the selected period's note, or today's, into the pane below. */
	private async refreshPreview(): Promise<void> {
		const el = this.previewEl;
		if (!el) return;
		const token = ++this.previewToken;
		if (this.host.settings.clickAction !== 'preview') {
			this.previewPath = null;
			el.empty();
			return;
		}

		const { date, granularity } = this.selected ?? { date: this.today, granularity: 'day' as const };
		const config = this.host.configs.get(granularity);
		const file = config.enabled ? getPeriodicNote(this.app, date, config) : null;
		this.previewPath = file?.path ?? null;
		const text = file ? await this.app.vault.cachedRead(file) : null;
		if (token !== this.previewToken) return;

		await renderPreview(
			el,
			{
				app: this.app,
				component: this,
				label: periodLabel(date, granularity),
				file,
				configured: config.enabled,
				onOpen: () => void this.openPeriod(date, granularity, new MouseEvent('click')),
			},
			text,
			() => token !== this.previewToken || !el.isConnected
		);
	}

	private onCellDragOver(evt: DragEvent): void {
		const cell = this.findCell(evt.target);
		if (!cell || this.host.acceptsDrop?.(cell.date, cell.granularity, evt) !== true) {
			this.clearDropTarget();
			return;
		}
		// Preventing the default is what marks the cell as a valid drop target.
		evt.preventDefault();
		if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'copy';
		if (this.dropTarget === cell) return;
		this.clearDropTarget();
		this.dropTarget = cell;
		cell.el.addClass('is-drop-target');
	}

	private onCellDrop(evt: DragEvent): void {
		this.clearDropTarget();
		if (evt.defaultPrevented) return;
		const cell = this.findCell(evt.target);
		if (!cell) return;
		if (this.host.handleDrop?.(cell.date, cell.granularity, evt) === true) evt.preventDefault();
	}

	private clearDropTarget(): void {
		this.dropTarget?.el.removeClass('is-drop-target');
		this.dropTarget = null;
	}

	private async openPeriod(
		date: Moment,
		granularity: Granularity,
		evt: MouseEvent | KeyboardEvent
	): Promise<void> {
		await openPeriodicNote(this.app, date, granularity, this.host.configs, {
			newLeaf: Keymap.isModEvent(evt),
			confirmBeforeCreate: this.host.settings.confirmBeforeCreate,
		});
	}

	private onCellContextMenu(evt: MouseEvent): void {
		const cell = this.findCell(evt.target);
		if (!cell) return;
		this.showPeriodMenu(cell.date, cell.granularity, evt);
	}

	private showPeriodMenu(date: Moment, granularity: Granularity, evt: MouseEvent): void {
		evt.preventDefault();
		const config = this.host.configs.get(granularity);
		const file = config.enabled ? getPeriodicNote(this.app, date, config) : null;
		const menu = new Menu();

		// Sections are declared before triggering `file-menu` so our own entries
		// sort above the ones other plugins and core contribute.
		menu.addItem((item) =>
			item.setTitle(periodLabel(date, granularity)).setIsLabel(true).setSection('periodic-calendar')
		);

		if (file) {
			menu.addItem((item) =>
				item
					.setTitle(t('menuOpenInNewTab'))
					.setIcon('file-plus')
					.setSection('open')
					.onClick(() => void this.app.workspace.getLeaf('tab').openFile(file))
			);
			menu.addItem((item) =>
				item
					.setTitle(t('menuOpenToTheRight'))
					.setIcon('separator-vertical')
					.setSection('open')
					.onClick(() => void this.app.workspace.getLeaf('split').openFile(file))
			);
			menu.addItem((item) =>
				item
					.setTitle(t('menuDelete'))
					.setIcon('trash')
					.setSection('danger')
					.onClick(() => void this.app.fileManager.trashFile(file))
			);
			// Lets other plugins contribute their usual file actions, the same way
			// the original Calendar plugin did.
			this.app.workspace.trigger('file-menu', menu, file, 'periodic-calendar-context-menu');
		} else if (config.enabled) {
			menu.addItem((item) =>
				item
					.setTitle(t('menuCreateNote'))
					.setIcon('file-plus')
					.setSection('action')
					.onClick(() =>
						void openPeriodicNote(this.app, date, granularity, this.host.configs, {
							confirmBeforeCreate: false,
						})
					)
			);
		} else {
			menu.addItem((item) =>
				item.setTitle(t('menuNotConfigured')).setIsLabel(true).setSection('periodic-calendar')
			);
		}

		// Sources contribute last, so their items sit below the calendar's own.
		this.host.decorateMenu?.(date, granularity, menu);

		menu.showAtMouseEvent(evt);
	}

	/**
	 * Hovering a cell.
	 *
	 * Only `preview` hands anything to the core Page preview plugin. In the other
	 * two modes the `hover-link` event is never fired, so the popover does not
	 * appear at all — the plugin stays registered as a hover link source, but
	 * with nothing to say. What the cell shows instead is its tooltip, which the
	 * cell itself decided when it was built.
	 */
	private onCellHover(evt: MouseEvent): void {
		if (this.host.settings.hoverMode !== 'preview') return;
		const cell = this.findCell(evt.target);
		if (!cell) return;
		const config = this.host.configs.get(cell.granularity);
		if (!config.enabled) return;
		const file = getPeriodicNote(this.app, cell.date, config);
		if (!(file instanceof TFile)) return;
		// Hands the preview over to the core Page preview plugin.
		this.app.workspace.trigger('hover-link', {
			event: evt,
			source: CALENDAR_VIEW_TYPE,
			hoverParent: this,
			targetEl: cell.el,
			linktext: file.path,
			sourcePath: file.path,
		});
	}

	private onFocusIn(evt: FocusEvent): void {
		const cell = this.findGridCell(evt.target);
		if (cell && this.grid) setTabStop(this.grid, cell);
	}

	private onKeyDown(evt: KeyboardEvent): void {
		const cell = this.findGridCell(evt.target);
		const grid = this.grid;
		if (!cell || !grid) return;

		const at = locateCell(grid, cell);
		let handled = true;
		switch (evt.key) {
			case 'ArrowLeft':
				handled = moveFocus(grid, cell, 0, -1);
				break;
			case 'ArrowRight':
				handled = moveFocus(grid, cell, 0, 1);
				break;
			case 'ArrowUp':
				handled = moveFocus(grid, cell, -1, 0);
				break;
			case 'ArrowDown':
				handled = moveFocus(grid, cell, 1, 0);
				break;
			case 'Home': {
				// Stay among day cells: the week column is not "the first day".
				const first = cell.granularity === 'day' ? grid.dayColumnOffset : 0;
				handled = at ? moveFocus(grid, cell, 0, first - at.col) : false;
				break;
			}
			case 'End': {
				const row = at ? grid.rows[at.row] : undefined;
				handled = at && row ? moveFocus(grid, cell, 0, row.length - 1 - at.col) : false;
				break;
			}
			case 'PageUp':
				this.shiftMonth(-1);
				break;
			case 'PageDown':
				this.shiftMonth(1);
				break;
			case 'Enter':
			case ' ':
				this.activatePeriod(cell.date, cell.granularity, evt);
				break;
			default:
				handled = false;
		}
		if (handled) evt.preventDefault();
	}
}
