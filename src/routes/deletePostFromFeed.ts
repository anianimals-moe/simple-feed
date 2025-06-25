import {publicAgent} from "../utils/publicAgent.ts";//TEST

export default async function deletePostFromFeed(req, res, db, feeds) {
    // url = `/${process.env.SECRET_PATH}/${x.shortName}?d=https://bsky.app/profile/.../post/...`
    const split = req.url.split("/");
    if (split.length < 8) { return false; }
    const rkey = split[2].split("?d=")[0];
    const feed = feeds.find(x => x.shortName === rkey);
    if (!feed) { return false; }

    let actor = split[6];
    if (actor.startsWith("did:plc:")) {
        const {success, data} = await publicAgent.app.bsky.actor.getProfile({actor});
        if (!success || !data?.did) { return false; }
        actor = data.did;
    }

    const _id = `at://${actor}/app.bsky.feed.post/${split[8]}`;
    const stmt = db.prepare('DELETE FROM posts WHERE rkey=? AND _id=?');
    const info = stmt.run(rkey, _id);
    console.log(info.changes);

    const deleteUrl = req.url.split("=").slice(1).join("=");
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`${deleteUrl} deleted from feed ${rkey}`);
    return true;
}