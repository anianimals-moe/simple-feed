import dotenv from 'dotenv';
import describeFeedGenerator from "./routes/describeFeedGenerator.ts";
import getFeedSkeleton from "./routes/getFeedSkeleton.ts";
import deletePostFromFeed from "./routes/deletePostFromFeed.ts";
import {getStoredData} from "./utils/getStoredData.ts";
import {Jetstream} from "./subroutines/Jetstream.ts";
import {initDb} from "./utils/initDb.ts";
import {updateLists} from "./subroutines/updateLists.ts";
import {prunePosts} from "./subroutines/prunePosts.ts";
import {pruneModeration} from "./subroutines/pruneModeration.ts";
import {initConstants, KEEP_POSTS_FOR, SUPPORTED_CW_LABELS, PORT} from "./utils/constants.ts";
import {LabelSubscription} from "./subroutines/LabelSubscription.ts";
import {pruneOrphans} from "./subroutines/pruneOrphans.ts";
import wellKnown from "./routes/wellKnown.ts";
import updateFeeds from "./routes/updateFeeds.ts";
import express from 'express'
import getDidForUser from "./routes/getDidForUser.ts";
import {checkAncestorModeration} from "./subroutines/checkAncestorModeration.ts";

(async () => {
    console.log("start");
    dotenv.config();
    initConstants();
    const feeds = (await getStoredData()).reduce((acc, x) => {
        acc.push(...x.feeds);
        return acc;
    }, []);
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
    const collectModeration = feeds.find(feed => feed.allowLabels.length < SUPPORTED_CW_LABELS.length);

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

    (function loopCheckAncestorModeration() {
        checkAncestorModeration(db, feeds).then(() => {
            setTimeout( () => {
                loopCheckAncestorModeration();
            }, 60*1000);
        });
    })();



    (function loopPruneOrphans() {
        pruneOrphans(db);
        setTimeout( () => {
            loopPruneOrphans();
        }, 37*60*1000);
    })();


    const app = express();
    app.use(express.json());
    app.get('/xrpc/app.bsky.feed.getFeedSkeleton', (req, res) => {
        getFeedSkeleton(req, res, db, feeds);
    });
    app.get('/xrpc/app.bsky.feed.describeFeedGenerator', (req, res) => {
        describeFeedGenerator(res, feeds);
    });
    app.get('/.well-known/did.json', (req, res) => {
        wellKnown(res);
    });

    app.get(`/${process.env.SECRET_PATH}/:rkey`, async (req, res) => {
        await deletePostFromFeed(req, res, db, feeds);
    });

    app.get(`/${process.env.SECRET_PATH}/f/user`, async (req, res) => {
        console.log("user", req.url);
        await getDidForUser(req, res);
    })

    app.post(`/${process.env.SECRET_PATH}/f/update_feeds`, (req, res) => {
        updateFeeds(req, res);
    });

    app.listen(3000);
})()
