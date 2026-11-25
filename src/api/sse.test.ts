import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { errorFromResponse, normaliseBaseUrl } from "./client.ts";
import { SseParser } from "./sse.ts";

describe("SseParser", () => {
    it("parses jaeconnect's events, skipping pings", () => {
        const parser = new SseParser();
        const events = parser.push(": ping\n\nid: evt_1\nevent: vehicle.locked\ndata: {\"type\":\"vehicle.locked\"}\n\n");
        assert.deepEqual(events, [{ id: "evt_1", event: "vehicle.locked", data: "{\"type\":\"vehicle.locked\"}" }]);
        assert.equal(parser.lastEventId, "evt_1");
    });

    it("joins a chunk split between a CR and its LF", () => {
        const parser = new SseParser();
        assert.deepEqual(parser.push("data: a\r"), []);
        assert.deepEqual(parser.push("\n\r\n"), [{ id: undefined, event: "message", data: "a" }]);
    });

    it("keeps the server's retry hint", () => {
        const parser = new SseParser();
        parser.push("retry: 5000\n\n");
        assert.equal(parser.retryMs, 5000);
    });
});

describe("client", () => {
    it("reads problem details", () => {
        const error = errorFromResponse(409, JSON.stringify({ status: 409, detail: "No control PIN is stored for this car.", code: "pin_required" }));
        assert.equal(error.message, "No control PIN is stored for this car.");
        assert.equal(error.code, "pin_required");
    });

    it("tidies the address", () => {
        assert.equal(normaliseBaseUrl(" https://localhost:7180/ "), "https://localhost:7180");
        assert.equal(normaliseBaseUrl(""), "https://jaeconnect.com");
    });
});
