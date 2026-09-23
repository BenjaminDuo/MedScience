import { AutonomousResearchEngine } from './AutonomousResearchEngine.js';
import { DEFAULT_AGENT_ID } from '../agents/agentPersona.js';
import { ChatEngine } from './ChatEngine.js';
import { SessionManager, globalSessionManager } from '../core/SessionManager.js';
import { EventBus, globalEventBus } from '../core/EventBus.js';
import { ModelProvider } from '../client/ModelProvider.js';
import { GenericModelClient } from '../client/GenericModelClient.js';
import { fallbackMockProvider } from '../client/ScientificMockProvider.js';
import { ProfileManager, globalProfileManager } from '../config/ProfileManager.js';
import { RuntimeSession, SessionType, Turn } from '../types/runtime.js';

export interface ResearchEngineOptions {
  profileManager?: ProfileManager;
  sessionManager?: SessionManager;
  eventBus?: EventBus;
}

export class ResearchEngine {
  private autonomousEngine: AutonomousResearchEngine;
  private chatEngine: ChatEngine;
  private profileManager: ProfileManager;
  private sessionManager: SessionManager;
  private eventBus: EventBus;

  constructor(options?: ResearchEngineOptions) {
    this.profileManager = options?.profileManager || globalProfileManager;
    this.sessionManager = options?.sessionManager || globalSessionManager;
    this.eventBus = options?.eventBus || globalEventBus;

    // At construction time (module load / app boot) there may not be a
    // usable profile yet -- e.g. before the user has opened Settings for
    // the first time. That must not crash app startup, so fall back to the
    // mock provider here ONLY as an inert placeholder: executeInquiry()
    // always re-resolves via updateProviderFromActiveProfile() before
    // running a real turn, which throws loudly at that point instead of
    // this placeholder ever actually answering a real question.
    let provider: ModelProvider;
    try {
      provider = this.resolveActiveProvider();
    } catch {
      provider = fallbackMockProvider;
    }
    this.autonomousEngine = new AutonomousResearchEngine({
      modelProvider: provider,
      sessionManager: this.sessionManager,
      eventBus: this.eventBus,
      maxTurns: 8,
    });
    this.chatEngine = new ChatEngine({
      modelProvider: provider,
      sessionManager: this.sessionManager,
      eventBus: this.eventBus,
    });
  }

  /**
   * Resolves the real, currently-active model. Throws rather than silently
   * degrading: this engine only ever runs under ExecutionRouter's 'api'
   * backend, and a user who has neither a working API profile (baseUrl +
   * model) nor a working Local Runtime (Codex CLI) profile must see a clear
   * error telling them to configure one -- never a fabricated "Demo Mode"
   * answer that looks like a real scientific result.
   */
  public resolveActiveProvider(): ModelProvider {
    const activeProfile = this.profileManager.getActiveProfile();
    if (activeProfile && activeProfile.baseUrl && activeProfile.model) {
      return new GenericModelClient(activeProfile);
    }
    throw new Error(
      'No usable model is configured. Open Settings -> Model & API and set a Base URL + Model, ' +
        'or switch the active execution profile to Local Runtime (Codex CLI) in Settings -> Execution Runtime.'
    );
  }

  /**
   * Re-resolves and swaps the live provider. Tolerant at this call site
   * only when invoked opportunistically (e.g. right after a profile save,
   * before any turn has actually been requested) -- executeInquiry() below
   * calls this too and does NOT swallow the error, so an actually
   * unconfigured setup still fails loudly the moment a turn is requested.
   */
  public updateProviderFromActiveProfile(): void {
    const provider = this.resolveActiveProvider();
    this.autonomousEngine.setModelProvider(provider);
    this.chatEngine.setModelProvider(provider);
  }

  public getModelProvider(): ModelProvider {
    return this.autonomousEngine.getModelProvider();
  }

  public async executeInquiry(
    inquiry: string,
    sessionId?: string,
    onDelta?: (chunk: string) => void,
    sessionType: SessionType = 'research',
    workspaceId: string = 'proj-1',
    researchProfileId: string = 'general',
    language: 'en' | 'zh' = 'en',
    agentId: string = DEFAULT_AGENT_ID
  ): Promise<{ session: RuntimeSession; turn: Turn }> {
    let session = sessionId ? this.sessionManager.getSession(sessionId) : undefined;
    if (!session) {
      const activeProfile = this.profileManager.getActiveProfile();
      session = this.sessionManager.createSession(
        inquiry.slice(0, 60),
        workspaceId,
        agentId,
        activeProfile?.id,
        activeProfile?.model,
        undefined,
        sessionType,
        researchProfileId
      );
    } else {
      const activeProfile = this.profileManager.getActiveProfile();
      if (activeProfile?.model) {
        session.activeModel = activeProfile.model;
      }
    }

    // Refresh model provider before running
    this.updateProviderFromActiveProfile();

    // sessionType is fixed at creation (see RuntimeSession.sessionType) --
    // an existing session always keeps routing through the engine it
    // started with, regardless of what this call was passed.
    const engine = session.sessionType === 'chat' ? this.chatEngine : this.autonomousEngine;
    const turn = await engine.run(session, inquiry, onDelta, language);
    return { session, turn };
  }
}

export const globalResearchEngine = new ResearchEngine();
