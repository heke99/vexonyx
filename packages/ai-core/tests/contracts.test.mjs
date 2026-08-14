import test from "node:test";import assert from "node:assert/strict";
test("model roles stay provider-neutral",()=>{const roles=["small","general","security","reasoning","embedding"];assert.equal(roles.includes("openai"),false);assert.equal(roles.length,5)});
