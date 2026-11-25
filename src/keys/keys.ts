import { action } from "@elgato/streamdeck";

import type { CommandName, Vehicle } from "../api/types.ts";
import type { CarContext } from "../car.ts";
import { pluggable, supports } from "../car.ts";
import { hub } from "../hub.ts";
import { icons } from "../render/icons.ts";
import type { KeyFace } from "../render/key-face.ts";
import type { ActionSettings } from "../settings.ts";
import { CarKey, type KeyHandle } from "./car-key.ts";
import { bootFace, carFace, chargingFace, climateFace, demisterFace, lockFace, signalFace, wheelFace } from "./key-views.ts";

/**
 * Locked or unlocked. A press locks; unlocking needs a one-second hold.
 */
@action({ UUID: "com.jaeconnect.streamdeck.lock" })
export class LockKey extends CarKey {
    protected readonly name = "Lock";
    protected readonly icon = icons.lockClosed;
    protected readonly commands: CommandName[] = ["lock", "unlock"];

    constructor() {
        super();
    }

    protected face(ctx: CarContext): KeyFace {
        return lockFace(ctx);
    }

    protected override canHold(ctx: CarContext): boolean {
        return ctx.status?.locked !== false && supports(ctx.vehicle, "unlock");
    }

    protected async press(key: KeyHandle, ctx: CarContext): Promise<void> {
        if (ctx.status?.locked === true) {
            this.hint(key, "Hold to unlock");
            return;
        }

        await this.run(key, ctx, "lock");
    }

    protected override async hold(key: KeyHandle, ctx: CarContext): Promise<void> {
        await this.run(key, ctx, "unlock");
    }
}

/**
 * Climate off, or running. A press starts it at the Climate dial's temperature, or stops it.
 */
@action({ UUID: "com.jaeconnect.streamdeck.climate" })
export class ClimateKey extends CarKey {
    protected readonly name = "Climate";
    protected readonly icon = icons.fan;
    protected readonly commands: CommandName[] = ["start_climate"];

    constructor() {
        super();
    }

    protected face(ctx: CarContext): KeyFace {
        return climateFace(ctx);
    }

    protected async press(key: KeyHandle, ctx: CarContext): Promise<void> {
        await (ctx.status?.climate?.on
            ? this.run(key, ctx, "stop_climate")
            : this.run(key, ctx, "start_climate", { temperature_c: ctx.climateTarget, duration_minutes: ctx.durationMinutes }));
    }
}

/**
 * Battery percent and charging, on cars that plug in. A press starts or stops charging on cars with charge control
 * (typically EVs); on others, such as plug-in hybrids, the key only shows the battery.
 */
@action({ UUID: "com.jaeconnect.streamdeck.charging" })
export class ChargingKey extends CarKey {
    protected readonly name = "Charging";
    protected readonly icon = icons.bolt;
    protected readonly commands: CommandName[] = [];

    constructor() {
        super();
    }

    protected override supported(vehicle: Vehicle): boolean {
        return pluggable(vehicle);
    }

    protected face(ctx: CarContext): KeyFace {
        return chargingFace(ctx);
    }

    protected async press(key: KeyHandle, ctx: CarContext): Promise<void> {
        if (!supports(ctx.vehicle, "start_charging") && !supports(ctx.vehicle, "stop_charging")) {
            this.hint(key, "Can't control");
            return;
        }

        switch (ctx.status?.charging?.state) {
            case "charging":
                await this.run(key, ctx, "stop_charging");
                break;
            case "plugged_in":
                await this.run(key, ctx, "start_charging");
                break;
            case "complete":
                this.hint(key, "Already full");
                break;
            default:
                this.hint(key, "Not plugged in");
                break;
        }
    }
}

/**
 * The powered boot. Opening needs a one-second hold; a press closes it.
 */
@action({ UUID: "com.jaeconnect.streamdeck.boot" })
export class BootKey extends CarKey {
    protected readonly name = "Boot";
    protected readonly icon = icons.bootOpen;
    protected readonly commands: CommandName[] = ["open_boot"];

    constructor() {
        super();
    }

    protected face(ctx: CarContext): KeyFace {
        return bootFace(ctx);
    }

