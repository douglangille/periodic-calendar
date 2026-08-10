import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * The rule that makes this folder worth having: nothing in `src/domain/` may
 * import anything at all.
 *
 * `node --test` runs these files through Node's native type stripping, with no
 * bundler in front of it, so a single `import { … } from 'obsidian'` anywhere in
 * the graph would make the whole suite unrunnable — and the temptation is to
 * "just import one type". This test fails first, and says why.
 */

const DOMAIN_DIR = dirname(fileURLToPath(import.meta.url));

/** Any static or dynamic import, and CommonJS `require`, at the start of a line. */
const IMPORT = /^\s*(?:import\s|export\s[^=]*\sfrom\s|.*\brequire\s*\(|.*\bimport\s*\()/;

function domainModules(): string[] {
	return readdirSync(DOMAIN_DIR)
		.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
		.sort();
}

describe('src/domain', () => {
	it('has modules to check', () => {
		assert.ok(domainModules().length > 0);
	});

	for (const name of domainModules()) {
		it(`${name} imports nothing`, () => {
			const lines = readFileSync(join(DOMAIN_DIR, name), 'utf8').split('\n');
			const offenders = lines.filter((line) => IMPORT.test(line));
			assert.deepEqual(
				offenders,
				[],
				`${name} must stay dependency-free so it can run under node --test`
			);
		});
	}
});
