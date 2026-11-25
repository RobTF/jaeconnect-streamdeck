import type { ClimateLimits, CommandName, OpeningPosition, SeatName, Vehicle, VehicleStatus } from "./api/types.ts";
import type { DistanceUnit, PressureUnit } from "./settings.ts";

/**
 * Everything an action needs to draw itself and act on its car.
 */
export type CarContext = {
    vehicle: Vehicle;
    /**
     * The last status read; `undefined` until the first one arrives.
     */
    status: VehicleStatus | undefined;
    distance: DistanceUnit;
    pressure: PressureUnit;
    /**
     * The temperature climate starts at: the Climate dial's, shared by every action on the car.
     */
    climateTarget: number;
    /**
     * The run time for climate, demisters and seats.
     */
    durationMinutes: number;
};

/**
 * Where a command is, while the plugin waits for the car.
 */
export type Progress = "waking" | "sending" | "sent" | "accepted";

/**
 * The words a key or panel shows for each step.
 */
export const progressText: Record<Progress, string> = {
    waking: "Waking car",
    sending: "Sending",
    sent: "Sent",
    accepted: "Car has it",
};

/**
 * Whether the car takes a command.
 * @param vehicle The car.
 * @param command The command.
 * @returns Whether it does.
 */
export function supports(vehicle: Vehicle, command: CommandName): boolean {
    return vehicle.supported_commands.includes(command);
}

/**
 * Whether the car plugs in to charge: an EV, plug-in hybrid or range extender, or a car whose powertrain the service
 * doesn't give (shown rather than hidden, as most cars jaeconnect knows plug in). Petrol, diesel and self-charging
 * hybrids don't.
 * @param vehicle The car.
 * @returns Whether it does.
 */
export function pluggable(vehicle: Vehicle): boolean {
    return vehicle.powertrain === null || ["ev", "phev", "erev"].includes(vehicle.powertrain);
}

/**
 * The climate control's limits, or jaeconnect's defaults (16–30 °C in whole degrees) when the car doesn't say.
 * @param vehicle The car.
 * @returns The limits.
 */
export function climateLimits(vehicle: Vehicle): ClimateLimits {
    return vehicle.climate ?? { min_temp_c: 16, max_temp_c: 30, step_c: 1, durations_minutes: [], max_engine_minutes: null };
}

/**
 * Clamps a temperature to the car's range and snaps it to its step.
 * @param vehicle The car.
 * @param temperature The temperature in °C.
 * @returns The temperature the car would take.
 */
export function clampTemperature(vehicle: Vehicle, temperature: number): number {
    const limits = climateLimits(vehicle);
    const step = limits.step_c > 0 ? limits.step_c : 1;
    const snapped = limits.min_temp_c + Math.round((temperature - limits.min_temp_c) / step) * step;
    return Math.min(limits.max_temp_c, Math.max(limits.min_temp_c, Number(snapped.toFixed(1))));
}

/**
 * The run times to offer: the car's own, or a sensible list when it takes any.
 * @param vehicle The car.
 * @returns The run times in minutes, shortest first.
 */
export function runTimes(vehicle: Vehicle): number[] {
    const own = climateLimits(vehicle).durations_minutes;
    return own.length > 0 ? [...own].sort((a, b) => a - b) : [5, 10, 15, 20, 30];
}

/**
 * The run time to use: the one chosen, when the car takes it, otherwise the car's longest up to 15 minutes.
 * @param vehicle The car.
 * @param chosen The action's setting.
 * @returns The run time in minutes.
 */
export function runTime(vehicle: Vehicle, chosen: number | undefined): number {
    const times = runTimes(vehicle);
    if (chosen !== undefined && times.includes(chosen)) {
        return chosen;
    }

    return times.filter((x) => x <= 15).at(-1) ?? times[0] ?? 15;
}

/**
 * The highest seat heating or cooling level the dial offers.
 */
export const maxSeatLevel = 3;

