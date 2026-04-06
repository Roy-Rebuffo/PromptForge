from pydantic import BaseModel, Field
from typing import List, Optional


class DimensionDiagnosis(BaseModel):
    score: float = Field(ge=0, le=10)
    reasoning: str
    improvement_hint: str


class DiagnosisResult(BaseModel):
    version_id: int
    prompt_content: str
    file_name: str = ""
    dimensions: dict[str, DimensionDiagnosis]
    weak_dims: List[str]
    overall: float
    evaluated_at: int


class EvaluateRequest(BaseModel):
    prompt_content: str
    context_label: str
    version_id: int


class PromptChange(BaseModel):
    line_before: str
    line_after: str
    dimension: str
    explanation: str


class ImprovementResult(BaseModel):
    improved_prompt: str
    changes: List[PromptChange]
    expected_score_delta: float
    parent_version_id: int