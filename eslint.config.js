import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Gebaute und erzeugte Verzeichnisse, **wo immer sie liegen**: Ohne das
  // vorangestellte `**/` gilt das Muster nur auf oberster Ebene, und ein
  // `git worktree` unter `.claude/worktrees/` schleppt sein eigenes `dist/`
  // mit — dessen ausgelieferte Fremdbibliotheken machten `npm run lint` mit
  // 60 Fehlern rot, die niemandem gehören.
  { ignores: ['**/dist', '**/coverage', '**/playwright-report', '**/test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      // Browser- und Node-Globals gemeinsam, da sowohl Anwendungscode (src/)
      // als auch Werkzeug-Konfiguration (vite.config.ts, vitest.config.ts, …)
      // von diesem Block erfasst werden.
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // TypeScript prüft undeklarierte Bezeichner bereits selbst (strict-Modus,
      // siehe tsconfig) — no-undef erzeugt hier nur Fehlalarme (z. B. bei
      // TS-Utility-Typen wie NodeJS.Timeout).
      'no-undef': 'off',
    },
  },
)
