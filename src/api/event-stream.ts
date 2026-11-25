import { errorFromResponse, userAgent } from "./client.ts";
import { SseParser, type SseEvent } from "./sse.ts";
import type { AppEvent } from "./types.ts";

/**
 * jaeconnect sends a `: ping` every 25 s, so this long without a byte means the connection has quietly died.
 */
const idleMs = 70_000;

/**
 * The first wait before reconnecting, doubled after each failure up to {@link maxBackoffMs}.
 */
const baseBackoffMs = 2_000;
const maxBackoffMs = 60_000;

/**
 * How long to wait while the account has no active subscription (402): it won't change quickly.
 */
const subscriptionRetryMs = 5 * 60_000;

/**
 * The stream's state, as {@link EventStream} reports it.
 */
export type StreamState =
    | { state: "connecting" }
    | { state: "connected" }
    | { state: "reconnecting"; message: string; retryMs: number }
    | { state: "stopped" }
    | { state: "error"; message: string };

type Outcome = { fatal?: boolean; message: string; retryMs: number };

/**
 * Keeps `GET /v1/events` open: reconnects after a drop with `Last-Event-ID` so nothing is missed, backs off when
 * jaeconnect is unreachable, and gives up only when the token itself is refused. Ported from
 * node-red-contrib-jaeconnect.
 */
export class EventStream {
    readonly #baseUrl: string;
    readonly #token: string;
    readonly #onEvent: (event: AppEvent) => void;
    readonly #onState: (state: StreamState) => void;
    readonly #fetch: typeof fetch;
    #running = false;
    #failures = 0;
    #lastEventId: string | undefined;
    #controller: AbortController | undefined;
    #wake: (() => void) | undefined;

    /**
     * Initializes a new instance of the {@link EventStream} class.
     * @param baseUrl The API address, without a trailing slash.
     * @param token The token.
     * @param onEvent Called with each event.
     * @param onState Called when the connection's state changes.
     * @param fetchImpl The fetch to use (tests).
     */
    constructor(baseUrl: string, token: string, onEvent: (event: AppEvent) => void, onState: (state: StreamState) => void, fetchImpl: typeof fetch = fetch) {
        this.#baseUrl = baseUrl;
        this.#token = token;
        this.#onEvent = onEvent;
        this.#onState = onState;
        this.#fetch = fetchImpl;
    }

    /**
     * Opens the stream, if it isn't open already.
     */
    start(): void {
        if (this.#running) {
            return;
        }

        this.#running = true;
        void this.#loop();
    }

    /**
     * Closes the stream for good.
     */
    stop(): void {
        this.#running = false;
        this.#controller?.abort();
        this.#wake?.();
    }

    async #loop(): Promise<void> {
        let delay = 0;
        while (this.#running) {
            if (delay > 0) {
                await this.#sleep(delay);
                if (!this.#running) {
                    break;
                }
            }

            this.#onState({ state: "connecting" });
            const outcome = await this.#connectOnce();
            if (!this.#running) {
                break;
            }

            if (outcome.fatal) {
                this.#running = false;
                this.#onState({ state: "error", message: outcome.message });
                return;
            }

            delay = outcome.retryMs;
            this.#onState({ state: "reconnecting", message: outcome.message, retryMs: delay });
        }

        this.#onState({ state: "stopped" });
    }

    async #connectOnce(): Promise<Outcome> {
        const controller = new AbortController();
        this.#controller = controller;
        const headers: Record<string, string> = {
            Accept: "text/event-stream",
            Authorization: `Bearer ${this.#token}`,
            "Cache-Control": "no-cache",
            "User-Agent": userAgent,
        };
        if (this.#lastEventId) {
            headers["Last-Event-ID"] = this.#lastEventId;
        }

        let response: Response;
        try {
            response = await this.#fetch(`${this.#baseUrl}/v1/events`, { headers, signal: controller.signal });
        } catch (error) {
            const reason = error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : String(error);
            return { message: `Couldn't reach jaeconnect: ${reason}`, retryMs: this.#backoff() };
        }

        if (!response.ok || !response.body) {
            const error = errorFromResponse(response.status, await response.text().catch(() => ""));
            if (response.status === 401 || response.status === 403) {
                return { fatal: true, message: error.message, retryMs: 0 };
            }

            if (response.status === 402) {
                return { message: error.message, retryMs: subscriptionRetryMs };
            }

            const retryAfter = Number(response.headers.get("retry-after"));
            return { message: error.message, retryMs: retryAfter > 0 ? retryAfter * 1000 : this.#backoff() };
        }

        this.#failures = 0;
        this.#onState({ state: "connected" });

        const parser = new SseParser();
        const decoder = new TextDecoder();
        let idle: NodeJS.Timeout | undefined;
        const armIdle = (): void => {
            clearTimeout(idle);
            idle = setTimeout(() => controller.abort(), idleMs);
        };

        armIdle();
        try {
            for await (const chunk of response.body) {
                armIdle();
                for (const event of parser.push(decoder.decode(chunk, { stream: true }))) {
                    this.#dispatch(event);
                }
            }
        } catch {
            // Aborted (stopped, or idle for too long) or the network dropped: either way, reconnect.
        } finally {
            clearTimeout(idle);
        }

        // A clean drop reconnects quickly; the server's retry hint wins when it gave one.
        return { message: "The connection closed.", retryMs: parser.retryMs ?? baseBackoffMs };
    }

    #dispatch(event: SseEvent): void {
        if (event.id) {
            this.#lastEventId = event.id;
        }

        let parsed: AppEvent;
        try {
            parsed = JSON.parse(event.data) as AppEvent;
        } catch {
            return;
        }

        this.#onEvent(parsed);
    }

    // The next wait after a failure: doubling, capped, with a little jitter so many clients don't return at once.
    #backoff(): number {
        const base = Math.min(maxBackoffMs, baseBackoffMs * 2 ** this.#failures);
        this.#failures += 1;
        return Math.round(base * (0.8 + Math.random() * 0.4));
    }

    #sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            const timer = setTimeout(done, ms);
            function done(): void {
                clearTimeout(timer);
                resolve();
            }

            this.#wake = done;
        });
    }
}
