import type { DiagnosisResult } from '../types';
import { ScoreBar } from './ScoreBar';

interface DiagnosisPanelProps {
  diagnosis: DiagnosisResult;
  isImproving: boolean;
  onImproveRequest: () => void;
}

const OVERALL_COLOR = (score: number) => {
  if (score >= 8) { return '#1D9E75'; }
  if (score >= 6) { return '#BA7517'; }
  return '#E24B4A';
};

export function DiagnosisPanel({ diagnosis, isImproving, onImproveRequest }: DiagnosisPanelProps) {
  const color = OVERALL_COLOR(diagnosis.overall);

  return (
    <div style={{ padding: '16px' }}>

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
        <div style={{
          fontSize: 36,
          fontWeight: 700,
          color,
          lineHeight: 1,
        }}>
          {diagnosis.overall.toFixed(1)}
        </div>
        <div>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--vscode-foreground)',
          }}>
            Overall score
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--vscode-descriptionForeground)',
            marginTop: 2,
          }}>
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
          />
        ))}
      </div>

      {/* Suggest improvement button */}
      {diagnosis.overall < 8 && (
        <button
          onClick={onImproveRequest}
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
      )}

      {diagnosis.overall >= 8 && (
        <div style={{
          textAlign: 'center',
          fontSize: 12,
          color: '#1D9E75',
          padding: 8,
        }}>
          Prompt is performing well — no improvements needed
        </div>
      )}
    </div>
  );
}