import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ago, clampSeatSetting, clampTemperature, currentPosition, distance, hasEngine, openings, pluggable, positions, pressure, runTime, seatCommands, seatOptions, seatSetting, shortError, sunroofClosesFirst } from "./car.ts";
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

describe("charging", () => {
    it("shows on cars that plug in, and on cars that don't say", () => {
        for (const powertrain of ["ev", "phev", "erev", null]) {
            assert.equal(pluggable(testVehicle({ powertrain })), true, String(powertrain));
        }
    });

    it("hides on petrol, diesel and self-charging hybrids", () => {
        assert.equal(pluggable(testVehicle({ powertrain: "ice" })), false);
        assert.equal(pluggable(testVehicle({ powertrain: "hev" })), false);
    });
});

describe("fuel", () => {
    it("shows on cars with an engine, and on cars that don't say", () => {
        for (const powertrain of ["phev", "erev", "hev", "ice", null]) {
            assert.equal(hasEngine(testVehicle({ powertrain })), true, String(powertrain));
        }
    });

    it("hides on electric cars", () => {
        assert.equal(hasEngine(testVehicle({ powertrain: "ev" })), false);
    });
});

describe("seats", () => {
    it("offers each seat once, with what it can do", () => {
        assert.deepEqual(seatOptions(testVehicle({ ventilated_seats: ["driver"] })), [
            { seat: "driver", heat: true, cool: true },
            { seat: "passenger", heat: true, cool: false },
        ]);
    });

    it("offers the front seats when the car service can't say which", () => {
        const car = testVehicle({ heated_seats: null, supported_commands: ["seat_heat"] });
        assert.deepEqual(seatOptions(car).map((x) => x.seat), ["driver", "passenger"]);
    });

    it("offers nothing without the seat commands", () => {
        assert.deepEqual(seatOptions(testVehicle({ supported_commands: ["lock"] })), []);
    });

    it("reads heating as positive and cooling as negative", () => {
        const seats = { driver: { heat_level: 2, vent_level: 0 }, passenger: { heat_level: 0, vent_level: 1 }, rear_left: null, rear_right: null };
        assert.equal(seatSetting(testStatus({ seats }), "driver"), 2);
        assert.equal(seatSetting(testStatus({ seats }), "passenger"), -1);
        assert.equal(seatSetting(testStatus({ seats }), "rear_left"), 0);
    });

    it("keeps a setting to what the seat can do", () => {
        assert.equal(clampSeatSetting({ seat: "driver", heat: true, cool: true }, -5), -3);
        assert.equal(clampSeatSetting({ seat: "driver", heat: true, cool: false }, -1), 0);
        assert.equal(clampSeatSetting({ seat: "driver", heat: false, cool: true }, 2), 0);
    });

    it("turns heating off before cooling, and the other way round", () => {
        assert.deepEqual(seatCommands("driver", 2, -1), [
            { command: "seat_heat", seat: "driver", level: 0 },
            { command: "seat_vent", seat: "driver", level: 1 },
        ]);
        assert.deepEqual(seatCommands("driver", -3, 0), [{ command: "seat_vent", seat: "driver", level: 0 }]);
        assert.deepEqual(seatCommands("driver", 1, 3), [{ command: "seat_heat", seat: "driver", level: 3 }]);
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
