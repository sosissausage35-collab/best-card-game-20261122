# Ember Duel

[![make.fun · best-card-game-20261122-1826](https://make.fun/badge/best-card-game-20261122-1826.svg)](https://make.fun/bounty/best-card-game-20261122-1826?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
[![rank](https://make.fun/badge/best-card-game-20261122-1826/sosissausage35-collab/best-card-game-20261122/rank.svg)](https://make.fun/bounty/best-card-game-20261122-1826/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
[![reward](https://make.fun/badge/best-card-game-20261122-1826/sosissausage35-collab/best-card-game-20261122/reward.svg)](https://make.fun/bounty/best-card-game-20261122-1826?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)

Built for the [best-card-game-20261122-1826 bounty](https://make.fun/bounty/best-card-game-20261122-1826) on make.fun.

An original mana-based card battler, built for the make.fun bounty
`best-card-game-20261122-1826` ("Make the best card game").

You are the **Ember Knight**, duelling the **Cinder Warden** for the ember forge.
Win a round by reducing the Warden to 0 ♥. Win all **3 rounds** to win the duel —
the Warden returns with more health each round, and you gain more mana.

## Rules

- Each turn your mana (🔷) refills and you draw a card. Your hand holds up to 7 cards.
- Cards cost mana. Four elements:
  - **Ember** 🔥 — damage (Ember Spark, Cinder Slash, Flameburst, Sunflare)
  - **Tide** 💧 — healing (Tide Mend, Springwater, Moonpetal)
  - **Gale** 🌬️ — damage + card draw (Gale Gust, Stormcall, Zephyr Trick)
  - **Stone** 🧱 — shield (Stone Wall, Granite Guard, Thorn Vine, Ember Bulwark)
- Shield 🛡️ absorbs damage before health does. Your deck reshuffles when it runs out.
- The Warden plays sensibly: it takes lethal damage when it can, heals when hurt,
  shields when exposed, and otherwise plays its biggest hit.
- Score = damage dealt + 50 per round won. Best score is saved on your device.

## Controls

- Mouse: click a card to play it, click **End Turn** to pass.
- Keyboard: `1`–`7` play a card, `E` end turn, `Enter` start / play again, `M` sound.

## Play

Static files, no build step, no network requests:

```sh
node serve.ts   # then open http://localhost:8080
```

Screenshots are staged with `?shot=start|play|win|loss&seed=7` — each frame is a real
game state reached by playing the actual rules forward.

## License

MIT — see `LICENSE`.
