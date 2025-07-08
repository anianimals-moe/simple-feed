import {updateNow} from "../utils/initDb.ts";
import {randomInt} from "crypto";
import {SUPPORTED_CW_LABELS} from "../utils/constants.ts";

export default function getFeedSkeleton(req, res, db, feeds) {
    const {feed:feedId, cursor:queryCursor, limit:_limit=50} = req.query;
    const feedObj = feeds.find(x => x.uri === feedId);
    if (!feedObj) { res.status(404).end('Not Found'); return; }

    let limit = parseInt(_limit as string);
    if (isNaN(limit) || limit > 100) { res.status(404).end('Not Found'); return; }

    const user = getUser(req);
    if (feedObj.viewers.length > 0 && !feedObj.viewers.find(x => x === user)) {
        res.status(401).json({
            feed:[], cursor:"",
            error: "Private Feed",
            message:"The feed owner has restricted access to this feed, contact them to view it"
        });
        return;
    }

    let cursor:string;
    let feed:any[];

    let {mode, sticky} = feedObj;
    if (mode === "user-likes" || mode === "user-posts") {
        let start = 0;
        if (queryCursor) {
            const v = parseInt(queryCursor as string);
            if (!isNaN(v)) { start = v; }
        }
        const _limit = start === 0 && sticky? limit - 1 : limit;

        feed = db.prepare("SELECT _id FROM posts WHERE rkey=? ORDER BY indexed_at DESC LIMIT ? OFFSET ?").all(feedObj.shortName, _limit, start);

        if (feed.length === 0) {
            if (start === 0 && sticky) {feed = [{post:sticky}];}
            cursor = "";
        } else {
            if (start === 0 && sticky) {
                feed.splice(1, 0, {post: sticky})
            }
            cursor = Math.min(start + limit, start + feed.length).toString();
            feed = feed.map(x => {return {post:x._id}});
        }
    } else if (mode === "posts") {
        let start = 0;
        if (queryCursor) {
            const v = parseInt(queryCursor as string);
            if (!isNaN(v)) { start = v; }
        }

        feed = feedObj.posts.slice(start, limit).map(x => {return {post: x};});
        cursor = `${feed.length+start}`;
    } else {
        const {feed: feedV, cursor: cursorV} = liveFeedHandler (db, feedObj, queryCursor, limit);
        feed = feedV;
        cursor = cursorV;
    }

    res.json({feed, cursor});
}

function atob(base64) {
    const buffer = Buffer.from(base64, 'base64');
    return buffer.toString('binary');
}

