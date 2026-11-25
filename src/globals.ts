import streamDeck from "@elgato/streamdeck";

import { type GlobalSettings, globalSettings, type StoredSettings } from "./settings.ts";

let current: GlobalSettings = globalSettings({});

/**
 * The plugin-wide settings as last read; the defaults until {@link loadGlobals} has run.
 * @returns The settings.
 */
export function globals(): GlobalSettings {
    return current;
}

/**
 * Reads the plugin-wide settings from Stream Deck, and keeps them current as a settings page changes them.
 * @param onChange Called with the new settings whenever a settings page saves them.
 * @returns The settings.
 */
export async function loadGlobals(onChange: (settings: GlobalSettings) => void): Promise<GlobalSettings> {
    streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
        current = globalSettings(ev.settings as StoredSettings);
        onChange(current);
    });
    current = globalSettings(await streamDeck.settings.getGlobalSettings<StoredSettings & Record<string, never>>());
    return current;
}
