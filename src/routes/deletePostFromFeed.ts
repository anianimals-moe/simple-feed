import {publicAgent} from "../utils/publicAgent.ts";

export default async function deletePostFromFeed(req, res, db, feeds) {
    // url = `/${process.env.SECRET_PATH}/${x.shortName}?d=https://bsky.app/profile/.../post/...`
    const rkey = req.params.rkey;
    const feed = feeds.find(x => x.shortName === rkey);
    if (!feed) { res.status(404).end(); return; }

    let parts = req.query.d;
    if (!parts) { res.status(404).end(); return; }
    parts = parts.split("/");
    if (parts.length !== 7) { res.status(404).end(); return; }

    let actor = parts[4];
    if (!actor.startsWith("did:plc:")) {
        const {success, data} = await publicAgent.app.bsky.actor.getProfile({actor});
        if (!success || !data?.did) { return false; }
        actor = data.did;
    }

    const _id = `at://${actor}/app.bsky.feed.post/${parts[6]}`;
    const stmt = db.prepare('DELETE FROM posts WHERE rkey=? AND _id=?');
    const info = stmt.run(rkey, _id);

    const deleteUrl = req.url.split("=").slice(1).join("=");
    if (info.changes > 0) {
        res.end(`${deleteUrl} deleted from feed ${rkey}`);
    } else {
        res.end(`${deleteUrl} not found in feed ${rkey}`);
    }


}