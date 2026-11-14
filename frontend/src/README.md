# Source layout

The code is grouped by **feature**: everything one part of the site needs
(its components, logic and styles) lives in that part's folder.

```
src/
├── main.jsx              Entry point: loads global styles, mounts <App />
├── app/                  App shell
│   ├── App.jsx           Routes, plus the mascot (mounted once, shared by every page)
│   └── page-wipe/        Hexagon transition between pages
├── pages/                One folder per route; a page puts features together
│   ├── landing/          "/"          LandingPage.jsx + landing.css
│   └── board/            "/hexagons"  BoardPage.jsx + board.css
├── features/
│   ├── board/            Tiles, the canvas field under them, the story panel,
│   │                     the camera, and the hex layout maths (layout.js)
│   ├── controls/         Hex-key buttons, progress tally, index drawer
│   ├── mascot/           The dog: Mascot.jsx, remote.js (how pages talk to it),
│   │                     lines.js (everything it says)
│   └── sound/            Synthesized sound effects and music
├── shared/               Used across features; knows nothing about any of them
│   ├── ui/               Icon, shared button styles
│   ├── hooks/            useNarrow, useStableCallback
│   ├── state/            prefs (sound settings, tiles read; saved in the browser)
│   └── utils/            Small helpers (clamp)
├── content/              What the site says
│   ├── content.js        Every tile's text, colours and links
│   ├── photos.js         Finds photos by file name
│   └── photos/           Drop photos here (naming rules in its README)
└── styles/               Global CSS: tokens.css (colours, fonts), base.css
```

## Rules of thumb

- **Import through a feature's `index.js`**: `import { Mascot } from '@/features/mascot'`.
  `@/` means `src/`. Inside a feature, use relative paths (`./Tile.jsx`).
- **Each component imports its own stylesheet.** A rule for the mascot goes in
  `features/mascot/mascot.css`, not in a global file.
- **Dependencies point one way**: `pages → features → shared`. Features may use
  `shared/` and `content/`; `shared/` never imports from `features/`.
- **New page**: a folder in `pages/` and a `<Route>` in `app/App.jsx`.
  **New feature**: a folder in `features/` with an `index.js` that lists what it offers.
