import os
import json
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from schemas import DiagnosisResult, ImprovementResult, PromptChange

load_dotenv()

IMPROVEMENT_SYSTEM = """You are an expert prompt engineer specialised in surgical improvements.
Your only job is to improve prompts by fixing specific weak dimensions.

STRICT RULES:
1. Only modify the dimensions listed in weak_dims. Do NOT touch what is already working.
2. For each change, document which dimension it addresses and why it improves it.
3. Preserve all template variables like {variable} exactly as they are.
4. Add no more than 2-3 changes per weak dimension.
5. Return ONLY valid JSON — no markdown, no backticks, no preamble.

REQUIRED JSON FORMAT:
{
  "improved_prompt": "<the full rewritten prompt>",
  "changes": [
    {
      "line_before": "<original fragment>",
      "line_after": "<improved fragment>",
      "dimension": "<which weak dimension this fixes>",
      "explanation": "<why this change improves that dimension>"
    }
  ],
  "expected_score_delta": <estimated overall score improvement as float>
}"""

improvement_prompt = ChatPromptTemplate.from_messages([
    ("system", IMPROVEMENT_SYSTEM),
    ("human", """Original prompt:
{prompt_content}

Dimensions to improve (score < 7):
{weak_dims_detail}

Do NOT modify these dimensions (already scoring well):
{strong_dims}""")
])


def improve_prompt(diagnosis: DiagnosisResult) -> ImprovementResult:

    # Instantiate LLM inside function so .env is loaded first
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        api_key=os.environ.get("GROQ_API_KEY", "")
    )

    chain = improvement_prompt | llm

    weak_dims_detail = "\n".join([
        f"- {dim} (score {diagnosis.dimensions[dim].score}/10): "
        f"{diagnosis.dimensions[dim].improvement_hint}"
        for dim in diagnosis.weak_dims
    ])

    strong_dims = ", ".join([
        dim for dim in diagnosis.dimensions
        if dim not in diagnosis.weak_dims
    ]) or "none"

    response = chain.invoke({
        "prompt_content": diagnosis.prompt_content,
        "weak_dims_detail": weak_dims_detail,
        "strong_dims": strong_dims
    })

    raw = response.content.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    data = json.loads(raw)

    changes = [
        PromptChange(
            line_before=c["line_before"],
            line_after=c["line_after"],
            dimension=c["dimension"],
            explanation=c["explanation"]
        )
        for c in data.get("changes", [])
    ]

    return ImprovementResult(
        improved_prompt=data["improved_prompt"],
        changes=changes,
        expected_score_delta=float(data.get("expected_score_delta", 0.0)),
        parent_version_id=diagnosis.version_id
    )