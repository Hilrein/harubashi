import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '_reference/**',
      'dist/**',
      'node_modules/**',
      'prisma/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
