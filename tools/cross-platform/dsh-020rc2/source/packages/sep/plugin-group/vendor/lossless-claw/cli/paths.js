import { homedir as defaultHomedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
// Accept only non-empty string path candidates.
function nonEmptyString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
// Resolve OpenClaw's home override before deriving state defaults or expanding tildes.
function resolveOpenClawHome(env, homedir) {
    const processHome = resolve(homedir());
    const configuredHome = nonEmptyString(env.OPENCLAW_HOME);
    if (!configuredHome) {
        return processHome;
    }
    if (configuredHome === "~") {
        return processHome;
    }
    if (configuredHome.startsWith("~/")) {
        return resolve(processHome, configuredHome.slice(2));
    }
    return isAbsolute(configuredHome) ? resolve(configuredHome) : resolve(configuredHome);
}
// Expand one user path and return the absolute process-facing path.
function resolveUserPath(value, home) {
    if (value === "~") {
        return home;
    }
    if (value.startsWith("~/")) {
        return resolve(home, value.slice(2));
    }
    return resolve(value);
}
/** Resolve the OpenClaw state, config, and LCM database paths for one CLI invocation. */
export function resolveCliPaths(input = {}) {
    const env = input.env ?? process.env;
    const overrides = input.overrides ?? {};
    const home = resolveOpenClawHome(env, input.homedir ?? defaultHomedir);
    // Resolve the state directory first because both remaining defaults derive from it.
    const openclawDirValue = nonEmptyString(overrides.openclawDir)
        ?? nonEmptyString(env.LCM_OPENCLAW_DIR)
        ?? nonEmptyString(env.OPENCLAW_STATE_DIR)
        ?? join(home, ".openclaw");
    const openclawDir = resolveUserPath(openclawDirValue, home);
    const configPathValue = nonEmptyString(overrides.configPath)
        ?? nonEmptyString(env.OPENCLAW_CONFIG_PATH)
        ?? join(openclawDir, "openclaw.json");
    const configPath = resolveUserPath(configPathValue, home);
    // Explicit and environment database paths override both supported plugin keys.
    const databasePathValue = nonEmptyString(overrides.databasePath)
        ?? nonEmptyString(env.LCM_DATABASE_PATH)
        ?? nonEmptyString(input.pluginConfig?.dbPath)
        ?? nonEmptyString(input.pluginConfig?.databasePath)
        ?? join(openclawDir, "lcm.db");
    return {
        openclawDir,
        configPath,
        databasePath: resolveUserPath(databasePathValue, home),
    };
}
