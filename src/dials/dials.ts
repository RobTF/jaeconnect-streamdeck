import { action } from "@elgato/streamdeck";

import type { OpeningPosition } from "../api/types.ts";
import { type CarContext, climateLimits, currentPosition, type Opening, openingCommand, openings, positions, runTimes, seatLevel, seatTargets, sunroofClosesFirst, supports } from "../car.ts";
import { hub, message } from "../hub.ts";
import type { PanelView } from "../render/panel-face.ts";
import { CarDial, type DialHandle, pickMs } from "./car-dial.ts";
import { climatePanel, energyPages, energyPanel, openingsPanel, seatsPanel } from "./panel-views.ts";

// While climate runs, a new temperature is sent this long after the dial stops turning.
const climateResendMs = 1_500;

/**
 * Remembers, per dial, a choice made by turning that waits for a press, and drops it after {@link pickMs}.
 */
class Picks<T> {
    readonly #values = new Map<string, T>();
    readonly #timers = new Map<string, NodeJS.Timeout>();

    /**
     * The choice waiting on a dial.
     * @param id The dial's id.
     * @returns The choice, or `undefined`.
     */
    get(id: string): T | undefined {
        return this.#values.get(id);
    }

    /**
     * Sets or clears a dial's choice, restarting its time-out.
     * @param id The dial's id.
     * @param value The choice, or `undefined` to clear it.
     * @param onDropped Called if the time-out drops it.
     */
    set(id: string, value: T | undefined, onDropped: () => void): void {
        clearTimeout(this.#timers.get(id));
        if (value === undefined) {
            this.clear(id);
            return;
        }

        this.#values.set(id, value);
        this.#timers.set(id, setTimeout(() => {
            this.#values.delete(id);
            this.#timers.delete(id);
            onDropped();
        }, pickMs));
    }

    /**
     * Clears a dial's choice.
     * @param id The dial's id.
     */
    clear(id: string): void {
        clearTimeout(this.#timers.get(id));
        this.#values.delete(id);
        this.#timers.delete(id);
    }
}

/**
 * The temperature climate starts at, shared with the Climate key. Turning sets it (sent straight away while climate
 * runs); a press starts or stops climate; a tap changes the run time.
 */
@action({ UUID: "com.jaeconnect.streamdeck.climate-dial" })
export class ClimateDial extends CarDial {
    readonly #runTimes = new Map<string, number>();
    readonly #resend = new Map<string, NodeJS.Timeout>();

    constructor() {
        super("Climate");
    }

    protected available(ctx: CarContext): boolean {
        return supports(ctx.vehicle, "start_climate");
    }

    protected panel(id: string, ctx: CarContext): PanelView {
        return climatePanel(this.#withRunTime(id, ctx));
    }

    protected turn(dial: DialHandle, ctx: CarContext, ticks: number): void {
        const step = climateLimits(ctx.vehicle).step_c || 1;
        hub.setClimateTarget(ctx.vehicle, ctx.climateTarget + ticks * step);
        if (ctx.status?.climate?.on) {
            clearTimeout(this.#resend.get(dial.id));
            this.#resend.set(dial.id, setTimeout(() => {
                const now = this.context(dial.id);
                if (now?.status?.climate?.on) {
                    void this.run(dial, now, "start_climate", { temperature_c: now.climateTarget, duration_minutes: this.#withRunTime(dial.id, now).durationMinutes });
                }
            }, climateResendMs));
        }
    }

    protected async press(dial: DialHandle, ctx: CarContext): Promise<void> {
        const run = this.#withRunTime(dial.id, ctx);
        await (ctx.status?.climate?.on
            ? this.run(dial, ctx, "stop_climate")
            : this.run(dial, ctx, "start_climate", { temperature_c: ctx.climateTarget, duration_minutes: run.durationMinutes }));
    }

    protected tap(dial: DialHandle, ctx: CarContext): void {
        const times = runTimes(ctx.vehicle);
        const current = this.#withRunTime(dial.id, ctx).durationMinutes;
        this.#runTimes.set(dial.id, times[(times.indexOf(current) + 1) % times.length] ?? current);
    }

    // The run time a tap chose, over the one in settings.
    #withRunTime(id: string, ctx: CarContext): CarContext {
        const chosen = this.#runTimes.get(id);
        return chosen === undefined ? ctx : { ...ctx, durationMinutes: chosen };
    }
}

/**
 * Seat heating and cooling. Turning chooses a level, which is sent only when the dial is pressed (and dropped after
 * ten seconds without a press); a tap moves to the next seat.
 */
@action({ UUID: "com.jaeconnect.streamdeck.seats-dial" })
export class SeatsDial extends CarDial {
    readonly #targets = new Map<string, number>();
    readonly #picks = new Picks<number>();

    constructor() {
        super("Seats");
    }

    protected available(ctx: CarContext): boolean {
        return seatTargets(ctx.vehicle).length > 0;
    }

