import type { Command, CommandBody, CommandName, Vehicle, VehicleStatus } from "./types.ts";

/**
 * The plugin's version, sent in the User-Agent so jaeconnect can tell it apart in its logs. Keep it in step with the
 * manifest.
 */
export const pluginVersion = "0.1.0";

/**
 * The jaeconnect service, used when the settings don't name another.
 */
export const defaultBaseUrl = "https://jaeconnect.com";

/**
 * Sent with every request.
 */
export const userAgent = `jaeconnect-streamdeck/${pluginVersion}`;

/**
 * A failed call to the jaeconnect API, carrying its problem details.
 */
export class JaeConnectError extends Error {
    /**
     * The HTTP status, when there was a response.
     */
    readonly status: number | undefined;

    /**
     * The stable error code, e.g. `vehicle_unreachable`.
     */
    readonly code: string | undefined;

    /**
     * Initializes a new instance of the {@link JaeConnectError} class.
     * @param message What went wrong, for people.
     * @param status The HTTP status.
     * @param code The stable error code.
     */
    constructor(message: string, status?: number, code?: string) {
        super(message);
        this.name = "JaeConnectError";
        this.status = status;
        this.code = code;
    }
}

/**
 * Tidies an API address: blank becomes the jaeconnect service, and a trailing slash is dropped.
 * @param url The address as typed.
 * @returns The address to call.
 */
export function normaliseBaseUrl(url: string | undefined): string {
    const trimmed = (url ?? "").trim().replace(/\/+$/, "");
    return trimmed === "" ? defaultBaseUrl : trimmed;
}

/**
 * Builds the error for a response that wasn't a success, from its problem details (RFC 7807) when it has them.
 * @param status The HTTP status.
 * @param text The response body.
 * @returns The error.
 */
export function errorFromResponse(status: number, text: string): JaeConnectError {
    let problem: unknown;
    try {
        problem = text ? JSON.parse(text) : undefined;
    } catch {
        problem = undefined;
    }

    if (problem !== null && typeof problem === "object") {
        const p = problem as { detail?: string; title?: string; code?: string };
        return new JaeConnectError(p.detail || p.title || `jaeconnect answered ${status}`, status, p.code);
    }

    return new JaeConnectError(`jaeconnect answered ${status}${text ? `: ${text.slice(0, 200)}` : ""}`, status);
}

/**
 * The jaeconnect API, called with a personal access token (`jc_pat_…`) or an OAuth access token.
 */
export class JaeConnectClient {
    readonly #baseUrl: string;
    readonly #token: string;
    readonly #fetch: typeof fetch;

    /**
     * Initializes a new instance of the {@link JaeConnectClient} class.
     * @param baseUrl The API address, without a trailing slash.
     * @param token The token.
     * @param fetchImpl The fetch to use (tests).
     */
    constructor(baseUrl: string, token: string, fetchImpl: typeof fetch = fetch) {
        this.#baseUrl = baseUrl;
        this.#token = token;
        this.#fetch = fetchImpl;
    }

    /**
     * The cars the token can read.
     * @returns The cars.
     */
    listVehicles(): Promise<Vehicle[]> {
        return this.#request<Vehicle[]>("GET", "/v1/vehicles");
    }

    /**
     * A car's status, cached by jaeconnect for up to a minute unless `fresh` asks the car.
     * @param vehicleId The car.
     * @param fresh Whether to ask the car itself.
     * @returns The status.
     */
    getStatus(vehicleId: string, fresh = false): Promise<VehicleStatus> {
        return this.#request<VehicleStatus>("GET", `/v1/vehicles/${encodeURIComponent(vehicleId)}/status${fresh ? "?refresh=true" : ""}`);
    }

    /**
     * Sends a command and waits for the car (up to about a minute, longer when it has to wake first).
     * @param vehicleId The car.
     * @param command The command.
     * @param body Its parameters.
     * @returns The command, `succeeded` or `failed`.
     */
    sendCommand(vehicleId: string, command: CommandName, body?: CommandBody): Promise<Command> {
        return this.#request<Command>("POST", `/v1/vehicles/${encodeURIComponent(vehicleId)}/commands/${command}`, body, 120_000);
    }

    async #request<T>(method: string, path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
        const headers: Record<string, string> = {
            Accept: "application/json",
            Authorization: `Bearer ${this.#token}`,
            "User-Agent": userAgent,
        };
        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        let response: Response;
        try {
            response = await this.#fetch(`${this.#baseUrl}${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error) {
            const reason = error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : String(error);
            throw new JaeConnectError(`Couldn't reach jaeconnect: ${reason}`);
        }

        const text = await response.text();
        if (!response.ok) {
            throw errorFromResponse(response.status, text);
        }

        return (text ? JSON.parse(text) : undefined) as T;
    }
}
