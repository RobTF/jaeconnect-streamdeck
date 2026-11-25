import { normaliseBaseUrl } from "./api/client.ts";

/**
 * Settings as Stream Deck stores them: JSON, whatever a settings page wrote.
 */
export type StoredSettings = Record<string, unknown>;

/**
 * How distances show.
 */
export type DistanceUnit = "mi" | "km";

/**
 * How tyre pressures show.
 */
export type PressureUnit = "psi" | "bar" | "kpa";

/**
 * The plugin-wide settings.
 */
export type GlobalSettings = {
    /**
     * A personal access token (`jc_pat_…`) with read and control on the cars to use; `undefined` until one is pasted.
     */
    token: string | undefined;
    /**
     * The jaeconnect address.
     */
    baseUrl: string;
    distance: DistanceUnit;
    pressure: PressureUnit;
};

/**
 * One action's settings.
 */
export type ActionSettings = {
    /**
     * The car; `undefined` means the first car the token can read.
     */
    vehicleId: string | undefined;
    /**
     * The run time for climate, demisters and seats; `undefined` means the car's longest (or 15 minutes).
     */
    durationMinutes: number | undefined;
    /**
     * Which window a demister key works on.
     */
    window: "front" | "rear";
};

/**
 * Reads the plugin-wide settings, filling in the defaults.
 * @param stored What Stream Deck stored.
 * @returns The settings.
 */
export function globalSettings(stored: StoredSettings): GlobalSettings {
    const token = typeof stored.token === "string" && stored.token.trim() !== "" ? stored.token.trim() : undefined;
    return {
        token,
        baseUrl: normaliseBaseUrl(typeof stored.baseUrl === "string" ? stored.baseUrl : undefined),
        distance: stored.distance === "km" ? "km" : "mi",
        pressure: stored.pressure === "bar" || stored.pressure === "kpa" ? stored.pressure : "psi",
    };
}

/**
 * Reads one action's settings, filling in the defaults.
 * @param stored What Stream Deck stored.
 * @returns The settings.
 */
export function actionSettings(stored: StoredSettings): ActionSettings {
    const minutes = Number(stored.durationMinutes);
    return {
        vehicleId: typeof stored.vehicleId === "string" && stored.vehicleId !== "" ? stored.vehicleId : undefined,
        durationMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 30 ? minutes : undefined,
        window: stored.window === "rear" ? "rear" : "front",
    };
}

/**
 * A field on the settings page (ui/settings.html), which draws whatever the plugin sends it.
 */
export type Field =
    | { kind: "heading"; label: string }
    | { kind: "text" | "secret"; key: string; label: string; placeholder?: string; help?: string }
    | { kind: "select"; key: string; label: string; default?: string; help?: string; options: { value: string; label: string }[] | "vehicles" | "durations" };

const carField: Field = { kind: "select", key: "vehicleId", label: "Car", default: "", options: "vehicles" };
const runTimeField: Field = { kind: "select", key: "durationMinutes", label: "Run time", default: "", options: "durations" };

/**
 * The fields each action's settings page shows, by action UUID.
 */
export const actionFields: Record<string, Field[]> = {
    "com.jaeconnect.streamdeck.lock": [carField],
    "com.jaeconnect.streamdeck.climate": [carField, runTimeField],
    "com.jaeconnect.streamdeck.charging": [carField],
    "com.jaeconnect.streamdeck.boot": [carField],
    "com.jaeconnect.streamdeck.demister": [
        carField,
        { kind: "select", key: "window", label: "Window", default: "front", options: [{ value: "front", label: "Windscreen" }, { value: "rear", label: "Rear window" }] },
        runTimeField,
    ],
    "com.jaeconnect.streamdeck.wheel": [carField],
    "com.jaeconnect.streamdeck.signal": [carField],
    "com.jaeconnect.streamdeck.car": [carField],
    "com.jaeconnect.streamdeck.climate-dial": [carField, runTimeField],
    "com.jaeconnect.streamdeck.seats-dial": [carField, runTimeField],
    "com.jaeconnect.streamdeck.energy-dial": [carField],
    "com.jaeconnect.streamdeck.openings-dial": [carField],
};

/**
 * The plugin-wide fields every settings page shows under the action's own.
 */
export const globalFields: Field[] = [
    { kind: "heading", label: "jaeconnect account" },
    {
        kind: "secret",
        key: "token",
        label: "Access token",
        placeholder: "jc_pat_…",
        help: "Create one on the jaeconnect website under Apps and tokens, with Control on the cars to use here.",
    },
    { kind: "text", key: "baseUrl", label: "Address", placeholder: "https://www.jaeconnect.com", help: "Leave blank for jaeconnect.com." },
    { kind: "heading", label: "Units" },
    { kind: "select", key: "distance", label: "Distance", default: "mi", options: [{ value: "mi", label: "Miles" }, { value: "km", label: "Kilometres" }] },
    { kind: "select", key: "pressure", label: "Tyre pressure", default: "psi", options: [{ value: "psi", label: "psi" }, { value: "bar", label: "bar" }, { value: "kpa", label: "kPa" }] },
];
