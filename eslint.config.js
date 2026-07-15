// Flat ESLint config for the monorepo (ESLint 10 requires flat config).
//
// Scope: the TS/React source under apps/* and packages/*. The legacy static
// frontend (frontend/, index.html, *.html) and the CommonJS backend are NOT
// linted here — the backend is plain Node CJS with its own conventions and a
// separate test gate; folding it in would mean a second parser config and a
// pile of rule exceptions for no v1.0 benefit. Add a backend block later if
// wanted.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  // Never lint build output, deps, or generated artifacts.
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      // Generated — tokens.css is emitted from tokens.ts and checked separately.
      'packages/tokens/src/tokens.css',
      // Legacy static site + backend are out of scope for this config (see header).
      'frontend/**',
      'backend/**',
      '*.html',
    ],
  },

  // Base JS + TypeScript recommended rules for all TS/TSX in the workspaces.
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // The two long-stable, high-value hooks rules — NOT the full v7 recommended
      // set. v7's recommended bundles React-Compiler-oriented advisories
      // (set-state-in-effect, immutability, preserve-manual-memoization) that flag
      // legitimate patterns this (non-compiler) codebase uses everywhere. Adopting
      // them wholesale would make the first lint run 50+ errors on working code.
      // Add the compiler ruleset deliberately if/when React Compiler is turned on.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Vite Fast Refresh only works when a module exports components alone;
      // warn (not error) so shared constant exports next to a component don't block.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Allow intentionally-unused args/vars when prefixed with _ (matches the
      // codebase's existing `_next`, `_opts` convention in the backend/tests).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Advisory during adoption — `any` is a smell, not a correctness bug; surfacing
      // it as a warning keeps the error list to things that are actually broken.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Node-flavoured config/tooling scripts (Vite config, token generators, mjs scripts).
  {
    files: ['**/*.config.{js,ts}', 'packages/**/scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
