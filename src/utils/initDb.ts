import Database from 'better-sqlite3';
import {GRAVITY} from "./constants.ts";//TEST

let NOW = 0;
export function updateNow () {
    NOW = Date.now();
}

function getNow () {
    return NOW;
}

export function initDb ():Database {
    const db = new Database('database.db');
    db.pragma('journal_mode = WAL');
    [
        "CREATE TABLE IF NOT EXISTS data ('_id' TEXT PRIMARY KEY NOT NULL, 'v' TEXT NOT NULL)",

        "CREATE TABLE IF NOT EXISTS posts ('rkey' TEXT NOT NULL, '_id' TEXT NOT NULL, 'author' TEXT NOT NULL, 'indexed_at' INTEGER NOT NULL, 'like_id' TEXT, 'expires' INTEGER NOT NULL, PRIMARY KEY (rkey, _id))",
        "CREATE INDEX IF NOT EXISTS posts_id ON posts (_id)",
        "CREATE INDEX IF NOT EXISTS posts_feed_author ON posts (author)",
        "CREATE INDEX IF NOT EXISTS posts_indexed_at ON posts (indexed_at)",
        "CREATE INDEX IF NOT EXISTS posts_expires_at ON posts (expires, indexed_at) WHERE expires = 1",
        "CREATE INDEX IF NOT EXISTS posts_like_id ON posts (like_id, rkey) WHERE like_id IS NOT NULL",

        "CREATE TABLE IF NOT EXISTS ups ('up_id' TEXT PRIMARY KEY NOT NULL, 'target' TEXT NOT NULL, 'is_like' INTEGER NOT NULL)",
        "CREATE INDEX IF NOT EXISTS ups_target ON ups (target)",
        "CREATE INDEX IF NOT EXISTS ups_is_like ON ups (is_like)",

        "CREATE TABLE IF NOT EXISTS moderation ('_id' TEXT NOT NULL, 'v' TEXT NOT NULL, 'indexed_at' INTEGER NOT NULL, PRIMARY KEY (_id, v))",
        "CREATE INDEX IF NOT EXISTS moderation_id ON moderation (_id)",
        "CREATE INDEX IF NOT EXISTS moderation_indexed_at ON moderation (indexed_at)"
    ].forEach(sql => db.exec(sql));

    // Function used for scoring in SQLite. Use updateNow to set now
    db.function('CALC_SCORE', (ups, then) => {
        const hours = (getNow() - then) / 3600000;
        return (ups + 1) / Math.pow((hours + 2), GRAVITY);
    });

    return db;
}