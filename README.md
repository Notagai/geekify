# geekify.

Your Spotify controller, inside the VS Code terminal. Also includes a pixel-art website designed for vibe.notagai.com.

## Lyrics-first graphical music desk (default in VS Code)

The default Geekify terminal experience is now a **sprite-free lyrics player**. In a graphics-capable VS Code integrated terminal, it renders an image-based interface using Foldered's original **wood tile, active/inactive paper tabs and sticky-note skin**, Sharp and the Kitty graphics protocol. Synchronized lyrics get the main panel; track details and playback controls live in a compact bottom strip. No Ren or Reina sprite appears in this mode.

The files in `assets/foldered/*.b64` are base64-encoded copies of artwork from the owner's Foldered repository. They're decoded once at startup to PNGs; this keeps original textures without relying on an external app or browser. Labels and song information remain live, not baked into screenshots.

To enable VS Code terminal image support, use VS Code 1.110+ and add the following settings to your existing user settings.json:

```json
{
  "terminal.integrated.enableImages": true,
  "terminal.integrated.gpuAcceleration": "auto",
  "terminal.integrated.windowsUseConptyDll": true
}
```

The last setting applies to Windows. Reload VS Code and open a new integrated terminal.

```powershell
geekify                 # Lyrics-first graphical UI in VS Code
geekify demo            # No-login graphical preview
geekify --ansi          # Original ANSI/text UI
geekify --graphics      # Explicit image mode
geekify graphics-check  # Diagnostic
geekify login           # Spotify authorization
```

Use Space for play/pause, n/p to skip, 1-5 for sections, / for search, arrows and Enter to browse, s/r for shuffle/repeat, f for save, and q to exit. Click the sidebar, lyrics/queue/info tabs and transport controls where supported.

**Limits:** The app draws to the current terminal, not to a separate desktop window. A compatible terminal host is necessary for the full graphical experience. In terminals without detected image protocol support, the default command uses the original ANSI UI unless --graphics is specified. On VS Code we deliberately skip the unreliable Kitty capability probe and attempt graphics directly. Spotify still produces audio in the official player. Missing lyrics are reported, never fabricated.

## Quick start: launch Geekify from anywhere

Requires Node.js 20 or newer.

Open your VS Code terminal and run:

    git clone https://github.com/Notagai/geekify.git
    cd geekify
    npm install
    npm link

After **npm link** (one-time setup), open **any** VS Code terminal, even in a different project, and type:

    geekify

This starts the interactive terminal interface. You do not need to run a web server or stay in this repository.

To preview without Spotify credentials:

    geekify demo

To launch the browser experience instead:

    npm run dev

Open http://127.0.0.1:5173/ .

## The wood-and-paper terminal design

Geekify now draws a **walnut wood-grain background with a cream paper panel** using standard 24-bit ANSI terminal colors. The look borrows Foldered's warm palette, not its folders or artwork. There are no folder shapes, and nothing launches in a separate window.

The **Now Playing** view contains a pixel-rendered album cover beside the track title and artist, a progress bar, and lyrics beneath. The cover is sourced from Spotify's album-art metadata and decoded locally with the cross-platform `sharp` dependency. The image uses colored Unicode half blocks, so it works in VS Code's integrated terminal without sixel, Kitty image protocols, or a GUI. The original demo includes a generated pixel-art cover. If Spotify has no cover art or the download fails, a placeholder remains visible.

To install the new album-art decoder after pulling an older clone:

    npm install
    npm link
    geekify

For the best results, expand VS Code's terminal pane to at least 80 columns by 25 rows. Geekify automatically reduces cover size and metadata when the terminal is shorter. All existing keyboard commands remain available.

## Connect Spotify to the terminal UI

1. Sign in to https://developer.spotify.com/dashboard and use a Spotify developer app.
2. In the app settings, register this **exact redirect URI**:
   **http://127.0.0.1:8888/callback**
3. In the terminal, run **geekify login**.
4. Paste the app's **Client ID** (never the client secret).
5. Authorize in the browser. Return to the terminal and run **geekify**.
6. Open the normal Spotify application on your computer or another device and start a song.

The CLI uses browser-based OAuth Authorization Code with PKCE. It refreshes the session automatically. Spotify Premium is required for development-mode apps and playback-control endpoints; developer apps have user limits. You do not need a paid AI API.

**Important:** Geekify controls the existing Spotify player. Spotify does **not** stream its audio into this terminal. The terminal isn't a replacement audio player; it is a playback manager, song browser and lyrics display.

Spotify's developer API may restrict playlist contents when you don't own or collaborate on the playlist. Library, search and device availability are also subject to the app's granted scopes and current Spotify access rules.

## Keyboard controls

