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
    it("asks for a press when a level is chosen but not sent", () => {
        const view = seatsPanel(testContext(), { seat: "driver", mode: "heat" }, 2);
        assert.equal(view.banner?.text, "Press to set level 2");
        assert.deepEqual(view.lines[1], { kind: "pips", count: 3, filled: 2, tone: "heat", pending: true });
    });

    it("shows the car's level when nothing is waiting", () => {
        const ctx = testContext({ seats: { driver: null, passenger: { heat_level: 0, vent_level: 1 }, rear_left: null, rear_right: null } });
        const view = seatsPanel(ctx, { seat: "passenger", mode: "vent" }, undefined);
        assert.equal(view.banner, undefined);
        assert.equal(view.label, "Seat cooling");
        assert.deepEqual(view.tag, { text: "L1", tone: "mint" });
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
