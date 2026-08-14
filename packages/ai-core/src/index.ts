export type ModelRole = "small" | "general" | "security" | "reasoning" | "embedding";
export type AgentState = "QUEUED"|"PLANNING"|"CONTEXT_LOADING"|"MODEL_RUNNING"|"TOOL_REQUESTED"|"SCOPE_VALIDATION"|"WAITING_FOR_APPROVAL"|"TOOL_RUNNING"|"OBSERVATION"|"VALIDATING"|"WAITING_FOR_USER"|"PAUSED_BUDGET_LIMIT"|"COMPLETED"|"FAILED"|"CANCELLED";
export type GenerateInput = { organizationId:string; userId:string; projectId?:string; role:ModelRole; prompt:string; maxOutputTokens:number; requestId:string };
export type GenerationChunk = { type:"state"|"text"|"usage"|"error"; state?:AgentState; text?:string; data?:Record<string,unknown> };
export interface InferenceProvider { generate(input:GenerateInput):Promise<string>; stream(input:GenerateInput):AsyncIterable<GenerationChunk>; health():Promise<{ok:boolean;detail?:string}>; embed?(texts:string[]):Promise<number[][]> }
export interface QueueProvider<T>{ enqueue(queue:string,payload:T,options:{priority:number;idempotencyKey:string}):Promise<{jobId:string}>; cancel(jobId:string):Promise<void> }
export interface StorageProvider { createUpload(input:{organizationId:string;path:string;contentType:string;size:number}):Promise<{uploadUrl:string;objectPath:string}>; remove(objectPath:string):Promise<void> }
