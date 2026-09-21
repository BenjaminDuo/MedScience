import { ModelProvider } from '../client/ModelProvider.js';
import { ModelMessage, ModelRequest } from '../types/model.js';
import { SessionManager, globalSessionManager } from '../core/SessionManager.js';
import { EventBus, globalEventBus } from '../core/EventBus.js';
import { HookRegistry, globalHookRegistry } from '../hooks/HookRegistry.js';
import { HookContext } from '../hooks/types.js';
import { RuntimeSession, Turn } from '../types/runtime.js';

export interface ChatEngineOptions {
  modelProvider: ModelProvider;
  sessionManager?: SessionManager;
  eventBus?: EventBus;
  hookRegistry?: HookRegistry;
  /** How many prior turns of this session to include as conversation history. */
  historyTurns?: number;
}

/**
 * The lightweight counterpart to AutonomousResearchEngine, for sessions
 * created as sessionType: 'chat'. A plain conversational loop -- one model
 * call, no forced tool use, no PlanTracker checklist, no CritiqueEngine
 * evidence gate, no Stop-hook evidence-completeness check. Those exist to
 * keep MedScience's *research* output honest (grounded in real, verified
 * data); they have no business running against "你好" or "这个功能怎么用".
 *
 * Routing which engine a turn runs through happens once, at session
 * creation (see RuntimeSession.sessionType), not per-message -- see the
 * comment on that field for why per-message intent classification (a
 * model-emitted tag, or inferring from whether tools got called) was
 * dropped in favor of this.
 */
export class ChatEngine {
  private modelProvider: ModelProvider;
  private sessionManager: SessionManager;
  private eventBus: EventBus;
  private hookRegistry: HookRegistry;
  private historyTurns: number;

  constructor(options: ChatEngineOptions) {
    this.modelProvider = options.modelProvider;
    this.sessionManager = options.sessionManager || globalSessionManager;
    this.eventBus = options.eventBus || globalEventBus;
    this.hookRegistry = options.hookRegistry || globalHookRegistry;
    this.historyTurns = options.historyTurns ?? 12;
  }

  public setModelProvider(provider: ModelProvider): void {
    this.modelProvider = provider;
  }

  public getModelProvider(): ModelProvider {
    return this.modelProvider;
  }

  public async run(
    session: RuntimeSession,
    userInquiry: string,
    onDelta?: (chunk: string) => void
  ): Promise<Turn> {
    const sessionId = session.id;
    const turnIndex = session.turns.length + 1;

    const hookContext: HookContext = {
      sessionId,
      turnIndex,
      agentId: session.activeAgent || 'research',
      event: 'SessionStart',
      timestamp: new Date().toISOString(),
    };

    await this.hookRegistry.triggerSessionStart(hookContext, { session, userInquiry });

    this.sessionManager.updateSessionStatus(sessionId, 'thinking');

    this.eventBus.emit({
      type: 'agent.thinking',
      sessionId,
      timestamp: new Date().toISOString(),
      payload: { thought: 'Replying...', phase: 'Chat' },
    });

    const systemPrompt = `You are MedScience, a helpful research-lab assistant.
Reply naturally and concisely to the user's message. This is a plain conversation, not a formal research task:
do not fabricate citations, evidence tags, or a research plan, and do not claim to have run tools, queries, or
computations you did not actually run. If the user's question turns out to need real data, verified literature,
or computation to answer responsibly, say so plainly and suggest they start a new Research session for it,
rather than inventing an answer.`;

    const history: ModelMessage[] = session.turns.slice(-this.historyTurns).flatMap((t) => {
      const pair: ModelMessage[] = [{ role: 'user', content: t.userInput }];
      if (t.agentResponse) pair.push({ role: 'assistant', content: t.agentResponse });
      return pair;
    });

    const messages: ModelMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userInquiry },
    ];

    const modelRequest: ModelRequest = {
      model: session.activeModel || 'gpt-4o',
      messages,
    };

    // Same privacy gate the research loop applies before any external call --
    // content type doesn't change what must be redacted before leaving the app.
    const outboundHookRes = await this.hookRegistry.triggerPreToolUse(
      { ...hookContext, event: 'PreToolUse' },
      {
        toolName: 'model_provider_request',
        toolArguments: { messages: modelRequest.messages },
        isExternalApi: this.modelProvider.isExternal !== false,
      }
    );

    if (!outboundHookRes.proceed) {
      const blockedMessage = outboundHookRes.message || 'External model request blocked by privacy gate.';
      const blockedTurn: Turn = {
        index: turnIndex,
        userInput: userInquiry,
        toolCalls: [],
        toolResults: [],
        agentResponse: blockedMessage,
        status: 'cancelled',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      this.sessionManager.addTurn(sessionId, blockedTurn);
      this.sessionManager.updateSessionStatus(sessionId, 'cancelled');
      return blockedTurn;
    }

    const response = onDelta
      ? await this.modelProvider.stream(modelRequest, onDelta)
      : await this.modelProvider.generate(modelRequest);

    const completedTurn: Turn = {
      index: turnIndex,
      userInput: userInquiry,
      toolCalls: [],
      toolResults: [],
      agentResponse: response.content,
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    this.sessionManager.addTurn(sessionId, completedTurn);
    this.sessionManager.updateSessionStatus(sessionId, 'completed');

    return completedTurn;
  }
}
