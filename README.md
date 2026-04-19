# Space Zero — site

A four-page static site for [Space Zero](https://example.com), a not-for-profit
somatic and embodied practice space in Crescent City, California. Designed to
be hosted on GitHub Pages with no build step.

## Structure

```
/
├── index.html           # Why — hero, strapline, mission, four Elements
├── what.html            # What — river panorama, practices, weekly rhythm
├── who.html             # Who — Space Zero & HUM Lab adjacency, people
├── when-where.html      # When & Where — location, hours, calendar, contact
└── assets/
    ├── space-zero.css   # Shared styles (design tokens, header, footer, shared components)
    ├── space-zero.js    # Shared runtime (logo, element visuals, strapline, chrome loader)
    └── river-pano.jpg   # Crescent City river panorama (hero on the What page)
```

Every page loads the same two asset files. There is no server-side templating;
the header and footer are injected client-side by `space-zero.js`. This keeps
the site deployable as plain static files with zero configuration.

## Editing

### Changing header or footer once for every page

Edit `assets/space-zero.js`. The `renderHeader(currentPage)` and
`renderFooter()` functions hold the HTML. Nav links live in the `NAV`
constant near the bottom of the file:

```js
const NAV = [
  { href: 'index.html',      label: 'Why',          key: 'why' },
  { href: 'what.html',       label: 'What',         key: 'what' },
  { href: 'who.html',        label: 'Who',          key: 'who' },
  { href: 'when-where.html', label: 'When & Where', key: 'when-where' },
];
```

Add or rename items here and every page updates. Each page's `<body>`
carries a `data-page="..."` attribute matching one of these `key` values so
the current nav item gets highlighted.

### Changing page content

Each page's `<section>` blocks carry the prose and markup for that page. Look
for the `<body>` tag — everything between the header `<div id="site-header">`
and the footer `<div id="site-footer">` is specific to that page. Placeholders
are marked as `[Street address]`, `[Name]`, etc., usually styled with the
`.placeholder` class.

### Changing the watercolour logo

The logo is drawn on a `<canvas>` and its geometry, palette, and watercolour
physics live in `assets/space-zero.js`. The Rough paper specification is the
`ROUGH_PAPER` constant; the patch colours and weights are in `LOGO_PATCHES_BASE`.

Every page has one or more logo canvases:
- `#heroLogo` on the Why page (large, with Space Zero wordmark)
- `#footerLogo` in the shared footer (medium, with wordmark)
- `#miniLogo` on the Who page intro

To add a logo elsewhere, add a canvas with one of these ids, or call
`SpaceZero.renderLogo(myCanvas, { scale: 0.36, withText: true })` yourself.

### Changing the four Element visuals

Each element visual is a separate renderer in `assets/space-zero.js`:
`renderWisdom`, `renderAlign`, `renderBenevolence`, `renderAesthetics`. They
are auto-mounted on any page that has a `<canvas data-element="wisdom">`
(or `"align"`, `"benevolence"`, `"aesthetics"`).

## Deploy to GitHub Pages

1. Create a new repo on GitHub.
2. Commit these files at the repo root.
3. Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / root.
4. Your site will be live at `https://<user>.github.io/<repo>/`.

For a custom domain, add a `CNAME` file at the root with the domain name, and
configure your DNS per GitHub's instructions.

## Local preview

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser. You can also just double-click
any `.html` file, though some browsers restrict local `file://` loading.

## Credits

Type: Cormorant Garamond + JetBrains Mono via Google Fonts.
Watercolour logo & element visuals: CRR-derived, adapted from
[cohere.org.uk](https://www.cohere.org.uk).
River panorama: Smith River / Crescent City, California.
