import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from schemas import DiagnosisResult, EvaluateRequest, ImprovementResult
from judge_agent import evaluate_prompt
from improvement_agent import improve_prompt

load_dotenv()

app = FastAPI(title="PromptForge Agents", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/evaluate", response_model=DiagnosisResult)
def evaluate(request: EvaluateRequest):
    try:
        result = evaluate_prompt(
            prompt_content=request.prompt_content,
            context_label=request.context_label,
            version_id=request.version_id
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/improve", response_model=ImprovementResult)
def improve(diagnosis: DiagnosisResult):
    try:
        result = improve_prompt(diagnosis)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))