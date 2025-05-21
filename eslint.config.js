import typescriptParser from '@typescript-eslint/parser';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import eslintJs from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    // Apply ESLint recommended rules and Node.js globals globally
    ...eslintJs.configs.recommended,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: { // Also add node globals for TS files
        ...globals.node,
      }
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      // Start with ESLint recommended rules for .ts files
      // ...eslintJs.configs.recommended.rules, // Base ESLint rules, applied globally
      // Add TypeScript specific recommended rules
      ...typescriptPlugin.configs.recommended.rules, // Apply TS recommended rules
      // Add Prettier recommended rules
      ...prettierConfig.rules,
      ...prettierPlugin.configs.recommended.rules,

      // Turn off base 'no-unused-vars' to avoid conflicts if it's also in eslintJs.configs.recommended
      'no-unused-vars': 'off',
      // Configure TypeScript-specific 'no-unused-vars'
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // example: '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
  // The global config with eslintJs.configs.recommended and node globals handles non-TS JS files.
  // No need for the extra config block that was here previously.
];
