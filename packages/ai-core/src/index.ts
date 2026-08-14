export type ModelRole = "small" | "general" | "security" | "reasoning" | "embedding";
export type ModelAlias = "vexonyx-small" | "vexonyx-general" | "vexonyx-security" | "vexonyx-reasoning" | "vexonyx-embedding";

export type AgentState =
  | "QUEUED"
  | "PLANNING"
  | "CONTEXT_LOADING"
  | "MODEL_RUNNING"
  | "TOOL_REQUESTED"
  | "SCOPE_VALIDATION"
  | "WAITING_FOR_APPROVAL"
  | "TOOL_RUNNING"
  | "OBSERVATION"
  | "VALIDATING"
  | "WAITING_FOR_USER"
  | "PAUSED_BUDGET_LIMIT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type RequestIdentity = {
  organizationId: string;
  userId: string;
  requestId: string;
  projectId?: string;
  engagementId?: string;
  conversationId?: string;
  agentRunId?: string;
};

export type GenerateInput = RequestIdentity & {
  role: ModelRole;
  prompt: string;
  maxOutputTokens: number;
  idempotencyKey: string;
  priority: 0 | 1 | 2 | 3 | 4;
};

export type GenerationChunk = {
  type: "state" | "text" | "usage" | "citation" | "error";
  state?: AgentState;
  text?: string;
  data?: Record<string, unknown>;
};

export interface InferenceProvider {
  generate(input: GenerateInput): Promise<string>;
  stream(input: GenerateInput): AsyncIterable<GenerationChunk>;
  health(): Promise<{ ok: boolean; detail?: string }>;
  embed?(texts: string[]): Promise<number[][]>;
}

export type QueueJobOptions = {
  priority: 0 | 1 | 2 | 3 | 4;
  idempotencyKey: string;
  maxAttempts?: number;
  availableAt?: string;
};

export type QueueClaim<T> = {
  jobId: string;
  queue: string;
  payload: T;
  attempt: number;
  leaseOwner: string;
  leaseGeneration: number;
  leaseExpiresAt: string;
};

export interface QueueProvider<T> {
  enqueue(queue: string, payload: T, options: QueueJobOptions): Promise<{ jobId: string }>;
  claim(queue: string, workerId: string, leaseSeconds: number): Promise<QueueClaim<T> | null>;
  renew(claim: QueueClaim<T>, leaseSeconds: number): Promise<QueueClaim<T>>;
  complete(claim: QueueClaim<T>, result?: Record<string, unknown>): Promise<void>;
  fail(claim: QueueClaim<T>, error: { code: string; message: string; retryable: boolean }): Promise<void>;
  cancel(jobId: string): Promise<void>;
}

export interface StorageProvider {
  createUpload(input: { organizationId: string; projectId?: string; path: string; contentType: string; size: number }): Promise<{ uploadUrl: string; objectPath: string }>;
  readPrivateObject(input: { objectPath: string; maxBytes: number }): Promise<Uint8Array>;
  remove(objectPath: string): Promise<void>;
}

export interface DatabaseProvider {
  transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}

export interface AuthProvider {
  getIdentity(request: Request): Promise<{ userId: string } | null>;
  requireOrganizationMembership(userId: string, organizationId: string): Promise<{ role: string }>;
}

export type Provenance = {
  sourceType: "user" | "project" | "file" | "file_chunk" | "repository" | "web" | "tool" | "memory" | "finding" | "note";
  sourceId: string;
  contentHash?: string;
  untrusted: boolean;
};

export type RetrievedContextItem = Provenance & {
  content: string;
  score?: number;
  chunkId?: string;
};

export type ContextEnvelope = RequestIdentity & {
  objective: string;
  trustedPolicy: string[];
  projectMetadata: Record<string, unknown>;
  retrievedUntrustedData: RetrievedContextItem[];
  toolObservations: RetrievedContextItem[];
  memory: RetrievedContextItem[];
  maxInputTokens: number;
  reservedOutputTokens: number;
};

export interface ContextBuilder {
  build(input: RequestIdentity & { objective: string; maxInputTokens: number; reservedOutputTokens: number }): Promise<ContextEnvelope>;
}

export type MemoryCandidate = Provenance & {
  organizationId: string;
  projectId?: string;
  userId?: string;
  scope: "session" | "conversation" | "project" | "user" | "organization";
  content: string;
  confidence: number;
  validationStatus: "candidate" | "validated" | "rejected" | "invalidated";
};

export interface MemoryProvider {
  search(input: RequestIdentity & { query: string; limit: number }): Promise<RetrievedContextItem[]>;
  writeCandidate(candidate: MemoryCandidate): Promise<{ memoryId: string }>;
  invalidateBySource(sourceType: string, sourceId: string): Promise<number>;
}

export type ToolDefinition = {
  name: string;
  version: string;
  category: string;
  inputSchemaVersion: string;
  requiredPermissions: string[];
  requiresProject: boolean;
  requiresScope: boolean;
  requiresApproval: boolean;
  executionEnvironment: "sandbox" | "worker" | "internal";
  timeoutSeconds: number;
  maxOutputBytes: number;
  costClass: "low" | "medium" | "high";
  enabled: boolean;
};

export type ToolRequest = RequestIdentity & {
  toolName: string;
  toolVersion: string;
  inputSchemaVersion: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
};

export type ScopeDecision = {
  allowed: boolean;
  reason: string;
  normalizedTarget?: string;
  authorizationId?: string;
  approvalRequestId?: string;
};

export interface ScopeProvider {
  authorizeToolRequest(request: ToolRequest): Promise<ScopeDecision>;
}

export type UsageEvent = RequestIdentity & {
  metric: string;
  quantity: number;
  cost: number;
  occurredAt: string;
  metadata?: Record<string, unknown>;
};

export interface UsageProvider {
  record(event: UsageEvent): Promise<void>;
}
