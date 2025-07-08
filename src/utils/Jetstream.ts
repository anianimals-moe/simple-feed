import {WebSocket} from "partysocket";
import Database from "better-sqlite3";
import {SUPPORTED_CW_LABELS, TIMEZONE} from "./constants.ts";
import {findKeyword, findKeywordIn} from "./textAndKeywords.ts";
import { eld } from 'eld';

const JETSTREAM_SERVERS = [
    "jetstream1.us-east.bsky.network",
    "jetstream2.us-east.bsky.network",
    "jetstream1.us-west.bsky.network",
    "jetstream2.us-west.bsky.network"
]

export class Jetstream {
    ws?: WebSocket;
    url: URL;
    db?:Database;
    feeds:any[];
    divergence:number;
    feedsWithLike:string[];
    feedsWithRepost:string[];
    tickMessage:string;

    constructor(options, db, feeds) {
        this.db = db;
        this.feeds = feeds;
        this.feedsWithLike = [];
        this.feedsWithRepost = [];

        feeds.filter(feed => feed.sort !== 'new' || feed.mode === "user-likes").forEach(feed => {
            this.feedsWithLike.push(feed.shortName);
        });
        feeds.filter(feed => ["ups", "sUps"].find(y => feed.sort === y)).forEach(feed => {
            this.feedsWithRepost.push(feed.shortName);
        });

        this.divergence = NaN;
        this.url = new URL(options.endpoint ?? `wss://${JETSTREAM_SERVERS[0]}/subscribe`); // TODO use other servers
        options.wantedCollections?.forEach((collection) => {
            this.url.searchParams.append("wantedCollections", collection);
        });
        options.wantedDids?.forEach((did) => {
            this.url.searchParams.append("wantedDids", did);
        });
        if (options.maxMessageSizeBytes) {
            this.url.searchParams.append("maxMessageSizeBytes", `${options.maxMessageSizeBytes}`);
        }

        setInterval(() => {
            if (this.tickMessage) {
                console.log(this.tickMessage);
                this.tickMessage = "";
            }
        }, 5*1000);
    }
    private createUrl() {
        const result = this.db!.prepare('SELECT v FROM data WHERE _id = ?').get("sub_jetstream") || {};
        console.log("jetstream cursor",result);
        const cursor:any = parseInt(result.v);
        if (!isNaN(cursor) && cursor > 0) {
            this.url.searchParams.set("cursor", cursor.toString());
        }
        return this.url.toString();
    }

    private checkList (conditions:{want:boolean, has:boolean}[]) {
        if (conditions.every(x => x.want)) {
            return true;
        }
        return conditions.some(x => x.want && x.has == x.want);
    }

    private additionalLangCheck (txt, feed, uri, lang) {
        if (feed.languages.length > 0) {
            const detect = eld.detect(txt);
            const scores = detect.getScores();
            const newLang = feed.languages.filter(ln => {
                if (!ln) {return false;}
                if (detect.language === ln) {return true;}
                const score = scores[ln];
                if (!score) {return false;}
                return score > 0.40;
            });

            if (!newLang.some(x => feed.languages.includes(x))) {
                return true;
            }
        }
        return false;
    }

