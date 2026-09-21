MONEY STATUS: hosting package
=============================

What this is
  A finished copy of the Money status app, ready to put on a free website host
  so it opens from its own web address, works offline, and installs on your
  iPhone like an app. The package contains only the app. It never contains
  your financial data. Your Moneydance export is read in your browser and
  stays on your device.

Files
  index.html            the app
  manifest.webmanifest  tells iPhone/Android how to install it
  sw.js                 lets it open offline
  icons/                app icons

Publish it free on GitHub Pages (recommended, no card needed)
  1. Create a free account at github.com and sign in.
  2. Click "+" (top right) > New repository.
     Name it something not obvious, for example  ms-k7x2q .
     Choose Public (free Pages needs a public repository). Click Create.
  3. On the new repository page click "uploading an existing file".
  4. Unzip this package, open the money-status folder, select EVERYTHING
     inside it (index.html, manifest.webmanifest, sw.js and the icons folder)
     and drag it into the browser window. Wait for the upload to finish.
  5. Click "Commit changes".
  6. Open Settings > Pages. Under "Build and deployment" set Source to
     "Deploy from a branch", Branch "main", folder "/ (root)", then Save.
  7. Wait one or two minutes and refresh that page. It shows your address:
       https://YOUR-USERNAME.github.io/YOUR-REPOSITORY-NAME/
     Open it. That is your app and the address to bookmark.

  The repository is public, so anyone who knows the address could open the
  empty app. There is nothing private in it: no data, only the program.

Other free hosts that also work
  Cloudflare Pages, Netlify and Vercel can all serve these files as a static
  site. Their free plans and screens change often, so GitHub Pages is the
  steadiest choice for a simple one-time upload.

iPhone 16
  1. Open your address in Safari.
  2. Tap Share, then Add to Home Screen, then Add. Keep "Open as Web App" on
     if you see it.
  3. Open it from the Home Screen icon. Choose your Moneydance export from
     Files (AirDrop the .txt file from your Mac and save it to Files first).
  Import inside the Home Screen app itself. It keeps its own storage.

MacBook (macOS Monterey)
  Open the same address in Safari and press Command+D to bookmark it.
  Safari on Monterey cannot add a site to the Dock as an app.

Updating later
  Replace index.html in the repository with the newer one (Add file > Upload
  files, same name). Open the app twice to load the new version.

Reading the colours
  Green is better for you, red is worse. Spending above your average is red
  and below is green. Income and savings above average are green. The average
  is your last three full months, scaled to the days counted.

Plan file (keeping two devices in step)
  Data > Plan file > Save plan file. On iPhone choose Save to Files and pick iCloud
  Drive. On the other device choose Load plan file. The file holds budgets, goals,
  forecast settings, exchange rates, one-off marks and Needs/Wants choices. It never
  contains your Moneydance export. You can protect it with a password.

Month-end close (Reports > Month-end close)
  A checklist per month: the export covers it, everything balances, exchange rates and budget
  are in place, and two boxes for your own checks. Close the month to keep a snapshot. If a
  later import changes a closed month, the app says exactly what moved and warns you before
  you replace your data. It records the change; it does not stop you.

Other tools
  Search: press Ctrl+K or Command+K (or the magnifier button) to jump to pages, accounts,
  categories and transactions.
  Transaction > Category: change how one transaction is categorised in this app only.
  Data > Category changes: move a whole category into another.
  Spending: donut chart of the mix and a list of top payees.
  Plan > Outlook > Edit: 12 or 24 month forecast and your own scenario percentages.
  Data > Check against Moneydance: type Moneydance's figures and see if they agree.
  Data > Needs and wants: decide which categories count as which.
  Transaction > Mark as one-off: leaves it out of averages and forecasts.
  Plan > Repeating: see detected regular payments and price rises.
  Plan > Debt: payoff date and interest saved with extra payments.
  Accounts > Where your money sits: currency and asset mix.
  Reports > Save year in review as PDF.

Appearance
  The paintbrush button at the top opens Appearance. Pick a template (Ledger,
  Ocean, Amethyst, Graphite, Sand, Rose or Mono), set your own accent and panel
  colours, choose the heading style, spacing and corners, or switch to a
  blue-and-orange palette for better and worse figures that is easier if you
  have colour-blind vision. Colours are adjusted so text stays readable.
  Your choices are saved on each device separately.

Saving PDFs
  Reports > Save this report as PDF, or Save full summary as PDF. The PDF is
  built inside the app, so it does not depend on the browser's print dialog.
  On iPhone it opens the share sheet (choose Save to Files). On a Mac it goes
  to your Downloads folder. The PDF always shows real amounts, even if you
  have Hide amounts switched on.

Your data
  Saved only in the browser on each device. Each device keeps its own copy.
  Import the export on every device you use. In the app, Data > Privacy and
  security lets you set a passcode that encrypts what is saved.