| Key | Action |
| --- | --- |
| 1 | Now Playing and live lyrics |
| 2 | Search results |
| 3 | Liked tracks |
| 4 | Playlists |
| 5 | Spotify Connect devices |
| / | Type and run a search |
| Up / Down, j / k | Navigate songs or manually scroll unsynced lyrics |
| Enter | Play selected track / open playlist / switch device |
| PgUp / PgDn | Change catalog page |
| Space | Play or pause |
| n / p | Next / previous track |
| + / - | Change volume |
| s / r | Toggle shuffle / cycle repeat |
| f | Save the current track to Liked Songs |
| c | Connect or reconnect Spotify |
| : | Enter a Geekify command |
| Esc | Go back |
| ? | Help |
| q | Quit |

Commands inside the interactive UI: **:connect**, **:logout**, **:demo**, **:search text**, **:refresh**, **:help**, **:quit**.

CLI entry points: **geekify**, **geekify demo**, **geekify login**, **geekify logout**, **geekify doctor**, **geekify web**, **geekify --help**, **geekify --version**.

## Playback controls troubleshooting

If Geekify can display the current track but cannot play, pause, skip, or start a song, use:

    git pull
    geekify login
    geekify doctor

**geekify doctor** is read-only. It checks whether Spotify granted `user-modify-playback-state`, whether the player API responds, whether a playback device is active, and whether the device is marked `is_restricted`. It never prints access or refresh tokens. Older sessions may not store their granted scopes; login again to populate them.

Before testing: open Spotify Desktop, start playing a song, and confirm Spotify Desktop is the active output device. Then run `geekify` and press Space to pause. If Spotify rejects the command, Geekify now reports the HTTP status, endpoint and Spotify-provided reason such as `PREMIUM_REQUIRED` or `RESTRICTION_VIOLATED` instead of a generic "denied" message.

A Spotify 403 is **not automatically proof you lack Premium**. Confirm that the account you authorized is on the app's Users Management allowlist, and that the Spotify app owner has Premium. The development limit is **five distinct authorized Spotify accounts**, not five devices or five simultaneous sessions.

## Lyrics: how the fix works

Lyrics come from https://lrclib.net/docs without an API key. The old implementation made one strict lookup with Spotify title, album and duration and returned "no lyrics" for many songs with different single/remaster metadata.

The revised lookup:
1. Attempts an exact song + artist + album + duration match.
2. Falls back to searching lyrics by title + artist without overconstraining album/duration.
3. Rejects results with the wrong artist/title or a significantly different duration.
4. Prefers synchronized, timestamped LRC.
5. Shows plain lyrics when only unsynced text is available, clearly labeled as **unsynced**.
6. Does not pretend lyrics exist if the provider has none.

The lyrics' current line is derived from Spotify's approximate playback position. Spotify polling and network latency can still lead to some drift. The app cannot guarantee lyrics for all songs. No copyrighted lyrics are committed to this repository; the original demo includes fictional lines only.

## Browser app

    npm run dev
    npm test
    npm run build

The website runs at http://127.0.0.1:5173/ . For **web** Spotify login, register a separate redirect URI **http://127.0.0.1:5173/**. The browser has a different OAuth session from the terminal. Use the gear icon to configure Spotify on the website. For hosting on vibe.notagai.com, run **npm run build** and deploy the **dist/** folder as a static website, then register **https://vibe.notagai.com/** as another Spotify redirect URI. Nothing is deployed automatically by this repository.

The website renders three original Canvas pixel scenes at 640x360, nearest-neighbor scaled to 1440p / 4K. It is currently atmospheric, not audio-frequency driven. True beat-accurate visualization requires a separate permission-based audio source. Spotify's platform policy also limits synchronizing Spotify sound recordings with visual media, so review https://developer.spotify.com/policy before publicly distributing such an integration.

## Developer notes

The terminal shell and Spotify API code use Node.js APIs and ANSI terminal controls. The only image-decoding dependency is **sharp**, used to convert Spotify JPEG covers into true-color terminal pixels. It works in interactive PowerShell, Windows Terminal, and VS Code integrated terminals.

- Spotify client ID and refreshed access tokens are written to your user profile's **~/.geekify/config.json**, best-effort user-only filesystem permissions; the file is **not encrypted**.
- Run **geekify logout** to clear the token from that file.
- Use **npm unlink -g geekify** to remove the globally linked command.
- The CLI's OAuth redirect uses **http://127.0.0.1:8888/callback** because Spotify permits HTTP only for loopback IP literals; \`localhost\` is not a permitted OAuth redirect.
- The terminal UI uses 6-second polling for playback state, respecting rate-limit headers where possible.
- The UI doesn't persist or upload music files. All audio comes from the existing Spotify player.

## Limits

Search, library and Spotify Connect depend on the Spotify Web API, a Premium developer account and the user's available playback devices. Remote commands may fail if playback is unavailable or a Spotify endpoint is restricted. Spotify retains control of audio playback and track availability.

Testing:

    npm install
    npm test
    npm run cli:smoke
    npm run build

GitHub Actions checks those commands on main and pull requests.
