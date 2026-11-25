import type { Vehicle, VehicleStatus } from "./api/types.ts";
import type { CarContext } from "./car.ts";

/**
 * A JAECOO 7 SHS as jaeconnect describes one: no heated steering wheel, no cabin temperature, a sunroof that closes
 * between vented and open. For tests.
 * @param overrides Fields to change.
 * @returns The car.
 */
export function testVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
    return {
        id: "8f3k2qa1b2c3",
        nickname: "Family car",
        brand: "JAECOO",
        model: "JAECOO 7 SHS",
        powertrain: "phev",
        car_account_status: "active",
        supported_commands: [
            "lock", "unlock", "open_boot", "close_boot", "start_climate", "stop_climate", "flash_and_honk", "start_charging", "stop_charging",
            "front_defrost_on", "front_defrost_off", "rear_defrost_on", "rear_defrost_off", "seat_heat", "seat_vent", "wake",
            "open_windows", "vent_windows", "close_windows", "open_sunroof", "vent_sunroof", "close_sunroof",
        ],
        heated_seats: ["driver", "passenger"],
        ventilated_seats: ["driver", "passenger"],
        climate: { min_temp_c: 16, max_temp_c: 30, step_c: 1, durations_minutes: [5, 10, 15], max_engine_minutes: 15 },
        sunroof_must_close_between_positions: true,
        permissions: { read: true, location: false, control: true },
        ...overrides,
    };
}

/**
 * A status for {@link testVehicle}: locked, asleep, plugged in and full. For tests.
 * @param overrides Fields to change.
 * @returns The status.
 */
export function testStatus(overrides: Partial<VehicleStatus> = {}): VehicleStatus {
    return {
        vehicle_id: "8f3k2qa1b2c3",
        battery_percent: 100,
        range_km: 84,
        range_miles: 52,
        fuel_percent: 64,
        fuel_range_km: 660,
        fuel_range_miles: 410,
        online: false,
        charging: { state: "complete", power_kw: null, minutes_to_full: null, target_percent: 100 },
        locked: true,
        doors_open: false,
        boot_open: false,
        windows_open: false,
        windows_position: "closed",
        sunroof_open: false,
        sunroof_position: "closed",
        climate: testClimate(),
        seats: { driver: { heat_level: 0, vent_level: 0 }, passenger: { heat_level: 0, vent_level: 0 }, rear_left: null, rear_right: null },
        tyres: null,
        engine_running: false,
        odometer_km: 10239,
        odometer_miles: 6362,
        reported_at: "2026-11-25T07:00:00Z",
        fetched_at: "2026-11-25T07:01:00Z",
        ...overrides,
    };
}

/**
 * The test car's climate, off, with no cabin reading. For tests.
 * @param overrides Fields to change.
 * @returns The climate.
 */
export function testClimate(overrides: Partial<NonNullable<VehicleStatus["climate"]>> = {}): NonNullable<VehicleStatus["climate"]> {
    return { on: false, cabin_temp_c: null, target_temp_c: null, requested_temp_c: null, steering_wheel_heat_on: false, front_defrost_on: false, rear_defrost_on: false, ends_at: null, ...overrides };
}

/**
 * A context for the test car. For tests.
 * @param status Fields to change in the status.
 * @param vehicle Fields to change in the car.
 * @returns The context.
 */
export function testContext(status: Partial<VehicleStatus> = {}, vehicle: Partial<Vehicle> = {}): CarContext {
    return { vehicle: testVehicle(vehicle), status: testStatus(status), distance: "mi", pressure: "psi", climateTarget: 21, durationMinutes: 15 };
}