    async run() {
        this.ws = new WebSocket(() => this.createUrl(), null); // TODO tune partysocket reconnection etc

        this.ws.onopen = () => {
            console.log("jetstream: connected");
        };
        this.ws.onclose = () => {
            console.log("jetstream: disconnected");
        }
        this.ws.onerror = ({ error }) => {
            console.error(error);
        }

        this.ws.onmessage = (data) => {
            const db = this.db!;
            const deleteLikedPost = db.prepare('DELETE FROM posts WHERE like_id=@like_id AND rkey=@rkey');
            const deletePost = db.prepare('DELETE FROM posts WHERE _id=@_id');
            const insertPost = db.prepare('INSERT OR IGNORE INTO posts (rkey, _id, author, indexed_at, like_id, expires) VALUES (@rkey, @_id, @author, @indexed_at, @like_id, @expires)');
            const updateCursor = db.prepare('INSERT INTO data (_id, v) VALUES (@_id, @v) ON CONFLICT (_id) DO UPDATE SET v = @v');
            const insertLike = db.prepare(`
                WITH cte(up_id, target, is_like) AS (VALUES (@_id, @target, 1))
                INSERT INTO ups (up_id, target, is_like)
                SELECT c.up_id, c.target, c.is_like
                FROM cte c
                WHERE EXISTS (SELECT 1 FROM posts m WHERE m._id = c.target AND m.rkey IN (${this.feedsWithLike.map(x => `'${x}'`).join(",")}))
            `);
            const deleteUp = db.prepare('DELETE FROM ups WHERE up_id=@_id');
            const insertRepost = db.prepare(`
                WITH cte(up_id, target, is_like) AS (VALUES (@_id, @target, 0))
                INSERT INTO ups (up_id, target, is_like)
                SELECT c.up_id, c.target, c.is_like
                FROM cte c
                WHERE EXISTS (SELECT 1 FROM posts m WHERE m._id = c.target AND m.rkey IN (${this.feedsWithRepost.map(x => `'${x}'`).join(",")}))
            `);

            try {
                let commands:any[] = [];
                const event = JSON.parse(data.data);

                const {v} = this.db!.prepare('SELECT v FROM data WHERE _id = ?').get("sub_jetstream") || {};
                let cursor = parseInt(v);
                if (isNaN(cursor)) {
                    cursor = 0;
                }

                if (event.time_us > cursor) {
                    cursor = event.time_us;
                    commands.push({t:"cursor", _id:"sub_jetstream", v:cursor.toString()});
                }

                if (event.kind !== "commit") { return; }

                let timestamps:number[] = [];
                const date = new Date();
                const nowTs = date.getTime();
                const author = event.did;

                if (event.commit.collection === "app.bsky.feed.post") {
                    switch (event.commit.operation) {
                        case "create": {
                            let {rkey, record} = event.commit;
                            if (rkey.length !== 13 || !/^[234567abcdefghijklmnopqrstuvwxyz]*$/.test(rkey)) { return; }

                            const thenTs = new Date(record.createdAt).getTime();
                            const diffTs = nowTs - thenTs;
                            if(diffTs > 43200000 // 12 hours past
                                ||
                                diffTs < -600000 // 10 min future
                            ) { return; }
                            timestamps.push(thenTs);

                            let embed:any = record.embed;
                            if (!!embed) {
                                const embedType = embed["$type"];
                                switch (embedType) {
                                    case "app.bsky.embed.recordWithMedia": {
                                        const quoteUri = embed.record?.record?.uri;

                                        const hasImages = !!embed.media?.images;
                                        const hasExternal = !!embed.external;
                                        const hasVideo = !!embed.media?.video;

                                        const imageAlt = embed.media?.images?.map(x => {return {alt: x.alt}});
                                        const externalUri = embed.external?.uri;
                                        const videoAlt = embed.media?.video?.alt;
                                        embed = {$type: embedType};
                                        if (quoteUri) { embed.record = { record: { uri: quoteUri } }; }
                                        if (hasImages) { embed.media = { images : imageAlt}; }
                                        if (hasExternal) { embed.external = {uri: externalUri}; }
                                        if (hasVideo) { embed.media = {video: {alt:videoAlt}}; }
                                        break;
                                    }
                                    case "app.bsky.embed.images": {
                                        embed = {$type: embedType, images: embed.images?.map(x => {return {alt: x.alt}}) || [] }; break;
                                    }
                                    case "app.bsky.embed.video": {
                                        embed = {$type: embedType, video: { alt: embed.video?.alt }}; break;
                                    }
                                    case "app.bsky.embed.record": {
                                        embed = {$type: embedType, record: {uri: embed.record?.uri}}; break;
                                    }
                                    case "app.bsky.embed.external": {
                                        embed = {$type: embedType, external: {uri: embed.external?.uri}}; break;
                                    }
                                }
                            }


                            const uri = `at://${author}/app.bsky.feed.post/${rkey}`;


                            let txt = record.text;
                            let tags:string[] = [];
                            let links:string[] = [];
                            if (Array.isArray(record.facets)) {
                                // @ts-ignore
                                record.facets.filter(x => Array.isArray(x.features) && x.features[0] &&
                                    x.features[0]["$type"] === "app.bsky.richtext.facet#tag").forEach(x => {
                                    const tag = x.features[0].tag as string;
                                    tags.push(tag);
                                });

                                let buffer = Buffer.from(record.text);
                                record.facets.filter(x => Array.isArray(x.features) && x.features[0] &&
                                    x.features[0]["$type"] === "app.bsky.richtext.facet#link").sort((a, b) => {
                                    return a.index.byteStart < b.index.byteStart ? 1 : -1;
                                }).forEach(x => {
                                    let parts: any = [];
                                    if (buffer) {
                                        parts.push(buffer.subarray(x.index.byteEnd, buffer.length));
                                        parts.push(buffer.subarray(0, x.index.byteStart));
                                        parts = parts.reverse();
                                    }

                                    buffer = Buffer.concat(parts);

                                    const url = x.features[0]["uri"];
                                    if (url) {
                                        // @ts-ignore
                                        links.push(url);
                                    }
                                });
                                txt = buffer.toString("utf8");
                            }

                            if (Array.isArray(record.tags)) {
                                (record.tags as string[]).forEach(x => tags.push(x));
                            }


                            let rootUri = record.reply?.root.uri;
                            let parentUri = record.reply?.parent.uri;

                            let hasPics = false;
                            let hasVideo = false;
                            let quoteUri:any = null;
                            let altTexts:string[]=[];

                            if (embed) {
                                switch (embed["$type"]) {
                                    case "app.bsky.embed.recordWithMedia": {
                                        quoteUri = embed.record?.record?.uri;
                                        const imagess = embed.media?.images;
                                        if (Array.isArray(imagess)) {
                                            hasPics = true;
                                            for (const image of imagess) {
                                                if (image.alt) {
                                                    altTexts.push(image.alt);
                                                }
                                            }
                                        }
                                        const external = embed.external?.uri;
                                        if (external) {
                                            links.push(external);
                                        }
                                        const video = embed.media?.video;
                                        if (video) {
                                            hasVideo = true;
                                            if (video.alt) {
                                                altTexts.push(video.alt);
                                            }
                                        }
                                        break;
                                    }
                                    case "app.bsky.embed.images": {
                                        if (Array.isArray(embed.images)) {
                                            hasPics = true;
                                            for (const image of embed.images) {
                                                if (image.alt) {
                                                    altTexts.push(image.alt);
                                                }
                                            }
                                        }
                                        break;
                                    }
                                    case "app.bsky.embed.video": {
                                        const video = embed.video;
                                        if (video) {
                                            hasVideo = true;
                                            if (video.alt) {
                                                altTexts.push(video.alt);
                                            }
                                        }
                                        break;
                                    }
                                    case "app.bsky.embed.record": {
                                        quoteUri = embed?.record?.uri;
                                        break;
                                    }
                                    case "app.bsky.embed.external": {
                                        links.push(embed?.external?.uri);
                                        break;
                                    }
                                }
                            }

                            let labels:string[] = [];
                            // @ts-ignore
                            if (record.labels?.$type === "com.atproto.label.defs#selfLabels" && Array.isArray(record.labels.values)) {
                                // @ts-ignore
                                labels = record.labels.values.reduce((acc, x) => {
                                    const {val} = x;
                                    if (typeof val === "string") {
                                        acc.push(val);
                                    }
                                    return acc;
                                }, labels);

                                // add labels from db
                                db.prepare('SELECT v from moderation WHERE _id=?').all(uri).forEach(x => labels.push(x.v));
                            }
                            const lang = (record.langs as string[] || [""]).map(x => x.split("-")[0]);


                            for (const feed of this.feeds) {
                                if (feed.mode === "live") {
                                    if (feed.blockList.includes(author)) { continue; }

                                    if (feed.allowList.length > 0 && !feed.allowList.includes(author)) { continue; }

                                    const wantPics = feed.pics.includes("pics");
                                    const wantText = feed.pics.includes("text");
                                    const wantVideo = feed.pics.includes("video");

                                    const checkMedia = this.checkList([
                                        {want: wantPics, has: hasPics},
                                        {want: wantVideo, has: hasVideo},
                                        {want: wantText, has: !(hasPics || hasVideo)}])
                                    if (!checkMedia) { continue; }

                                    if (hasPics || hasVideo) {
                                        let rejectedLabels = SUPPORTED_CW_LABELS.filter(x => !(feed.allowLabels || []).includes(x));
                                        if (labels.some(x => rejectedLabels.includes(x))) { continue; }
                                        if (Array.isArray(feed.mustLabels) && feed.mustLabels.length > 0 && !feed.mustLabels.some(x => labels.includes(x))) { continue; }
                                    }


                                    const wantTop = feed.postLevels.includes("top");
                                    const wantReply = feed.postLevels.includes("reply");

                                    const checkLevel = this.checkList([
                                        {want: wantTop, has: !rootUri},
                                        {want: wantReply, has: !!rootUri}])

                                    if (!checkLevel) { continue; }

                                    if (feed.everyList.length > 0 && feed.everyList.includes(author)) {
                                        // Everylist has separate block keywords
                                        let {everyListBlockKeyword, everyListBlockKeywordSetting} = feed;
                                        if (!everyListBlockKeyword.block.empty) {
                                            everyListBlockKeywordSetting = everyListBlockKeywordSetting || ["text"];
                                            if (everyListBlockKeywordSetting.includes("alt") &&
                                                altTexts.some(altText => findKeyword(altText, everyListBlockKeyword.block))) {
                                                continue;
                                            }

                                            if (everyListBlockKeywordSetting.includes("text") &&
                                                findKeyword(txt, everyListBlockKeyword.block, tags)) {
                                                continue;
                                            }

                                            if (everyListBlockKeywordSetting.includes("link") && links.length > 0 &&
                                                links.some(t => findKeyword(t, everyListBlockKeyword.block))) {
                                                continue;
                                            }
                                        }

                                        // Pass
                                        commands.push({t:"insertPost", rkey:feed.shortName, _id:uri, author, indexed_at:nowTs, like_id:null, expires:1});
                                        continue;
                                    }

                                    if (feed.languages.length > 0) {
                                        if (!lang.some(x => feed.languages.includes(x))) { continue; }
                                    }


                                    if (!feed.keywords.block.empty) {
                                        if (feed.keywordSetting.includes("alt") &&
                                            altTexts.some(altText => findKeyword(altText, feed.keywords.block))) {
                                            continue;
                                        }
                                        if (feed.keywordSetting.includes("text") &&
                                            findKeyword(txt, feed.keywords.block, tags)) {
                                            continue;
                                        }

                                        if (feed.keywordSetting.includes("link") && links.length > 0 &&
                                            links.some(t => findKeyword(t, feed.keywords.block))) {
                                            continue;
                                        }
                                    }

                                    if (!feed.keywords.search.empty) {
                                        const found = (feed.keywordSetting.includes("alt") && findKeywordIn(altTexts, feed.keywords.search)) ||
                                            (feed.keywordSetting.includes("text") && findKeyword(txt, feed.keywords.search, tags)) ||
                                            (feed.keywordSetting.includes("link") && links.length > 0 && findKeywordIn(links, feed.keywords.search));

                                        if (found) {
                                            if (this.additionalLangCheck (txt, feed, uri, lang)) { continue; }

                                            commands.push({t:"insertPost", rkey:feed.shortName, _id:uri, author, indexed_at:nowTs, like_id:null, expires:1});
                                            continue;
                                        }
                                    }

                                    // The post has a quote and has the keyword
                                    if (!feed.keywordsQuote.search.empty && quoteUri) {
                                        if (!feed.keywordsQuote.block.empty) {
                                            if (feed.keywordSetting.includes("alt") &&
                                                altTexts.some(altText => findKeyword(altText, feed.keywordsQuote.block))) {
                                                continue;
                                            }
                                            if (feed.keywordSetting.includes("text") &&
                                                findKeyword(record.text, feed.keywordsQuote.block, tags)) {
                                                continue;
                                            }

                                            if (feed.keywordSetting.includes("link") && links.length > 0 &&
                                                links.some(t => findKeyword(t, feed.keywordsQuote.block))) {
                                                continue;
                                            }
                                        }

                                        const found = (feed.keywordSetting.includes("alt") && findKeywordIn(altTexts, feed.keywordsQuote.search)) ||
                                            (feed.keywordSetting.includes("text") && findKeyword(txt, feed.keywordsQuote.search, tags)) ||
                                            (feed.keywordSetting.includes("link") && links.length > 0 && findKeywordIn(links, feed.keywordsQuote.search))

                                        if (found) {
                                            if (this.additionalLangCheck (txt, feed, uri, lang)) { continue; }

                                            commands.push({t:"insertPost", rkey:feed.shortName, _id:uri, author, indexed_at:nowTs, like_id:null, expires:1});
                                        }
                                    }
                                }

                                const quoteAuthor = quoteUri? quoteUri.split("/")[2] : "";
                                const parentAuthor = parentUri? parentUri.split("/")[2] : "";
                                const rootAuthor = rootUri? rootUri.split("/")[2] : "";

                                if (feed.mode === "responses") {
                                    let found:any = false;
                                    for (const did of feed.everyList) {
                                        if (did === quoteAuthor || did === parentAuthor || did === rootAuthor) {
                                            found = did;
                                            break;
                                        }
                                    }

                                    if (found) {
                                        commands.push({t:"insertPost", rkey:feed.shortName, _id:uri, author, indexed_at:nowTs, like_id:null, expires:1});
                                    }
                                }

                                if (feed.mode === "user-posts") {
                                    if (feed.allowList.includes(author)) {
                                        const wantPics = feed.pics.includes("pics");
                                        const wantText = feed.pics.includes("text");
                                        const wantVideo = feed.pics.includes("video");

                                        const checkMedia = this.checkList([
                                            {want: wantPics, has: hasPics},
                                            {want: wantVideo, has: hasVideo},
                                            {want: wantText, has: !(hasPics || hasVideo)}])

                                        if (!checkMedia) { continue; }

                                        const wantTop = feed.postLevels.includes("top");
                                        const wantReply = feed.postLevels.includes("reply");
                                        const checkLevel = this.checkList([
                                            {want: wantTop, has: !rootUri},
                                            {want: wantReply, has: !!rootUri}])

                                        if (!checkLevel) { continue; }

                                        if (!feed.keywords.block.empty) {
                                            if (feed.keywordSetting.includes("alt") &&
                                                altTexts.some(altText => findKeyword(altText, feed.keywords.block))) {
                                                continue;
                                            }
                                            if (feed.keywordSetting.includes("text") &&
                                                findKeyword(txt, feed.keywords.block, tags)) {
                                                continue;
                                            }

                                            if (feed.keywordSetting.includes("link") && links.length > 0 &&
                                                links.some(t => findKeyword(t, feed.keywords.block))) {
                                                continue;
                                            }
                                        }

                                        if (!feed.keywords.search.empty) {
                                            const found = (feed.keywordSetting.includes("alt") && altTexts.some(altText => findKeyword(altText, feed.keywords.search))) ||
                                                (feed.keywordSetting.includes("text") && findKeyword(txt, feed.keywords.search, tags)) ||
                                                (feed.keywordSetting.includes("link") && links.length > 0 && links.some(t => findKeyword(t, feed.keywords.search)));
                                            if (found) {
                                                commands.push({t:"insertPost", rkey:feed.shortName, _id:uri, author, indexed_at:nowTs, like_id:null, expires:0});
                                            }
                                        } else {
                                            commands.push({t:"insertPost", rkey:feed.shortName, _id:uri, author, indexed_at:nowTs, like_id:null, expires:0});
                                        }
                                    }
                                }
                            }

                            break;
                        }
                        case "delete": {
                            const uri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
                            commands.push({t:"deletePost", _id:uri});
                            break;
                        }
                    }

                    if (timestamps.length > 0 && commands.length > 1) {
                        timestamps.sort();
                        const median = timestamps[Math.floor(timestamps.length/2)];
                        const diff = nowTs - median;
                        const oldDiff = this.divergence;
                        this.divergence = diff;

                        const diffPrev = diff - oldDiff;

                        let ms = String(diff % 1000).padStart(3,"0");
                        let seconds = Math.floor(diff / 1000);
                        const hh = Math.floor(seconds / 3600) ;
                        seconds = seconds % 3600;
                        const mm = String(Math.floor(seconds / 60)).padStart(2,"0");
                        const ss = String(Math.floor(seconds % 60)).padStart(2,"0");

                        this.tickMessage = `[${cursor}] ${commands.length} ${new Date(median).toLocaleString("en-GB", TIMEZONE)} now:${date.toLocaleString("en-GB", TIMEZONE)} [${hh}:${mm}:${ss}.${ms}] ${diffPrev>0?"+":""}${diffPrev}`;
                    }
                } else if (event.commit.collection === "app.bsky.feed.like"){
                    switch (event.commit.operation) {
                        case "create": {
                            const _id = `${author}/${event.commit.rkey}`;
                            commands.push({t: "insertLike", _id, target: event.commit.record.subject.uri});

                            for (const feed of this.feeds) {
                                if (feed.mode !== "user-likes" || !feed.allowList.includes(author)) { continue; }
                                commands.push({t:"insertPost", rkey:feed.shortName, _id:event.commit.record.subject.uri, author, indexed_at:nowTs, like_id:_id, expires:0});
                            }

                            break;
                        }
                        case "delete": {
                            const _id = `${author}/${event.commit.rkey}`;
                            commands.push({t: "deleteUp", _id});
                            for (const feed of this.feeds) {
                                if (feed.mode !== "user-likes" || !feed.allowList.includes(author)) { continue; }
                                commands.push({t:"deleteLikedPost", like_id:_id, rkey: feed.shortName});
                            }
                            break;
                        }
                    }
                } else if (event.commit.collection === "app.bsky.feed.repost"){
                    switch (event.commit.operation) {
                        case "create": {
                            commands.push({
                                t: "insertRepost",
                                _id: `${author}/${event.commit.rkey}`,
                                target: event.commit.record.subject.uri
                            });
                            break;
                        }
                        case "delete": { commands.push({t: "deleteUp", _id: `${author}/${event.commit.rkey}`}); break; }
                    }
                }

                db.transaction((commands) => {
                    for (const command of commands) {
                        const {t, ...rest} = command;
                        switch (t) {
                            case "insertLike": { insertLike.run(rest); break; }
                            case "insertRepost": { insertRepost.run(rest); break; }
                            case "insertPost": { insertPost.run(rest); break; }
                            case "deleteUp": { deleteUp.run(rest); break; }
                            case "deletePost": { deletePost.run(rest); break; }
                            case "deleteLikedPost": { deleteLikedPost.run(rest); break; }
                            case "cursor": { updateCursor.run(rest); break; }
                        }
                    }
                })(commands);
            } catch (e) {
                console.error(e);
                throw e;
            }
        };
    }
}