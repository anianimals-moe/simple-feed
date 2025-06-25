export default function wellKnown(res) {
    res.writeHead(401, { 'Content-Type': "application/json" });
    res.end(JSON.stringify({
        "@context": ["https://www.w3.org/ns/did/v1"],
        "id": `did:web:${process.env.DOMAIN}`,
        "service": [
            {
                "id": "#bsky_fg",
                "type": "BskyFeedGenerator",
                "serviceEndpoint": `https://${process.env.DOMAIN}`
            }
        ]
    }));
}