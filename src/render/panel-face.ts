import { escape, type Tone, tones } from "./key-face.ts";

/**
 * One line of a touch-strip panel, drawn top to bottom.
 */
export type PanelLine =
    | { kind: "text"; text: string; font: "big" | "name" | "body"; tone?: Tone }
    | { kind: "bar"; share: number; tone: Tone; mark?: number }
    | { kind: "chips"; items: string[]; on?: string; pick?: string }
    | { kind: "pips"; count: number; filled: number; tone: Tone; pending?: boolean }
    | { kind: "scale"; value: number; levels: number; cool: boolean; heat: boolean; pending?: boolean }
    | { kind: "ends"; left?: { text: string; tone: Tone }; right?: { text: string; tone: Tone } }
    | { kind: "pairs"; pairs: [string, string][] };

/**
 * What a dial's touch-strip panel shows.
 */
export type PanelView = {
    /**
     * The small label at the top left.
     */
    label: string;
    /**
     * An icon before the label (see icons.ts), with the label in the same colour, as the website's energy meters
     * have.
     */
    icon?: { elements: string; tone: Tone };
    /**
     * A tag at the top right, e.g. ON.
     */
    tag?: { text: string; tone: Tone };
    lines: PanelLine[];
    /**
     * A strip across the bottom, while a command is under way, after it failed, or to prompt a press.
     */
    banner?: { text: string; tone: Tone };
};

const width = 200;
const height = 100;
const left = 10;
const right = 190;

const fonts = {
    big: { size: 24, height: 28, weight: 700 },
    name: { size: 17, height: 21, weight: 700 },
    body: { size: 12, height: 16, weight: 500 },
} as const;

/**
 * Draws a dial's touch-strip panel as a 200 × 100 SVG, base64 encoded for a pixmap's `setFeedback`.
 * @param view What to draw.
 * @returns The image.
 */
export function drawPanel(view: PanelView): string {
    const parts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<rect width="${width}" height="${height}" fill="#07090a"/>`,
        view.icon
            ? `<g transform="translate(${left} 5) scale(0.5)" color="${tones[view.icon.tone]}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${view.icon.elements}</g>`
            : "",
        `<text x="${view.icon ? left + 16 : left}" y="16" font-family="Segoe UI, sans-serif" font-weight="700" font-size="10" letter-spacing="1.2" fill="${view.icon ? tones[view.icon.tone] : "#8b9693"}">${escape(view.label.toUpperCase())}</text>`,
        view.tag ? tag(view.tag.text, tones[view.tag.tone]) : "",
    ];

    let y = 22;
    for (const line of view.lines) {
        const [svg, used] = draw(line, y);
        parts.push(svg);
        y += used;
    }

    if (view.banner) {
        const colour = tones[view.banner.tone];
        parts.push(`<rect x="0" y="80" width="${width}" height="20" fill="${colour}" opacity="0.18"/>`);
        parts.push(`<text x="${width / 2}" y="94.5" text-anchor="middle" font-family="Segoe UI, sans-serif" font-weight="600" font-size="11.5" fill="${colour}">${escape(view.banner.text)}</text>`);
    }

    parts.push("</svg>");
    return `data:image/svg+xml;base64,${Buffer.from(parts.join(""), "utf8").toString("base64")}`;
}

function tag(text: string, colour: string): string {
    const w = text.length * 6.2 + 10;
    return [
        `<rect x="${(right - w).toFixed(1)}" y="5" width="${w.toFixed(1)}" height="15" rx="4" fill="${colour}" opacity="0.2"/>`,
        `<text x="${(right - w / 2).toFixed(1)}" y="16" text-anchor="middle" font-family="Segoe UI, sans-serif" font-weight="700" font-size="9.5" fill="${colour}">${escape(text)}</text>`,
    ].join("");
}

