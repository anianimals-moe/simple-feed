export default function describeFeedGenerator(res, feeds) {
    res.json({
        did: `did:web:${process.env.DOMAIN}`,
        feeds: feeds.map(x => x.uri)
    });
}