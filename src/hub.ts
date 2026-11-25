import streamDeck from "@elgato/streamdeck";

import { JaeConnectClient, JaeConnectError } from "./api/client.ts";
import { EventStream, type StreamState } from "./api/event-stream.ts";
import type { AppEvent, Command, CommandBody, CommandName, Vehicle, VehicleStatus } from "./api/types.ts";
import { clampTemperature, type Progress } from "./car.ts";
import type { GlobalSettings } from "./settings.ts";

/**
 * Whether the plugin can talk to jaeconnect.
 */
export type Connection = "signed-out" | "connecting" | "connected" | "error";

// Status drifts (range, tyre pressures, cabin temperature on cars that have it) without an event, so read it this
// often. jaeconnect caches it for up to a minute, so this costs the car nothing.
const pollMs = 60_000;

// After a failure that may pass (jaeconnect unreachable), try signing in again this often.
const retryMs = 30_000;

type Waiting = { vehicleId: string; command: CommandName; onProgress: (progress: Progress) => void };

/**
 * The one connection to jaeconnect that every key and dial shares: the cars the token can read, their latest status,
 * the live event stream, and the commands in flight.
 */
class CarHub {
    /**
     * Whether the plugin can talk to jaeconnect.
     */
    connection: Connection = "signed-out";

    /**
     * Why it can't, when it can't.
     */
    problem: string | undefined;

    /**
     * The cars the token can read, in the order jaeconnect lists them.
     */
    readonly vehicles = new Map<string, Vehicle>();

    readonly #statuses = new Map<string, VehicleStatus>();
    readonly #climateTargets = new Map<string, number>();
    readonly #listeners = new Set<() => void>();
    readonly #waiting: Waiting[] = [];
    #client: JaeConnectClient | undefined;
    #stream: EventStream | undefined;
    #poll: NodeJS.Timeout | undefined;
    #retry: NodeJS.Timeout | undefined;
    #configured = "";

    /**
     * Calls a function whenever anything an action shows may have changed.
     * @param listener The function.
     */
    onChange(listener: () => void): void {
        this.#listeners.add(listener);
    }

    /**
     * Signs in with the plugin-wide settings, or signs out when there's no token. Does nothing when the token and
     * address haven't changed.
     * @param settings The settings.
     */
    async configure(settings: GlobalSettings): Promise<void> {
        const key = `${settings.baseUrl}\n${settings.token ?? ""}`;
        if (key === this.#configured) {
            return;
        }

        this.#configured = key;
        this.#stop();
        if (!settings.token) {
            this.#set("signed-out");
            return;
        }

        const client = new JaeConnectClient(settings.baseUrl, settings.token);
        this.#client = client;
        this.#set("connecting");

        let vehicles: Vehicle[];
        try {
            vehicles = await client.listVehicles();
        } catch (error) {
            if (this.#client !== client) {
                return;
            }

            const refused = error instanceof JaeConnectError && (error.status === 401 || error.status === 403);
            this.#set("error", refused ? `jaeconnect refused the token (${error.status}: ${error.message}). Check it on the settings page.` : message(error));
            if (!refused) {
                this.#retry = setTimeout(() => {
                    this.#configured = "";
                    void this.configure(settings);
                }, retryMs);
            }

