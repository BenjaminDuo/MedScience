export type ProtocolType = 'openai-compatible' | 'anthropic-compatible' | 'custom';

export interface ModelProfile {
  id: string;
  name: string;
  protocol: ProtocolType;
  baseUrl: string;
  model: string;
  apiKey?: string;
  contextWindow?: number;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  toolCalling?: boolean;
  headers?: Record<string, string>;
  /** Overrides the default request/stream-stall timeout (ms) for this profile. Falls back to a 3-minute default when unset. */
  requestTimeoutMs?: number;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type TextContentPart = {
  type: 'text';
  text: string;
};

export type ImageContentPart = {
  type: 'image_url';
  image_url: {
    url: string; // http(s) URL or data:image/jpeg;base64,...
    detail?: 'low' | 'high' | 'auto';
  };
};

export type ModelContentPart = TextContentPart | ImageContentPart;

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ModelContentPart[];
  toolCallId?: string;
  name?: string;
  toolCalls?: ModelToolCall[];
}

export interface ModelToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ModelRequest {
  model: string;
  messages: ModelMessage[];
  tools?: any[];
  /**
   * 'auto' (default, omitted): the model may call a tool or answer in plain text.
   * 'required': the model must call *some* tool this turn (any of `tools`), but may pick which.
   * { name }: the model must call that specific tool this turn.
   * Providers that don't support forced tool choice silently ignore this; callers that rely on
   * a specific tool being called must still handle the "model replied with plain text" case.
   */
  toolChoice?: 'auto' | 'required' | { name: string };
  temperature?: number;
  maxTokens?: number;
}

export interface ModelResponse {
  content: string;
  toolCalls?: ModelToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  model?: string;
  error?: string;
}
