import dotenv from "dotenv";
import {getStoredData} from "utils/getStoredData.ts";
import fs from "fs";
import { resolve } from 'path'

dotenv.config();

const {feeds, agent} = await getStoredData();
const {did} = agent.session;

const images = fs.readdirSync(resolve(import.meta.dirname, '..'))
    .filter(x => [".jpg", ".jpeg", ".png"].find(y => x.endsWith(y)));

for (const feed of feeds) {
    const {shortName, displayName, description} = feed;

    const imagePath = images.find(x => x.startsWith(shortName));
    let encoding = "";
    let imageData:any;
    if (imagePath) {
        imageData = fs.readFileSync(imagePath, {encoding: 'base64'});

        if (imageData.startsWith("iVBORw0K")) {
            console.log("png");
            encoding = "image/png";
        } else if (imageData.startsWith("/9j/")) {
            console.log("jpg");
            encoding = "image/jpeg";
        } else {
            throw `${imagePath} is not a valid jpg, jpeg, or png. Use photo editing software to save correctly`;
        }
        imageData = Buffer.from(imageData, "base64");
    }

    let avatar = {};
    if (encoding) {
        const blobRes = await agent.com.atproto.repo.uploadBlob(imageData, {encoding});
        avatar = {avatar:blobRes.data.blob};
    }

    const record = {
        repo: did,
        collection: 'app.bsky.feed.generator',
        rkey:shortName,
        record: {
            did: `did:web:${process.env.DOMAIN}`,
            displayName,
            description,
            ...avatar,
            createdAt: new Date().toISOString(),
        },
    };

    await agent.com.atproto.repo.putRecord(record);
}
console.log("REGISTERED");