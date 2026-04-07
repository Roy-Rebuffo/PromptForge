import os
import time
import json
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from schemas import DiagnosisResult, DimensionDiagnosis

load_dotenv()  # load .env at module level

JUDGE_SYSTEM = """You are a strict expert LLM prompt evaluator.
You will receive a prompt and must evaluate it across 5 dimensions.

STRICT INSTRUCTIONS:
1. Reason through each dimension separately before scoring.
2. Be HARSH and PRECISE — a vague or incomplete prompt must score low.
3. A prompt with no clear task, no context, or no actionable instruction scores 0-2 in coherence and precision.
4. Do NOT give benefit of the doubt — evaluate what is written, not what could be intended.
5. Return ONLY valid JSON — no markdown, no backticks, no preamble.

DIMENSIONS:
- coherence: Does the prompt contain a clear, actionable instruction that an LLM could execute without guessing? Vague phrases, incomplete sentences, or content without a clear task score 0-2.
- precision: Is the prompt specific enough to produce consistent, predictable outputs? Generic or ambiguous prompts score 0-3.
- tone: Is the tone appropriate and consistent for the declared context? Mismatched or undefined tone scores 3-5.
- safety: Is the prompt free from harmful, biased, or dangerous instructions? (10 = fully safe, 0 = explicitly harmful)
- completeness: Does the prompt include the three basic elements: (1) a clear task, (2) sufficient context, (3) expected output format? Missing all three scores 0-1. Each present element adds ~3 points.

SCORING GUIDE:
- 0-2: Completely inadequate — no clear purpose or dangerous
- 3-4: Poor — vague, incomplete, or missing key elements
- 5-6: Below average — some intent visible but major gaps
- 7-8: Good — clear intent with minor improvements possible
- 9-10: Excellent — specific, actionable, well-structured

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
  }},
  "completeness": {{
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

    llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0,
    api_key=os.environ.get("GROQ_API_KEY", ""),
    model_kwargs={"response_format": {"type": "json_object"}}
)

    chain = judge_prompt | llm

    response = chain.invoke({
        "context": context_label,
        "prompt_content": prompt_content
    })

    raw = response.content.strip()

    # Strip markdown backticks if the model adds them
    if raw.startswith("```"):
        lines = raw.split("\n")
        lines = [l for l in lines if not l.startswith("```")]
        raw = "\n".join(lines)
    raw = raw.strip()

    # Try to extract JSON if there's extra text around it
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start != -1 and end > start:
        raw = raw[start:end]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Last resort: use a more lenient parser
        import ast
        raw_fixed = raw.replace('\n', ' ').replace('\r', ' ')
        data = json.loads(raw_fixed)

    dimensions = {
        dim: DimensionDiagnosis(
            score=float(data[dim]["score"]),
            reasoning=str(data[dim]["reasoning"]),
            improvement_hint=str(data[dim]["improvement_hint"])
        )
        for dim in ["coherence", "precision", "tone", "safety", "completeness"]
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
        file_name=context_label,
        dimensions=dimensions,
        weak_dims=weak_dims,
        overall=overall,
        evaluated_at=int(time.time())
    )