import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
const LOSSLESS_PACKAGE_NAME = "@martian-engineering/lossless-claw";
const LOSSLESS_PACKAGE_SEGMENTS = ["@martian-engineering", "lossless-claw"];
/** Resolve the loader-provided source to its enclosing Lossless Claw package root. */
function normalizePackageRoot(sourcePath) {
    const absolutePath = resolve(sourcePath);
    if (!existsSync(absolutePath)) {
        return absolutePath;
    }
    try {
        const sourceDir = statSync(absolutePath).isDirectory() ? absolutePath : dirname(absolutePath);
        let currentDir = sourceDir;
        while (true) {
            if (readPackageCopy(currentDir, "active")) {
                return currentDir;
            }
            const parentDir = dirname(currentDir);
            if (parentDir === currentDir) {
                return sourceDir;
            }
            currentDir = parentDir;
        }
    }
    catch {
        return absolutePath;
    }
}
/** Read only a valid Lossless Claw manifest from a candidate package root. */
function readPackageCopy(packageRoot, kind) {
    const packagePath = join(packageRoot, "package.json");
    if (!existsSync(packagePath)) {
        return null;
    }
    try {
        const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
        return manifest.name === LOSSLESS_PACKAGE_NAME && typeof manifest.version === "string"
            ? { kind, path: packageRoot, version: manifest.version }
            : null;
    }
    catch {
        return null;
    }
}
/** Resolve generated-project package roots without recursively walking node_modules. */
function listGeneratedProjectRoots(stateDir) {
    const projectsRoot = join(stateDir, "npm", "projects");
    if (!existsSync(projectsRoot)) {
        return [];
    }
    try {
        return readdirSync(projectsRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => join(projectsRoot, entry.name, "node_modules", ...LOSSLESS_PACKAGE_SEGMENTS));
    }
    catch {
        return [];
    }
}
/** Prefer real paths for deduplication while retaining missing paths for reporting. */
function canonicalPath(path) {
    try {
        return realpathSync(path);
    }
    catch {
        return resolve(path);
    }
}
/** Scan the active package and OpenClaw's fixed live and generated-project install locations. */
export function scanLcmVersionCopies(params) {
    const activePath = normalizePackageRoot(params.activeSourcePath);
    const active = {
        kind: "active",
        path: activePath,
        version: params.activeVersion,
    };
    const activeCanonicalPath = canonicalPath(activePath);
    const candidates = [
        {
            kind: "live",
            path: join(params.stateDir, "node_modules", ...LOSSLESS_PACKAGE_SEGMENTS),
        },
        {
            kind: "live",
            path: join(params.stateDir, "extensions", "node_modules", ...LOSSLESS_PACKAGE_SEGMENTS),
        },
        ...listGeneratedProjectRoots(params.stateDir).map((path) => ({
            kind: "generated",
            path,
        })),
    ];
    const seen = new Set([activeCanonicalPath]);
    const shadows = [];
    for (const candidate of candidates) {
        const copy = readPackageCopy(candidate.path, candidate.kind);
        if (!copy) {
            continue;
        }
        const canonical = canonicalPath(copy.path);
        if (seen.has(canonical)) {
            continue;
        }
        seen.add(canonical);
        shadows.push(copy);
    }
    shadows.sort((left, right) => left.path.localeCompare(right.path));
    return {
        active,
        shadows,
        split: shadows.some((copy) => copy.version !== active.version),
    };
}
