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

If the automatic install fails, run `npm run extension:install` inside the Geekify repository. For manual installation, run `npm run extension:package`, then use **Extensions > ... > Install from VSIX**. Use `code --list-extensions --show-versions` to verify `notagai.geekify@0.4.6` is present. The launcher reports extension and bridge failures instead of silently claiming the panel opened.

The CLI first calls the extension's local, authenticated bridge to reveal its webview panel, falling back to VS Code's URI handler for initial activation. Unlike the old terminal graphics mode, the panel loads the original Geekify artwork only once and updates song data with real DOM elements. It does not use the old full-screen SVG-to-PNG-to-terminal transfer loop.

## Seamless parchment sprites (v0.4.7)

The main paper panel no longer stretches a full-page image to the dimensions
of the VS Code editor. Six new reusable pixel-art SVG sprites in
`assets/geekify/ui/paper/` now define the paper:

- `grain-tile.svg`: native-size 256×256 repeating paper grain
- `torn-top.svg` / `torn-bottom.svg`: horizontally repeating torn edges
- `worn-left.svg` / `worn-right.svg`: vertically repeating distressed edges and holes
- `forest-edge.svg`: larger, anchored, horizontally repeating mountain and pine
  forest that does not stretch to the panel width

The CSS composes these independent layers. On shorter and narrower panes,
the forest scales proportionally as a whole; paper grain and edge tiles
stay at their native dimensions and none are stretched. The paper content reserves bottom space for the
forest and scrolls when necessary.

Install the updated extension with `git pull origin main`, `npm install`,
`npm link`, then `geekify`. Reload the VS Code window after the install
to replace the previously loaded webview.

## Webview artwork and responsive layout repair (v0.4.6)

Several sprites in the original generated asset sheet were genuinely truncated or
contaminated by captions, including playback controls, sidebar icons and progress
bar textures. Their source PNGs were **not** complete interface controls. Geekify's
VS Code panel no longer displays those cropped control PNGs. Complete inline
SVG icons, wood-styled pixel buttons and a CSS seek bar replace them. The
flowers and polaroid appear as caption-free cropped decorations; the
paper/background images and usable wood materials remain.

The visual player now uses a flexible DOM layout rather than scaling an entire
1200×675 artboard into every editor pane. Wide editors show a sidebar beside
the parchment; narrow panes stack the six navigation buttons, parchment and
playback bar, so the window fills and the player does not get cut off.

The changes are tested by CI, including simulated webview startup and playback
state, but still require a visual check in the user's actual VS Code installation.

## VS Code CLI verification repair (v0.4.5)

This fixes a false-negative installation check when `where.exe code` already points
to the normal Visual Studio Code `bin\code.cmd`. The previous version required
specific internal `Code.exe` and `cli.js` paths to exist, even if the actual CLI
could run. Geekify now selects the full `code.cmd` path and verifies it by
executing `--version`, avoiding the extensionless shell script `bin\code`.

If it still cannot find the launcher, run
`& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --version`
in PowerShell and use `geekify panel-doctor` to inspect the detailed error.

## Windows VS Code launcher discovery repair (v0.4.4)

Geekify no longer invokes whichever `code` command Windows resolves first.
A broken or shadowed `code.cmd` can try to run `..\\Code.exe`
from the Geekify project directory. Geekify now validates a real
VS Code `bin\\code.cmd`, its companion `Code.exe` and `resources/app/out/cli.js`
before invoking it. It checks standard user/system install directories and
then fully qualified launchers from `where.exe code`.

If VS Code is installed in a nonstandard location, set the full path:
`$env:GEEKIFY_VSCODE_COMMAND = 'C:\\Actual VS Code Location\\bin\\code.cmd'`.
Run `where.exe code` to investigate broken PATH launchers.
The extension installer also prefers the npm entrypoint through Node rather
than an unverified `npm.cmd` shim.

## Windows CLI quoting repair (v0.4.4)

Version 0.4.4 fixes `cmd.exe` quoting on Windows when the VS Code launcher
runs `code --list-extensions`, installs an extension from a VSIX path, or
opens the VS Code URI. This was previously reported as a command with doubled
quotation marks not being recognized. Geekify now runs Windows shims with
verbatim /c arguments and has dedicated Windows CI coverage.

## Fix for a panel that doesn't open

Geekify **0.4.4** fixes an extension activation crash in older builds:
the URI handler was registered on `vscode.commands` instead of `vscode.window`.
The command-line tool was working, but VS Code never completed extension activation.

Run `git pull origin main`, `npm install`, `npm link`, then `geekify`.
The launcher installs version 0.4.4 automatically.
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
