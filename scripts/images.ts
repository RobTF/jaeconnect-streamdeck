// Writes the manifest's images (action list icons, default key and dial images, the category and plugin icons) from
// the same icons the keys draw. Run it after changing an icon: npm run images.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { type IconName, icons } from "../src/render/icons.ts";

const root = path.resolve("com.jaeconnect.streamdeck.sdPlugin", "imgs");

const actions: { slug: string; icon: IconName; dial?: boolean }[] = [
    { slug: "lock", icon: "lockClosed" },
    { slug: "climate", icon: "fan" },
    { slug: "charging", icon: "bolt" },
    { slug: "fuel", icon: "fuel" },
    { slug: "boot", icon: "bootOpen" },
    { slug: "demister", icon: "windscreen" },
    { slug: "wheel", icon: "wheel" },
    { slug: "signal", icon: "signal" },
    { slug: "car", icon: "car" },
    { slug: "climate-dial", icon: "thermometer", dial: true },
    { slug: "seats-dial", icon: "seat", dial: true },
    { slug: "energy-dial", icon: "gauge", dial: true },
    { slug: "openings-dial", icon: "window", dial: true },
];

const stroke = (colour: string, width: number) => `fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" color="${colour}"`;

// The action list wants a white glyph on transparent, 20 × 20 (40 × 40 at 2×).
const listIcon = (icon: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><g ${stroke("#ffffff", 1.8)}>${icon}</g></svg>`;

// A key's default image before the plugin draws it: the icon in mint on the key's near-black face.
const keyImage = (icon: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="#07090a"/><rect x="2" y="2" width="140" height="140" rx="16" fill="none" stroke="#1f2a28" stroke-width="3"/><g transform="translate(36 36) scale(3)" ${stroke("#5fe0b4", 1.8)}>${icon}</g></svg>`;

// The plugin's own icon (imgs/plugin/marketplace.png) has to be a PNG, so it isn't written here: it is the jaeconnect
// website's icon-512.png scaled to 288 × 288.

// The category icon is a white glyph like the action list's: the j and its dot.
const category = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 48 48"><path d="M27 21v10a7 7 0 0 1-14 0" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><circle cx="27" cy="13" r="3.2" fill="#fff"/><path d="M30.5 8.8a5.5 5.5 0 0 1 0 8.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>`;

function write(file: string, svg: string): void {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${svg}\n`);
}

for (const a of actions) {
    write(path.join(root, "actions", a.slug, "icon.svg"), listIcon(icons[a.icon]));
    write(path.join(root, "actions", a.slug, a.dial ? "dial.svg" : "key.svg"), keyImage(icons[a.icon]));
}

write(path.join(root, "plugin", "category.svg"), category);
console.log(`Wrote ${actions.length * 2 + 1} images to ${root}.`);
