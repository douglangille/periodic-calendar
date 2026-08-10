import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { slugifyClass, sourceClassName } from './class-names.ts';

/**
 * Namespacing is a published guarantee of the API: whatever a source puts in
 * `Dot.className` or `CellMetadata.classes` reaches the DOM as
 * `<source-id>-<class>`, sanitized. A source that could inject a raw string
 * could collide with the calendar's own classes, or write an invalid one.
 */

describe('slugifyClass', () => {
	it('keeps letters, digits, underscores and hyphens', () => {
		assert.equal(slugifyClass('busy_day-2'), 'busy_day-2');
	});

	it('replaces anything else with a single hyphen', () => {
		assert.equal(slugifyClass('very  busy!!day'), 'very-busy-day');
	});

	it('trims the hyphens it just created at the ends', () => {
		assert.equal(slugifyClass('  spaced  '), 'spaced');
		assert.equal(slugifyClass('...'), '');
	});

	it('keeps non-ASCII letters, which are legal in CSS identifiers', () => {
		assert.equal(slugifyClass('día-señalado'), 'día-señalado');
	});
});

describe('sourceClassName', () => {
	it('puts the source id in front, so two sources cannot collide', () => {
		assert.equal(sourceClassName('tasks', 'done'), 'tasks-done');
		assert.equal(sourceClassName('habits', 'done'), 'habits-done');
	});

	it('sanitizes the id as well as the class', () => {
		assert.equal(sourceClassName('my plugin!', 'in progress'), 'my-plugin-in-progress');
	});

	it('falls back to a generic namespace when the id sanitizes away', () => {
		assert.equal(sourceClassName('***', 'dot'), 'source-dot');
	});

	it('prefixes a token that would start with a digit, which CSS cannot select', () => {
		assert.equal(sourceClassName('3d', 'dot'), '_3d-dot');
	});

	it('returns null when the class name has nothing usable left', () => {
		// Null rather than the bare namespace: an empty class name must add no
		// class at all, not a class every source would share.
		assert.equal(sourceClassName('tasks', ''), null);
		assert.equal(sourceClassName('tasks', '   '), null);
		assert.equal(sourceClassName('tasks', '!!!'), null);
	});
});
