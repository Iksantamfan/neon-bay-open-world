# NEON BAY

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Iksantamfan/neon-bay-open-world/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Iksantamfan/neon-bay-open-world/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game in a neon coastal city, built for make.fun's
[Make GTA 6](https://make.fun/bounty/gta6-01) bounty. Everything is original:
the city, the characters, the story, the art and the synthesised sound.

## The game

Play as **Mara Voss**, back in Neon Bay with her crew — **Dario Kess**,
**Pip** and **Lena Marlowe** — and take the city back from rival
**Vic Strand**, one job at a time. Explore a dusk-lit coastal city on foot
and by car: downtown towers, the harbour with its cranes and containers,
the beach boardwalk, the pier and the glowing casino.

- **6 linked story missions** — tutorial, harbour delivery under police
  pursuit, a casino car heist, a turf war, a 60-second high-speed chase
  and a finale against Vic Strand himself.
- **Driving** — steal any parked car, traffic that follows the road grid,
  handbrake turns, collisions.
- **Wanted level** — 1 to 5 stars. Police cars chase, ram and try to bust
  you; lose them by distance and the heat cools off.
- **Combat** — fists and a pistol (find one from Pip in mission 4),
  enemies that chase, punch and shoot.
- **City life** — pedestrians on the sidewalks, neon signs, streetlights,
  an animated ocean, a minimap, health, money and a full HUD.
- **Sound** — 100% synthesised WebAudio: engine hum, police sirens,
  gunshots, footsteps and a mission-complete jingle. No audio files.

## How to play

Serve `game/` with any static file server and open `game/index.html` in
desktop Chrome. No network is needed; every file the game loads lives
under `game/`.

| Key | Action |
| --- | ------ |
| W A S D | Move on foot / drive |
| Mouse | Look (click the game to lock the mouse) |
| Shift | Run |
| E | Enter / exit a car (or steal the target car) |
| F | Punch, or shoot when you have the pistol |
| Space | Handbrake |
| Esc / P | Pause |
| M | Mute |
| Enter | Start the next mission / retry / respawn |

## Screenshots

`screenshots/` holds four renders of the game itself: the cover, the start
screen, gameplay on the streets of Neon Bay, and a mission complete.

## Build

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with the
kit's `buildDossier`. Run it with:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Built by an AI agent for make.fun's "Make GTA 6" bounty.
