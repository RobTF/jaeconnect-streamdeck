import { type DialRotateEvent, type DialUpEvent, type DidReceiveSettingsEvent, SingletonAction, type TouchTapEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import { JaeConnectError } from "../api/client.ts";
import type { CommandBody, CommandName } from "../api/types.ts";
import { type CarContext, progressText, shortError } from "../car.ts";
import { carContext } from "../context.ts";
import { hub } from "../hub.ts";
import { drawPanel, type PanelView } from "../render/panel-face.ts";
import { type ActionSettings, actionSettings, type StoredSettings } from "../settings.ts";
import { notAvailablePanel, offlinePanel } from "./panel-views.ts";

/**
 * The dial an action's handlers act on.
 */
export type DialHandle = DialUpEvent["action"];

// How long a failed command's reason stays on the panel.
const errorMs = 4_000;

/**
 * How long a choice made by turning (a seat level, a window position) waits for a press before it's dropped, so the
 * panel doesn't keep showing a change that never happened.
 */
export const pickMs = 10_000;

type Busy = { progress: keyof typeof progressText } | { error: string; tone: FlashTone };

/**
 * The colours a message along the bottom of a panel comes in.
 */
export type FlashTone = "red" | "amber" | "mint";

/**
 * The shape every jaeconnect dial shares: it redraws its touch-strip panel whenever its car changes, keeps each
 * dial's settings, and shows a command's progress on the panel, then the reason when it failed.
 */
export abstract class CarDial extends SingletonAction {
    readonly #settings = new Map<string, ActionSettings>();
    readonly #drawn = new Map<string, string>();
    readonly #busy = new Map<string, Busy>();
    readonly #label: string;

    /**
     * Initializes a new instance of the {@link CarDial} class, redrawing whenever a car changes.
     * @param label The dial's name, for the panel while there's no car to show.
     */
    protected constructor(label: string) {
        super();
        this.#label = label;
        hub.onChange(() => this.render());
    }

    /**
     * Draws the panel as it appears.
     * @param ev The event.
     */
    override onWillAppear(ev: WillAppearEvent): void {
        this.#settings.set(ev.action.id, actionSettings(ev.payload.settings as StoredSettings));
        this.#drawn.delete(ev.action.id);
        this.render();
    }

    /**
     * Forgets the panel once it's gone.
     * @param ev The event.
     */
    override onWillDisappear(ev: WillDisappearEvent): void {
        this.#drawn.delete(ev.action.id);
    }

    /**
     * Redraws the panel with the dial's new settings.
     * @param ev The event.
     */
    override onDidReceiveSettings(ev: DidReceiveSettingsEvent): void {
        this.#settings.set(ev.action.id, actionSettings(ev.payload.settings as StoredSettings));
        this.render();
    }

    /**
     * Turns the dial.
     * @param ev The event.
     */
    override onDialRotate(ev: DialRotateEvent): void {
        const ctx = this.context(ev.action.id);
        if (ctx && this.available(ctx)) {
            this.turn(ev.action, ctx, ev.payload.ticks);
            this.render();
        }
    }

    /**
     * Presses the dial.
     * @param ev The event.
     */
    override async onDialUp(ev: DialUpEvent): Promise<void> {
        const busy = this.#busy.get(ev.action.id);
        const ctx = this.context(ev.action.id);
        if (ctx && this.available(ctx) && !(busy && "progress" in busy)) {
            await this.press(ev.action, ctx);
            this.render();
        }
    }

    /**
     * Taps the panel.
     * @param ev The event.
     */
    override async onTouchTap(ev: TouchTapEvent): Promise<void> {
        const ctx = this.context(ev.action.id);
        if (ctx && this.available(ctx)) {
            await this.tap(ev.action, ctx);
            this.render();
        }
    }

    /**
     * Works out what the panel shows.
     * @param id The dial's id.
     * @param ctx The car.
     * @returns The view.
     */
    protected abstract panel(id: string, ctx: CarContext): PanelView;

    /**
     * Whether the car can do what the dial does; when it can't, the panel says "Not on this car".
     * @param ctx The car.
     * @returns Whether it can.
     */
    protected abstract available(ctx: CarContext): boolean;

    /**
     * Turns the dial.
     * @param dial The dial.
     * @param ctx The car.
     * @param ticks How far: positive clockwise.
     */
    protected abstract turn(dial: DialHandle, ctx: CarContext, ticks: number): void;

    /**
     * Presses the dial.
     * @param dial The dial.
     * @param ctx The car.
     */
    protected abstract press(dial: DialHandle, ctx: CarContext): Promise<void> | void;

    /**
     * Taps the panel.
     * @param dial The dial.
     * @param ctx The car.
     */
    protected abstract tap(dial: DialHandle, ctx: CarContext): Promise<void> | void;

    /**
     * The car for a dial, when connected.
     * @param id The dial's id.
     * @returns The car.
     */
    protected context(id: string): CarContext | undefined {
        return hub.connection === "connected" ? carContext(this.#settings.get(id) ?? actionSettings({})) : undefined;
    }

    /**
     * Sends a command from a dial, showing its progress on the panel, then the reason when it failed.
     * @param dial The dial.
     * @param ctx The car.
     * @param command The command.
     * @param body Its parameters.
     * @returns Whether it worked.
     */
    protected async run(dial: DialHandle, ctx: CarContext, command: CommandName, body?: CommandBody): Promise<boolean> {
        try {
            await hub.command(ctx.vehicle.id, command, body, (progress) => {
                this.#busy.set(dial.id, { progress });
                this.render();
            });
            this.#busy.delete(dial.id);
            this.render();
            return true;
        } catch (error) {
            const code = error instanceof JaeConnectError ? error.code : undefined;
            await dial.showAlert();
            this.flash(dial.id, shortError(code), "red", errorMs);
            return false;
        }
    }

    /**
     * Shows a message along the bottom of the panel for a moment.
     * @param id The dial's id.
     * @param text The message.
     * @param tone Its colour.
     * @param ms How long.
     */
    protected flash(id: string, text: string, tone: FlashTone, ms = 1_500): void {
        const busy = { error: text, tone };
        this.#busy.set(id, busy);
        this.render();
        setTimeout(() => {
            if (this.#busy.get(id) === busy) {
                this.#busy.delete(id);
                this.render();
            }
        }, ms);
    }

    /**
     * Draws every panel of this action that is showing.
     */
    protected render(): void {
        for (const dial of this.actions) {
            if (!dial.isDial()) {
                continue;
            }

            const image = drawPanel(this.#viewOf(dial.id));
            if (this.#drawn.get(dial.id) !== image) {
                this.#drawn.set(dial.id, image);
                void dial.setFeedback({ canvas: image });
            }
        }
    }

    #viewOf(id: string): PanelView {
        if (hub.connection !== "connected") {
            return offlinePanel(this.#label, hub.connection);
        }

        const ctx = this.context(id);
        if (!ctx) {
            return notAvailablePanel(this.#label, "Pick a car in settings");
        }

        if (!this.available(ctx)) {
            return notAvailablePanel(this.#label, "Not on this car");
        }

        const view = this.panel(id, ctx);
        const busy = this.#busy.get(id);
        if (busy && "progress" in busy) {
            view.banner = { text: progressText[busy.progress], tone: "cool" };
        } else if (busy) {
            view.banner = { text: busy.error, tone: busy.tone };
        }

        return view;
    }
}
