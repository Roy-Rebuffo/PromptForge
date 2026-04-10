interface ModelSelectorProps {
  models: string[];
  current: string;
  onSelect: (model: string) => void;
}

const MODEL_LABELS: Record<string, string> = {
  // Both dot and hyphen variants since VS Code may return either
  'copilot/claude-haiku-4-5': 'Claude Haiku 4.5',
  'copilot/claude-haiku-4.5': 'Claude Haiku 4.5',
  'copilot/claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'copilot/claude-sonnet-4.5': 'Claude Sonnet 4.5',
  'copilot/claude-sonnet-4': 'Claude Sonnet 4',
  'copilot/gpt-4o': 'GPT-4o',
  'copilot/gpt-4.1': 'GPT-4.1',
  'copilot/gpt-4-1': 'GPT-4.1',
  'copilot/gpt-5-mini': 'GPT-5 mini',
  'copilot/o3-mini': 'o3 mini',
  'copilot/gemini-2.0-flash': 'Gemini 2.0 Flash',
  'copilot/gemini-2-0-flash': 'Gemini 2.0 Flash',
  'groq/llama-3.3-70b-versatile': 'Groq Llama 3.3 70B',
};

function formatModelName(modelId: string): string {
  return MODEL_LABELS[modelId] ?? modelId.split('/').pop() ?? modelId;
}

export function ModelSelector({ models, current, onSelect }: ModelSelectorProps) {
  if (models.length === 0) { return null; }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 12px',
      borderBottom: '1px solid var(--vscode-panel-border)',
      background: 'var(--vscode-editor-background)',
    }}>
      <span style={{
        fontSize: 11,
        color: 'var(--vscode-descriptionForeground)',
        flexShrink: 0,
      }}>
        Model:
      </span>
      <select
        value={current}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          flex: 1,
          fontSize: 11,
          background: 'var(--vscode-dropdown-background)',
          color: 'var(--vscode-dropdown-foreground)',
          border: '1px solid var(--vscode-dropdown-border)',
          borderRadius: 4,
          padding: '2px 6px',
          cursor: 'pointer',
        }}
      >
        {models.map(m => (
          <option key={m} value={m}>
            {formatModelName(m)}
          </option>
        ))}
      </select>
    </div>
  );
}