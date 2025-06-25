import {publicAgent} from "./publicAgent.ts";

const FEED_LIST_PATHS = [
    "allowList",
    "blockList",
    "everyList",
    "viewers"
];

export async function updateLists(feeds, db) {
    const listsMap = new Map<string, string[]>();
    const toDelete:any = [];

    for (const feed of feeds) {
        const {shortName} = feed;
        for (const path of FEED_LIST_PATHS) {
            const list = feed[`${path}Sync`];
            if (!list) { continue; }
            const old = feed[path] || [];
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
            if (path === "blockList") {
                justUpdated.filter(x => !old.find(y => x === y))
                    .forEach(author => toDelete.push({author, rkey:shortName}));
            }
        }
    }

    if (toDelete.length > 0) {
        const deleteBlocked = db.prepare('DELETE FROM posts WHERE author=@author AND rkey=@rkey)');
        const deleteMany = db.transaction((items) => items.forEach(item => deleteBlocked.run(item)));


        // Delete all posts in feed from newly blocked users
        deleteMany(toDelete);
        setTimeout(() => {
            // Do it again later because maybe potential concurrency issues (block author and insert post at same time)
            deleteMany(toDelete);
        }, 10000);
    }
}