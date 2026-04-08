import { useState } from 'react';
import type { DimensionDiagnosis } from '../types';

const DIMENSION_COLORS: Record<string, string> = {
  coherence: '#1D9E75',
  precision: '#7F77DD',
  tone: '#BA7517',
  safety: '#E24B4A',
  completeness: '#185FA5',
};

const DIMENSION_LABELS: Record<string, string> = {
  coherence: 'Coherence',
  precision: 'Precision',
  tone: 'Tone',
  safety: 'Safety',
  completeness: 'Completeness',
};

interface ScoreBarProps {
  dimension: string;
  data: DimensionDiagnosis;
  isWeak: boolean;
  onImproveDimension: (dim: string) => void;
  isImproving: boolean;
}

export function ScoreBar({ dimension, data, isWeak, onImproveDimension, isImproving }: ScoreBarProps) {
  const [expanded, setExpanded] = useState(false);
  const color = DIMENSION_COLORS[dimension] ?? '#888';
  const label = DIMENSION_LABELS[dimension] ?? dimension;
  const percentage = (data.score / 10) * 100;

  return (
    <div style={{
      marginBottom: 12,
      background: 'var(--vscode-editor-background)',
      border: `1px solid ${isWeak ? color : 'var(--vscode-panel-border)'}`,
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--vscode-foreground)',
          width: 80,
          flexShrink: 0,
        }}>
          {label}
        </span>

        <div style={{
          flex: 1,
          height: 6,
          background: 'var(--vscode-panel-border)',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${percentage}%`,
            height: '100%',
            background: color,
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }} />
        </div>

        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color,
          width: 32,
          textAlign: 'right',
          flexShrink: 0,
        }}>
          {data.score.toFixed(1)}
        </span>

        {isWeak && (
          <span style={{
            fontSize: 10,
            background: color,
            color: '#fff',
            padding: '1px 6px',
            borderRadius: 99,
            flexShrink: 0,
          }}>
            weak
          </span>
        )}

        <span style={{
          fontSize: 11,
          color: 'var(--vscode-descriptionForeground)',
          flexShrink: 0,
        }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded reasoning */}
      {expanded && (
        <div style={{
          padding: '0 12px 12px',
          borderTop: '1px solid var(--vscode-panel-border)',
        }}>
          <p style={{
            fontSize: 12,
            color: 'var(--vscode-foreground)',
            margin: '8px 0 6px',
            lineHeight: 1.5,
          }}>
            {data.reasoning}
          </p>

          {data.improvement_hint && (
            <p style={{
              fontSize: 11,
              color,
              margin: '0 0 10px',
              fontStyle: 'italic',
              lineHeight: 1.4,
            }}>
              Suggestion: {data.improvement_hint}
            </p>
          )}

          {/* Improve this dimension button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onImproveDimension(dimension);
            }}
            disabled={isImproving}
            style={{
              width: '100%',
              padding: '5px 0',
              background: 'transparent',
              color: isImproving ? 'var(--vscode-descriptionForeground)' : color,
              border: `1px solid ${isImproving ? 'var(--vscode-panel-border)' : color}`,
              borderRadius: 4,
              fontSize: 11,
              cursor: isImproving ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            {isImproving ? 'Generating...' : `Improve ${label}`}
          </button>
        </div>
      )}
    </div>
  );
}