import {publicAgent} from "../utils/publicAgent.ts";

export default async function getDidForUser(req, res) {
    // url = `/${process.env.SECRET_PATH}/user?u=https://bsky.app/profile/.../...`
    const {u} = req.query;
    if (!u) {res.status(404).end(); return; }
    let actor = u.split("/")[4];
    if (!actor.startsWith("did:plc:")) {
        const {success, data} = await publicAgent.app.bsky.actor.getProfile({actor});
        if (!success || !data?.did) { return false; }
        actor = data.did;
    }
    res.end(actor);
}