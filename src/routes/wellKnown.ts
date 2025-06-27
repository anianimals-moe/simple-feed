export default function wellKnown(res) {
    res.json({
        "@context": ["https://www.w3.org/ns/did/v1"],
        "id": `did:web:${process.env.DOMAIN}`,
        "service": [
            {
                "id": "#bsky_fg",
                "type": "BskyFeedGenerator",
                "serviceEndpoint": `https://${process.env.DOMAIN}`
            }
        ]
    });
}