// Draws one line at `y` (its top); returns the SVG and the height it took.
function draw(line: PanelLine, y: number): [string, number] {
    switch (line.kind) {
        case "text": {
            const font = fonts[line.font];
            const fill = line.tone ? tones[line.tone] : "#9aa6a3";
            return [`<text x="${left}" y="${y + font.size - 2}" font-family="Segoe UI, sans-serif" font-weight="${font.weight}" font-size="${font.size}" fill="${fill}">${escape(line.text)}</text>`, font.height];
        }

        case "bar": {
            const span = right - left;
            const filled = Math.max(0, Math.min(1, line.share)) * span;
            const mark = line.mark === undefined ? "" : `<rect x="${(left + Math.max(0, Math.min(1, line.mark)) * span - 1.5).toFixed(1)}" y="${y}" width="3" height="10" rx="1" fill="${tones.white}"/>`;
            return [`<rect x="${left}" y="${y + 3}" width="${span}" height="4" rx="2" fill="#1d2524"/><rect x="${left}" y="${y + 3}" width="${filled.toFixed(1)}" height="4" rx="2" fill="${tones[line.tone]}"/>${mark}`, 12];
        }

        case "chips": {
            const gap = 4;
            const w = (right - left - gap * (line.items.length - 1)) / Math.max(1, line.items.length);
            const chips = line.items.map((item, i) => {
                const x = left + i * (w + gap);
                const on = item === line.on;
                const pick = item === line.pick && line.pick !== line.on;
                const fill = on ? tones.mint : "#1d2524";
                return [
                    `<rect x="${x.toFixed(1)}" y="${y + 1}" width="${w.toFixed(1)}" height="18" rx="4" fill="${fill}" fill-opacity="${on ? 0.25 : 1}" stroke="${pick ? tones.amber : "none"}" stroke-width="1.5"/>`,
                    `<text x="${(x + w / 2).toFixed(1)}" y="${y + 14}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-weight="600" font-size="10.5" fill="${on ? tones.mint : pick ? tones.amber : "#8b9693"}">${escape(item)}</text>`,
                ].join("");
            });
            return [chips.join(""), 23];
        }

        case "pips": {
            const w = 24;
            const pips = Array.from({ length: line.count }, (_, i) => {
                const x = left + i * (w + 5);
                const lit = i < line.filled;
                if (!lit) {
                    return `<rect x="${x}" y="${y + 3}" width="${w}" height="7" rx="2" fill="#1d2524"/>`;
                }

                return line.pending
                    ? `<rect x="${x + 0.75}" y="${y + 3.75}" width="${w - 1.5}" height="5.5" rx="2" fill="none" stroke="${tones.amber}" stroke-width="1.5"/>`
                    : `<rect x="${x}" y="${y + 3}" width="${w}" height="7" rx="2" fill="${tones[line.tone]}"/>`;
            });
            return [pips.join(""), 14];
        }

        case "scale": {
            // Cooling to the left of a centre mark and heating to the right, each filling outwards from the centre,
            // the way the dial turns: anticlockwise cools, clockwise heats. Every pill takes its side's colour: faint
            // when off, outlined when chosen but not sent, filled when on. A side the seat can't do is left out.
            const w = 22;
            const gap = 4;
            const centre = (left + right) / 2;
            const pip = (x: number, lit: boolean, tone: Tone, available: boolean): string => {
                if (!available) {
                    return "";
                }

                if (!lit) {
                    return `<rect x="${x.toFixed(1)}" y="${y + 3}" width="${w}" height="7" rx="2" fill="${tones[tone]}" fill-opacity="0.16"/>`;
                }

                return line.pending
                    ? `<rect x="${(x + 0.75).toFixed(1)}" y="${y + 3.75}" width="${w - 1.5}" height="5.5" rx="2" fill="none" stroke="${tones[tone]}" stroke-width="1.5"/>`
                    : `<rect x="${x.toFixed(1)}" y="${y + 3}" width="${w}" height="7" rx="2" fill="${tones[tone]}"/>`;
            };
            const parts = [`<rect x="${centre - 1}" y="${y}" width="2" height="13" rx="1" fill="#4a5250"/>`];
            for (let level = 1; level <= line.levels; level++) {
                const offset = 5 + (level - 1) * (w + gap);
                parts.push(pip(centre - offset - w, line.value <= -level, "cool", line.cool));
                parts.push(pip(centre + offset, line.value >= level, "heat", line.heat));
            }

            return [parts.join(""), 16];
        }

        case "ends": {
            // A word at each end of the line, e.g. which way the Seats dial cools and heats.
            const font = fonts.body;
            const text = (x: number, anchor: string, end: { text: string; tone: Tone } | undefined): string =>
                end ? `<text x="${x}" y="${y + font.size - 2}" text-anchor="${anchor}" font-family="Segoe UI, sans-serif" font-weight="600" font-size="${font.size}" fill="${tones[end.tone]}">${escape(end.text)}</text>` : "";
            return [text(left, "start", line.left) + text(right, "end", line.right), font.height];
        }

        default: {
            // Two columns of label and value, e.g. the tyres.
            const rows = Math.ceil(line.pairs.length / 2);
            const cells = line.pairs.map(([label, value], i) => {
                const x = left + (i % 2) * 92;
                const top = y + Math.floor(i / 2) * 22;
                return `<text x="${x}" y="${top + 17}" font-family="Segoe UI, sans-serif" font-size="10" font-weight="600" fill="#8b9693">${escape(label)}</text><text x="${x + 22}" y="${top + 18}" font-family="Segoe UI, sans-serif" font-size="17" font-weight="700" fill="${tones.white}">${escape(value)}</text>`;
            });
            return [cells.join(""), rows * 22];
        }
    }
}
