/**
 * One server-sent event.
 */
export type SseEvent = {
    /**
     * The last `id:` seen, which carries over to later events as the spec says.
     */
    id: string | undefined;
    event: string;
    data: string;
};

/**
 * Parses a server-sent event stream (https://html.spec.whatwg.org/multipage/server-sent-events.html) a chunk at a
 * time. Lines may end in CR, LF or CRLF, and a chunk may stop anywhere, even between a CR and its LF. Ported from
 * node-red-contrib-jaeconnect.
 */
export class SseParser {
    #buffer = "";
    #data: string[] = [];
    #eventType = "";

    /**
     * The last `id:` seen.
     */
    lastEventId: string | undefined;

    /**
     * The last `retry:` the server asked for, in milliseconds.
     */
    retryMs: number | undefined;

    /**
     * Adds text from the stream.
     * @param text The next chunk, decoded.
     * @returns The events it completed.
     */
    push(text: string): SseEvent[] {
        this.#buffer += text;
        const events: SseEvent[] = [];
        for (;;) {
            const match = /\r\n|\r|\n/.exec(this.#buffer);
            if (!match) {
                break;
            }

            // A CR at the very end might be the first half of a CRLF: wait for the next chunk.
            if (match[0] === "\r" && match.index === this.#buffer.length - 1) {
                break;
            }

            const line = this.#buffer.slice(0, match.index);
            this.#buffer = this.#buffer.slice(match.index + match[0].length);
            const event = this.#line(line);
            if (event) {
                events.push(event);
            }
        }

        return events;
    }

    #line(line: string): SseEvent | undefined {
        if (line === "") {
            if (this.#data.length === 0) {
                this.#eventType = "";
                return undefined;
            }

            const event = { id: this.lastEventId, event: this.#eventType || "message", data: this.#data.join("\n") };
            this.#data = [];
            this.#eventType = "";
            return event;
        }

        if (line.startsWith(":")) {
            return undefined;
        }

        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) {
            value = value.slice(1);
        }

        switch (field) {
            case "data":
                this.#data.push(value);
                break;
            case "event":
                this.#eventType = value;
                break;
            case "id":
                if (!value.includes("\0")) {
                    this.lastEventId = value;
                }
                break;
            case "retry":
                if (/^\d+$/.test(value)) {
                    this.retryMs = Number(value);
                }
                break;
            default:
                break;
        }

        return undefined;
    }
}
