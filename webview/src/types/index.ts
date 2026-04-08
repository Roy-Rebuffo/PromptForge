export interface DimensionDiagnosis {
  score: number;
  reasoning: string;
  improvement_hint: string;
}

export interface DiagnosisResult {
  version_id: number;
  prompt_content: string;
  file_name: string;
  dimensions: {
    coherence: DimensionDiagnosis;
    precision: DimensionDiagnosis;
    tone: DimensionDiagnosis;
    safety: DimensionDiagnosis;
    completeness: DimensionDiagnosis;
  };
  weak_dims: string[];
  overall: number;
  evaluated_at: number;
}

export interface PromptChange {
  line_before: string;
  line_after: string;
  dimension: string;
  explanation: string;
}

export interface ImprovementResult {
  improved_prompt: string;
  changes: PromptChange[];
  expected_score_delta: number;
  parent_version_id: number;
}

export type WebviewMessage =
  | { type: 'EVAL_COMPLETE'; payload: DiagnosisResult }
  | { type: 'IMPROVE_COMPLETE'; payload: ImprovementResult }
  | { type: 'IMPROVE_REQUEST'; payload: DiagnosisResult; target_dim?: string }
  | { type: 'APPLY_IMPROVEMENT'; payload: { content: string } }
  | { type: 'ERROR'; payload: { message: string } };

// VS Code API exposed to the Webview
export interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}