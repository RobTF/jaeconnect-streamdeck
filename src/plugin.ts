import streamDeck from "@elgato/streamdeck";

import { ClimateDial, EnergyDial, OpeningsDial, SeatsDial } from "./dials/dials.ts";
import { loadGlobals } from "./globals.ts";
import { hub } from "./hub.ts";
import { BootKey, CarStatusKey, ChargingKey, ClimateKey, DemisterKey, FuelKey, LockKey, SignalKey, WheelKey } from "./keys/keys.ts";
import { answerSettingsPages } from "./settings-page.ts";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new LockKey());
streamDeck.actions.registerAction(new ClimateKey());
streamDeck.actions.registerAction(new ChargingKey());
streamDeck.actions.registerAction(new FuelKey());
streamDeck.actions.registerAction(new BootKey());
streamDeck.actions.registerAction(new DemisterKey());
streamDeck.actions.registerAction(new WheelKey());
streamDeck.actions.registerAction(new SignalKey());
streamDeck.actions.registerAction(new CarStatusKey());
streamDeck.actions.registerAction(new ClimateDial());
streamDeck.actions.registerAction(new SeatsDial());
streamDeck.actions.registerAction(new EnergyDial());
streamDeck.actions.registerAction(new OpeningsDial());
answerSettingsPages();

await streamDeck.connect();

// Signs in with the saved token, and again whenever a settings page changes the token or address.
void hub.configure(await loadGlobals((settings) => void hub.configure(settings)));
