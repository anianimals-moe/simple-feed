Work in progress

Getting Started
- Have npm and yarn installed (not covered by this readme, sorry)
- Prepare feeds.json, which is a combination of output from blueskyfeeds.com backup json with all feeds combined in an array []
  - e.g. if only 1 feed, put a [ at the front and ] and the end and rename the json file to feed.json
- [Prepare the environment file](docs/env.md)
- On console, run yarn install to download /node_modules
- On console, run yarn register to register the feed to bluesky's app layer
- On console, run yarn dev, this will start all the servers and it will start storing posts for the feed and listening
- Route your port 3000 to your domain
- Test your code by trying out [the routes](docs/http.md)


Some other readmes
- [High Level Technical Architecture](docs/architecture.md)
- [Setting up the Environment file](docs/env.md)
- [HTTP routes](docs/http.md)