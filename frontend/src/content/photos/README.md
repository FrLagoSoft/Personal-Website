# Photos

Drop image files in this folder and the site picks them up by file name.
No code changes needed. Accepted: jpg, jpeg, png, webp, avif, gif.

| File name            | Where it appears                                             |
| -------------------- | ------------------------------------------------------------ |
| `portrait.jpg`       | The centre tile, the landing page, and the "About" panel     |
| `<id>-1.jpg`, `-2`…  | Photo gallery in that tile's side panel (numbered from 1)    |
| `<id>-tile.jpg`      | Printed on the hexagon itself, behind the tile's name        |

`<id>` is the `id` of a tile or category in `src/content/content.js`.

Examples:

- `dronautics-1.jpg`, `dronautics-2.jpg`: gallery for the Dronautics panel
- `agent-factory-tile.jpg`: the Agent Factory hexagon becomes a photo tile
- `hackathons-tile.jpg`: photo on the Hackathons category tile (also shown on the landing page)
- `me-1.jpg`: gallery in your own "About" panel

Tips: portrait photos should be at least 600 px wide (the current one is a 235 px
GitHub avatar, so it is soft). Gallery photos look best around 1600 px wide.
While running `npm run dev`, each panel shows the exact file names it is looking for.
