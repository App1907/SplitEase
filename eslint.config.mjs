import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'exports/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-extraneous-class': 'off',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'prefer-const': 'error',
      // Prefer Promise.all when awaits are independent; intentional sequential cases use a disable comment.
      'no-await-in-loop': 'error',
      // Reassign the binding of a parameter — use a local instead (mutating props like req.x is fine).
      'no-param-reassign': ['error', { props: false }],
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      // Smoke/e2e scripts intentionally poll and retry in sequence.
      'no-await-in-loop': 'off',
    },
  },
);
