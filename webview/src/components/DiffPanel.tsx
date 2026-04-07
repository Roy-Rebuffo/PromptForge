import type { ImprovementResult, VsCodeApi } from '../types';

const DIMENSION_COLORS: Record<string, string> = {
  coherence: '#1D9E75',
  precision: '#7F77DD',
  tone: '#BA7517',
  safety: '#E24B4A',
  completeness: '#185FA5',
};

interface DiffPanelProps {
  improvement: ImprovementResult;
  vscode: VsCodeApi;
  onDiscard: () => void;
}

export function DiffPanel({ improvement, vscode, onDiscard }: DiffPanelProps) {

  function handleApply() {
    vscode.postMessage({
      type: 'APPLY_IMPROVEMENT',
      payload: { content: improvement.improved_prompt },
    });
  }

  return (
    <div style={{ padding: '16px' }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--vscode-foreground)',
        }}>
          Suggested improvements
        </span>
        <span style={{
          fontSize: 12,
          color: '#1D9E75',
        }}>
          +{improvement.expected_score_delta.toFixed(1)} pts estimated
        </span>
      </div>

      {/* Changes list */}
      <div style={{ marginBottom: 16 }}>
        {improvement.changes.map((change, i) => {
          const color = DIMENSION_COLORS[change.dimension] ?? '#888';
          return (
            <div key={i} style={{
              marginBottom: 12,
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid var(--vscode-panel-border)',
            }}>
              {/* Before */}
              <div style={{
                padding: '6px 10px',
                background: 'rgba(226, 75, 74, 0.1)',
                fontFamily: 'var(--vscode-editor-font-family)',
                fontSize: 12,
                color: '#E24B4A',
                textDecoration: 'line-through',
                lineHeight: 1.5,
              }}>
                — {change.line_before}
              </div>

              {/* After */}
              <div style={{
                padding: '6px 10px',
                background: 'rgba(29, 158, 117, 0.1)',
                fontFamily: 'var(--vscode-editor-font-family)',
                fontSize: 12,
                color: '#1D9E75',
                lineHeight: 1.5,
              }}>
                + {change.line_after}
              </div>

              {/* Dimension tag + explanation */}
              <div style={{
                padding: '6px 10px',
                background: 'var(--vscode-editor-background)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <span style={{
                  fontSize: 10,
                  background: color,
                  color: '#fff',
                  padding: '1px 6px',
                  borderRadius: 99,
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  {change.dimension}
                </span>
                <span style={{
                  fontSize: 11,
                  color: 'var(--vscode-descriptionForeground)',
                  lineHeight: 1.4,
                }}>
                  {change.explanation}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Improved prompt preview */}
      <div style={{
        marginBottom: 16,
        padding: 10,
        background: 'var(--vscode-editor-background)',
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: 6,
      }}>
        <div style={{
          fontSize: 11,
          color: 'var(--vscode-descriptionForeground)',
          marginBottom: 6,
        }}>
          Full improved prompt
        </div>
        <pre style={{
          margin: 0,
          fontSize: 12,
          fontFamily: 'var(--vscode-editor-font-family)',
          color: 'var(--vscode-foreground)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.5,
        }}>
          {improvement.improved_prompt}
        </pre>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleApply}
          style={{
            flex: 2,
            padding: '8px 0',
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Apply in editor
        </button>
        <button
          onClick={onDiscard}
          style={{
            flex: 1,
            padding: '8px 0',
            background: 'transparent',
            color: 'var(--vscode-descriptionForeground)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: 4,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}