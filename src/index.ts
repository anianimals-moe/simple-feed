import dotenv from 'dotenv';
import * as http from "http";
import describeFeedGenerator from "./routes/describeFeedGenerator.ts";//TEST
import getFeedSkeleton from "./routes/getFeedSkeleton.ts";//TEST
import deletePostFromFeed from "./routes/deletePostFromFeed.ts";//TEST
import {getStoredData} from "./utils/getStoredData.ts";//TEST
import {Jetstream} from "./utils/Jetstream.ts";//TEST
import {initDb} from "./utils/initDb.ts";//TEST
import {updateLists} from "./utils/updateLists.ts";//TEST
import {prunePosts} from "./utils/prunePosts.ts";//TEST
import {pruneModeration} from "./utils/pruneModeration.ts";//TEST
import {initConstants, KEEP_POSTS_FOR, SUPPORTED_CW_LABELS, PORT} from "./utils/constants.ts";//TEST
import {LabelSubscription} from "./utils/LabelSubscription.ts";//TEST
import {pruneOrphans} from "./utils/pruneOrphans.ts";//TEST
import wellKnown from "./routes/wellKnown.ts";//TEST

console.log("start");
dotenv.config();
initConstants();
const {feeds} = await getStoredData();
const db = initDb();

// Update lists every 7 minutes
await (async function loopUpdateLists() {
    await updateLists(feeds, db);
    setTimeout( async () => {
        await loopUpdateLists();
    }, 7*60*1000);
})();

let wantedCollections = [];
if (feeds.find(x => x.mode !== "posts")) {
    wantedCollections.push("app.bsky.feed.post");
}

if (feeds.find(feed => feed.sort !== 'new' || feed.mode === "user-likes")) {
    wantedCollections.push("app.bsky.feed.like");
}
if (feeds.find(feed => ["ups", "sUps"].find(y => feed.sort === y))) {
    wantedCollections.push("app.bsky.feed.repost");
}
const collectModeration = feeds.find(feed => feed.mustLabels.length > 0 || feed.allowLabels.length < SUPPORTED_CW_LABELS.length);

if (wantedCollections.length > 0) {
    const jetstream = new Jetstream({wantedCollections}, db, feeds);
    jetstream.run();
}

if (collectModeration) {
    const labelSubscription = new LabelSubscription(db, feeds);
    labelSubscription.run();
}

// Clear moderation
if (collectModeration) {
    (function loopPruneModeration() {
        pruneModeration(db);
        setTimeout( () => {
            loopPruneModeration();
        }, 29*60*1000);
    })();
}

// Clear posts
if (KEEP_POSTS_FOR > 0) {
    (function loopPrunePosts() {
        prunePosts(db);
        setTimeout( () => {
            loopPrunePosts();
        }, 31*60*1000);
    })();
}

(function loopPruneOrphans() {
    pruneOrphans(db);
    setTimeout( () => {
        loopPruneOrphans();
    }, 37*60*1000);
})();


const server = http.createServer(async (req, res) => {
    if (req.method === 'GET') {
        if (req.url!.startsWith('/xrpc/app.bsky.feed.getFeedSkeleton')) {
            getFeedSkeleton(req, res, db, feeds);
        } else if (req.url === '/xrpc/app.bsky.feed.describeFeedGenerator') {
            describeFeedGenerator(res, feeds);
        } else if (req.url!.startsWith(`/${process.env.SECRET_PATH}/`)) {
            if (!await deletePostFromFeed(req, res, db, feeds)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            }
        } else if (req.url === "/.well-known/did.json") {
            wellKnown(res);
        }else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
    }
});
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});