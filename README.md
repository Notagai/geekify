# geekify.

A Spotify controller with two interfaces: a **pixel-art visual panel in VS Code** and a **fast terminal-native UI**. No more streaming enormous PNG frames through the terminal.

## Quick start (Windows / VS Code)

Requires Node.js 20+, VS Code with the command-line launcher available as code, and a Spotify developer application.

Open PowerShell in the cloned repository:

    git pull origin main
    npm install
    npm link
    # Geekify now installs its matching VS Code extension on first launch.
    # If VS Code was already open, reload its window after the first installation.

Then, from any VS Code integrated terminal:

    geekify                 # Opens the wooden pixel-art VS Code panel
    geekify demo            # Panel demo without Spotify
    geekify-fast            # Fast native ANSI terminal controller
    geekify-fast demo       # Fast no-account terminal demo

**The launcher now installs or updates the VS Code extension automatically when needed.** Once installed, the extension registers a localhost-only, authenticated panel bridge. The CLI requests that the editor actually open and waits for an acknowledgement. If VS Code needs a reload after installing, use **Ctrl+Shift+P > Developer: Reload Window** and rerun geekify. You can also open the panel with **Command Palette > Geekify: Open Player**.

If the automatic install fails, run `npm run extension:install` inside the Geekify repository. For manual installation, run `npm run extension:package`, then use **Extensions > ... > Install from VSIX**. Use `code --list-extensions --show-versions` to verify `notagai.geekify@0.4.2` is present. The launcher reports extension and bridge failures instead of silently claiming the panel opened.

The CLI first calls the extension's local, authenticated bridge to reveal its webview panel, falling back to VS Code's URI handler for initial activation. Unlike the old terminal graphics mode, the panel loads the original Geekify artwork only once and updates song data with real DOM elements. It does not use the old full-screen SVG-to-PNG-to-terminal transfer loop.

## Fix for a panel that doesn't open

Geekify **0.4.2** fixes an extension activation crash in older builds:
the URI handler was registered on `vscode.commands` instead of `vscode.window`.
The command-line tool was working, but VS Code never completed extension activation.

Run `git pull origin main`, `npm install`, `npm link`, then `geekify`.
The launcher installs version 0.4.2 automatically.
If VS Code was open during installation, use **Developer: Reload Window**
and run `geekify` again.
For diagnostics run `geekify panel-doctor`. It reports the installed extension version,
last recorded activation status, and bridge status without opening the player.

## Spotify authorization and audio

1. Create an application in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Register the redirect URI **http://127.0.0.1:8888/callback** exactly.
3. Run geekify login and paste your public Spotify Client ID.
4. If you authorized Geekify previously, **run login again**. The new panel requests the additional streaming, user-read-email, user-read-private, and user-read-currently-playing scopes.
5. Open geekify and click **Listen inside Geekify** if an in-panel Spotify playback device becomes available. Premium is required.

### Can Geekify play audio without Spotify Desktop?

**Sometimes, but not guaranteed inside VS Code.** Geekify uses Spotify's **official Web Playback SDK** to request a local playback device inside the panel. Spotify Premium is required. Some VS Code/Electron webviews do not include the encrypted-media/DRM support this SDK needs, so the in-panel player may fail to initialize. The player shows that error rather than pretending to play. Use the **Spotify web player** button to play audio in your default browser **without installing or opening Spotify Desktop**; then Geekify can show and control the active Spotify Connect device.

The web player still occupies a browser tab; Geekify cannot bypass Spotify's DRM or stream protected recordings directly through Node.js. No copyrighted Spotify audio plays in demo mode.

The Spotify Web Playback SDK cannot be used in commercial applications without Spotify's written approval. Geekify is currently a personal/development project and does not modify or synchronize Spotify audio with visual media.

## Commands

| Command | Behavior |
| --- | --- |
| geekify | Open VS Code visual panel |
| geekify demo | Open visual panel demo |
| geekify-fast | Native text/ANSI terminal controller |
| geekify-fast demo | Native terminal demo |
| geekify login | OAuth PKCE authorization |
| geekify logout | Clear saved session |
| geekify doctor | Diagnose permissions and devices |
| geekify panel-doctor | Diagnose VS Code extension activation |
| geekify web | Launch original browser visualizer |
| npm run extension:package | Build local VSIX installer |
| npm run extension:install | Package and install VS Code extension |

## Terminal shortcuts

1-5 navigation, / search, j/k or arrows browse, Enter select, Space pause/resume, n/p skip, s shuffle, r repeat, f like, q quit.

## Developer notes

- VS Code panel uses original modular pixel artwork in assets/geekify/ui and DOM/CSS in vscode/panel.*, with vscode/extension.cjs as the host.
- Spotify API calls, lyrics fetching, OAuth refresh and browser launching run in the extension host. The Web Playback SDK, if supported, runs only in the webview.
- Spotify account and refresh tokens reside in ~/.geekify/config.json with best-effort restricted permissions. The file is not encrypted; geekify logout clears the token.
- npm test, npm run cli:smoke and npm run build check the project. Extension packaging additionally depends on the VSIX packager.
- The previous terminal graphics implementation remains in cli/graphics-app.mjs as legacy code but is no longer the default.
- Lyrics from LRCLIB may be unavailable or unsynchronized.
