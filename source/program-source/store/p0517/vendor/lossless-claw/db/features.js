const featureCache = new WeakMap();
function probeVirtualTable(db, sql) {
    try {
        db.exec("DROP TABLE IF EXISTS temp.__lcm_virtual_table_probe");
        db.exec(sql);
        db.exec("DROP TABLE temp.__lcm_virtual_table_probe");
        return true;
    }
    catch {
        try {
            db.exec("DROP TABLE IF EXISTS temp.__lcm_virtual_table_probe");
        }
        catch {
            // Ignore cleanup failures after a failed probe.
        }
        return false;
    }
}
function probeFts5(db) {
    return probeVirtualTable(db, "CREATE VIRTUAL TABLE temp.__lcm_virtual_table_probe USING fts5(content)");
}
function probeTrigramTokenizer(db) {
    return probeVirtualTable(db, "CREATE VIRTUAL TABLE temp.__lcm_virtual_table_probe USING fts5(content, tokenize='trigram')");
}
/**
 * Detect SQLite features exposed by the current Node runtime.
 *
 * The result is cached per DatabaseSync handle because the probe is runtime-
 * specific, not database-file-specific.
 */
export function getLcmDbFeatures(db) {
    const cached = featureCache.get(db);
    if (cached) {
        return cached;
    }
    const detected = {
        fts5Available: probeFts5(db),
        trigramTokenizerAvailable: false,
    };
    if (detected.fts5Available) {
        detected.trigramTokenizerAvailable = probeTrigramTokenizer(db);
    }
    featureCache.set(db, detected);
    return detected;
}
