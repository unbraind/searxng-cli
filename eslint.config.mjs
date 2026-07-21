import eslint from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { jsdoc },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-for-of': 'off',
      'no-case-declarations': 'off',
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportExpression', message: 'Dynamic imports are forbidden.' },
        { selector: 'TSEnumDeclaration', message: 'Use an erasable string union instead of enum.' },
        { selector: 'TSModuleDeclaration', message: 'Namespaces and TypeScript modules are forbidden.' },
        { selector: 'TSImportEqualsDeclaration', message: 'TypeScript import-equals syntax is forbidden.' },
        { selector: 'TSParameterProperty', message: 'Parameter properties are forbidden.' },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: [
            'ExportNamedDeclaration > FunctionDeclaration',
            'ExportNamedDeclaration > ClassDeclaration',
            'ExportNamedDeclaration > TSInterfaceDeclaration',
            'ExportNamedDeclaration > TSTypeAliasDeclaration',
          ],
          require: {
            ArrowFunctionExpression: false,
            ClassDeclaration: false,
            FunctionDeclaration: false,
            FunctionExpression: false,
            MethodDefinition: false,
          },
        },
      ],
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off',
    },
    settings: {
      jsdoc: { mode: 'typescript' },
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['tests/**/*.ts'],
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
    },
  }
);
