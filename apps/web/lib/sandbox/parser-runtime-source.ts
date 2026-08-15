import "server-only";
import { createHash } from "node:crypto";
import { ISOLATED_PARSER_SOURCE } from "./parser-source";

// parser-source.ts uses String.raw so the reviewed Python source remains readable in TypeScript.
// Every Python escape is therefore represented as a doubled backslash and normalized once here.
export const ISOLATED_PARSER_RUNTIME_SOURCE = ISOLATED_PARSER_SOURCE.replaceAll("\\\\", "\\");
export const ISOLATED_PARSER_SOURCE_SHA256 = createHash("sha256").update(ISOLATED_PARSER_RUNTIME_SOURCE).digest("hex");