function parseJwt (token)  {
    try {
        const base64Url = token.includes(".")? token.split('.')[1] : token;
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch {}
    return {};
}

function getUser (req) {
    const authorization = req.header("authorization");
    let user;
    if (authorization && authorization.startsWith("Bearer ")) {
        const {iss} = parseJwt(authorization.slice(7));
        if (iss) {
            user = iss;
        }
    }
    return user;
}

function liveFeedHandler(db, feedObj, queryCursor, limit) {
    let feed=[], cursor="";
    let {_id, sticky, sort} = feedObj;


    const sortLike = db.prepare(`
        WITH p AS (SELECT _id FROM posts WHERE rkey=?)
        SELECT _id, COUNT(up_id) FROM p LEFT JOIN ups ON target = _id WHERE is_like = 1 GROUP BY _id ORDER BY COUNT(up_id) DESC LIMIT ? OFFSET ?
    `);

    const sortUps = db.prepare(`
        WITH p AS (SELECT _id FROM posts WHERE rkey=?)
        SELECT _id, COUNT(up_id) FROM p LEFT JOIN ups ON target = _id GROUP BY _id ORDER BY COUNT(up_id) DESC LIMIT ? OFFSET ?
    `);

    // indexed_at is used to calculate score
    const sortSLike = db.prepare(`
        WITH p AS (SELECT _id, indexed_at FROM posts WHERE rkey=?)
        SELECT _id, CALC_SCORE(COUNT(up_id), indexed_at), COUNT(up_id) FROM p LEFT JOIN ups ON target = _id WHERE is_like = 1 GROUP BY _id ORDER BY CALC_SCORE(COUNT(up_id), indexed_at) DESC LIMIT ? OFFSET ?
    `);
    const sortSUps = db.prepare(`
        WITH p AS (SELECT _id, indexed_at FROM posts WHERE rkey=?)
        SELECT _id, CALC_SCORE(COUNT(up_id), indexed_at), COUNT(up_id) FROM p LEFT JOIN ups ON target = _id GROUP BY _id ORDER BY CALC_SCORE(COUNT(up_id), indexed_at) DESC LIMIT ? OFFSET ?
    `);


    let result:any[] = [];
    try {
        if (sort === "new") {
            if (queryCursor) {
                let [_postId, tss] = queryCursor.split("::");
                const [userId, __postId] = _postId.split("/");
                const postId = `at://${userId}/app.bsky.feed.post/${__postId}`
                tss = parseInt(tss);
                if (isNaN(tss)) { tss = 0; }

                result = db.prepare("SELECT _id, indexed_at FROM posts WHERE rkey=? AND indexed_at < ? ORDER BY indexed_at DESC LIMIT ?").all(feedObj.shortName, tss, limit);
                if (result.length === 0) {
                    return {cursor, feed};
                }

                let index = result.findIndex(x => x._id === postId);
                if (index === -1) {
                    index = result.findIndex(x => x.indexed_at < tss);
                }
                if (index === -1) {
                    return {cursor, feed};
                }
                result = result.slice(index + 1, index + 1 + limit);
                const last = result.at(-1);
                if (last) {
                    try {
                        const ts = last.indexed_at;
                        const parts = last._id.split("/");
                        const id = `${parts[2]}/${parts[4]}`;
                        cursor = `${id}::${ts}`;
                    } catch (e) {
                        cursor = "";
                    }
                }
            } else {
                if (sticky) {
                    limit = limit - 1;
                }

                // If moderation is enabled, add a 1-minute buffer to wait for moderation to happen
                if (feedObj.allowLabels.length < SUPPORTED_CW_LABELS.length) {
                    result = db.prepare("SELECT _id, indexed_at FROM posts WHERE rkey=? AND indexed_at < ? ORDER BY indexed_at DESC LIMIT ?").all(feedObj.shortName, Date.now() - 60*1000, limit);
                } else {
                    result = db.prepare("SELECT _id, indexed_at FROM posts WHERE rkey=? ORDER BY indexed_at DESC LIMIT ?").all(feedObj.shortName, limit);
                }

                if (result.length === 0) {
                    feed = sticky ? [{post: sticky}] : [];
                    return {cursor, feed};
                }

                if (sticky) {
                    result = result.filter(x => x._id !== sticky);
                    result.splice(1, 0, {_id: sticky});
                }
                // return last item + timestamp
                const last = result.at(-1);
                if (last) {
                    const ts = last.indexed_at;
                    const parts = last._id.split("/");
                    const id = `${parts[2]}/${parts[4]}`;
                    cursor = `${id}::${ts}`;
                }
            }
        } else {
            updateNow(); // Update timestamp used in calculations
            const queryInt = parseInt(queryCursor);
            const skip = !isNaN(queryInt) && queryInt > 0? queryInt : 0;
            const {sort, shortName} = feedObj;

            switch (sort) {
                case "like": { result = sortLike.all(shortName, limit, skip); break; }
                case "sLike": { result = sortSLike.all(shortName, limit, skip); break; }
                case "ups": { result = sortUps.all(shortName, limit, skip); break; }
                case "sUps": { result = sortSUps.all(shortName, limit, skip); break; }
            }

            if (result.length === 0) {
                if (skip === 0) {
                    feed = sticky ? [{post: sticky}] : [];
                }
                return {cursor, feed};
            }

            if (skip === 0) {
                if (sticky) {
                    result = result.filter(x => x._id !== sticky);
                    result.splice(randomInt(0, 2),0, {_id: sticky});
                }
                cursor = `${limit}`;
            } else {
                cursor = `${result.length + skip}`;
            }
        }
    } catch (e) {
        console.error("feed failed to build", _id, e);
    }

    feed = result.map(x => {return {post: x._id};});
    return {feed, cursor};
}
