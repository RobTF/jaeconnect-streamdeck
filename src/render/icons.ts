/**
 * The icons keys and the manifest's images use: the inner elements of a 24 × 24 stroke SVG, drawn with
 * `stroke="currentColor"`. An element that sets `fill="currentColor"` is filled in the same colour.
 */
export const icons = {
    lockClosed: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    lockOpen: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.8"/>',
    fan: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2C10.6 6.4 12 3.5 14.6 4c2.2.5 1.7 3.8-1.2 6.1"/><path d="M13.6 13c3.9.9 5.9 3.6 4.2 5.6-1.5 1.7-4.1-.4-4.9-4"/><path d="M10.4 12.9c-2.8 2.8-6.2 2.9-6.9.4-.6-2.2 2.6-3.3 6.3-2.1"/>',
    thermometer: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 10v6"/>',
    bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
    car: '<path d="M2.5 16v-3.6l2.4-.9L8 7.5h7.5l3.5 4 2.5.7V16"/><path d="M9.3 16h5.4"/><circle cx="7" cy="16" r="2.2"/><circle cx="17" cy="16" r="2.2"/><path d="M2.5 16h2.2M19.2 16h2.3"/>',
    bootOpen: '<path d="M2.5 16v-3.6l2.4-.9L8 7.5h6"/><path d="M14 7.5 20.5 4"/><path d="M14 7.5v4.6l7.5.4V16"/><path d="M9.3 16h5.4"/><circle cx="7" cy="16" r="2.2"/><circle cx="17" cy="16" r="2.2"/><path d="M2.5 16h2.2M19.2 16h2.3"/>',
    windscreen: '<path d="M3 20c2.6-5.5 15.4-5.5 18 0"/><path d="M8 12.5c-1-1.4 1-2.4 0-3.8s1-2.4 0-3.8M12 11.5c-1-1.4 1-2.4 0-3.8s1-2.4 0-3.8M16 12.5c-1-1.4 1-2.4 0-3.8s1-2.4 0-3.8"/>',
    rearWindow: '<path d="M4 16V8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5V16z"/><path d="M7 9.5h10M7 12.5h10"/><path d="M9 21c-.8-.9.8-1.4 0-2.3M12 21c-.8-.9.8-1.4 0-2.3M15 21c-.8-.9.8-1.4 0-2.3"/>',
    wheel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M3.8 11h6M14.2 11h6M12 14.2v6.3"/>',
    signal: '<path d="M11 6.5C7 6.5 5 9 5 12s2 5.5 6 5.5z"/><path d="M14.5 8 20 6.5M14.5 12h6M14.5 16l5.5 1.5"/>',
    seat: '<path d="M8 3.5c-1 0-1.5.8-1.4 1.8l.9 8.2c.1 1 .9 1.5 1.9 1.5h6.1l2 5"/><path d="M9.5 15 8.5 20.5"/>',
    gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>',
    window: '<path d="M4 19V9l5-5h11v15z"/><path d="M4 13h16"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
} as const;

/**
 * An icon's name.
 */
export type IconName = keyof typeof icons;

/**
 * A battery outline filled to a share, for the Charging key.
 * @param share How full, 0 to 1.
 * @returns The icon's elements.
 */
export function batteryIcon(share: number): string {
    const width = Math.max(0.8, Math.min(1, share) * 13);
    return `<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M21.5 10.5v3"/><rect x="4" y="9" width="${width.toFixed(1)}" height="6" rx="1" fill="currentColor" stroke="none"/>`;
}
