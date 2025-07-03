# Work in progress

## Getting Started

- Have npm, yarn, and tsx installed globally (not covered by this readme, sorry), yes I know tsx has issues
- Prepare feeds.json, which is a combination of output from blueskyfeeds.com backup json with all feeds combined in an array []
  - e.g. if only 1 feed, put a [ at the front and ] and the end and rename the json file to feed.json
- [Prepare the environment file](docs/env.md)
- On console, run `yarn install` to download /node_modules
- On console, run `yarn register` to register the feed to Bluesky's app layer
- On console, run `yarn dev`, this will start all the servers and it will start storing posts for the feed and listening
- Test your code by trying out [the routes](docs/http.md)
- Route your port 3000 (or the port you have set in .env) to your domain, you can try use Cloudflare Tunnel (cloudflared) with a [cheap numeric xyz domain](https://www.reddit.com/r/homelab/comments/vtqg9m/psa_any_xyz_domain_of_the_format_69_digitsxyz_is/)
- Test your feed on Bluesky itself
- (Optional) Install pm2 and use it to automatically restart the server when errors occur, and to receive commands from /update_feeds that forces a restarnt
  - Note that some errors can cause infinite loops and this does not solve those
  - Especially useful for updating feeds.json in a Dockerized app from a local version of this app without making a new docker or ssh into existing
  - Start using `pm2 start ecosystem.config.cjs` instead of `yarn dev` to have pm2 handle restarting


Some other readmes
- [High Level Technical Architecture](docs/architecture.md)
- [Setting up the Environment file](docs/env.md)
- [HTTP routes](docs/http.md)
