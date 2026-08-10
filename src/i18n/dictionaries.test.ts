import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import en from './en.ts';
import es from './es.ts';

/**
 * `es.ts` is typed against `en.ts`, so a *missing* key is already a compile
 * error. What the type cannot catch is a key translated to an empty string, or
 * a translation that quietly dropped a `{placeholder}` — which would put a raw
 * `{count}` in front of the user or, worse, silently lose the number.
 *
 * Both dictionaries import nothing at runtime, which is why this runs under
 * `node --test` with no Obsidian in sight.
 */

const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(template: string): string[] {
	return [...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '').sort();
}

// Indexed by plain strings here on purpose: the point of the test is to compare
// the two key sets, which the `keyof typeof en` type already assumes are equal.
const english: Record<string, string> = en;
const spanish: Record<string, string> = es;

const dictionaries: [string, Record<string, string>][] = [
	['en', english],
	['es', spanish],
];

describe('the shipped dictionaries', () => {
	it('has a non-trivial number of keys', () => {
		assert.ok(Object.keys(en).length > 50);
	});

	it('translates exactly the English keys, no more and no fewer', () => {
		assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
	});

	for (const [language, dictionary] of dictionaries) {
		it(`${language} has no empty string`, () => {
			const empty = Object.entries(dictionary)
				.filter(([, value]) => value.trim() === '')
				.map(([key]) => key);
			assert.deepEqual(empty, []);
		});
	}

	it('keeps the same placeholders in every translation', () => {
		for (const [key, template] of Object.entries(english)) {
			const translated = spanish[key];
			assert.ok(translated !== undefined, `es is missing ${key}`);
			assert.deepEqual(
				placeholders(translated),
				placeholders(template),
				`placeholders differ for ${key}`
			);
		}
	});
});
