# Handoff: Bruce's Clipboard Calculator + Line Painter

Read this first in a new session.

## Ground rules from the user
- Never edit a finished version. Always copy it to a new folder (`bruce-calculator-vNN`) and work on the copy.
- Keep every early mock-up. `MOCKUPS.md` lists each version and its link.
- Marktrak is a separate project. Don't mix it in here.

## Where things are
- Branch: `ccr-40133ded-4zaunk` (not merged to `main`).
- Latest: `bruce-calculator-v17/`, published at https://claude.ai/artifact/W3586NxzmdT6VMTSrVTbNi
  - `index.html`: the calculator page. It uses Bruce's real clipboard photo (`clipboard-top.jpg`,
    `clipboard-paper.jpg`) with key hotspots over the photo and a 7-segment LCD canvas.
  - `ute3d.js`: the three.js (r128) Line Painter 3D game. It opens with code `662` then `=`.
- `research/`: the NZ marking rule book (84 cited rules) and quiz. NZTA blocks automated reading, so
  these are from search summaries only and need checking against real documents.

## Priorities (user's order)
1. Calculator looks like Bruce's real one. Done in v17; get the user's feedback.
2. Finish the painting game. The user said the game is "absolute rubbish" but didn't say why. They have
   a screen recording at `C:\Users\uptha\Videos\2026-10-25 17-30-52.mp4`. Watch it first and find out
   what's wrong before building anything.
3. Teaching game for markers: side roads with tails, arrows, turn bays. Get the user's specs first,
   then build from those.

## What the user has told us about the job
- Bruce's 1985 NY662 ute (Independent Roadmarkers, Fordell, Wanganui) is the vehicle. Use Hino 300
  specs for the driving feel only.
- In NZ, yellow and white are not painted in one pass.
- Nobody walks the set-out. It's done from the truck with a distance counter.
- No job sheets or forms. "We are painting."
- Operator view: window down, a big mirror looking at the line, a pointer out the front right, and the
  operator hangs their head out the window.
- Quick-fire questions mid-job annoyed them; v13 and later don't pause the game.
- No cones on the road.
- The user found the 3D boring or cheap at several points. They respond best to realism and clear
  "what do I do now" guidance.

## Testing tips
- Headless Chromium uses software GL, so it runs slowly. Test at about 400x860 or 950x450, and move
  the ute with `window.Ute3D.game._state` to skip ahead.