/**
 * A seat the Seats dial offers, and whether it can be heated, cooled or both.
 */
export type SeatOption = { seat: SeatName; heat: boolean; cool: boolean };

/**
 * The seats the Seats dial offers, front first: each seat that can be heated or cooled. A list the car service
 * can't give (`null`) offers the front seats.
 * @param vehicle The car.
 * @returns The seats, in the order a tap steps through them.
 */
export function seatOptions(vehicle: Vehicle): SeatOption[] {
    const front: SeatName[] = ["driver", "passenger"];
    const heated = supports(vehicle, "seat_heat") ? (vehicle.heated_seats ?? front) : [];
    const cooled = supports(vehicle, "seat_vent") ? (vehicle.ventilated_seats ?? front) : [];
    return (["driver", "passenger", "rear_left", "rear_right"] as const)
        .map((seat) => ({ seat, heat: heated.includes(seat), cool: cooled.includes(seat) }))
        .filter((x) => x.heat || x.cool);
}

/**
 * A seat's heating and cooling as one number, the way the Seats dial turns it: heating levels above zero, cooling
 * levels below (-2 is cooling at level 2), 0 for off. Heating wins if the car reports both.
 * @param status The status.
 * @param seat The seat.
 * @returns The setting, 0 when the car doesn't say.
 */
export function seatSetting(status: VehicleStatus | undefined, seat: SeatName): number {
    const levels = status?.seats?.[seat];
    const heat = levels?.heat_level ?? 0;
    const vent = levels?.vent_level ?? 0;
    return heat > 0 ? heat : vent > 0 ? -vent : 0;
}

/**
 * Clamps a seat setting to what the seat can do: no cooling on a seat that only heats, and the other way round.
 * @param option The seat.
 * @param setting The setting.
 * @returns The setting it can take.
 */
export function clampSeatSetting(option: SeatOption, setting: number): number {
    return Math.min(option.heat ? maxSeatLevel : 0, Math.max(option.cool ? -maxSeatLevel : 0, setting));
}

/**
 * The commands that take a seat from one setting to another. Going from heating to cooling (or back) turns the old
 * one off first, so the car isn't left doing both.
 * @param seat The seat.
 * @param from Its setting now.
 * @param to The setting wanted.
 * @returns The commands, in order, with their seat and level.
 */
export function seatCommands(seat: SeatName, from: number, to: number): { command: "seat_heat" | "seat_vent"; seat: SeatName; level: number }[] {
    const steps: { command: "seat_heat" | "seat_vent"; seat: SeatName; level: number }[] = [];
    if (from > 0 && to <= 0) {
        steps.push({ command: "seat_heat", seat, level: 0 });
    } else if (from < 0 && to >= 0) {
        steps.push({ command: "seat_vent", seat, level: 0 });
    }

    if (to > 0) {
        steps.push({ command: "seat_heat", seat, level: to });
    } else if (to < 0) {
        steps.push({ command: "seat_vent", seat, level: -to });
    }

    return steps;
}

/**
 * A seat's name for a panel.
 * @param seat The seat.
 * @returns The name.
 */
export function seatName(seat: SeatName): string {
    return { driver: "Driver", passenger: "Passenger", rear_left: "Rear left", rear_right: "Rear right" }[seat];
}

/**
 * Windows or sunroof.
 */
export type Opening = "windows" | "sunroof";

/**
 * The command that moves an opening to a position.
 * @param opening Windows or sunroof.
 * @param position The position.
 * @returns The command.
 */
export function openingCommand(opening: Opening, position: OpeningPosition): CommandName {
    const verb = { closed: "close", vented: "vent", open: "open" }[position];
    return `${verb}_${opening}` as CommandName;
}

/**
 * The openings the Openings dial offers: those the car can close.
 * @param vehicle The car.
 * @returns The openings.
 */
export function openings(vehicle: Vehicle): Opening[] {
    return (["windows", "sunroof"] as const).filter((x) => supports(vehicle, openingCommand(x, "closed")));
}

