import fs from "fs";
import {AtpAgent} from "@atproto/api";
import {prepKeywords} from "./textAndKeywords.ts";
import {SUPPORTED_CW_LABELS} from "./constants.ts";

export async function getStoredData() {
    if (!process.env.DOMAIN) {
        throw "Missing DOMAIN entry in .env";
    }

    if (!process.env.SECRET_PATH) {
        throw "Missing SECRET PATH entry in .env";
    }
    if (process.env.SECRET_PATH.length < 300 || process.env.SECRET_PATH.length > 1000 || !/^[a-zA-Z0-9]+$/.test(process.env.SECRET_PATH)) {
        throw "SECRET PATH entry in .env must be between 300 and 1000 alphanumeric characters [a-zA-Z0-9]";
    }

    if (!fs.existsSync("feeds.json")) {
        throw "Missing feeds array in feeds.json";
    }

    let feedData:any = JSON.parse(fs.readFileSync("feeds.json", {encoding:"utf8"}));
    if (!Array.isArray(feedData) || feedData.length < 1) {
        throw "Missing feeds array in feeds.json";
    }

    const out:any[] = [];
    for (const group of feedData) {
        let {user:identifier, password, feeds} = group;
        if (!Array.isArray(feeds) || feeds.length < 1) {
            throw "Missing feeds array in feeds.json";
        }

        if (!identifier || !password) {
            throw "Missing user data in feeds.json";
        }

        const agent = new AtpAgent({ service: "https://bsky.social/" });
        await agent.login({identifier, password});

        if (!agent.session) {
            throw `Invalid user data for ${identifier} ${password}`;
        }

        feeds = feeds.map(feed => {
            let {keywords, keywordsQuote, mode, everyListBlockKeyword, shortName, sticky, displayName, description,
                blockList, blockListSync,
                allowList, allowListSync,
                everyList, everyListSync,
                viewers, viewersSync,
                pics, mustLabels, allowLabels, postLevels, keywordSetting,
                languages, sort, posts} = feed;
            // Set the at:// URI
            const uri = `at://${agent.session!.did}/app.bsky.feed.generator/${shortName}`;
            keywords = keywords = prepKeywords(keywords || []);
            keywordsQuote = prepKeywords(keywordsQuote || []);
            everyListBlockKeyword = prepKeywords(everyListBlockKeyword || []);
            blockList = blockList || [];
            allowList = allowList || [];
            everyList = everyList || [];
            mustLabels = mustLabels || [];
            allowLabels = allowLabels || SUPPORTED_CW_LABELS;
            languages = languages || [];
            sort = sort || "new";
            viewers = viewers || [];

            return { uri,
                keywords, keywordsQuote, mode, everyListBlockKeyword, shortName, sticky, displayName, description,
                blockList, blockListSync,
                allowList, allowListSync,
                everyList, everyListSync,
                pics, mustLabels, allowLabels, postLevels, keywordSetting,
                languages, sort, viewers, viewersSync, posts
            }
        });

        out.push({feeds, agent});
    }

    return out;
}
