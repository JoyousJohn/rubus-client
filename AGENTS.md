## Cursor Cloud specific instructions

### Project overview

RUBus is a vanilla JavaScript/HTML/CSS Progressive Web App (PWA) for real-time Rutgers University bus tracking. There is **no build step**, no `package.json`, no bundler, and no server-side code in this repository. All JS/CSS dependencies are loaded from CDNs at runtime.

### Running the app locally

Serve the repo root as static files on any HTTP server. For example:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/` in a browser.

### Key caveats

- **No lint/test/build tooling**: The project has no configured linter, test framework, or build system. Code quality checks must be done manually or by reading the source.
- **External API dependency**: The app relies on live external APIs (`passiogo.com`, `demo.rubus.live`, `tiles.rubus.live`) for bus data, ETAs, and map tiles. These are not part of this repo and cannot be run locally. The app will render the UI but will show no data if these APIs are unreachable.
- **Map tile token**: The Mapbox-style tile token is hardcoded in `js/map.js` (variable `tileToken`). If tiles stop rendering, this token may have expired.
- **PWA manifest**: `manifest.json` is at the repo root. The service worker registration is in `index.html`.
- **Campus selection**: On first load, the app shows a theme picker then a campus selector (Camden, New Brunswick, Newark). Select a campus to proceed to the map view.
