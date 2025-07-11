import {publicAgent} from "../utils/publicAgent.ts";
import {SUPPORTED_CW_LABELS} from "../utils/constants.ts";

const MAX_QUERY_SIZE = 25;
const MAX_ATTEMPTS = 3;

const tryGetPosts = async (uris:string[], attempt= 1) => {
    try {
        const {data} = await publicAgent.getPosts({uris});
        return data.posts;
    } catch (e) {
        if (e.error === "InternalServerError") {
            if (uris.length <= 1) { return []; } // This is the buggy post
            // Use binary search to find the error
            const half = Math.ceil(uris.length / 2);
            const x = await tryGetPosts(uris.slice(0, half));
            const y = await tryGetPosts(uris.slice(half));

            return x.concat(y);
        }

        if (attempt <= MAX_ATTEMPTS) {
            return await tryGetPosts(uris, attempt + 1);
        } else {
            throw e;
        }
    }
}
export async function checkAncestorModeration(db, feeds:any[]) {
    const toModerate = db.prepare('SELECT rkey, _id, ancestor, checked FROM post_ancestor WHERE checked < 1').all();
    console.log("checkAncestorModeration", toModerate.length);
    const mapping = new Map<string, {_id:string, rkey:string, checked:number}[]>();
    const commands:any[] = [];
    for (const {rkey, _id, ancestor, checked} of toModerate) {
        const entries = mapping.get(ancestor) || [];
        entries.push({rkey, _id, checked});
        commands.push({t:"updateAncestor", rkey, _id, ancestor});
        mapping.set(ancestor, entries);
    }

    const allUris:string[] = Array.from(mapping.keys());
    const list = [...Array(Math.ceil(allUris.length / MAX_QUERY_SIZE))].map(_ => allUris.splice(0, MAX_QUERY_SIZE));

    const deletePost = db.prepare("DELETE FROM posts WHERE rkey=@rkey AND _id=@_id");
    const updateAncestor = db.prepare("UPDATE post_ancestor SET checked = 1 WHERE rkey=@rkey AND _id=@_id AND ancestor=@ancestor");
    const insertAncestor = db.prepare(`INSERT OR IGNORE INTO post_ancestor (rkey, _id, ancestor, checked) VALUES (@rkey, @_id, @ancestor, -1)`);

    for (const uris of list) {
        const posts = await tryGetPosts(uris); // Any uri that isn't retrieved is already deleted
        for (const {uri, labels, record:{embed}} of posts) {
            const feedsWithIds = mapping.get(uri);

            if (embed) {
                // Add quote as ancestor to check for moderation too!
                let quoteUri = "";
                switch (embed["$type"]) {
                    case "app.bsky.embed.recordWithMedia": { quoteUri = embed.record?.record?.uri; break; }
                    case "app.bsky.embed.record": { quoteUri = embed.record?.uri; break; }
                }
                if (quoteUri) {
                    feedsWithIds.forEach(({_id, rkey, checked}) => {
                        if (checked === 0) {
                            commands.push({t: "insertAncestor", rkey, _id, ancestor:quoteUri});
                        } // checked = -1 is root already, don't go deeper
                    });
                }
            }


            for (const {src, val, neg} of labels) {
                if (src !== "did:plc:ar7c4by46qjdydhdevvrndac" || neg) { continue; }

                for (const {_id, rkey} of feedsWithIds) {
                    const feed = feeds.find(x => x.shortName === rkey);
                    const labelsToReject = SUPPORTED_CW_LABELS.filter(x => !(feed.allowLabels || []).includes(x));
                    if (labelsToReject.some(x => x === val)) {
                        commands.push({t:"deletePost", rkey, _id});
                    }
                }
            }
        }
    }

    db.transaction((commands) => {
        for (const command of commands) {
            const {t, ...rest} = command;
            switch (t) {
                case "updateAncestor": { updateAncestor.run(rest); break; }
                case "deletePost": { deletePost.run(rest); break; }
                case "insertAncestor": { insertAncestor.run(rest); break; }
            }
        }
    })(commands);
}