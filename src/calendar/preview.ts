import { MarkdownRenderer, setIcon, type App, type Component, type TFile } from 'obsidian';
import { t } from '../i18n';

export interface PreviewOptions {
	app: App;
	/** Owns the renderer's lifetime: the view, so embeds die with it. */
	component: Component;
	label: string;
	/** The note, or null when it does not exist or the period is not configured. */
	file: TFile | null;
	/** False when the period has no periodic note configuration at all. */
	configured: boolean;
	/** Opens the note, or creates it first (after the usual confirmation). */
	onOpen: () => void;
}

/**
 * Renders a period's note, read-only, into `el`.
 *
 * Built off-screen and swapped in at the end, so refreshing the preview of the
 * note already showing does not blink the pane empty first. Returns false when
 * `isStale` said a newer render superseded this one, in which case `el` is left
 * exactly as it was.
 */
export async function renderPreview(
	el: HTMLElement,
	options: PreviewOptions,
	text: string | null,
	isStale: () => boolean
): Promise<boolean> {
	const next = createDiv();

	if (options.file && text !== null) {
		// The note carries its own title, so there is no header row: the open icon
		// sits in the top-right corner, level with that title.
		const open = next.createDiv({
			cls: 'periodic-calendar-preview-open clickable-icon',
			attr: { 'aria-label': t('previewOpen') },
		});
		setIcon(open, 'external-link');
		open.addEventListener('click', options.onOpen);

		const body = next.createDiv({ cls: 'periodic-calendar-preview-body markdown-rendered' });
		const frontmatter = options.app.metadataCache.getFileCache(options.file)?.frontmatterPosition;
		const content = frontmatter ? text.slice(frontmatter.end.offset).replace(/^\s*\n/, '') : text;
		await MarkdownRenderer.render(options.app, content, body, options.file.path, options.component);
	} else {
		// Nothing else says which period was picked, so the label stays here.
		const header = next.createDiv({ cls: 'periodic-calendar-preview-header' });
		header.createSpan({ cls: 'periodic-calendar-preview-title', text: options.label });
		if (options.configured) {
			const create = header.createEl('button', {
				cls: 'periodic-calendar-preview-create',
				text: t('previewCreate'),
			});
			create.addEventListener('click', options.onOpen);
		}
		next.createDiv({
			cls: 'periodic-calendar-preview-empty',
			text: options.configured ? t('previewEmpty') : t('menuNotConfigured'),
		});
	}

	if (isStale()) return false;
	el.empty();
	el.append(...Array.from(next.childNodes));
	return true;
}