    protected panel(id: string, ctx: CarContext): PanelView {
        return seatsPanel(ctx, this.#target(id, ctx), this.#picks.get(id));
    }

    protected turn(dial: DialHandle, ctx: CarContext, ticks: number): void {
        const level = seatLevel(ctx.status, this.#target(dial.id, ctx));
        const next = Math.min(3, Math.max(0, (this.#picks.get(dial.id) ?? level) + ticks));
        this.#picks.set(dial.id, next === level ? undefined : next, () => this.flash(dial.id, "Not sent", "amber"));
    }

    protected async press(dial: DialHandle, ctx: CarContext): Promise<void> {
        const level = this.#picks.get(dial.id);
        if (level === undefined) {
            this.flash(dial.id, "Turn to choose, then press", "amber");
            return;
        }

        this.#picks.clear(dial.id);
        const target = this.#target(dial.id, ctx);
        await this.run(dial, ctx, target.mode === "heat" ? "seat_heat" : "seat_vent", { seat: target.seat, level, duration_minutes: ctx.durationMinutes });
    }

    protected tap(dial: DialHandle, ctx: CarContext): void {
        this.#picks.clear(dial.id);
        this.#targets.set(dial.id, ((this.#targets.get(dial.id) ?? 0) + 1) % seatTargets(ctx.vehicle).length);
    }

    #target(id: string, ctx: CarContext) {
        const targets = seatTargets(ctx.vehicle);
        return targets[(this.#targets.get(id) ?? 0) % targets.length];
    }
}

/**
 * Battery, fuel, tyres and odometer. Turning or tapping moves between them; a press asks the car for a fresh status.
 */
@action({ UUID: "com.jaeconnect.streamdeck.energy-dial" })
export class EnergyDial extends CarDial {
    readonly #pages = new Map<string, number>();

    constructor() {
        super("Energy");
    }

    protected available(): boolean {
        return true;
    }

    protected panel(id: string, ctx: CarContext): PanelView {
        const pages = energyPages(ctx);
        return energyPanel(ctx, pages[(this.#pages.get(id) ?? 0) % pages.length]);
    }

    protected turn(dial: DialHandle, ctx: CarContext, ticks: number): void {
        const count = energyPages(ctx).length;
        this.#pages.set(dial.id, ((((this.#pages.get(dial.id) ?? 0) + ticks) % count) + count) % count);
    }

    protected async press(dial: DialHandle, ctx: CarContext): Promise<void> {
        this.flash(dial.id, "Asking the car", "mint", 60_000);
        try {
            await hub.refresh(ctx.vehicle.id, true);
            this.flash(dial.id, "Updated", "mint");
        } catch (error) {
            await dial.showAlert();
            this.flash(dial.id, message(error).slice(0, 32), "red", 4_000);
        }
    }

    protected tap(dial: DialHandle, ctx: CarContext): void {
        this.turn(dial, ctx, 1);
    }
}

/**
 * Windows and sunroof. Turning chooses closed, vented or open, which is sent only when the dial is pressed (and
 * dropped after ten seconds without a press); a tap switches between windows and sunroof.
 */
@action({ UUID: "com.jaeconnect.streamdeck.openings-dial" })
export class OpeningsDial extends CarDial {
    readonly #openings = new Map<string, number>();
    readonly #picks = new Picks<OpeningPosition>();

    constructor() {
        super("Openings");
    }

    protected available(ctx: CarContext): boolean {
        return openings(ctx.vehicle).length > 0;
    }

    protected panel(id: string, ctx: CarContext): PanelView {
        return openingsPanel(ctx, this.#opening(id, ctx), this.#picks.get(id));
    }

    protected turn(dial: DialHandle, ctx: CarContext, ticks: number): void {
        const opening = this.#opening(dial.id, ctx);
        const offered = positions(ctx.vehicle, opening);
        const current = currentPosition(ctx.status, opening);
        const from = offered.indexOf(this.#picks.get(dial.id) ?? current ?? "closed");
        const next = offered[Math.min(offered.length - 1, Math.max(0, from + ticks))];
        this.#picks.set(dial.id, next === current ? undefined : next, () => this.flash(dial.id, "Not sent", "amber"));
    }

    protected async press(dial: DialHandle, ctx: CarContext): Promise<void> {
        const pick = this.#picks.get(dial.id);
        if (pick === undefined) {
            this.flash(dial.id, "Turn to choose, then press", "amber");
            return;
        }

        this.#picks.clear(dial.id);
        const opening = this.#opening(dial.id, ctx);
        if (opening === "sunroof" && sunroofClosesFirst(ctx.vehicle, currentPosition(ctx.status, "sunroof"), pick)) {
            if (!(await this.run(dial, ctx, "close_sunroof"))) {
                return;
            }
        }

        await this.run(dial, ctx, openingCommand(opening, pick));
    }

    protected tap(dial: DialHandle, ctx: CarContext): void {
        this.#picks.clear(dial.id);
        this.#openings.set(dial.id, ((this.#openings.get(dial.id) ?? 0) + 1) % openings(ctx.vehicle).length);
    }

    #opening(id: string, ctx: CarContext): Opening {
        const offered = openings(ctx.vehicle);
        return offered[(this.#openings.get(id) ?? 0) % offered.length];
    }
}
