export function pruneOrphans(db) {
    const old = db.prepare('SELECT COUNT(*) AS count FROM ups').get().count;
    const info = db.prepare("DELETE FROM ups WHERE up_id IN (SELECT up_id FROM ups LEFT JOIN posts ON target=_id WHERE _id IS NULL)").run();
    console.log(`Ups has ${old} -> ${old-info.changes}(-${info.changes}) entries`);
}