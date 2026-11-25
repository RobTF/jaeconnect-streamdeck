import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ago, clampTemperature, currentPosition, distance, openings, positions, pressure, runTime, seatTargets, shortError, sunroofClosesFirst } from "./car.ts";
import { testStatus, testVehicle } from "./test-cars.ts";

describe("climate", () => {
    it("clamps to the car's range and snaps to its step", () => {
        const car = testVehicle({ climate: { min_temp_c: 16, max_temp_c: 28, step_c: 0.5, durations_minutes: [], max_engine_minutes: null } });
        assert.equal(clampTemperature(car, 31), 28);
        assert.equal(clampTemperature(car, 12), 16);
        assert.equal(clampTemperature(car, 21.3), 21.5);
    });

    it("uses jaeconnect's defaults when the car doesn't say", () => {
        assert.equal(clampTemperature(testVehicle({ climate: null }), 40), 30);
    });

    it("takes a chosen run time only when the car does", () => {
        const car = testVehicle();
        assert.equal(runTime(car, 10), 10);
        assert.equal(runTime(car, 20), 15);
        assert.equal(runTime(car, undefined), 15);
    });
});

describe("seats", () => {
    it("offers heating then cooling on the listed seats", () => {
        assert.deepEqual(seatTargets(testVehicle()), [
            { seat: "driver", mode: "heat" },
            { seat: "passenger", mode: "heat" },
            { seat: "driver", mode: "vent" },
            { seat: "passenger", mode: "vent" },
        ]);
    });

    it("offers the front seats when the car service can't say which", () => {
        const car = testVehicle({ heated_seats: null, supported_commands: ["seat_heat"] });
        assert.deepEqual(seatTargets(car).map((x) => x.seat), ["driver", "passenger"]);
    });

    it("offers nothing without the seat commands", () => {
        assert.deepEqual(seatTargets(testVehicle({ supported_commands: ["lock"] })), []);
    });
});

describe("windows and sunroof", () => {
    it("offers the positions the car takes", () => {
        const car = testVehicle({ supported_commands: ["close_windows", "open_windows"] });
        assert.deepEqual(openings(car), ["windows"]);
        assert.deepEqual(positions(car, "windows"), ["closed", "open"]);
    });

    it("falls back to open or closed when the car doesn't give a position", () => {
        assert.equal(currentPosition(testStatus({ windows_position: null, windows_open: true }), "windows"), "open");
        assert.equal(currentPosition(testStatus({ sunroof_position: "vented" }), "sunroof"), "vented");
        assert.equal(currentPosition(testStatus({ sunroof_position: null, sunroof_open: null }), "sunroof"), undefined);
    });

    it("closes the sunroof first between vented and open on cars that need it", () => {
        const car = testVehicle();
        assert.equal(sunroofClosesFirst(car, "vented", "open"), true);
        assert.equal(sunroofClosesFirst(car, "vented", "closed"), false);
        assert.equal(sunroofClosesFirst(car, "closed", "open"), false);
        assert.equal(sunroofClosesFirst(testVehicle({ sunroof_must_close_between_positions: false }), "vented", "open"), false);
    });
});

describe("formatting", () => {
    it("shows distances in the chosen unit", () => {
        assert.equal(distance(84, 52, "mi"), "52 mi");
        assert.equal(distance(84, null, "mi"), "52 mi");
        assert.equal(distance(10239, 6362, "km"), "10,239 km");
        assert.equal(distance(null, null, "km"), undefined);
    });

    it("shows tyre pressures in the chosen unit", () => {
        assert.equal(pressure(250, "psi"), "36");
        assert.equal(pressure(250, "bar"), "2.5");
        assert.equal(pressure(250, "kpa"), "250");
        assert.equal(pressure(null, "psi"), "–");
    });

    it("says how long ago", () => {
        const now = Date.parse("2026-11-25T08:00:00Z");
        assert.equal(ago("2026-11-25T07:59:30Z", now), "just now");
        assert.equal(ago("2026-11-25T07:58:00Z", now), "2 min ago");
        assert.equal(ago("2026-11-25T05:00:00Z", now), "3 h ago");
        assert.equal(ago(undefined, now), "no report");
    });

    it("keeps failure reasons short enough for a key", () => {
        for (const code of ["vehicle_unreachable", "pin_required", "subscription_required", "close_sunroof_first", "anything_else", undefined]) {
            assert.ok(shortError(code).length <= 14, `${code}: ${shortError(code)}`);
        }
    });
});
