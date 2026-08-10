import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		// Node-side dev tooling, not plugin code: outside the TS project.
		'scripts/**',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	// `recommendedWithLocalesEn` adds the sentence-case check for English locale
	// modules — `src/i18n/en.ts`, where every visible string now lives.
	...obsidianmd.configs.recommendedWithLocalesEn,
	{
		// Names the linter must not "correct": they are spelled this way in
		// Obsidian's own interface, in the Periodic Notes plugin and in our manifest.
		rules: {
			'obsidianmd/ui/sentence-case': [
				'warn',
				{ brands: ['Obsidian', 'Periodic Notes', 'Calendar Plus'], enforceCamelCaseLower: true },
			],
			'obsidianmd/ui/sentence-case-locale-module': [
				'warn',
				{ brands: ['Obsidian', 'Periodic Notes', 'Calendar Plus'] },
			],
		},
	},
	{
		// Unit tests are run by `node --test` straight over the TypeScript and are
		// never bundled into main.js — esbuild only follows `src/main.ts`. The
		// mobile-compatibility and floating-promise rules therefore do not apply:
		// `node:test` and `node:fs` are exactly what they should use, and
		// `describe`/`it` return promises nobody is meant to await.
		files: ['src/**/*.test.ts'],
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
			'@typescript-eslint/no-floating-promises': 'off',
			// The plugin must take `moment` from Obsidian, and it does. A test has
			// no Obsidian to take it from, so the semester round trip imports the
			// npm package instead — pinned to the version `obsidian` depends on, so
			// it is the same formatter and the same strict parser.
			'@typescript-eslint/no-restricted-imports': 'off',
		},
	}
);
