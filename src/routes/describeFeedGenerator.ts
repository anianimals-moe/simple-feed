export default function describeFeedGenerator(res, feeds) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
        did: `did:web:${process.env.DOMAIN}`,
        feeds: feeds.map(x => x.uri)
    }));
}