            return;
        }

        if (this.#client !== client) {
            return;
        }

        for (const vehicle of vehicles) {
            this.vehicles.set(vehicle.id, vehicle);
        }

        if (vehicles.length === 0) {
            this.#set("error", "The token can't see any cars. Give it access to a car on the jaeconnect website.");
            return;
        }

        streamDeck.logger.info(`Connected to ${settings.baseUrl}: ${vehicles.length} car${vehicles.length === 1 ? "" : "s"} (${vehicles.map((x) => `${x.nickname}, ${x.supported_commands.length} commands`).join("; ")}).`);
        this.#set("connected");
        await Promise.all(vehicles.map((x) => this.refresh(x.id)));

        this.#stream = new EventStream(settings.baseUrl, settings.token, (ev) => this.#onEvent(ev), (state) => this.#onStream(state));
        this.#stream.start();
        this.#poll = setInterval(() => {
            for (const id of this.vehicles.keys()) {
                void this.refresh(id);
            }
        }, pollMs);
    }

    /**
     * A car: the one asked for, or the first car when none is chosen.
     * @param id The car's id, if the action has one.
     * @returns The car, or `undefined` when the token can't see it.
     */
    vehicle(id: string | undefined): Vehicle | undefined {
        return id ? this.vehicles.get(id) : this.vehicles.values().next().value;
    }

    /**
     * A car's last status.
     * @param id The car's id.
     * @returns The status, or `undefined` until the first read.
     */
    status(id: string): VehicleStatus | undefined {
        return this.#statuses.get(id);
    }

    /**
     * The temperature climate starts at on a car: the Climate dial's, or 21 °C to begin with.
     * @param vehicle The car.
     * @returns The temperature.
     */
    climateTarget(vehicle: Vehicle): number {
        return this.#climateTargets.get(vehicle.id) ?? clampTemperature(vehicle, 21);
    }

    /**
     * Sets the temperature climate starts at on a car.
     * @param vehicle The car.
     * @param temperature The temperature, clamped to the car's range.
     */
    setClimateTarget(vehicle: Vehicle, temperature: number): void {
        this.#climateTargets.set(vehicle.id, clampTemperature(vehicle, temperature));
        this.#changed();
    }

    /**
     * Reads a car's status.
     * @param id The car's id.
     * @param fresh Whether to ask the car itself rather than take jaeconnect's last reading.
     */
    async refresh(id: string, fresh = false): Promise<void> {
        const client = this.#client;
        if (!client) {
            return;
        }

        try {
            const status = await client.getStatus(id, fresh);
            if (this.#client === client) {
                this.#statuses.set(id, status);
                this.#changed();
            }
        } catch (error) {
            streamDeck.logger.warn(`Couldn't read the status of ${id}: ${message(error)}`);
            if (fresh) {
                throw error;
            }
        }
    }

    /**
     * Sends a command and waits for the car.
     * @param vehicleId The car.
     * @param command The command.
     * @param body Its parameters.
     * @param onProgress Told where the command is while the car works on it.
     * @returns The command, once it succeeded.
     * @throws {JaeConnectError} When it failed, with the API's code.
     */
    async command(vehicleId: string, command: CommandName, body: CommandBody | undefined, onProgress: (progress: Progress) => void): Promise<Command> {
        const client = this.#client;
        if (!client || this.connection !== "connected") {
            throw new JaeConnectError("Not connected to jaeconnect.");
        }

        onProgress(this.#statuses.get(vehicleId)?.online === false ? "waking" : "sending");
        const waiting: Waiting = { vehicleId, command, onProgress };
        this.#waiting.push(waiting);
        try {
            streamDeck.logger.info(`Sending ${command} to ${vehicleId}${body ? ` ${JSON.stringify(body)}` : ""}`);
            const result = await client.sendCommand(vehicleId, command, body);
            if (result.status === "failed") {
                throw new JaeConnectError(result.error?.message ?? "The car didn't do it.", undefined, result.error?.code);
            }

            // The status event usually arrives first; this catches cars whose change doesn't raise one.
            setTimeout(() => void this.refresh(vehicleId), 2_000);
            return result;
        } finally {
            this.#waiting.splice(this.#waiting.indexOf(waiting), 1);
        }
    }

    #onEvent(event: AppEvent): void {
        if (event.type.startsWith("vehicle.") && isStatus(event.data)) {
            this.#statuses.set(event.data.vehicle_id, event.data);
            this.#changed();
        } else if (event.type === "command.updated") {
            const command = event.data as Command;
            const progress = command.status === "accepted" ? "accepted" : command.status === "sent" ? "sent" : undefined;
            const waiting = this.#waiting.find((x) => x.vehicleId === command.vehicle_id && x.command === command.command);
            if (progress && waiting) {
                waiting.onProgress(progress);
            }
        } else if (event.type === "billing.access_ended" || event.type === "billing.subscription_paused") {
            this.#set("error", "jaeconnect access has ended. Check billing on the jaeconnect website.");
        } else if (event.type === "billing.access_restored" && this.connection === "error") {
            this.#set("connected");
            for (const id of this.vehicles.keys()) {
                void this.refresh(id);
            }
        }
    }

    #onStream(state: StreamState): void {
        if (state.state === "error") {
            this.#set("error", state.message);
        } else if (state.state === "reconnecting") {
            streamDeck.logger.info(`Event stream dropped (${state.message}); reconnecting in ${state.retryMs} ms.`);
        }
    }

    #set(connection: Connection, problem?: string): void {
        this.connection = connection;
        this.problem = problem;
        if (problem) {
            streamDeck.logger.warn(problem);
        }

        this.#changed();
    }

    #stop(): void {
        this.#stream?.stop();
        this.#stream = undefined;
        this.#client = undefined;
        clearInterval(this.#poll);
        clearTimeout(this.#retry);
        this.vehicles.clear();
        this.#statuses.clear();
    }

    #changed(): void {
        for (const listener of this.#listeners) {
            try {
                listener();
            } catch (error) {
                streamDeck.logger.error(`A redraw failed: ${message(error)}`);
            }
        }
    }
}

function isStatus(data: unknown): data is VehicleStatus {
    return data !== null && typeof data === "object" && "vehicle_id" in data && "reported_at" in data;
}

/**
 * An error's message.
 * @param error The error.
 * @returns The message.
 */
export function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * The plugin's one connection to jaeconnect.
 */
export const hub = new CarHub();
