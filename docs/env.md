# Environment file

There is a `env.sample` file in the root folder, rename it to .env and update the values
The environmental values needed are described below

## Timezone

For convenience of logging, TZ identifier from https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

```sh
TIMEZONE=US/Pacific
```

## Domain

Domain without `https://`, You need to route http:localhost:3000 to https://domain

```sh
DOMAIN=example.com
```

## Credentials


The username and password are needed to register and update feed information.

The username is the email address you used to register with BlueSky.
The password is an app password that can be created in the [settings](https://bsky.app/settings/) page.

```sh
BLUESKY_USERNAME=demo@example.com
BLUESKY_PASSWORD=0000-1111-2222-3333
```

## Post retention

In milliseconds to keep posts for, minimum one hour (3600000), otherwise will keep indefinitely.

```sh
KEEP_POSTS_FOR=1209600000
```

## Secret path to use to delete posts

Case sensitive alphanumeric code [a-zA-Z0-9] 300-1000 characters length

Example: https://example.com/`path`/cats?d=https://bsky.app/profile/`user`/post/`xyz`

The above URL will delete the post user/xyz from the feed cats

```sh
SECRET_PATH=CH93xnp6iGIc81CZRhDUgd0aXwSXz8RO6WYGgQfidHyM9D1dBixXzsqmomau8YX6oIsre8KvhjoJ5oxoy2HJm9RE9DGcwUUCZqTRgRAggirt1LxlznnJWRc5BzNpv0XJ6F0JU1eRXK21Q7JfjSGyR3R1xuRPLN1YmLGOiyfHeRodcx4pibnKavJH1ENxUMOpr7YTretiL1ru9pAY37I3RyYMkSRc6GowHRX7K3ZuOwQWcpsOvF9vmZ6ZG6TEFriVBihViqvVLzBTvs4CyVClABsvkR4aqjC7Stap6mtgCHwdctpHJCOGS4UmMRtycXstcDrvaWaGjM2chRGYbBFD7pHUa7RoT6sD9yUJY8m3nxwNMKOjaw8JHSNNtUD9G1YenRWoRzruSxqsGLLu
```

## Optional: Port to listen on

Alternative port to use, default 3000 if empty

```sh
PORT=3000
```
