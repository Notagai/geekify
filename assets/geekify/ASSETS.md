# Geekify's original pixel-art UI pack

**Approved visual target:** [`reference/approved-composition.png`](reference/approved-composition.png).
**Real app composition preview:** [`reference/assembled-preview.png`](reference/assembled-preview.png).

This pack was developed from the approved **Geekify** concept and generated independently of the Foldered website artwork. Foldered was a mood-board reference only. The runtime UI is not a flattened screenshot; it assembles separately cut, cleaned, quantized PNG assets from this directory. Dynamic labels, lyrics, album art, time/progress, tab selection and Spotify controls are rendered separately.

## Layout

The top-level music desk is 1200x675 layout units, then scaled proportionately for the terminal pane. The dominant paper sheet is the lyrics view, with Queue and Info secondary; playback stays in a fixed bottom strip. The main shell has a dark walnut tile, independently composited pixel-art frame edge/corner elements, an irregular paper surface, taped tag and decorations, and nonrectangular wood transport controls. There is **no mascot** in this release.

## Asset groups

| Group | Details |
| --- | --- |
| `frame/` | 4 irregular pixel-art corners, 4 edge strips, a repeatable walnut surface |
| `branding/` | Original Geekify paper logo tag |
| `paper/` | Empty lyrics surface, bottom player skin, active/inactive tab skins |
| `sidebar/` | Active/idle button skins, 6 icon assets |
| `player/` | Album frame, demo cover, shuffle/previous/pause/next/repeat, heart and progress parts |
| `decor/` | Pixel ivy, flowers, taped photograph, tape strip |

The full manifest is [`manifest.json`](manifest.json) with exact relative paths, dimensions and source crop regions. PNG alpha is retained for compositing; no runtime dependency on source PSD/sprite sheets is needed. Image source sheets and the reference are included for review and future recutting but are **not** painted over interactive UI.

## Implementation and provenance

- Individual sprites were cut from the generated `geekify_retro_pixel_ui_asset_sheet.png` (not from Foldered) and given a constrained palette. Detached text labels and neon fringing from the generated sheet were removed.
- The long lyrics paper is rebuilt with a repeated blank middle section so the mountain silhouettes and paper perforations are **not distorted** to fill the UI.
- The player skin is reconstructed from the original paper strip into a continuous drawable panel.
- The album frame is cut from the approved composition and has a transparent interior for live Spotify cover art.
- Default cover art is an example from the approved concept and changes to the real Spotify track artwork when connected.
- The source artwork and preview may need further hand-pixel cleanup; do not claim the pack is manually pixel-perfect.

## Future Ren / Reina integration

The initial `geekify` command has **no sprite**. When characters are added later, they should render as independent pixel sprite sheets on top of the assembled UI. Reactions can be driven by song genre, mood, tempo/BPM and musical key **when that data is actually available**; those values should not be invented, and APIs may restrict access to audio features. No background AI calls are required for routine animation.

## Run

Use `geekify` or `geekify demo` in a VS Code terminal with image support. Use `geekify --ansi` for the text fallback. `npm test` checks manifest assets and PNG rendering, and `npm run build` validates the project.
