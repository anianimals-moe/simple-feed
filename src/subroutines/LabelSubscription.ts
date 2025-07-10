import {Subscription} from "@atproto/xrpc-server";
import Database from "better-sqlite3";
import {SUPPORTED_CW_LABELS} from "../utils/constants.ts";
export class LabelSubscription {
    public sub: Subscription
    db: Database
    feeds:any[]
    insertModeration:any
    deleteByModeration:any
    updateCursor:any
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
        });

        this.insertModeration = db.prepare('INSERT OR IGNORE INTO moderation(_id, v, indexed_at) VALUES (@_id, @v, @indexed_at)');
        this.updateCursor = db.prepare('INSERT INTO data (_id, v) VALUES (@_id, @v) ON CONFLICT (_id) DO UPDATE SET v = @v');

        this.deleteByModeration = db.prepare(`
            WITH p AS (SELECT _id FROM post_ancestor WHERE rkey=@rkey AND ancestor=@_id UNION SELECT @_id AS _id)
            DELETE FROM posts WHERE (rkey, _id) IN (SELECT @rkey AS rkey, _id FROM p)
        `);
    }

    async run(subscriptionReconnectDelay: number = 3000) {
        try {
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
                            this.deleteByModeration.run({rkey:feed.shortName, _id:uri});
                            commands.push({t:"insert", _id:uri, v:val, indexed_at:now});
                            // save entry to be deleted later
                        }
                    }
                }

                this.db!.transaction((commands) => {
                    for (const command of commands) {
                        const {t, ...rest} = command;
                        switch (t) {
                            case "insert": { this.insertModeration.run(rest); break; }
                            case "cursor": { this.updateCursor.run(rest); break; }
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
