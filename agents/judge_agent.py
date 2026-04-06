import os
import time
import json
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from schemas import DiagnosisResult, DimensionDiagnosis

load_dotenv()  # load .env at module level

JUDGE_SYSTEM = """You are an expert LLM prompt evaluator.
You will receive a prompt and must evaluate it across 4 dimensions.

STRICT INSTRUCTIONS:
1. Reason through each dimension separately before scoring.
2. For each dimension give a score from 0 to 10 and a concrete improvement hint.
3. Do NOT look at the overall score until all dimensions are complete.
4. Return ONLY valid JSON — no markdown, no backticks, no preamble.

DIMENSIONS:
- coherence: Does the prompt clearly communicate its intent to the model?
- precision: Is the prompt specific enough to avoid ambiguous outputs?
- tone: Is the tone appropriate for the declared context?
- safety: Is the prompt safe and free from harmful instructions? (10 = fully safe)

REQUIRED JSON FORMAT:
{{
  "coherence": {{
    "score": <0-10>,
    "reasoning": "<your reasoning>",
    "improvement_hint": "<concrete suggestion>"
  }},
  "precision": {{
    "score": <0-10>,
    "reasoning": "<your reasoning>",
    "improvement_hint": "<concrete suggestion>"
  }},
  "tone": {{
    "score": <0-10>,
    "reasoning": "<your reasoning>",
    "improvement_hint": "<concrete suggestion>"
  }},
  "safety": {{
    "score": <0-10>,
    "reasoning": "<your reasoning>",
    "improvement_hint": "<concrete suggestion>"
  }}
}}"""

judge_prompt = ChatPromptTemplate.from_messages([
    ("system", JUDGE_SYSTEM),
    ("human", "Context: {context}\n\nPrompt to evaluate:\n{prompt_content}")
])


def evaluate_prompt(
    prompt_content: str,
    context_label: str,
    version_id: int
) -> DiagnosisResult:

    # Instantiate LLM inside function so .env is loaded first
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0,
        api_key=os.environ.get("GROQ_API_KEY", "")
    )

    chain = judge_prompt | llm

    response = chain.invoke({
        "context": context_label,
        "prompt_content": prompt_content
    })

    raw = response.content.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    data = json.loads(raw)

    dimensions = {
        dim: DimensionDiagnosis(
            score=data[dim]["score"],
            reasoning=data[dim]["reasoning"],
            improvement_hint=data[dim]["improvement_hint"]
        )
        for dim in ["coherence", "precision", "tone", "safety"]
    }

    overall = round(
        sum(d.score for d in dimensions.values()) / len(dimensions), 2
    )

    weak_dims = [
        dim for dim, d in dimensions.items() if d.score < 7
    ]

    return DiagnosisResult(
        version_id=version_id,
        prompt_content=prompt_content,
        dimensions=dimensions,
        weak_dims=weak_dims,
        overall=overall,
        evaluated_at=int(time.time())
    )