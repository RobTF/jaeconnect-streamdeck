import type { OpeningPosition } from "../api/types.ts";
import { type CarContext, climateLimits, currentPosition, distance, type Opening, positions, pressure, type SeatTarget, seatLevel, seatName } from "../car.ts";
import type { Connection } from "../hub.ts";
import { formatTemp } from "../keys/key-views.ts";
import type { PanelView } from "../render/panel-face.ts";

/**
 * What a panel shows while the plugin isn't connected to jaeconnect.
 * @param label The dial's name.
 * @param connection The connection.
 * @returns The view.
 */
export function offlinePanel(label: string, connection: Connection): PanelView {
    switch (connection) {
        case "signed-out":
            return { label, lines: [{ kind: "text", text: "Sign in", font: "name", tone: "amber" }, { kind: "text", text: "Add an access token in settings", font: "body" }] };
        case "connecting":
            return { label, lines: [{ kind: "text", text: "Connecting…", font: "name", tone: "grey" }] };
        default:
            return { label, lines: [{ kind: "text", text: "Offline", font: "name", tone: "red" }, { kind: "text", text: "See the settings page", font: "body" }] };
    }
}

/**
 * What a panel shows when its car isn't one the token can see, or can't do what the dial does.
 * @param label The dial's name.
 * @param text The reason.
 * @returns The view.
 */
export function notAvailablePanel(label: string, text: string): PanelView {
    return { label, lines: [{ kind: "text", text, font: "name", tone: "grey" }] };
}

/**
 * The Climate dial: the temperature it will start at (or the car's while running) and the run time.
 * @param ctx The car.
 * @returns The view.
 */
export function climatePanel(ctx: CarContext): PanelView {
    const climate = ctx.status?.climate;
    const on = climate?.on === true;
    const limits = climateLimits(ctx.vehicle);
    const target = ctx.climateTarget;
    const share = (target - limits.min_temp_c) / Math.max(1, limits.max_temp_c - limits.min_temp_c);
    const cabin = climate?.cabin_temp_c ?? null;
    const cabinShare = cabin === null ? undefined : (cabin - limits.min_temp_c) / Math.max(1, limits.max_temp_c - limits.min_temp_c);
    return {
        label: "Climate",
        tag: on ? { text: "ON", tone: "mint" } : { text: "OFF", tone: "grey" },
        lines: [
            { kind: "text", text: `${formatTemp(target)}C`, font: "big", tone: target >= 20 ? "heat" : "cool" },
            { kind: "text", text: `${cabin === null ? "Driver side" : `Cabin ${formatTemp(cabin)}`} · ${ctx.durationMinutes} min`, font: "body" },
            { kind: "bar", share, tone: target >= 20 ? "heat" : "cool", mark: cabinShare },
        ],
    };
}

/**
 * The Seats dial: the seat, heating or cooling, its level, and a level chosen but not sent yet.
 * @param ctx The car.
 * @param target The seat and mode shown.
 * @param pick The level chosen with the dial, when it differs from the car's.
 * @returns The view.
 */
export function seatsPanel(ctx: CarContext, target: SeatTarget, pick: number | undefined): PanelView {
    const level = seatLevel(ctx.status, target);
    const pending = pick !== undefined && pick !== level;
    const shown = pending ? pick : level;
    return {
        label: target.mode === "heat" ? "Seat heating" : "Seat cooling",
        tag: level > 0 ? { text: `L${level}`, tone: "mint" } : { text: "OFF", tone: "grey" },
        lines: [
            { kind: "text", text: seatName(target.seat), font: "name", tone: "white" },
            { kind: "pips", count: 3, filled: shown, tone: target.mode === "heat" ? "heat" : "cool", pending },
            { kind: "text", text: level > 0 ? `Level ${level} · ${ctx.durationMinutes} min` : "Turn to choose a level", font: "body" },
        ],
        banner: pending ? { text: shown === 0 ? "Press to turn off" : `Press to set level ${shown}`, tone: "amber" } : undefined,
    };
}

/**
 * A page of the Energy dial.
 */
export type EnergyPage = "battery" | "fuel" | "tyres" | "odometer";

/**
 * The pages the Energy dial offers: those the car reports.
 * @param ctx The car.
 * @returns The pages.
 */
export function energyPages(ctx: CarContext): EnergyPage[] {
    const status = ctx.status;
    const pages: EnergyPage[] = [];
    if (status?.battery_percent !== null && status?.battery_percent !== undefined) {
        pages.push("battery");
    }

    if (status?.fuel_percent !== null && status?.fuel_percent !== undefined) {
        pages.push("fuel");
    }

    if (status?.tyres) {
        pages.push("tyres");
    }

    pages.push("odometer");
    return pages;
}

