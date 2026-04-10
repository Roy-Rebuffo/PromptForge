import type { DiagnosisResult } from '../types';
import { ScoreBar } from './ScoreBar';

interface DiagnosisPanelProps {
  diagnosis: DiagnosisResult;
  isImproving: boolean;
  onImproveRequest: (targetDim?: string) => void;
  improveError?: string;
}

const OVERALL_COLOR = (score: number) => {
  if (score >= 8) { return '#1D9E75'; }
  if (score >= 6) { return '#BA7517'; }
  return '#E24B4A';
};

export function DiagnosisPanel({ diagnosis, isImproving, onImproveRequest, improveError }: DiagnosisPanelProps) {
  const color = OVERALL_COLOR(diagnosis.overall);

  return (
    <div style={{ padding: '16px' }}>

      {/* File name header */}
      <div style={{
        fontSize: 11,
        color: 'var(--vscode-descriptionForeground)',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          background: 'var(--vscode-badge-background)',
          color: 'var(--vscode-badge-foreground)',
          padding: '2px 8px',
          borderRadius: 99,
          fontFamily: 'var(--vscode-editor-font-family)',
        }}>
          {diagnosis.file_name}.prompt
        </span>
        <span>being evaluated</span>
      </div>

      {/* Overall score */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
        padding: 12,
        background: 'var(--vscode-editor-background)',
        border: `1px solid ${color}`,
        borderRadius: 8,
      }}>
        <div style={{ fontSize: 36, fontWeight: 700, color, lineHeight: 1 }}>
          {diagnosis.overall.toFixed(1)}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--vscode-foreground)' }}>
            Overall score
          </div>
          <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 2 }}>
            {diagnosis.weak_dims.length === 0
              ? 'All dimensions passing'
              : `${diagnosis.weak_dims.length} weak dimension${diagnosis.weak_dims.length > 1 ? 's' : ''}: ${diagnosis.weak_dims.join(', ')}`
            }
          </div>
        </div>
      </div>

      {/* Dimension scores */}
      <div style={{ marginBottom: 16 }}>
        {Object.entries(diagnosis.dimensions).map(([dim, data]) => (
          <ScoreBar
            key={dim}
            dimension={dim}
            data={data}
            isWeak={diagnosis.weak_dims.includes(dim)}
            onImproveDimension={(d) => onImproveRequest(d)}
            isImproving={isImproving}
          />
        ))}
      </div>

      {/* Improve error message */}
      {improveError && (
        <div style={{
          fontSize: 11,
          color: '#E24B4A',
          padding: '6px 8px',
          background: 'rgba(226, 75, 74, 0.1)',
          border: '1px solid #E24B4A',
          borderRadius: 4,
          marginBottom: 8,
          lineHeight: 1.4,
        }}>
          {improveError}
        </div>
      )}

      {/* Performing well message */}
      {diagnosis.overall >= 8 && (
        <div style={{
          textAlign: 'center',
          fontSize: 11,
          color: '#1D9E75',
          padding: '4px 0 8px',
        }}>
          Prompt is performing well — keep iterating to reach 10
        </div>
      )}

      {/* Always visible suggest improvement button */}
      <button
        onClick={() => onImproveRequest()}
        disabled={isImproving}
        style={{
          width: '100%',
          padding: '8px 0',
          background: isImproving ? 'var(--vscode-panel-border)' : 'var(--vscode-button-background)',
          color: 'var(--vscode-button-foreground)',
          border: 'none',
          borderRadius: 4,
          fontSize: 13,
          cursor: isImproving ? 'not-allowed' : 'pointer',
          fontWeight: 500,
        }}
      >
        {isImproving ? 'Generating improvement...' : 'Suggest improvement'}
      </button>
    </div>
  );
}