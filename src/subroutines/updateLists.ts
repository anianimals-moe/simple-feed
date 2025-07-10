import {publicAgent} from "../utils/publicAgent.ts";
import fs from "fs";

const FEED_LIST_PATHS = [
    "allowList",
    "blockList",
    "everyList",
    "viewers"
];

export async function updateLists(feeds, db) {
    const listsMap = new Map<string, string[]>();
    let oldFeeds = [];
    try {
        const fileData = fs.readFileSync("feeds-old.json", {encoding:"utf8"});
        if (fileData) {
            oldFeeds = JSON.parse(fileData);
        } else {
            oldFeeds = [];
        }
    } catch (e) {
        console.error("Handle feeds-old.json", e);
        oldFeeds = [];
    }


    for (const feed of feeds) {
        for (const path of FEED_LIST_PATHS) {
            const list = feed[`${path}Sync`];
            if (!list) { continue; }
            let justUpdated = listsMap.get(list);
            if (!justUpdated) {
                let cursor:any = {};
                let attempt = 0;
                justUpdated = [];
                do {
                    try {
                        const {data} = await publicAgent.app.bsky.graph.getList({list, limit: 100, ...cursor});
                        const {cursor:newCursor, items} = data;
                        for (const item of items) {
                            justUpdated.push(item.subject.did);
                        }

                        if (!newCursor) {
                            cursor = null;
                        } else {
                            cursor = {cursor: newCursor};
                        }
                    } catch (e) {
                        if (e.status === 400 && e.error === "InvalidRequest") {
                            console.error("list not found ", list);
                            break;
                        } else {
                            console.error("list query error", list, e);
                        }
                        attempt++;
                        if (attempt > 3) {
                            throw e;
                        }
                    }
                } while (cursor);
                listsMap.set(list, justUpdated);
            }

            feed[path] = justUpdated;
        }
    }

    const toDelete = feeds.reduce((acc, feed) => {
        const {shortName} = feed;
        const oldFeed = oldFeeds.find(old => old.shortName === shortName);
        if (oldFeed) {
            const oldList = oldFeed.blockList || [];
            feed.blockList.filter(x => !oldList.find(y => y === x))
                .forEach(author => acc.push({author, rkey:shortName}));
        }
        return acc;
    }, []);

    // For comparison with next loop
    fs.writeFileSync("feeds-old.json", JSON.stringify(feeds.map(x => {return {shortName: x.shortName, blockList:x.blockList}}), null, 2), {encoding:"utf8"});

    if (toDelete.length > 0) {
        const deleteBlocked = db.prepare('DELETE FROM posts WHERE author=@author AND rkey=@rkey');
        const deleteMany = db.transaction((items) => items.forEach(item => deleteBlocked.run(item)));

        // Delete all posts in feed from newly blocked users
        deleteMany(toDelete);
        setTimeout(() => {
            // Do it again later because maybe potential concurrency issues (block author and insert post at same time)
            deleteMany(toDelete);
        }, 10000);
    }
}