import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(new URL(path,import.meta.url),"utf8");

test("Next config keeps beta login invite and auth routes reachable",()=>{
 const config=read("../next.config.ts");
 assert.match(config,/publicSignupRedirects/);
 assert.match(config,/"\/signup"/);
 assert.doesNotMatch(config,/waitlistRedirects/);
 assert.doesNotMatch(config,/source:\s*"\/login"/);
 assert.doesNotMatch(config,/source:\s*"\/invite\/|source:\s*"\/auth\//);
});

test("proxy protects app with login instead of waitlist",()=>{
 const proxy=read("../proxy.ts");
 assert.match(proxy,/path\.startsWith\("\/app"\).*!claims\?\.sub/s);
 assert.match(proxy,/url\.pathname = "\/login"/);
 assert.match(proxy,/path === "\/signup"/);
});
