// Muster: adg/lint-staged.config.js — hier ohne Monorepo-Pfadumschreibung,
// da Applai ein einzelnes Paket im Repository-Wurzelverzeichnis ist.
export default {
  '*.{ts,tsx}': (files) => `eslint --max-warnings=0 ${files.join(' ')}`,
}