    protected override canHold(ctx: CarContext): boolean {
        return ctx.status?.boot_open !== true;
    }

    protected async press(key: KeyHandle, ctx: CarContext): Promise<void> {
        if (ctx.status?.boot_open !== true) {
            this.hint(key, "Hold to open");
            return;
        }

        if (supports(ctx.vehicle, "close_boot")) {
            await this.run(key, ctx, "close_boot");
        }
    }

    protected override async hold(key: KeyHandle, ctx: CarContext): Promise<void> {
        await this.run(key, ctx, "open_boot");
    }
}

/**
 * The windscreen or rear window demister (a setting). A press turns it on or off.
 */
@action({ UUID: "com.jaeconnect.streamdeck.demister" })
export class DemisterKey extends CarKey {
    protected readonly name = "Demister";
    protected readonly icon = icons.windscreen;
    protected readonly commands: CommandName[] = ["front_defrost_on", "rear_defrost_on"];

    constructor() {
        super();
    }

    protected face(ctx: CarContext, settings: ActionSettings): KeyFace {
        return demisterFace(ctx, settings.window);
    }

    protected async press(key: KeyHandle, ctx: CarContext): Promise<void> {
        const window = this.settingsOf(key.id).window;
        const on = window === "front" ? ctx.status?.climate?.front_defrost_on : ctx.status?.climate?.rear_defrost_on;
        if (on) {
            await this.run(key, ctx, window === "front" ? "front_defrost_off" : "rear_defrost_off");
        } else if (supports(ctx.vehicle, window === "front" ? "front_defrost_on" : "rear_defrost_on")) {
            await this.run(key, ctx, window === "front" ? "front_defrost_on" : "rear_defrost_on", { duration_minutes: ctx.durationMinutes });
        } else {
            this.hint(key, "Not on this car");
        }
    }
}

/**
 * The heated steering wheel, for cars that have one. A press turns it on or off.
 */
@action({ UUID: "com.jaeconnect.streamdeck.wheel" })
export class WheelKey extends CarKey {
    protected readonly name = "Wheel";
    protected readonly icon = icons.wheel;
    protected readonly commands: CommandName[] = ["steering_wheel_heat_on"];

    constructor() {
        super();
    }

    protected face(ctx: CarContext): KeyFace {
        return wheelFace(ctx);
    }

    protected async press(key: KeyHandle, ctx: CarContext): Promise<void> {
        await this.run(key, ctx, ctx.status?.climate?.steering_wheel_heat_on ? "steering_wheel_heat_off" : "steering_wheel_heat_on");
    }
}

/**
 * Flashes the lights and sounds the horn.
 */
@action({ UUID: "com.jaeconnect.streamdeck.signal" })
export class SignalKey extends CarKey {
    protected readonly name = "Signal";
    protected readonly icon = icons.signal;
    protected readonly commands: CommandName[] = ["flash_and_honk"];

    constructor() {
        super();
    }

    protected face(): KeyFace {
        return signalFace();
    }

    protected async press(key: KeyHandle, ctx: CarContext): Promise<void> {
        await this.run(key, ctx, "flash_and_honk");
    }
}

/**
 * The car's name, whether it's awake and when it last reported. A press asks the car for a fresh status; a hold wakes
 * a sleeping car.
 */
@action({ UUID: "com.jaeconnect.streamdeck.car" })
export class CarStatusKey extends CarKey {
    protected readonly name = "Car";
    protected readonly icon = icons.car;
    protected readonly commands: CommandName[] = [];

    constructor() {
        super();
    }

    protected face(ctx: CarContext, _settings: ActionSettings, now: number): KeyFace {
        return carFace(ctx, now);
    }

    protected override canHold(ctx: CarContext): boolean {
        return ctx.status?.online === false && supports(ctx.vehicle, "wake");
    }

    protected async press(key: KeyHandle, ctx: CarContext): Promise<void> {
        try {
            await hub.refresh(ctx.vehicle.id, true);
            await key.showOk();
        } catch {
            await key.showAlert();
        }
    }

    protected override async hold(key: KeyHandle, ctx: CarContext): Promise<void> {
        await this.run(key, ctx, "wake");
    }
}
