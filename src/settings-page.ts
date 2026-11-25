import streamDeck from "@elgato/streamdeck";

import { runTimes } from "./car.ts";
import { hub } from "./hub.ts";
import { actionFields, globalFields } from "./settings.ts";

type JsonValue = Parameters<typeof streamDeck.ui.sendToPropertyInspector>[0];

/**
 * Answers every action's settings page (ui/settings.html): "schema" gets the action's fields, the plugin-wide fields,
 * the cars and run times to offer, and the connection's status; "status" gets the status alone, which the page asks
 * for every two seconds while it's open.
 */
export function answerSettingsPages(): void {
    streamDeck.ui.onSendToPlugin(async (ev) => {
        const payload = ev.payload;
        if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
            return;
        }

        if (payload.type === "schema") {
            const vehicleId = typeof payload.vehicleId === "string" && payload.vehicleId !== "" ? payload.vehicleId : undefined;
            const reply = {
                type: "schema",
                fields: actionFields[ev.action.manifestId] ?? [],
                globalFields,
                names: names(vehicleId),
                status: status(),
            };
            await streamDeck.ui.sendToPropertyInspector(reply as unknown as JsonValue);
        } else if (payload.type === "status") {
            await streamDeck.ui.sendToPropertyInspector({ type: "status", status: status() });
        }
    });
}

// The choices the pages offer: the cars the token can see, and the run times the action's car takes.
function names(vehicleId: string | undefined): { vehicles: { value: string; label: string }[]; durations: { value: string; label: string }[] } {
    const vehicles = [...hub.vehicles.values()];
    const car = hub.vehicle(vehicleId);
    return {
        vehicles: [
            { value: "", label: vehicles.length ? `First car (${vehicles[0]?.nickname})` : "Sign in first" },
            ...vehicles.map((x) => ({ value: x.id, label: `${x.nickname} · ${x.model}` })),
        ],
        durations: [
            { value: "", label: "Car's default" },
            ...(car ? runTimes(car) : [5, 10, 15, 20, 30]).map((x) => ({ value: String(x), label: `${x} min` })),
        ],
    };
}

// The connection line every page shows under its fields.
function status(): { connected: boolean; state: string; detail: string } {
    switch (hub.connection) {
        case "connected": {
            const count = hub.vehicles.size;
            return { connected: true, state: "Connected", detail: `${count} car${count === 1 ? "" : "s"}` };
        }
        case "connecting":
            return { connected: false, state: "Connecting", detail: "to jaeconnect" };
        case "signed-out":
            return { connected: false, state: "Not signed in", detail: "paste an access token above" };
        default:
            return { connected: false, state: "Offline", detail: hub.problem ?? "jaeconnect can't be reached" };
    }
}
