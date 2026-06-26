import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// OpenNext Cloudflare adapter config. Caching defaults to in-Worker; for
// incremental cache / ISR back it with R2 or KV — see
// https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig();
