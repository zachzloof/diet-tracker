import js from '@eslint/js'
import {
  configureVueProject,
  defineConfigWithVueTs,
  vueTsConfigs,
} from '@vue/eslint-config-typescript'
import prettier from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

configureVueProject({ rootDir: import.meta.dirname, scriptLangs: ['ts'] })

export default defineConfigWithVueTs(
  {
    name: 'ignores',
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/api/drizzle/**',
    ],
  },
  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  {
    name: 'project-rules',
    files: ['**/*.{ts,vue,js}'],
    rules: {
      // Component names come from the mobile-ui skill (Button, Card, Input, ...).
      'vue/multi-word-component-names': 'off',
      // Optional TS props are undefined by design; a default would only add noise.
      'vue/require-default-prop': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    name: 'node-files',
    files: [
      'apps/api/**/*.ts',
      'packages/**/*.ts',
      'eslint.config.js',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/drizzle.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    name: 'browser-files',
    files: ['apps/web/src/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },
  prettier,
)
