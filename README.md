# ms-k7x2q
A finished copy of the Money status app, ready to put on a free website host so it opens from its own web address, works offline, and installs on your iPhone like an app. The package contains only the app. It never contains your financial data. Your Moneydance export is read in your browser and stays on your device.

## Code layout
Plain files, no build step: what is in the repository is what runs.
- `index.html`: page shell and security policy (no inline scripts allowed).
- `css/app.css`: all styles.
- `js/NN-*.js`: classic scripts loaded in number order and sharing one global scope. Engine (export parser, ledger, net worth) → state and storage → charts → pages → plan → appearance → extras (backup, plan file, debts) → controls → planning model → shell (render, init). A new file must be added to `index.html` **and** to `CORE` in `sw.js`; a test fails if you forget.
- `sw.js`: offline cache. The deploy stamps its version.

## Releasing
Pages source must be set to **GitHub Actions** (Settings → Pages). Every push to `main` runs the tests and, if they pass, publishes `index.html`, `css/`, `js/`, `sw.js`, `manifest.webmanifest` and `icons/` with a fresh service-worker cache version. Pull requests run the tests only.

## Tests
```bash
npm ci && npx playwright install chromium && npm test
```
- `tests/money.test.mjs`: the export parser, double-entry checks and net worth, compared against an independent recalculation of the built-in sample data.
- `tests/ui.test.mjs`: every page renders with the sample data and no errors.
- `tests/offline.test.mjs`: the files the app needs exist and are cached, it works offline, and the update prompt appears.
- `tests/backup.test.mjs`: the backup is encrypted, refuses wrong passwords, and survives a full wipe and restore.
- `tests/budget.test.mjs`: Plan › Budget edits keep your place, amounts with commas work, and every toolbar option (fill, clear, planning lines, bulk edit, versions) does what it says.
- `tests/amounts.test.mjs`: every money box in a dialog saves what was typed, including `1,250` and `1250,50`.
- `tests/tools/crawl.mjs` (`npm run check:app`): opens every page, tab and report on desktop and phone sizes, presses every kind of button, opens every dialog and edits every kind of box; fails on any error, lost cursor, collapsing section, sideways scrolling or dialog that will not close.
- `tests/security.test.mjs`: the security policy blocks sending data to other servers, the app never trips it, and the passcode lock works.

If you change the maths on purpose, update the golden value in `money.test.mjs`.
