There is a env.sample file in the root folder, rename it to .env and update the values
The environmental values needed are described below

// For convenience of logging, TZ identifier from https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
TIMEZONE=US/Pacific     
// Domain without https:// , You need to route http:localhost:3000 to https://domain
DOMAIN=example.com      

// The username and password are needed to register/update feed information and to get you did:plc:
BLUESKY_USERNAME=demo@example.com       // account of the feed owner 
BLUESKY_PASSWORD=0000-1111-2222-3333    // feed owner's app-password created at https://bsky.app/settings/app-passwords

// Milliseconds to keep posts for, minimum one hour (3600000), otherwise will keep indefinitely
KEEP_POSTS_FOR=1209600000 

// Secret path to use to delete posts
// Case sensitive alphanumeric code [a-zA-Z0-9] 300-1000 characters length
// e.g. https://example.com/<path>/cats?d=https://bsky.app/profile/<user>/post/<xyz>
// will delete the post user/xyz from the feed cats
SECRET_PATH=CH93xnp6iGIc81CZRhDUgd0aXwSXz8RO6WYGgQfidHyM9D1dBixXzsqmomau8YX6oIsre8KvhjoJ5oxoy2HJm9RE9DGcwUUCZqTRgRAggirt1LxlznnJWRc5BzNpv0XJ6F0JU1eRXK21Q7JfjSGyR3R1xuRPLN1YmLGOiyfHeRodcx4pibnKavJH1ENxUMOpr7YTretiL1ru9pAY37I3RyYMkSRc6GowHRX7K3ZuOwQWcpsOvF9vmZ6ZG6TEFriVBihViqvVLzBTvs4CyVClABsvkR4aqjC7Stap6mtgCHwdctpHJCOGS4UmMRtycXstcDrvaWaGjM2chRGYbBFD7pHUa7RoT6sD9yUJY8m3nxwNMKOjaw8JHSNNtUD9G1YenRWoRzruSxqsGLLu

// (Optional) Alternative port to use, default 3000 if empty
PORT=3000