When your code is running properly, you should be able to access the following routes 
If you have set the port to something other than 3000, please use that instead
- GET http://localhost:3000/xrpc/.well-known/did.json
  - Returns Well Known DID Configuration
- GET http://localhost:3000/xrpc/app.bsky.feed.describeFeedGenerator
  - Returns a list of feeds on your server
- GET http://localhost:3000/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://<user_did>/app.bsky.feed.generator/<feed_name>
  - Gets your feed

Additional route for you to use to delete posts from feeds, 
please keep the secret_path a secret or attackers will be able to attack the server:
- GET http://localhost:3000/<secret_path>/<feed_name>?d=https://bsky.app/profile/<user>/post/<post_id>
  - delete posts from your feeds
- GET http://localhost:3000/<secret_path>/f/user?u=https://bsky.app/profile/<user>...
  - get did from user
- POST http://localhost:3000/<secret_path>/f/update_feeds
  - For modifying docker Updates the feeds.json with a new feeds.json submitted in the post body. Use <yarn update-feeds> from a different machine to push its feeds.json to the domain's

Once your localhost port is exposed to the internet via your domain, test out by substituting https://domain.com instead of http://localhost:3000
