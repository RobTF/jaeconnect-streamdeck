import { type CarContext, runTime } from "./car.ts";
import { globals } from "./globals.ts";
import { hub } from "./hub.ts";
import type { ActionSettings } from "./settings.ts";

/**
 * Gathers what an action needs about its car.
 * @param settings The action's settings.
 * @returns The car, or `undefined` when the token can't see it (or nothing is connected).
 */
export function carContext(settings: ActionSettings): CarContext | undefined {
    const vehicle = hub.vehicle(settings.vehicleId);
    if (!vehicle) {
        return undefined;
    }

    const units = globals();
    return {
        vehicle,
        status: hub.status(vehicle.id),
        distance: units.distance,
        pressure: units.pressure,
        climateTarget: hub.climateTarget(vehicle),
        durationMinutes: runTime(vehicle, settings.durationMinutes),
    };
}
