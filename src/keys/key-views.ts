import { ago, type CarContext, distance } from "../car.ts";
import { batteryIcon, icons } from "../render/icons.ts";
import type { KeyFace } from "../render/key-face.ts";
import type { Connection } from "../hub.ts";

/**
 * What a key shows while the plugin isn't connected to jaeconnect.
 * @param connection The connection.
 * @returns The face.
 */
export function offlineFace(connection: Connection): KeyFace {
    switch (connection) {
        case "signed-out":
            return { icon: icons.key, value: "Sign in", sub: "Add a token", tone: "amber" };
        case "connecting":
            return { icon: icons.car, value: "…", sub: "Connecting", tone: "grey" };
        default:
            return { icon: icons.car, value: "Offline", sub: "See settings", tone: "red" };
    }
}

/**
 * What a key shows when its car isn't one the token can see.
 * @returns The face.
 */
export function noCarFace(): KeyFace {
    return { icon: icons.car, value: "No car", sub: "Pick one", tone: "amber" };
}

/**
 * What a key shows when its car can't do what the key does.
 * @param name The key's name.
 * @param icon Its icon.
 * @returns The face.
 */
export function unsupportedFace(name: string, icon: string): KeyFace {
    return { icon, value: name, sub: "Not on this car", tone: "off" };
}

/**
 * The Lock key: locked or unlocked; a press locks, a hold unlocks.
 * @param ctx The car.
 * @returns The face.
 */
export function lockFace(ctx: CarContext): KeyFace {
    const locked = ctx.status?.locked;
    if (locked === null || locked === undefined) {
        return { icon: icons.lockClosed, value: "Lock", sub: "Not reported", tone: "grey" };
    }

    return locked
        ? { icon: icons.lockClosed, value: "Locked", sub: "Hold to unlock", tone: "mint" }
        : { icon: icons.lockOpen, value: "Unlocked", sub: "Press to lock", tone: "amber" };
}

/**
 * The Climate key: off with the temperature it would start at, or the car's set temperature while it runs. The
 * cabin temperature shows only for cars that report one.
 * @param ctx The car.
 * @returns The face.
 */
export function climateFace(ctx: CarContext): KeyFace {
    const climate = ctx.status?.climate;
    const cabin = climate?.cabin_temp_c ?? null;
    if (climate?.on) {
        const target = climate.target_temp_c ?? climate.requested_temp_c ?? ctx.climateTarget;
        return { icon: icons.fan, value: `${formatTemp(target)} on`, sub: cabin === null ? "Driver side" : `Cabin ${formatTemp(cabin)}`, tone: target >= 20 ? "heat" : "cool" };
    }

    if (cabin !== null) {
        return { icon: icons.thermometer, value: `Cabin ${formatTemp(cabin)}`, sub: "Climate off", tone: cabin < 8 ? "cool" : cabin > 28 ? "heat" : "white" };
    }

    return { icon: icons.fan, value: "Climate off", sub: `Starts at ${formatTemp(ctx.climateTarget)}`, tone: "grey" };
}

/**
 * The Charging key: battery percent, and the charger's power and time to full while charging.
 * @param ctx The car.
 * @returns The face.
 */
export function chargingFace(ctx: CarContext): KeyFace {
    const percent = ctx.status?.battery_percent;
    const charging = ctx.status?.charging;
    if (percent === null || percent === undefined) {
        return { icon: batteryIcon(0), value: "Battery", sub: "Not reported", tone: "grey" };
    }

    // Matches the Fuel key: a white icon and number, so neither reads as a status, and the website's green meter, lit
    // mint while charging.
    const live = charging?.state === "charging";
    const icon = batteryIcon(percent / 100, live);
    const face = { icon, value: `${percent}%`, tone: "white", meter: { share: percent / 100, tone: live ? "mint" : "electric" } } as const;
    switch (charging?.state) {
        case "charging": {
            const power = charging.power_kw === null ? "Charging" : `${charging.power_kw.toFixed(1)} kW`;
            const time = charging.minutes_to_full === null ? "" : ` · ${hoursMinutes(charging.minutes_to_full)}`;
            return { ...face, sub: `${power}${time}` };
        }
        case "complete":
            return { ...face, sub: "Full" };
        case "plugged_in":
            return { ...face, sub: "Plugged in" };
        default:
            return { ...face, sub: distance(ctx.status?.range_km ?? null, ctx.status?.range_miles ?? null, ctx.distance) ?? "Not plugged in" };
    }
}

