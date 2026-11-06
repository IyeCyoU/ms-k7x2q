# ms-k7x2q
A finished copy of the Money status app, ready to put on a free website host so it opens from its own web address, works offline, and installs on your iPhone like an app. The package contains only the app. It never contains your financial data. Your Moneydance export is read in your browser and stays on your device.

## Releasing
Pages source must be set to **GitHub Actions** (Settings → Pages). Every push to `main` runs the tests and, if they pass, publishes `index.html`, `sw.js`, `manifest.webmanifest` and `icons/` with a fresh service-worker cache version. Pull requests run the tests only.

## Tests
```bash
npm ci && npx playwright install chromium && npm test
```
- `tests/money.test.mjs`: the export parser, double-entry checks and net worth, compared against an independent recalculation of the built-in sample data.
- `tests/ui.test.mjs`: every page renders with the sample data and no errors.
- `tests/offline.test.mjs`: the files the app needs exist, it works offline, and the update prompt appears.

If you change the maths on purpose, update the golden value in `money.test.mjs`.
