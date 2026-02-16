import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Global ignores
  { ignores: ['**/dist/', '**/node_modules/', 'data/'] },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended (type-aware not needed — too slow for monorepo)
  ...tseslint.configs.recommended,

  // React hooks rules for client package
  {
    files: ['packages/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Syncing state from props in useEffect is a common React pattern
      'react-hooks/set-state-in-effect': 'off',
      // Ref mutation via props is fine when the prop is a RefObject
      'react-hooks/immutability': 'off',
    },
  },

  // Project-wide rule overrides
  {
    rules: {
      // Allow _ prefixed unused vars (common pattern for destructuring)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Allow explicit any sparingly — the codebase uses it in tool args/results
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow empty catch blocks (used in SSE parsing)
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Prettier must be last to override formatting rules
  eslintConfigPrettier,
);