/**
 * The Fuel key: fuel level and the range on it, in the website's fuel blue with its pump icon and a meter.
 * @param ctx The car.
 * @returns The face.
 */
export function fuelFace(ctx: CarContext): KeyFace {
    const percent = ctx.status?.fuel_percent;
    if (percent === null || percent === undefined) {
        return { icon: icons.fuel, value: "Fuel", sub: "Not reported", tone: "grey" };
    }

    const range = distance(ctx.status?.fuel_range_km ?? null, ctx.status?.fuel_range_miles ?? null, ctx.distance);
    // The pump fills its box more than the battery does, so it's drawn a touch smaller to look the same size.
    return { icon: icons.fuel, iconScale: 0.9, value: `${percent}%`, sub: range ?? "Fuel", tone: "white", meter: { share: percent / 100, tone: "fuel" } };
}

/**
 * The Boot key: a hold opens it, a press closes it.
 * @param ctx The car.
 * @returns The face.
 */
export function bootFace(ctx: CarContext): KeyFace {
    return ctx.status?.boot_open
        ? { icon: icons.bootOpen, value: "Boot open", sub: "Press to close", tone: "amber" }
        : { icon: icons.car, value: "Boot shut", sub: "Hold to open", tone: "white" };
}

/**
 * A demister key.
 * @param ctx The car.
 * @param window Which window.
 * @returns The face.
 */
export function demisterFace(ctx: CarContext, window: "front" | "rear"): KeyFace {
    const on = window === "front" ? ctx.status?.climate?.front_defrost_on : ctx.status?.climate?.rear_defrost_on;
    return {
        icon: window === "front" ? icons.windscreen : icons.rearWindow,
        value: window === "front" ? "Screen" : "Rear",
        sub: on ? "Demister on" : "Demister off",
        tone: on ? "heat" : "grey",
    };
}

/**
 * The heated steering wheel key.
 * @param ctx The car.
 * @returns The face.
 */
export function wheelFace(ctx: CarContext): KeyFace {
    const on = ctx.status?.climate?.steering_wheel_heat_on;
    return { icon: icons.wheel, value: "Wheel", sub: on ? "Heating" : "Off", tone: on ? "heat" : "grey" };
}

/**
 * The Signal key (lights, horn or both, depending on the car).
 * @returns The face.
 */
export function signalFace(): KeyFace {
    return { icon: icons.signal, value: "Signal", sub: "Lights and horn", tone: "amber" };
}

/**
 * The Car key: the car's name, whether it's awake, and when it last reported.
 * @param ctx The car.
 * @param now The time now, in milliseconds since the epoch.
 * @returns The face.
 */
export function carFace(ctx: CarContext, now: number): KeyFace {
    const online = ctx.status?.online;
    const state = online === true ? "Awake" : online === false ? "Asleep" : "";
    const when = ago(ctx.status?.reported_at, now);
    return {
        icon: icons.car,
        value: ctx.vehicle.nickname,
        sub: state ? `${state} · ${when}` : when,
        tone: "white",
        dot: online ? "mint" : "off",
    };
}

/**
 * A temperature for display.
 * @param celsius The temperature.
 * @returns The text, e.g. `21°`.
 */
export function formatTemp(celsius: number): string {
    return `${Number.isInteger(celsius) ? celsius : celsius.toFixed(1)}°`;
}

function hoursMinutes(minutes: number): string {
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes} min`;
}
