export function pruneModeration(db) {
    const now = Date.now();
    const earlier = now - 12*60*60*1000; // 12 hours
    const old = db.prepare('SELECT COUNT(*) AS count FROM moderation').get().count;
    const info = db.prepare('DELETE FROM moderation WHERE indexed_at < ?').run(earlier);
    console.log(`Moderation has ${old} -> ${old-info.changes}(-${info.changes}) entries`);
}