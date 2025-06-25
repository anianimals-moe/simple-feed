This atproto feed server has two parts
- register.ts: Feed Registration
  - Registers the feed with the at-proto servers, updating its name, image, and description
- index.ts: Main code required to host the feed
  - Local SQLite database created by code
  - Looping Functions
    - updateLists: update members of lists by connecting to App Layer
    - pruneModeration: prune moderation data that is too old.
    - prunePosts: prune posts that are too old
    - pruneOrphans: prune likes/reposts not associated with a saved post
  - Jetstream: 
    - Connects to Jetstream websocket and downloads posts, likes, and reposts
    - Stores in SQLite and is pruned by looping function
  - LabelSubscription: 
    - Connects to the moderation firehose websocket and deletes post that get labelled (e.g. porn)
    - Because Jetstream currently still does not support 'com.atproto.label.subscribeLabels'
    - Directly deletes moderated posts from feeds, but may be processed faster than Jetstream, so stores in DB just in case
  - Web service with 4 GET routes
    - /xrpc/app.bsky.feed.describeFeedGenerator  : tells bluesky which feeds are hosted there
    - /xrpc/app.bsky.feed.getFeedSkeleton?feed={full_feed_id}  :  accessed by App layer to get feed posts
    - /.well-known/did.json   : comply with Well Known DID Configuration 
    - /{SECRET_PATH}/{feed_id}?d={post_url} : publicly accessible but secret route for you to delete posts from a feed manually


- @atproto/api: Official api, for basic queries (did, lists, feed registration) 
- @atproto/server: Official firehose client, for moderation labels
- better-sqlite3: Faster SQLite Local Database than node's
- nodejs http server: to respond to 3 main GET routes
- partysocket: Wrapper around nodejs websocket for convenience features like auto-reconnecting
- really-relaxed-json: for human written json without needing ' marks