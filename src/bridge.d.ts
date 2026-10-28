export interface CodexStatus {
  available: boolean;
  connected: boolean;
  mode: 'live' | 'demo';
  pending?: boolean;
  reason?: string;
  account?: { type: string; email?: string; planType?: string };
}
export interface CodexModel {
  id: string;
  name: string;
  isDefault: boolean;
  defaultEffort?: string;
  efforts: string[];
}
export interface CodexEvent extends Partial<CodexStatus> {
  type: 'delta' | 'done' | 'error' | 'status';
  text?: string;
  threadId?: string;
  turnId?: string;
  status?: string;
}
export interface CodexTurnInput {
  text: string;
  style?: string;
  effort?: string;
  model?: string;
  threadId?: string;
}
declare global {
  interface Window {
    superCodex?: {
      platform: string;
      getStatus(): Promise<CodexStatus>;
      connect(): Promise<CodexStatus>;
      getModels(): Promise<CodexModel[]>;
      sendTurn(payload: CodexTurnInput): Promise<{ threadId: string; turnId: string; model: string; effort?: string }>;
      cancelTurn(payload: { threadId: string; turnId?: string }): Promise<{ cancelled: boolean }>;
      onEvent(callback: (event: CodexEvent) => void): () => void;
      windowAction(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
    };
  }
}
