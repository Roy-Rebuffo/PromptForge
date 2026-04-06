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

export interface PromptVersion {
  id: number;
  file_path: string;
  content: string;
  content_hash: string;
  message: string | null;
  parent_id: number | null;
  source: 'manual' | 'suggested';
  created_at: number;
}

export type WebviewMessage =
  | { type: 'START_EVAL'; payload: { versionId: number; content: string; filePath: string } }
  | { type: 'EVAL_COMPLETE'; payload: DiagnosisResult }
  | { type: 'IMPROVE_REQUEST'; payload: DiagnosisResult }
  | { type: 'IMPROVE_COMPLETE'; payload: ImprovementResult }
  | { type: 'APPLY_IMPROVEMENT'; payload: { content: string } }
  | { type: 'ERROR'; payload: { message: string } };