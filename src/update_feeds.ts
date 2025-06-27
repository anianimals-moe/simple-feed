import dotenv from "dotenv";
import {getStoredData} from "./utils/getStoredData.ts";
import fs from "fs";

console.log("start");
dotenv.config();
await getStoredData();
const body = fs.readFileSync("feeds.json", {encoding:"utf8"});
const result = await fetch(`https://${process.env.DOMAIN}/${process.env.SECRET_PATH}/f/update_feeds`,{
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body
});

if(!result.ok) {
    console.log(result.status);
} else {
    const body = await result.json()
    console.log("ok", body);
}
//bskyfeeds.anianimals.moe
