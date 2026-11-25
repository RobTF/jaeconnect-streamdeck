# jaeconnect for Stream Deck

Your car on a Stream Deck+, through [jaeconnect](https://jaeconnect.com): locks, climate, charging, demisters,
seats, windows and sunroof, with live status on the keys and the touch strip.

Each control is its own action in the Stream Deck app, so you can lay them out however you like, put them on other
pages, or show two cars side by side. Every action reads what its car can do from jaeconnect, so a car without a
heated steering wheel shows that key as "Not on this car" instead of a key that fails.

## Actions

| Action | Shows | Press | Hold, turn or tap |
|---|---|---|---|
| **Lock** (key) | Locked or unlocked | Lock | Hold 1 s: unlock |
| **Climate** (key) | Off and the temperature it starts at, or the car's set temperature while running | Start at the Climate dial's temperature, or stop | – |
| **Charging** (key) | Battery %, charger power and time to full, on cars that plug in (not petrol, diesel or self-charging hybrids) | Start or stop charging, on cars with charge control | – |
| **Fuel** (key) | Fuel %, a meter and the range on fuel, on cars with an engine (not electric cars) | Ask the car for a fresh status | – |
| **Boot** (key) | Open or shut | Close | Hold 1 s: open |
| **Demister** (key) | Windscreen or rear window (a setting), on or off | Turn on or off | – |
| **Heated wheel** (key) | On or off, for cars that have one | Turn on or off | – |
| **Signal** (key) | – | Flash the lights and sound the horn | – |
| **Car** (key) | Name, awake or asleep, last report | Ask the car for a fresh status | Hold 1 s while asleep: wake it |
| **Climate dial** | Temperature and run time | Start or stop climate | Turn: temperature (sent at once while running). Tap: run time |
| **Seats dial** | Seat, and its heating or cooling on one scale | Send the chosen setting | Turn right from off to heat (levels 1–3), left to cool; not sent until you press, and dropped after 10 s. Tap: next seat |
| **Energy dial** | Battery, fuel, tyres or odometer | Ask the car for a fresh status | Turn or tap: next page |
| **Windows and sunroof dial** | Closed, vented or open | Send the chosen position | Turn: choose a position (not sent until you press; dropped after 10 s). Tap: windows or sunroof |

Anything that opens the car needs a hold, and anything a dial chooses needs a press, so a knock on the desk doesn't
open a window. The control PIN stays in jaeconnect and is never typed on the deck.

## Setting up

1. On the jaeconnect website, go to **Apps and tokens** and create a personal access token with **Control** on the
   cars to use (Control includes reading status; location isn't needed).
2. Drag any jaeconnect action onto the deck, open its settings and paste the token into **Access token**. Every
   action shares it.
3. Pick the car for each action, or leave it on the first car.

## Developing

Needs Node 24 and the Stream Deck app (7.1 or later) with developer mode on (`npx streamdeck dev`).

```powershell
npm install
npm run deploy
```

`deploy` builds the plugin, copies it into Stream Deck's plugins folder and restarts it. The first time, restart the
Stream Deck app so it finds the plugin. `npm run watch` rebuilds and redeploys on every change.

| Script | Does |
|---|---|
| `npm test` | Unit tests (Node's test runner, on the TypeScript directly) |
| `npm run typecheck` | Type-checks without building |
| `npm run validate` | Elgato's manifest and image checks |
| `npm run images` | Rewrites the action images from `src/render/icons.ts` |
| `npm run pack` | Builds `dist/com.jaeconnect.streamdeck.streamDeckPlugin` to install or share |

To try it against a local jaeconnect, set **Address** in the settings to `https://localhost:7180` and use a token
from that instance. The plugin's log is in `com.jaeconnect.streamdeck.sdPlugin/logs` (and the installed copy's).

### How it fits together

- `src/hub.ts` is the one connection every action shares: it lists the cars (`GET /v1/vehicles`), keeps their
  status, holds the `GET /v1/events` stream open (reconnecting with `Last-Event-ID`), reads status once a minute for
  values that drift without an event, and sends commands. `command.updated` events drive "Sending", "Sent" and
  "Car has it" on the key that sent the command.
- `src/keys/` and `src/dials/` hold the actions. What each one shows is worked out by pure functions in
  `key-views.ts` and `panel-views.ts`, which the tests cover, and drawn as SVG by `src/render/`.
- `src/api/` is ported from [node-red-contrib-jaeconnect](https://github.com/RobTF/node-red-contrib-jaeconnect).
- `ui/settings.html` is one settings page for every action; the plugin sends it the fields (`src/settings.ts`).

## Still to do

- Sign in with OAuth (authorization code with PKCE and a loopback redirect) instead of a pasted token. jaeconnect
  needs a client for the plugin that accepts `http://127.0.0.1` redirects first.
- Read the account's units from jaeconnect rather than a plugin setting.
- Only poll status while a jaeconnect action is on screen.

## Licence

MIT
