import Database from 'better-sqlite3';
import {GRAVITY} from "./constants.ts";

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
        // For cursors and other misc data
        "CREATE TABLE IF NOT EXISTS data ('_id' TEXT PRIMARY KEY NOT NULL, 'v' TEXT NOT NULL)",

        // like_id is use for user-likes feeds. expires is a boolean, indexed_at can be like's index time, not the post's time
        "CREATE TABLE IF NOT EXISTS posts ('rkey' TEXT NOT NULL, '_id' TEXT NOT NULL, 'author' TEXT NOT NULL, 'indexed_at' INTEGER NOT NULL, 'like_id' TEXT, 'expires' INTEGER NOT NULL, PRIMARY KEY (rkey, _id))",
        "CREATE INDEX IF NOT EXISTS posts_id ON posts (_id)",
        "CREATE INDEX IF NOT EXISTS posts_feed_author ON posts (author)",
        "CREATE INDEX IF NOT EXISTS posts_indexed_at ON posts (indexed_at)",
        "CREATE INDEX IF NOT EXISTS posts_expires_at ON posts (expires, indexed_at) WHERE expires = 1",
        "CREATE INDEX IF NOT EXISTS posts_like_id ON posts (like_id, rkey) WHERE like_id IS NOT NULL",

        // For Moderation, do not add a post to feed if its parent/root is NSFW, checked is boolean
        "CREATE TABLE IF NOT EXISTS post_ancestor ('rkey' TEXT NOT NULL, '_id' TEXT NOT NULL, 'ancestor' TEXT NOT NULL, 'checked' INTEGER NOT NULL, PRIMARY KEY(rkey, _id, ancestor), FOREIGN KEY (rkey, _id) REFERENCES posts(rkey, _id) ON DELETE CASCADE)",
        "CREATE INDEX IF NOT EXISTS post_ancestor_rkey_ancestor ON post_ancestor (rkey, ancestor)",
        "CREATE INDEX IF NOT EXISTS post_ancestor_checked ON post_ancestor (checked)",

        // For score-based feeds that use reposts/likes
        "CREATE TABLE IF NOT EXISTS ups ('up_id' TEXT PRIMARY KEY NOT NULL, 'target' TEXT NOT NULL, 'is_like' INTEGER NOT NULL)",
        "CREATE INDEX IF NOT EXISTS ups_target ON ups (target)",
        "CREATE INDEX IF NOT EXISTS ups_is_like ON ups (is_like)",

        // Because moderation is a separate stream, store separately
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