/**
 * The Energy dial: battery, fuel, tyres or odometer.
 * @param ctx The car.
 * @param page The page.
 * @returns The view.
 */
export function energyPanel(ctx: CarContext, page: EnergyPage): PanelView {
    const s = ctx.status;
    switch (page) {
        case "battery": {
            const charging = s?.charging;
            const state = { unplugged: "UNPLUGGED", plugged_in: "PLUGGED IN", charging: "CHARGING", complete: "FULL" }[charging?.state ?? "unplugged"];
            const range = distance(s?.range_km ?? null, s?.range_miles ?? null, ctx.distance);
            const limit = charging?.target_percent;
            return {
                label: "Battery",
                tag: { text: state, tone: charging?.state === "charging" || charging?.state === "complete" ? "mint" : "grey" },
                lines: [
                    { kind: "text", text: `${s?.battery_percent ?? 0}%`, font: "big", tone: "white" },
                    { kind: "text", text: [range ? `${range} electric` : undefined, limit ? `limit ${limit}%` : undefined].filter(Boolean).join(" · "), font: "body" },
                    { kind: "bar", share: (s?.battery_percent ?? 0) / 100, tone: charging?.state === "charging" ? "mint" : "white", mark: limit ? limit / 100 : undefined },
                ],
            };
        }
        case "fuel": {
            const range = distance(s?.fuel_range_km ?? null, s?.fuel_range_miles ?? null, ctx.distance);
            return {
                label: "Fuel",
                lines: [
                    { kind: "text", text: `${s?.fuel_percent ?? 0}%`, font: "big", tone: "white" },
                    { kind: "text", text: range ? `${range} on fuel` : "Range not reported", font: "body" },
                    { kind: "bar", share: (s?.fuel_percent ?? 0) / 100, tone: (s?.fuel_percent ?? 0) < 15 ? "red" : "white" },
                ],
            };
        }
        case "tyres": {
            const t = s?.tyres;
            const warning = [t?.front_left, t?.front_right, t?.rear_left, t?.rear_right].some((x) => x?.pressure_warning || x?.temperature_warning);
            return {
                label: `Tyres · ${ctx.pressure === "kpa" ? "kPa" : ctx.pressure}`,
                tag: warning ? { text: "CHECK", tone: "red" } : { text: "OK", tone: "mint" },
                lines: [{
                    kind: "pairs",
                    pairs: [
                        ["FL", pressure(t?.front_left?.pressure_kpa, ctx.pressure)],
                        ["FR", pressure(t?.front_right?.pressure_kpa, ctx.pressure)],
                        ["RL", pressure(t?.rear_left?.pressure_kpa, ctx.pressure)],
                        ["RR", pressure(t?.rear_right?.pressure_kpa, ctx.pressure)],
                    ],
                }],
            };
        }
        default:
            return {
                label: "Odometer",
                lines: [
                    { kind: "text", text: distance(s?.odometer_km ?? null, s?.odometer_miles ?? null, ctx.distance) ?? "Not reported", font: "big", tone: "white" },
                    { kind: "text", text: ctx.vehicle.nickname, font: "body" },
                ],
            };
    }
}

/**
 * The Openings dial: windows or sunroof, where they are, and a position chosen but not sent yet.
 * @param ctx The car.
 * @param opening Windows or sunroof.
 * @param pick The position chosen with the dial, when it differs from the car's.
 * @returns The view.
 */
export function openingsPanel(ctx: CarContext, opening: Opening, pick: OpeningPosition | undefined): PanelView {
    const current = currentPosition(ctx.status, opening);
    const names: Record<OpeningPosition, string> = { closed: "Closed", vented: "Vent", open: "Open" };
    const pending = pick !== undefined && pick !== current;
    const verb = pick === "closed" ? "close" : pick === "vented" ? "vent" : "open";
    return {
        label: opening === "windows" ? "Windows" : "Sunroof",
        tag: current === undefined ? { text: "?", tone: "grey" } : current === "closed" ? { text: "SHUT", tone: "mint" } : { text: current === "vented" ? "VENT" : "OPEN", tone: "amber" },
        lines: [
            { kind: "text", text: current === undefined ? "Not reported" : `${opening === "windows" ? "Windows" : "Sunroof"} ${current === "vented" ? "vented" : current}`, font: "body" },
            { kind: "chips", items: positions(ctx.vehicle, opening).map((x) => names[x]), on: current ? names[current] : undefined, pick: pick ? names[pick] : undefined },
        ],
        banner: pending ? { text: `Press to ${verb}`, tone: "amber" } : undefined,
    };
}
