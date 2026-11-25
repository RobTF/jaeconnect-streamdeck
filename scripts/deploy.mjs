// Copies the built plugin into Stream Deck's plugins folder and restarts it. `streamdeck link` makes a link instead,
// which Stream Deck cannot follow onto a Dev Drive (ReFS).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const uuid = "com.jaeconnect.streamdeck";
const source = path.resolve(`${uuid}.sdPlugin`);
const target = path.join(process.env.APPDATA ?? "", "Elgato", "StreamDeck", "Plugins", `${uuid}.sdPlugin`);

// Elgato's CLI, run by this Node rather than through npx and a shell.
const streamdeck = (...args) => [path.resolve("node_modules", "@elgato", "cli", "bin", "streamdeck.mjs"), ...args];

// The running plugin keeps its log open, so the copy goes over the installed one in place rather than replacing the
// folder; Node read bin/plugin.js when it started and holds nothing else. Stream Deck's "stop" cannot be relied on
// to end the process first.
const isLog = (file) => path.relative(target, file).split(path.sep)[0] === "logs";

if (!existsSync(path.join(source, "bin", "plugin.js"))) {
    console.error("Build the plugin first: npm run build");
    process.exit(1);
}

const isNew = !existsSync(target);
if (!isNew) {
    // Remove what the build no longer makes.
    for (const entry of readdirSync(target, { recursive: true, withFileTypes: true })) {
        const file = path.join(entry.parentPath, entry.name);
        if (entry.isFile() && !isLog(file) && !existsSync(path.join(source, path.relative(target, file)))) {
            rmSync(file);
        }
    }
}

cpSync(source, target, { recursive: true, force: true, filter: (file) => path.relative(source, file).split(path.sep)[0] !== "logs" });
console.log(`Copied the plugin to ${target}.`);

if (isNew) {
    console.log("First install: restart the Stream Deck app (quit it from the tray and start it again) so it finds the plugin.");
} else {
    const asked = new Date();
    execFileSync(process.execPath, streamdeck("restart", uuid), { stdio: "inherit" });
    warnIfRefused(asked);
}

// Stream Deck turns developer mode off now and then (after a reboot, say), and then ignores the restart while the
// CLI still reports success. Its own log says so; when it does, say what to do.
function warnIfRefused(since) {
    const logs = path.join(process.env.APPDATA ?? "", "Elgato", "StreamDeck", "logs");
    const latest = existsSync(logs)
        ? readdirSync(logs, { withFileTypes: true }).filter((x) => x.isFile()).map((x) => path.join(logs, x.name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
        : undefined;
    if (!latest) {
        return;
    }

    const refused = readFileSync(latest, "utf8")
        .split("\n")
        .filter((line) => line.includes("Feature only enabled in developer mode"))
        .some((line) => Date.parse(/"timestamp":"([^"]+)"/.exec(line)?.[1] ?? "") >= since.getTime() - 1_000);
    if (refused) {
        console.error("Stream Deck refused the restart: developer mode is off, so the plugin is still the old one.");
        console.error("Run `npx streamdeck dev`, then quit Stream Deck from the tray and start it again.");
        process.exitCode = 1;
    }
}
