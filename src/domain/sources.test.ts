import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TAG_COLORS, countWords, forgetPath, tagColor, tagSlug } from './sources.ts';

describe('countWords', () => {
	it('counts runs of non-whitespace', () => {
		assert.equal(countWords('one two three'), 3);
		assert.equal(countWords('  padded   words  '), 2);
	});

	it('is zero for nothing to count', () => {
		assert.equal(countWords(''), 0);
		assert.equal(countWords('   \n\t  '), 0);
	});

	it('does not count the frontmatter, which is metadata and not prose', () => {
		assert.equal(countWords('---\ntags: [a, b]\ndate: 2026-01-01\n---\nJust two\n'), 2);
	});

	it('strips frontmatter written with CRLF line endings', () => {
		assert.equal(countWords('---\r\ntags: [a]\r\n---\r\nJust two\r\n'), 2);
	});

	it('only strips frontmatter at the very top of the file', () => {
		// A horizontal rule mid-note is content, not a second frontmatter block.
		assert.equal(countWords('Intro\n\n---\n\nMore text here\n'), 5);
	});

	it('counts a note that has frontmatter and nothing else as empty', () => {
		assert.equal(countWords('---\ntags: [a]\n---\n'), 0);
	});
});

describe('tagSlug', () => {
	it('drops the hash and lowercases', () => {
		assert.equal(tagSlug('#Work'), 'work');
	});

	it('flattens a nested tag into a single class token', () => {
		assert.equal(tagSlug('#work/deep-focus'), 'work-deep-focus');
	});

	it('collapses anything that is not a letter or a digit', () => {
		assert.equal(tagSlug('#a__b'), 'a-b');
		assert.equal(tagSlug('#2026/Q1'), '2026-q1');
	});

	it('trims the hyphens it created at the ends', () => {
		// Accented letters are outside the [a-z0-9] range on purpose: the slug
		// only ever feeds a CSS class, and this keeps it ASCII and predictable.
		assert.equal(tagSlug('#café'), 'caf');
		assert.equal(tagSlug('#/leading/'), 'leading');
	});
});

describe('tagColor', () => {
	it('always returns a color from the theme palette', () => {
		for (const tag of ['#a', '#work', '#work/deep', '#2026', '', '#ñ']) {
			assert.ok(TAG_COLORS.includes(tagColor(tag) as (typeof TAG_COLORS)[number]));
		}
	});

	it('is stable for the same tag, so a tag never changes color', () => {
		assert.equal(tagColor('#work'), tagColor('#work'));
	});

	it('uses the whole palette across a handful of tags', () => {
		const used = new Set(
			['#a', '#b', '#c', '#d', '#e', '#f', '#g', '#h'].map((tag) => tagColor(tag))
		);
		assert.equal(used.size, TAG_COLORS.length);
	});
});

describe('forgetPath', () => {
	it('drops the exact path', () => {
		const index = new Map([['a/b.md', 1]]);
		assert.equal(forgetPath(index, 'a/b.md'), true);
		assert.equal(index.size, 0);
	});

	it('drops everything under a folder, which is all a folder delete reports', () => {
		const index = new Set(['journal/2026-01-01.md', 'journal/sub/2026-01-02.md', 'other.md']);
		assert.equal(forgetPath(index, 'journal'), true);
		assert.deepEqual([...index], ['other.md']);
	});

	it('does not touch a sibling whose name merely starts the same', () => {
		// `journal2` is not inside `journal`; only the `journal/` prefix counts.
		const index = new Set(['journal2/a.md', 'journalling.md']);
		assert.equal(forgetPath(index, 'journal'), false);
		assert.equal(index.size, 2);
	});

	it('reports false when it removed nothing, so no repaint is signalled', () => {
		const index = new Map([['a.md', 1]]);
		assert.equal(forgetPath(index, 'b.md'), false);
	});
});
