import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Engine code must run in Node and in a Web Worker: no DOM, no timers, no Math.random.
const engineGlobals = ['window', 'document', 'localStorage', 'setTimeout', 'setInterval'].map(
  (name) => ({ name, message: 'Engine code must not use DOM or timer globals (see CLAUDE.md).' }),
);

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/core/**/*.ts', 'src/solver/**/*.ts', 'src/generator/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...engineGlobals],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG in core/rng.ts.',
        },
      ],
    },
  },
  prettier,
);
