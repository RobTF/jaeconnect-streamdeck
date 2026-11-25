import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { drawPanel } from "../render/panel-face.ts";
import { testContext } from "../test-cars.ts";
import { climatePanel, energyPages, energyPanel, openingsPanel, seatsPanel } from "./panel-views.ts";

describe("Climate dial", () => {
    it("shows the driver side, not a cabin temperature, for cars without one", () => {
        const view = climatePanel(testContext());
        assert.deepEqual(view.lines[0], { kind: "text", text: "21°C", font: "big", tone: "heat" });
        assert.deepEqual(view.lines[1], { kind: "text", text: "Driver side · 15 min", font: "body" });
        assert.equal((view.lines[2] as { mark?: number }).mark, undefined);
    });
});

describe("Seats dial", () => {
    const both = { seat: "driver" as const, heat: true, cool: true };

    it("asks for a press when heating is chosen but not sent", () => {
        const view = seatsPanel(testContext(), both, 2);
        assert.equal(view.banner?.text, "Press to heat at 2");
        assert.deepEqual(view.lines[1], { kind: "scale", value: 2, levels: 3, cool: true, heat: true, pending: true });
    });

    it("asks for a press when cooling is chosen", () => {
        assert.equal(seatsPanel(testContext(), both, -1).banner?.text, "Press to cool at 1");
    });

    it("shows the car's cooling when nothing is waiting", () => {
        const ctx = testContext({ seats: { driver: null, passenger: { heat_level: 0, vent_level: 1 }, rear_left: null, rear_right: null } });
        const view = seatsPanel(ctx, { seat: "passenger", heat: true, cool: true }, undefined);
        assert.equal(view.banner, undefined);
        assert.deepEqual(view.tag, { text: "COOL 1", tone: "cool" });
        assert.deepEqual(view.lines[2], { kind: "text", text: "Cooling · 15 min", font: "body" });
    });

    it("names the cool and heat ends when off", () => {
        assert.deepEqual(seatsPanel(testContext(), both, undefined).lines[2], { kind: "ends", left: { text: "Cool", tone: "cool" }, right: { text: "Heat", tone: "heat" } });
    });

    it("leaves out the end a seat can't do", () => {
        const line = seatsPanel(testContext(), { seat: "passenger", heat: true, cool: false }, undefined).lines[2];
        assert.deepEqual(line, { kind: "ends", left: undefined, right: { text: "Heat", tone: "heat" } });
    });
});

describe("Energy dial", () => {
    it("offers only the pages the car reports", () => {
        assert.deepEqual(energyPages(testContext()), ["battery", "fuel", "odometer"]);
        assert.deepEqual(energyPages(testContext({ fuel_percent: null, tyres: { front_left: null, front_right: null, rear_left: null, rear_right: null } })), ["battery", "tyres", "odometer"]);
    });

    it("shows the battery with its range and limit", () => {
        const view = energyPanel(testContext(), "battery");
        assert.deepEqual(view.lines[1], { kind: "text", text: "52 mi electric · limit 100%", font: "body" });
    });
});

describe("Windows and sunroof dial", () => {
    it("asks for a press when a position is chosen", () => {
        const view = openingsPanel(testContext({ sunroof_position: "vented" }), "sunroof", "open");
        assert.equal(view.banner?.text, "Press to open");
        assert.deepEqual(view.lines[1], { kind: "chips", items: ["Closed", "Vent", "Open"], on: "Vent", pick: "Open" });
    });

    it("draws a panel as a base64 SVG", () => {
        assert.match(drawPanel(openingsPanel(testContext(), "windows", undefined)), /^data:image\/svg\+xml;base64,/);
    });
});
