import fs from "fs";

export default function updateFeeds(req, res) {
    res.json({ok:1});
    fs.writeFileSync("feeds.json", JSON.stringify(req.body, null, 2), {encoding:"utf8"});
    process.exit();
}