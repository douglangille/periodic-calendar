import { TFile, debounce } from 'obsidian';
import type { CellMetadata, Dot, Granularity, SummaryCard } from '../api/types';
import { t } from '../i18n';
import { compactNumber } from '../domain/settings';
import { countWords, forgetPath } from '../domain/sources';
import type { Moment } from '../periodic/resolve';
import { IndexedSource } from './context';
import { WORD_COUNT_SOURCE_ID } from './ids';

/** Upper bound on dots, so a very long note cannot fill the cell. */
const MAX_DOTS = 5;

/** How long reads are batched before the index is published. */
const READ_DEBOUNCE_MS = 250;

/**
 * Dots and a magnitude from how much was written in a period's note.
 *
 * The original Calendar plugin had a `wordsPerDot` setting; it belongs to this
 * source now and is read on every render, so changing it repaints without
 * re-reading anything.
 *
 * Reading files is the expensive part, and the API maps dates to notes but not
 * the other way round, so the index is filled **lazily**: the first time the
 * calendar asks about a note, the read is queued and the cell contributes
 * nothing; when the read lands, `refresh()` repaints it. At most a screenful of
 * notes is ever read, however large the vault is.
 */
export class WordCountSource extends IndexedSource {
	readonly id = WORD_COUNT_SOURCE_ID;
	readonly nameKey = 'sourceWordCountName';

	private readonly counts = new Map<string, number>();
	private readonly queue = new Set<string>();
	private readonly drainQueue = debounce(
		() => {
			void this.processQueue();
		},
		READ_DEBOUNCE_MS,
		true
	);

	getMetadata(date: Moment, granularity: Granularity): CellMetadata | null {
		const file = this.noteFor(date, granularity);
		if (!file) return null;
		const words = this.counts.get(file.path);
		if (words === undefined) {
			// Never read: queue it and say nothing for now. Reading here would put
			// file I/O on the render path, which the contract forbids.
			this.queue.add(file.path);
			this.drainQueue();
			return null;
		}
		if (words === 0) return null;

		const perDot = Math.max(1, Math.floor(this.ctx.getWordsPerDot()));
		const dots: Dot[] = [];
		for (let index = 0; index < Math.min(MAX_DOTS, Math.floor(words / perDot)); index++) {
			dots.push({ className: 'word' });
		}
		// Two forms rather than one, so a single word does not read "1 words".
		const key = words === 1 ? 'sourceWordCountTooltipOne' : 'sourceWordCountTooltip';
		const tooltip = t(key, { count: words });
		return { dots, value: words, tooltip };
	}

	/**
	 * How much was written across the period.
	 *
	 * Same lazy contract as `getMetadata`: a note nobody has read yet is queued
	 * and left out of this total, which lands complete on the repaint that the
	 * finished read triggers. Reading here would put file I/O on the render path.
	 */
	getSummary(from: Moment, to: Moment): SummaryCard[] | null {
		let total = 0;
		let pending = false;
		this.eachDay(from, to, (date) => {
			const file = this.noteFor(date, 'day');
			if (!file) return;
			const words = this.counts.get(file.path);
			if (words === undefined) {
				this.queue.add(file.path);
				pending = true;
				return;
			}
			total += words;
		});
		if (pending) this.drainQueue();
		if (total === 0) return null;
		return [
			{
				label: t('summaryWordsLabel'),
				value: compactNumber(total),
				icon: 'pencil-line',
				tooltip: t('summaryWordsTooltip', { count: total }),
			},
		];
	}

	protected rebuild(): void {
		// Nothing to build up front. Dropping what was cached is enough: the notes
		// on screen are re-read the moment they are asked about again.
		if (this.counts.size === 0) return;
		this.counts.clear();
		this.signalChange();
	}

	protected onFileChanged(file: TFile): void {
		if (file.extension !== 'md') return;
		// Only a note the calendar has already asked about can be on screen. A new
		// one gets read when a repaint asks for it, which a vault create triggers.
		if (!this.counts.has(file.path)) return;
		this.queue.add(file.path);
		this.drainQueue();
	}

	protected onPathRemoved(path: string): void {
		forgetPath(this.queue, path);
		if (forgetPath(this.counts, path)) this.signalChange();
	}

	private async processQueue(): Promise<void> {
		const paths = [...this.queue];
		this.queue.clear();
		let changed = false;
		for (const path of paths) {
			const file = this.ctx.app.vault.getFileByPath(path);
			if (!(file instanceof TFile)) {
				if (this.counts.delete(path)) changed = true;
				continue;
			}
			// `cachedRead` is the right call here: the content is only read, and
			// this never runs inside `getMetadata`.
			const words = countWords(await this.ctx.app.vault.cachedRead(file));
			if (this.counts.get(path) === words) continue;
			this.counts.set(path, words);
			changed = true;
		}
		if (changed) this.signalChange();
	}
}
