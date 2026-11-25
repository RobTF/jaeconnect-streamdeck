/**
 * The colours keys and panels use, on a near-black face. Mint is jaeconnect's accent on dark backgrounds.
 */
export const tones = {
    mint: "#5fe0b4",
    // The website's energy meters in its dark theme: electric is teal-green (--jc-teal), fuel is blue
    // (--jc-graphic-cool).
    electric: "#12a27e",
    fuel: "#4aa3ec",
    amber: "#ffc94d",
    heat: "#ffa94d",
    cool: "#6cc4ff",
    red: "#ff6b6b",
    white: "#f2f5f4",
    grey: "#8b9693",
    off: "#4a5250",
} as const;

/**
 * A key colour.
 */
export type Tone = keyof typeof tones;

/**
 * What to draw on a key.
 */
export type KeyFace = {
    /**
     * The icon's elements (see icons.ts).
     */
    icon: string;
    /**
     * The big text under the icon.
     */
    value: string;
    /**
     * The line under it.
     */
    sub: string;
    /**
     * The colour of the icon and the value.
     */
    tone: Tone;
    /**
     * A dot in the top right corner, e.g. mint while the car is awake.
     */
    dot?: Tone;
    /**
     * A strip across the bottom in place of the line, while a command is under way or after it failed.
     */
    banner?: { text: string; tone: Tone };
    /**
     * Draws the ring round the key filled this far (0 to 1), for a hold in progress.
     */
    progress?: number;
};

/**
 * Draws a key as a 144 × 144 SVG data URI, for `setImage`.
 * @param face What to draw.
 * @returns The image.
 */
export function drawKey(face: KeyFace): string {
    const ink = tones[face.tone];
    const off = face.tone === "off";
    const size = face.value.length <= 6 ? 26 : face.value.length <= 9 ? 21 : 17;

    // A hold fills the ring clockwise; its length is the rounded square's perimeter (4 × 110 + 2π × 14 ≈ 528).
    const ring = face.progress === undefined
        ? `<rect x="2" y="2" width="140" height="140" rx="16" fill="none" stroke="${off ? "#1b2121" : "#1f2a28"}" stroke-width="3"/>`
        : `<rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="#1f2a28" stroke-width="5"/><rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="${tones.mint}" stroke-width="5" stroke-dasharray="${(Math.min(1, Math.max(0, face.progress)) * 528).toFixed(1)} 600"/>`;

    const bottom = face.banner
        ? `<rect x="10" y="104" width="124" height="26" rx="7" fill="${tones[face.banner.tone]}" opacity="0.18"/><text x="72" y="122" text-anchor="middle" font-family="Segoe UI, sans-serif" font-weight="600" font-size="15" fill="${tones[face.banner.tone]}">${escape(face.banner.text)}</text>`
        : `<text x="72" y="122" text-anchor="middle" font-family="Segoe UI, sans-serif" font-weight="500" font-size="15" fill="${off ? "#4a5250" : "#9aa6a3"}">${escape(face.sub)}</text>`;

    const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
        '<rect width="144" height="144" fill="#07090a"/>',
        ring,
        face.dot ? `<circle cx="122" cy="22" r="6" fill="${tones[face.dot]}"/>` : "",
        `<g transform="translate(46 14) scale(2.17)" color="${ink}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${face.icon}</g>`,
        `<text x="72" y="92" text-anchor="middle" font-family="Segoe UI, sans-serif" font-weight="700" font-size="${size}" fill="${off ? "#5d6664" : face.tone === "grey" ? tones.white : ink}">${escape(face.value)}</text>`,
        bottom,
        "</svg>",
    ].join("");
    return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

/**
 * Escapes text for SVG.
 * @param text The text.
 * @returns The escaped text.
 */
export function escape(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
