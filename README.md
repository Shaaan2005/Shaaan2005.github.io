# Utkarsh Rai: portfolio

A one-page portfolio site built with plain HTML, CSS and a little JavaScript. There's no build step and nothing to install.

```
index.html          page content (all sections)
css/styles.css      design tokens (light + dark), layout, components, responsive rules
css/motion.css      animations and interactions (reveals, project visuals, theme toggle)
css/hero-core.css   hero layout, floor grid and the isometric "core" (colours for both themes)
js/main.js          menu, theme toggle, scroll reveals, project visuals, chart, card tilt, copy button
js/playground.js    canvas animation: the "search by meaning" playground
js/hero-core.js     hero core: an isometric stack of the layers I build, which comes apart on hover or tap
assets/             favicon and the resume-screening demo clip + poster
.nojekyll           tells GitHub Pages to serve files as-is
```

## Preview locally

Any static file server works. From this folder, run:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. You can also open `index.html` directly in a browser.

## Deploy to GitHub Pages

1. Create a repository on GitHub. Name it `Shaaan2005.github.io` to serve the site at `https://shaaan2005.github.io/`, or use any name to serve it at `https://shaaan2005.github.io/<repo-name>/`.
2. Push this folder to that repository:
   ```bash
   git init
   git add .
   git commit -m "Add portfolio site"
   git branch -M main
   git remote add origin https://github.com/Shaaan2005/<repo-name>.git
   git push -u origin main
   ```
3. On GitHub, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)` and save.
4. After a minute or so, the site is live at the URL shown on that page.

All paths in the site are relative, so it works both at the root domain and under a repository subpath.

### Other static hosts

- **Netlify:** drag this folder onto <https://app.netlify.com/drop>.
- **Vercel:** run `npx vercel` in this folder and accept the defaults. There's no framework and no build command.
- **Cloudflare Pages:** connect the repository, leave the build command empty and set the output directory to `/`.

## Editing content

All text lives in `index.html`, one section per block (`#work`, `#about`, `#contact`). Colors, fonts and spacing are CSS custom properties at the top of `css/styles.css`. Change `--accent` to restyle the whole page.

The benchmark chart in the featured project reads its numbers from the `data-*` attributes on each `<li>` in `.bench-rows`. If you re-run the benchmark, update those values and the table below them.

Fonts (Newsreader, IBM Plex Sans, IBM Plex Mono) load from Google Fonts, with system-font fallbacks if they can't load.
