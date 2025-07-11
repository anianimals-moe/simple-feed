export const SUPPORTED_CW_LABELS = ["nudity", "sexual", "porn", "graphic-media"];
export let GRAVITY = 1.8;
export let TIMEZONE:any = {};

export let KEEP_POSTS_FOR = -1;

export let PORT = 3000;

export function initConstants () {
    const envGravity = parseInt(process.env.GRAVITY);
    if (!isNaN(envGravity) && envGravity > 1) {
        GRAVITY = envGravity;
    }
    const tz = process.env.TIMEZONE;
    if (tz) {
        console.log("reading timezone", tz);
        TIMEZONE = {timeZone: tz as string};
    }

    const keepPostsMs = parseInt(process.env.KEEP_POSTS_FOR);
    if (!isNaN(keepPostsMs) && keepPostsMs > 60*60*1000) {
        KEEP_POSTS_FOR = keepPostsMs;
    }

    const port = parseInt(process.env.PORT);
    if (!isNaN(port) && port > 0) {
        PORT = port;
    }
}

