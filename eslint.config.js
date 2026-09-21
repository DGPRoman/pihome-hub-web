import js from '@eslint/js'
import vitest from '@vitest/eslint-plugin'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },

  js.configs.recommended,

  {
    // Type-aware linting, which is the reason to run this at all: rules that
    // read the checker catch a forgotten await or a switch that stopped being
    // exhaustive, and neither is visible from syntax alone.
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The hub is the source of truth and its responses arrive as `unknown`.
      // A stray `any` would erase the validation layer's whole point.
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',

      // Enforced by hand until now. `Async<T>` and `Relay` are types, and
      // importing them as values would keep them in the emitted bundle.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Guards nothing today, and is kept deliberately. The rationale here used to
      // name a `never` assignment in RelayPanel; there is none, and the only
      // `switch` in src/ is over a status code, which cannot be exhausted. Where
      // a union does have to be covered — the retry policy, the error kinds — it
      // is a total `Record`, which the compiler checks whether or not this rule
      // is on. This stays so the first `switch` written over a union is checked
      // before it is merged rather than after.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // With strict null checks on, a condition that can never be false is
      // usually a leftover from a type that has since been narrowed.
      '@typescript-eslint/no-unnecessary-condition': 'error',

      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactRefresh.configs.vite],
    // The plugin is registered by hand and only its rule list is borrowed:
    // every config eslint-plugin-react-hooks ships still declares `plugins` as
    // an array of strings, which is the eslintrc shape ESLint 10 no longer
    // accepts. Reaching past the config avoids waiting on that.
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
    languageOptions: { globals: globals.browser },
  },

  {
    // Build-time files run in Node, not the browser.
    files: ['vite.config.ts', 'vitest.setup.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.test.{ts,tsx}'],
    extends: [vitest.configs.recommended],
    rules: {
      // Tests deliberately construct promises that never settle to model a
      // request in flight, and stub globals with shapes narrower than the real
      // thing. Both are the point of the test, not an oversight.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Last, so it can switch off anything the rules above would fight Prettier
  // over. Formatting is Prettier's job; correctness is ESLint's.
  prettier,
)