/**
 * The positions an opening can be sent to, closed first.
 * @param vehicle The car.
 * @param opening Windows or sunroof.
 * @returns The positions.
 */
export function positions(vehicle: Vehicle, opening: Opening): OpeningPosition[] {
    return (["closed", "vented", "open"] as const).filter((x) => supports(vehicle, openingCommand(opening, x)));
}

/**
 * Where an opening is now: the car's position when it says, otherwise open or closed.
 * @param status The status.
 * @param opening Windows or sunroof.
 * @returns The position, or `undefined` when the car doesn't report it.
 */
export function currentPosition(status: VehicleStatus | undefined, opening: Opening): OpeningPosition | undefined {
    if (!status) {
        return undefined;
    }

    const position = opening === "windows" ? status.windows_position : status.sunroof_position;
    const open = opening === "windows" ? status.windows_open : status.sunroof_open;
    return position ?? (open === null ? undefined : open ? "open" : "closed");
}

/**
 * Whether moving the sunroof to a position needs it closed first, as on cars whose sunroof can't go straight between
 * vented and open.
 * @param vehicle The car.
 * @param from Where it is.
 * @param to Where it should go.
 * @returns Whether to send `close_sunroof` first.
 */
export function sunroofClosesFirst(vehicle: Vehicle, from: OpeningPosition | undefined, to: OpeningPosition): boolean {
    return vehicle.sunroof_must_close_between_positions && from !== undefined && from !== "closed" && to !== "closed" && from !== to;
}

/**
 * A distance for display.
 * @param km Kilometres.
 * @param miles Miles, when the API gave them.
 * @param unit The unit to show.
 * @returns The text, e.g. `52 mi`.
 */
export function distance(km: number | null, miles: number | null, unit: DistanceUnit): string | undefined {
    if (unit === "km") {
        return km === null ? undefined : `${Math.round(km).toLocaleString("en-GB")} km`;
    }

    const value = miles ?? (km === null ? null : km / 1.609344);
    return value === null ? undefined : `${Math.round(value).toLocaleString("en-GB")} mi`;
}

/**
 * A tyre pressure for display, without its unit.
 * @param kpa Kilopascals.
 * @param unit The unit to show.
 * @returns The number as text.
 */
export function pressure(kpa: number | null | undefined, unit: PressureUnit): string {
    if (kpa === null || kpa === undefined) {
        return "–";
    }

    return unit === "kpa" ? Math.round(kpa).toString() : unit === "bar" ? (kpa / 100).toFixed(1) : Math.round(kpa * 0.145038).toString();
}

/**
 * How long ago something happened, briefly.
 * @param iso The time, ISO 8601.
 * @param now The time now, in milliseconds since the epoch.
 * @returns The text, e.g. `2 min ago`.
 */
export function ago(iso: string | undefined, now: number): string {
    const then = iso ? Date.parse(iso) : Number.NaN;
    if (Number.isNaN(then)) {
        return "no report";
    }

    const seconds = Math.max(0, Math.round((now - then) / 1000));
    if (seconds < 60) {
        return "just now";
    }

    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
        return `${minutes} min ago`;
    }

    const hours = Math.round(minutes / 60);
    return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/**
 * A few words for a failed command, short enough for a key.
 * @param code The API's error code.
 * @returns The words.
 */
export function shortError(code: string | undefined): string {
    switch (code) {
        case "vehicle_unreachable":
            return "No answer";
        case "pin_required":
        case "invalid_pin":
            return "Check PIN";
        case "subscription_required":
            return "Subscribe";
        case "scope_missing":
            return "No control";
        case "reauth_required":
            return "Reconnect car";
        case "command_not_supported":
            return "Not supported";
        case "rate_limited":
            return "Too soon";
        case "close_sunroof_first":
            return "Close first";
        case "unauthenticated":
            return "Check token";
        default:
            return "Failed";
    }
}
