# PromptForge

**Evaluate, version and improve your LLM prompts — without leaving VS Code.**

PromptForge is a VS Code extension that brings a full prompt engineering workflow directly into your editor. Write a `.prompt` file, evaluate it with an AI judge powered by Groq, and get actionable improvement suggestions in seconds.

---

## Features

### AI-powered evaluation
Every `.prompt` file is evaluated across 5 dimensions by an LLM-as-judge:
- **Coherence** — does the prompt have a clear, actionable instruction?
- **Precision** — is it specific enough to produce consistent outputs?
- **Tone** — is the tone appropriate for the context?
- **Safety** — is the prompt free from harmful instructions?
- **Completeness** — does it include a task, context, and expected output format?

### Surgical improvement suggestions
When a dimension scores below 7, PromptForge generates a targeted rewrite that fixes only what's broken — leaving what already works untouched. Every change is explained and linked to the dimension it addresses.

### Version history
Every evaluation automatically saves a snapshot of your prompt. Browse the full version tree in the sidebar, compare versions, and restore any previous state with one click.

### Apply improvements in one click
Accept a suggested improvement directly into your editor. The document updates in place — ready for your next evaluation cycle.

---

## Requirements

PromptForge requires a Python agent server running locally. Before using the extension:

### 1. Clone the repository
```bash
git clone https://github.com/Roy-Rebuffo/PromptForge
cd PromptForge
```

### 2. Set up the Python environment
```bash
cd agents
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Add your Groq API key
Create a `.env` file inside the `agents/` folder:
GROQ_API_KEY=your_api_key_here

Get your free API key at [console.groq.com](https://console.groq.com).

### 4. Start the agent server {#server}
```bash
uvicorn main:app --port 5678 --reload
```

Or use the built-in command: `Ctrl+Shift+P` → `PromptForge: Start Agent Server`

---

## How to use

1. Create a file with the `.prompt` extension
2. Write your prompt — use `{variable}` for template placeholders
3. Press `Ctrl+Alt+E` or click the beaker icon in the editor title bar
4. Review the diagnosis in the PromptForge panel
5. Click **Suggest improvement** if any dimension scores below 7
6. Click **Apply in editor** to accept the suggestion

---

## Extension commands

| Command | Description |
|---|---|
| `PromptForge: Run Evaluation` | Evaluate the active `.prompt` file |
| `PromptForge: Start Agent Server` | Start the Python agent server |
| `PromptForge: Show Version` | Preview a version from the history |
| `PromptForge: Restore Version` | Restore a previous version to the editor |

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+E` | Run evaluation on the active `.prompt` file |

---

## Tech stack

- **Extension** — TypeScript + VS Code API
- **Agent server** — Python + FastAPI + LangChain
- **LLM** — Groq (llama-3.3-70b-versatile)
- **Storage** — SQLite via sql.js

---

## License

MIT