import { type DidReceiveSettingsEvent, type KeyDownEvent, type KeyUpEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import { JaeConnectError } from "../api/client.ts";
import type { CommandBody, CommandName, Vehicle } from "../api/types.ts";
import { type CarContext, progressText, shortError, supports } from "../car.ts";
import { carContext } from "../context.ts";
import { hub } from "../hub.ts";
import { drawKey, type KeyFace } from "../render/key-face.ts";
import { type ActionSettings, actionSettings, type StoredSettings } from "../settings.ts";
import { noCarFace, offlineFace, unsupportedFace } from "./key-views.ts";

/**
 * The key an action's handlers act on.
 */
export type KeyHandle = KeyUpEvent["action"];

// A press held this long is a hold: long enough that a knock on the desk doesn't open the car.
const holdMs = 1_000;

// How long a failed command's reason stays on the key.
const errorMs = 4_000;

type Busy = { progress: keyof typeof progressText } | { error: string };

/**
 * The shape every jaeconnect key shares: it redraws whenever its car changes, keeps each key's settings, tells a
 * press from a hold (filling the ring while held), and shows a command's progress, then a tick or the reason it
 * failed.
 */
export abstract class CarKey extends SingletonAction {
    readonly #settings = new Map<string, ActionSettings>();
    readonly #drawn = new Map<string, string>();
    readonly #busy = new Map<string, Busy>();
    readonly #holds = new Map<string, { started: number; fired: boolean; timer: NodeJS.Timeout; ticker: NodeJS.Timeout }>();
    #clock: NodeJS.Timeout | undefined;

    /**
     * Initializes a new instance of the {@link CarKey} class, redrawing whenever a car changes.
     */
    protected constructor() {
        super();
        hub.onChange(() => this.render());
    }

    /**
     * Draws the key as it appears, and keeps "2 min ago" and the like current.
     * @param ev The event.
     */
    override onWillAppear(ev: WillAppearEvent): void {
        this.#settings.set(ev.action.id, actionSettings(ev.payload.settings as StoredSettings));
        this.#drawn.delete(ev.action.id);
        this.#clock ??= setInterval(() => this.render(), 15_000);
        this.render();
    }

    /**
     * Forgets the key once it's gone.
     * @param ev The event.
     */
    override onWillDisappear(ev: WillDisappearEvent): void {
        this.#settings.delete(ev.action.id);
        this.#drawn.delete(ev.action.id);
    }

    /**
     * Redraws the key with its new settings.
     * @param ev The event.
     */
    override onDidReceiveSettings(ev: DidReceiveSettingsEvent): void {
        this.#settings.set(ev.action.id, actionSettings(ev.payload.settings as StoredSettings));
        this.render();
    }

    /**
     * Starts a hold, when the key has one right now.
     * @param ev The event.
     */
    override onKeyDown(ev: KeyDownEvent): void {
        const key = ev.action as KeyHandle;
        this.#endHold(key.id);
        const ctx = this.#context(key.id);
        if (!ctx || this.#busy.has(key.id) || !this.canHold(ctx)) {
            return;
        }

        const hold = {
            started: Date.now(),
            fired: false,
            timer: setTimeout(() => {
                hold.fired = true;
                clearInterval(hold.ticker);
                this.render();
                void this.hold(key, ctx);
            }, holdMs),
            ticker: setInterval(() => this.render(), 80),
        };
        this.#holds.set(key.id, hold);
    }

    /**
     * Runs the press, unless the key was held.
     * @param ev The event.
     */
    override async onKeyUp(ev: KeyUpEvent): Promise<void> {
        const fired = this.#endHold(ev.action.id);
        this.render();
        const busy = this.#busy.get(ev.action.id);
        if (fired || (busy && "progress" in busy)) {
            return;
        }

        const ctx = this.#context(ev.action.id);
        if (!ctx || !this.supported(ctx.vehicle)) {
            return;
        }

        await this.press(ev.action, ctx);
    }

    /**
     * The key's name, for when its car can't do what it does.
     */
    protected abstract readonly name: string;

    /**
     * The key's icon, for when its car can't do what it does.
     */
    protected abstract readonly icon: string;

    /**
     * Works out what the key shows.
     * @param ctx The car.
     * @param settings The key's settings.
     * @param now The time now, in milliseconds since the epoch.
     * @returns The face.
     */
    protected abstract face(ctx: CarContext, settings: ActionSettings, now: number): KeyFace;

    /**
     * Runs a press.
     * @param key The key.
     * @param ctx The car.
     */
    protected abstract press(key: KeyHandle, ctx: CarContext): Promise<void> | void;

    /**
     * The commands the key needs; a car that takes none of them shows "Not on this car".
     */
    protected abstract readonly commands: CommandName[];

    /**
     * Whether a hold does something right now; by default, never.
     * @param ctx The car.
     * @returns Whether it does.
     */
    protected canHold(ctx: CarContext): boolean {
        void ctx;
        return false;
    }

    /**
     * Runs a hold; by default, nothing.
     * @param key The key.
     * @param ctx The car.
     */
    protected hold(key: KeyHandle, ctx: CarContext): Promise<void> | void {
        void key;
        void ctx;
    }

    /**
     * Whether the car can do what the key does.
     * @param vehicle The car.
     * @returns Whether it can.
     */
    protected supported(vehicle: Vehicle): boolean {
        return this.commands.length === 0 || this.commands.some((x) => supports(vehicle, x));
    }

    /**
     * The key's settings.
     * @param id The key's id.
     * @returns The settings.
     */
    protected settingsOf(id: string): ActionSettings {
        return this.#settings.get(id) ?? actionSettings({});
    }

    /**
     * Sends a command from a key, showing its progress, then a tick, or an alert and the reason it failed.
     * @param key The key.
     * @param ctx The car.
     * @param command The command.
     * @param body Its parameters.
     * @returns Whether it worked.
     */
    protected async run(key: KeyHandle, ctx: CarContext, command: CommandName, body?: CommandBody): Promise<boolean> {
        try {
            await hub.command(ctx.vehicle.id, command, body, (progress) => {
                this.#busy.set(key.id, { progress });
                this.render();
            });
            this.#busy.delete(key.id);
            this.render();
            await key.showOk();
            return true;
        } catch (error) {
            const code = error instanceof JaeConnectError ? error.code : undefined;
            this.#busy.set(key.id, { error: shortError(code) });
            this.render();
            await key.showAlert();
            setTimeout(() => {
                const busy = this.#busy.get(key.id);
                if (busy && "error" in busy) {
                    this.#busy.delete(key.id);
                    this.render();
                }
            }, errorMs);
            return false;
        }
    }

    /**
     * Shows a hint on the key for a moment, e.g. "Hold to unlock" after a press.
     * @param key The key.
     * @param text The hint.
     */
    protected hint(key: KeyHandle, text: string): void {
        this.#busy.set(key.id, { error: text });
        this.render();
        setTimeout(() => {
            this.#busy.delete(key.id);
            this.render();
        }, 1_500);
    }

    /**
     * Draws every key of this action that is showing.
     */
    protected render(): void {
        const now = Date.now();
        for (const key of this.actions) {
            if (!key.isKey()) {
                continue;
            }

            const image = drawKey(this.#faceOf(key.id, now));
            if (this.#drawn.get(key.id) !== image) {
                this.#drawn.set(key.id, image);
                void key.setImage(image);
            }
        }
    }

    #faceOf(id: string, now: number): KeyFace {
        if (hub.connection !== "connected") {
            return offlineFace(hub.connection);
        }

        const ctx = this.#context(id);
        if (!ctx) {
            return noCarFace();
        }

        if (!this.supported(ctx.vehicle)) {
            return unsupportedFace(this.name, this.icon);
        }

        const face = this.face(ctx, this.settingsOf(id), now);
        const busy = this.#busy.get(id);
        const hold = this.#holds.get(id);
        if (busy && "progress" in busy) {
            face.banner = { text: progressText[busy.progress], tone: "cool" };
        } else if (busy) {
            face.banner = { text: busy.error, tone: busy.error.startsWith("Hold") ? "amber" : "red" };
        }

        if (hold && !hold.fired) {
            face.progress = (now - hold.started) / holdMs;
        }

        return face;
    }

    #context(id: string): CarContext | undefined {
        return hub.connection === "connected" ? carContext(this.settingsOf(id)) : undefined;
    }

    // Stops timing a hold; returns whether it had already fired.
    #endHold(id: string): boolean {
        const hold = this.#holds.get(id);
        if (!hold) {
            return false;
        }

        clearTimeout(hold.timer);
        clearInterval(hold.ticker);
        this.#holds.delete(id);
        return hold.fired;
    }
}
