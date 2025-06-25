import {Subscription} from "@atproto/xrpc-server";
import Database from "better-sqlite3";
import {SUPPORTED_CW_LABELS} from "./constants.ts";//TEST
export class LabelSubscription {
    public sub: Subscription
    db: Database
    feeds:any[]
    constructor(db, feeds) {
        this.db = db;
        this.feeds = feeds;
        this.sub = new Subscription({
            service: 'wss://mod.bsky.app',
            method:'com.atproto.label.subscribeLabels',
            getParams: async () => {
                const result = this.db!.prepare('SELECT v FROM data WHERE _id = ?').get("sub_label") || {};
                console.log("label cursor",result);
                const cursor:any = parseInt(result.v);
                return !isNaN(cursor) && cursor > 0? {cursor} : {};
            },
            validate: (value: unknown) => {
                return value;
            },
        })
    }

    async run(subscriptionReconnectDelay: number = 3000) {
        try {
            const db = this.db!;
            const insertModeration = db.prepare('INSERT OR IGNORE INTO moderation(_id, v, indexed_at) VALUES (@_id, @v, @indexed_at)');
            const updateCursor = db.prepare('INSERT INTO data (_id, v) VALUES (@_id, @v) ON CONFLICT (_id) DO UPDATE SET v = @v');

            for await (const evt of this.sub) {
                const now = Date.now();
                const commands:any[] = [{t:"cursor", _id:"sub_label",v:evt.seq.toString()}];

                for (const label of evt.labels) {
                    const {src, uri, val, neg} = label;
                    /* Only OFFICIAL LABELS */
                    if (src !== "did:plc:ar7c4by46qjdydhdevvrndac" || neg) { continue; }
                    const parts = uri.split("/");
                    if (parts[3] !== "app.bsky.feed.post") { continue; }

                    for (const feed of this.feeds) {
                        const labelsToReject = SUPPORTED_CW_LABELS.filter(x => !(feed.allowLabels || []).includes(x));
                        const rejectThisLabel = labelsToReject.find(x => x === val);
                        if (rejectThisLabel) {
                            // check if db has entry and delete it immediately
                            const {changes} = db.prepare('DELETE FROM posts WHERE rkey=? AND _id=?').run(feed.shortName, uri);
                            if (changes > 0) { continue; } // deleted, don't need this again
                            commands.push({t:"insert", _id:uri, v:val, indexed_at:now});
                            // if not, save entry to be deleted later
                        }
                    }
                }

                db.transaction((commands) => {
                    for (const command of commands) {
                        const {t, ...rest} = command;
                        switch (t) {
                            case "insert": { insertModeration.run(rest); break; }
                            case "cursor": { updateCursor.run(rest); break; }
                        }
                    }
                })(commands);
            }
        } catch (err) {
            console.error('cursor subscription errored', err)
            setTimeout(() => this.run(subscriptionReconnectDelay), subscriptionReconnectDelay)
        }
    }

}
