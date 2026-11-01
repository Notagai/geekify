# geekify.

A browser-first pixel-art now-playing experience, designed for vibe.notagai.com. Runs locally and deploys as a static website.

## Quick start

Requires Node.js 20+. No package installation, account, or API keys for the demo.

1. Clone the repository.
2. From the project folder run:

    npm run dev

3. Open **http://127.0.0.1:5173/** in your browser.
4. Press **Start the demo**. The gear icon opens scene controls.

Other commands:

- **npm test** runs the built-in LRC parser tests.
- **npm run build** creates a deployable static **dist/** folder.

## Optional: Connect Spotify

1. Create an app at https://developer.spotify.com/dashboard.
2. Add the *exact* redirect URI **http://127.0.0.1:5173/** in Spotify app settings.
3. Open **Settings → Spotify Connection** and paste the app's **Client ID**. Click Connect Spotify.
4. Authorize the playback-state permission. Play a song in your normal Spotify client.
5. The website checks the active track approximately every five seconds, then gets time-coded lyrics from LRCLIB where available.

No client secret is needed. Authorization Code + PKCE runs in the browser. Client IDs live in localStorage; Spotify tokens live only in sessionStorage. Never paste a client secret into this site.

Spotify requires you to register the production redirect URI separately, for example **https://vibe.notagai.com/** (include the trailing slash). Spotify disallows the host name localhost for OAuth redirect URIs, so the local server uses 127.0.0.1 instead.

Spotify developer mode may require the account owner to have Premium and limit eligible users.

## Features

- Three original procedurally rendered 640×360 pixel-art scenes (neon city, twilight mountains, orbiting planet).
- Nearest-neighbor scaling to full-screen 1440p and 4K, with lyrics rendered as sharp native text.
- Browser-based Spotify PKCE sign-in and now-playing track/progress display.
- Browser-based LRCLIB lyric lookup and LRC timestamp parsing.
- Original demo lyrics and fake playback timeline, with no third-party copyrighted lyrics bundled.
- Fullscreen, responsive layout, theme selector, motion intensity, reduced-motion option.
- No server APIs, cloud storage, paid AI tokens or npm packages.

## Limitations and licensing

The demo is **silent** and does not play music. Spotify audio still comes from your Spotify app. Spotify's Web API exposes playback metadata, not raw audio-frequency data. Scene motion is atmospheric and is **not beat-accurate**. True audio-reactive visuals would need a separate, permission-based audio input.

Spotify developer rules restrict synchronizing Spotify sound recordings with visual media. Review its developer policy and obtain permissions as appropriate before a publicly distributed synchronized visualization product: https://developer.spotify.com/policy

Synchronized lyrics are retrieved from https://lrclib.net/docs when available and are not stored in this repository. Some songs have no timed lyrics, instrumental tracks are unsupported by design, and rate limits or API errors can occur. The interface falls back to showing the song title.

## Deploy

Run **npm run build** and configure a static hosting provider (Vercel, Cloudflare Pages, or similar):

- Build command: npm run build
- Output directory: dist
- Framework: Other / none
- Domain: vibe.notagai.com (DNS and host configuration required)

This repo does not deploy anything automatically. To use Spotify on your deployed domain, register the deployment's exact HTTPS redirect URI in the Spotify Dashboard.

## Notes

No external wallpaper images are downloaded. Pixel art is rendered directly by Canvas. Spotify and LRCLIB remain independent third-party services with their own terms.
