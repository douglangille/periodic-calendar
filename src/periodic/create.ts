import {
	Modal,
	Notice,
	TFile,
	normalizePath,
	type App,
	type PaneType,
} from 'obsidian';
import type { Granularity } from '../api/types';
import { t } from '../i18n';
import { type PeriodicConfig, type PeriodicConfigStore } from './config';
import {
	formatPeriod,
	getPeriodicNote,
	periodicNotePath,
	startOfPeriod,
	type Moment,
} from './resolve';

/** Asks before creating a note, mirroring the original plugin's affordance. */
class ConfirmCreateModal extends Modal {
	private confirmed = false;

	constructor(
		app: App,
		private readonly noteName: string,
		private readonly onConfirm: () => void
	) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle(t('modalNewNoteTitle'));
		this.contentEl.createEl('p', {
			text: t('modalNewNoteBody', { name: this.noteName }),
		});
		const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const create = buttons.createEl('button', {
			cls: 'mod-cta',
			text: t('modalCreate'),
		});
		create.addEventListener('click', () => {
			this.confirmed = true;
			this.close();
		});
		const cancel = buttons.createEl('button', { text: t('modalCancel') });
		cancel.addEventListener('click', () => this.close());
		create.focus();
	}

	override onClose(): void {
		this.contentEl.empty();
		if (this.confirmed) this.onConfirm();
	}
}

/** Creates every missing folder in `folder`. */
async function ensureFolder(app: App, folder: string): Promise<void> {
	const path = normalizePath(folder.replace(/^\/+|\/+$/g, ''));
	if (!path || path === '/' || app.vault.getFolderByPath(path)) return;
	try {
		await app.vault.createFolder(path);
	} catch (err) {
		// Another writer may have created it between the check and the call.
		if (!app.vault.getFolderByPath(path)) throw err;
	}
}

/**
 * Contents of the configured template, or an empty string.
 *
 * The template path may or may not carry the `.md` extension — core Daily notes
 * stores it without — so it is resolved as a link target.
 */
async function readTemplate(app: App, template: string): Promise<string> {
	const trimmed = template.trim();
	if (!trimmed) return '';
	const file = app.metadataCache.getFirstLinkpathDest(normalizePath(trimmed), '');
	if (!(file instanceof TFile)) {
		new Notice(t('noticeTemplateUnreadable', { path: trimmed }));
		return '';
	}
	return app.vault.cachedRead(file);
}

/**
 * Substitutes the template placeholders core Daily notes and the original
 * Calendar plugin both understand: `{{date}}`, `{{time}}`, `{{title}}`,
 * `{{date:FORMAT}}`, `{{date+3d:FORMAT}}`, `{{yesterday}}`, `{{tomorrow}}`, and
 * `{{monday:FORMAT}}`-style weekday references for week-level notes.
 */
export function applyTemplateTokens(
	contents: string,
	date: Moment,
	config: PeriodicConfig
): string {
	const { moment } = window;
	const start = startOfPeriod(date, config.granularity);
	const title = formatPeriod(date, config);
	const now = moment();

	return contents
		.replace(/\{\{\s*title\s*\}\}/gi, title)
		.replace(/\{\{\s*time\s*\}\}/gi, now.format('HH:mm'))
		.replace(
			/\{\{\s*(?:date|time)\s*(?:([+-]\d+)([yqmwdhs]))?\s*(?::(.+?))?\}\}/gi,
			(_match, delta: string | undefined, unit: string | undefined, format: string | undefined) => {
				const value = start.clone().set({
					hour: now.hour(),
					minute: now.minute(),
					second: now.second(),
				});
				if (delta && unit) {
					value.add(parseInt(delta, 10), unit as 'd');
				}
				return format ? value.format(format.trim()) : title;
			}
		)
		.replace(/\{\{\s*yesterday\s*\}\}/gi, start.clone().subtract(1, 'day').format(config.format))
		.replace(/\{\{\s*tomorrow\s*\}\}/gi, start.clone().add(1, 'day').format(config.format))
		.replace(
			/\{\{\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*:(.+?)\}\}/gi,
			(_match, weekday: string, format: string) => {
				const index = [
					'sunday',
					'monday',
					'tuesday',
					'wednesday',
					'thursday',
					'friday',
					'saturday',
				].indexOf(weekday.toLowerCase());
				return start.clone().weekday(index).format(format.trim());
			}
		);
}

/** Creates the note for a period from its template. Throws on failure. */
export async function createPeriodicNote(
	app: App,
	date: Moment,
	config: PeriodicConfig
): Promise<TFile> {
	await ensureFolder(app, config.folder);
	const template = await readTemplate(app, config.template);
	const path = periodicNotePath(date, config);
	const existing = app.vault.getFileByPath(path);
	if (existing) return existing;
	return app.vault.create(path, applyTemplateTokens(template, date, config));
}

/** How `openPeriodicNote` should behave. */
export interface OpenPeriodicNoteOptions {
	/** Forwarded to `workspace.getLeaf`. */
	newLeaf?: PaneType | boolean;
	/** Show a confirmation before creating a missing note. */
	confirmBeforeCreate?: boolean;
	/** Skip creation entirely and do nothing when the note is missing. */
	openOnly?: boolean;
}

/**
 * Opens the note for a period, creating it first when it does not exist.
 *
 * The single entry point for cell clicks, header shortcuts and commands, so all
 * three behave identically.
 */
export async function openPeriodicNote(
	app: App,
	date: Moment,
	granularity: Granularity,
	store: PeriodicConfigStore,
	options: OpenPeriodicNoteOptions = {}
): Promise<void> {
	const config = store.get(granularity);
	if (!config.enabled) {
		new Notice(t('noticeNotConfigured'));
		return;
	}

	const existing = getPeriodicNote(app, date, config);
	if (existing) {
		await app.workspace.getLeaf(options.newLeaf).openFile(existing);
		return;
	}
	if (options.openOnly) return;

	const open = async () => {
		try {
			const file = await createPeriodicNote(app, date, config);
			await app.workspace.getLeaf(options.newLeaf).openFile(file);
		} catch (err) {
			console.error('Periodic Calendar could not create the note', err);
			new Notice(t('noticeCreateFailed'));
		}
	};

	if (options.confirmBeforeCreate) {
		new ConfirmCreateModal(app, formatPeriod(date, config), () => {
			void open();
		}).open();
		return;
	}
	await open();
}
