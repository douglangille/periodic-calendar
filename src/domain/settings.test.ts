import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampCardLimit, compactNumber, resolveDisabledSources } from './settings.ts';

const DEFAULTS = ['calendar-plus-word-count', 'calendar-plus-tags'] as const;

describe('resolveDisabledSources', () => {
	it('seeds the defaults on a fresh install and asks for the mark to be written', () => {
		const result = resolveDisabledSources(false, false, undefined, DEFAULTS);
		assert.deepEqual(result.disabledSources, [...DEFAULTS]);
		assert.equal(result.markApplied, true);
	});

	it('never disables anything for a user who already has settings', () => {
		const result = resolveDisabledSources(false, true, [], DEFAULTS);
		assert.deepEqual(result.disabledSources, []);
		assert.equal(result.markApplied, true);
	});

	it('keeps the stored list of an existing user untouched', () => {
		const stored = ['calendar-plus-notes-exist'];
		const result = resolveDisabledSources(false, true, stored, DEFAULTS);
		assert.deepEqual(result.disabledSources, stored);
		assert.equal(result.markApplied, true);
	});

	it('leaves everything alone once the mark is there', () => {
		const result = resolveDisabledSources(true, true, ['calendar-plus-tags'], DEFAULTS);
		assert.deepEqual(result.disabledSources, ['calendar-plus-tags']);
		assert.equal(result.markApplied, false);
	});

	it('does not re-seed a marked install that has since enabled everything', () => {
		// The regression this whole mechanism exists to prevent: a user who turned
		// the word count on by hand must not find it off again after an update.
		const result = resolveDisabledSources(true, true, [], DEFAULTS);
		assert.deepEqual(result.disabledSources, []);
	});

	it('copies the stored list instead of aliasing it', () => {
		const stored = ['calendar-plus-tags'];
		const result = resolveDisabledSources(true, true, stored, DEFAULTS);
		result.disabledSources.push('other');
		assert.deepEqual(stored, ['calendar-plus-tags']);
	});

	it('survives a stored value that is not a list', () => {
		assert.deepEqual(resolveDisabledSources(true, true, undefined, DEFAULTS).disabledSources, []);
		assert.deepEqual(resolveDisabledSources(true, true, 'tags', DEFAULTS).disabledSources, []);
	});

	it('drops entries a hand-edited file left behind that are not source ids', () => {
		const result = resolveDisabledSources(true, true, ['calendar-plus-tags', 7, null], DEFAULTS);
		assert.deepEqual(result.disabledSources, ['calendar-plus-tags']);
	});
});

describe('clampCardLimit', () => {
	it('keeps a sensible number', () => {
		assert.equal(clampCardLimit(4, 4, 12), 4);
	});

	it('falls back when the stored value is not a number', () => {
		assert.equal(clampCardLimit('4', 4, 12), 4);
		assert.equal(clampCardLimit(Number.NaN, 4, 12), 4);
		assert.equal(clampCardLimit(undefined, 4, 12), 4);
	});

	it('never returns less than one card or more than the maximum', () => {
		assert.equal(clampCardLimit(0, 4, 12), 1);
		assert.equal(clampCardLimit(-3, 4, 12), 1);
		assert.equal(clampCardLimit(99, 4, 12), 12);
	});

	it('drops a fractional limit rather than rendering half a card', () => {
		assert.equal(clampCardLimit(3.7, 4, 12), 3);
	});
});

describe('compactNumber', () => {
	it('leaves small counts alone', () => {
		assert.equal(compactNumber(0), '0');
		assert.equal(compactNumber(912), '912');
		assert.equal(compactNumber(999), '999');
	});

	it('shortens thousands, with a decimal only while it says something', () => {
		assert.equal(compactNumber(1000), '1k');
		assert.equal(compactNumber(1420), '1.4k');
		assert.equal(compactNumber(14_200), '14k');
	});

	it('shortens millions', () => {
		assert.equal(compactNumber(1_000_000), '1M');
		assert.equal(compactNumber(3_140_000), '3.1M');
	});

	it('is never a stray "NaN" on a card', () => {
		assert.equal(compactNumber(Number.NaN), '0');
		assert.equal(compactNumber(Number.POSITIVE_INFINITY), '0');
	});
});
