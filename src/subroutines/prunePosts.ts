import {KEEP_POSTS_FOR} from "../utils/constants.ts";

export function prunePosts(db) {
    const now = Date.now();
    const earlier = now - KEEP_POSTS_FOR;
    const old = db.prepare('SELECT COUNT(1) AS count FROM posts').get().count;
    const info = db.prepare('DELETE FROM posts WHERE expires = 1 AND indexed_at < ?').run(earlier);
    console.log(`Posts has ${old} -> ${old-info.changes}(-${info.changes}) entries`);
    
    const feedCount = db.prepare('SELECT rkey, COUNT(_id) AS count FROM posts GROUP BY rkey').all();
    console.log(feedCount);
}