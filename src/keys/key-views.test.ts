import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { drawKey } from "../render/key-face.ts";
import { testClimate, testContext } from "../test-cars.ts";
import { carFace, chargingFace, climateFace, demisterFace, fuelFace, lockFace, offlineFace } from "./key-views.ts";

describe("Lock key", () => {
    it("asks for a hold to unlock", () => {
        const face = lockFace(testContext({ locked: true }));
        assert.equal(face.value, "Locked");
        assert.equal(face.sub, "Hold to unlock");
    });

    it("says when the car doesn't report its locks", () => {
        assert.equal(lockFace(testContext({ locked: null })).sub, "Not reported");
    });
});

describe("Climate key", () => {
    it("shows the temperature it would start at when the car has no cabin reading", () => {
        const face = climateFace(testContext());
        assert.equal(face.value, "Climate off");
        assert.equal(face.sub, "Starts at 21°");
    });

    it("shows the car's set temperature while running", () => {
        const ctx = testContext({ climate: testClimate({ on: true, target_temp_c: 23 }) });
        const face = climateFace(ctx);
        assert.equal(face.value, "23° on");
        assert.equal(face.sub, "Driver side");
    });

    it("shows the cabin temperature for cars that report it", () => {
        const ctx = testContext({ climate: testClimate({ cabin_temp_c: 4.5 }) });
        assert.equal(climateFace(ctx).value, "Cabin 4.5°");
    });
});

describe("Charging key", () => {
    it("shows power and time to full while charging", () => {
        const face = chargingFace(testContext({ battery_percent: 46, charging: { state: "charging", power_kw: 7.2, minutes_to_full: 185, target_percent: 90 } }));
        assert.equal(face.value, "46%");
        assert.equal(face.sub, "7.2 kW · 3h 05m");
        assert.equal(face.tone, "white");
        assert.deepEqual(face.meter, { share: 0.46, tone: "mint" });
        assert.match(face.icon, /#5fe0b4/, "a mint bolt in the battery");
    });

    it("is white with a green meter, like the Fuel key, when not charging", () => {
        const face = chargingFace(testContext({ battery_percent: 62, charging: { state: "plugged_in", power_kw: null, minutes_to_full: null, target_percent: 90 } }));
        assert.equal(face.tone, "white");
        assert.deepEqual(face.meter, { share: 0.62, tone: "electric" });
    });

    it("shows the range when unplugged", () => {
        assert.equal(chargingFace(testContext({ battery_percent: 62, charging: { state: "unplugged", power_kw: null, minutes_to_full: null, target_percent: 90 } })).sub, "52 mi");
    });
});

describe("Fuel key", () => {
    it("shows the level, a meter and the range on fuel", () => {
        const face = fuelFace(testContext());
        assert.equal(face.value, "64%");
        assert.equal(face.sub, "410 mi");
        assert.deepEqual(face.meter, { share: 0.64, tone: "fuel" });
    });

    it("says when the car doesn't report fuel", () => {
        assert.equal(fuelFace(testContext({ fuel_percent: null })).sub, "Not reported");
    });
});

describe("other keys", () => {
    it("names the rear demister", () => {
        assert.equal(demisterFace(testContext(), "rear").value, "Rear");
    });

    it("shows whether the car is awake", () => {
        const face = carFace(testContext({ online: false }), Date.parse("2026-11-25T07:02:00Z"));
        assert.equal(face.sub, "Asleep · 2 min ago");
        assert.equal(face.dot, "off");
    });

    it("asks for a token when signed out", () => {
        assert.equal(offlineFace("signed-out").sub, "Add a token");
    });

    it("draws a key as an SVG data URI", () => {
        const image = drawKey({ ...lockFace(testContext()), progress: 0.5, banner: { text: "Sending", tone: "cool" } });
        assert.match(image, /^data:image\/svg\+xml;charset=utf8,/);
        assert.match(decodeURIComponent(image), /Sending/);
    });
});
