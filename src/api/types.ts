/**
 * The shapes the jaeconnect API (v1) answers with, as far as the plugin reads them. JSON is snake_case, and anything
 * a car doesn't report is `null`. The contract is docs/API.md in the jaeconnect repo.
 */

/**
 * A remote command's path segment.
 */
export type CommandName =
    | "lock"
    | "unlock"
    | "open_boot"
    | "close_boot"
    | "start_climate"
    | "stop_climate"
    | "flash_and_honk"
    | "start_charging"
    | "stop_charging"
    | "start_engine"
    | "stop_engine"
    | "steering_wheel_heat_on"
    | "steering_wheel_heat_off"
    | "front_defrost_on"
    | "front_defrost_off"
    | "rear_defrost_on"
    | "rear_defrost_off"
    | "seat_heat"
    | "seat_vent"
    | "locate"
    | "wake"
    | "open_windows"
    | "vent_windows"
    | "close_windows"
    | "open_sunroof"
    | "vent_sunroof"
    | "close_sunroof";

/**
 * A seat, for the seat commands. Driver and passenger follow the car's drive side.
 */
export type SeatName = "driver" | "passenger" | "rear_left" | "rear_right";

/**
 * How far a window or sunroof is open.
 */
export type OpeningPosition = "closed" | "vented" | "open";

/**
 * Whether the car is plugged in and charging.
 */
export type ChargingState = "unplugged" | "plugged_in" | "charging" | "complete";

/**
 * The climate control's temperature range and run times.
 */
export type ClimateLimits = {
    min_temp_c: number;
    max_temp_c: number;
    step_c: number;
    /**
     * The run times the car accepts; empty means any.
     */
    durations_minutes: number[];
    max_engine_minutes: number | null;
};

/**
 * A car the token can read (`GET /v1/vehicles`).
 */
export type Vehicle = {
    id: string;
    nickname: string;
    brand: string;
    model: string;
    powertrain: string | null;
    car_account_status: "active" | "reauth_required";
    supported_commands: CommandName[];
    /**
     * The seats that can be heated; `null` when the car service can't say, and then every seat is offered.
     */
    heated_seats: SeatName[] | null;
    ventilated_seats: SeatName[] | null;
    climate: ClimateLimits | null;
    sunroof_must_close_between_positions: boolean;
    permissions: { read: boolean; location: boolean; control: boolean };
};

/**
 * One seat's heating and ventilation levels; 0 is off.
 */
export type SeatLevels = { heat_level: number | null; vent_level: number | null };

/**
 * One tyre's reading.
 */
export type Tyre = { pressure_kpa: number | null; temperature_c: number | null; pressure_warning: boolean | null; temperature_warning: boolean | null };

/**
 * A car's status (`GET /v1/vehicles/{id}/status`, and the data of the `vehicle.*` events).
 */
export type VehicleStatus = {
    vehicle_id: string;
    battery_percent: number | null;
    range_km: number | null;
    range_miles: number | null;
    fuel_percent: number | null;
    fuel_range_km: number | null;
    fuel_range_miles: number | null;
    online: boolean | null;
    charging: { state: ChargingState; power_kw: number | null; minutes_to_full: number | null; target_percent: number | null } | null;
    locked: boolean | null;
    doors_open: boolean | null;
    boot_open: boolean | null;
    windows_open: boolean | null;
    windows_position: OpeningPosition | null;
    sunroof_open: boolean | null;
    sunroof_position: OpeningPosition | null;
    climate: {
        on: boolean;
        /**
         * Some brands (OMODA | JAECOO) never report it.
         */
        cabin_temp_c: number | null;
        target_temp_c: number | null;
        requested_temp_c: number | null;
        steering_wheel_heat_on: boolean | null;
        front_defrost_on: boolean | null;
        rear_defrost_on: boolean | null;
        ends_at: string | null;
    } | null;
    seats: { driver: SeatLevels | null; passenger: SeatLevels | null; rear_left: SeatLevels | null; rear_right: SeatLevels | null } | null;
    tyres: { front_left: Tyre | null; front_right: Tyre | null; rear_left: Tyre | null; rear_right: Tyre | null } | null;
    engine_running: boolean | null;
    odometer_km: number | null;
    odometer_miles: number | null;
    reported_at: string;
    fetched_at: string;
};

/**
 * A command's record. `sent` and `accepted` only appear in `command.updated` events; the POST answers once it is
 * `succeeded` or `failed`.
 */
export type Command = {
    id: string;
    vehicle_id: string;
    command: CommandName;
    status: "sent" | "accepted" | "succeeded" | "failed";
    error: { code: string; message: string } | null;
};

/**
 * The optional body of a command.
 */
export type CommandBody = {
    temperature_c?: number;
    duration_minutes?: number;
    seat?: SeatName;
    level?: number;
};

/**
 * An event from `GET /v1/events`.
 */
export type AppEvent = {
    id: string;
    type: string;
    created_at: string;
    vehicle_id?: string;
    data: unknown;
};
