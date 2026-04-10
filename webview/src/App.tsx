import { useState, useEffect } from 'react';
import type { DiagnosisResult, ImprovementResult, VsCodeApi, WebviewMessage } from './types';
import { DiagnosisPanel } from './components/DiagnosisPanel';
import { DiffPanel } from './components/DiffPanel';
import { ModelSelector } from './components/ModelSelector';

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

type AppState = 'waiting' | 'diagnosed' | 'improving' | 'improved' | 'error' | 'eval_error';

export default function App() {
  const [state, setState] = useState<AppState>('waiting');
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [improvement, setImprovement] = useState<ImprovementResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [improveError, setImproveError] = useState<string>('');

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const message = event.data as WebviewMessage;

      switch (message.type) {
        case 'EVAL_COMPLETE':
          setDiagnosis(message.payload);
          setImprovement(null);
          setState('diagnosed');
          break;

        case 'IMPROVE_COMPLETE':
          setImprovement(message.payload);
          setState('improved');
          break;

        case 'MODELS_AVAILABLE':
          setAvailableModels(message.payload.models);
          setCurrentModel(message.payload.current);
          break;

        case 'ERROR':
          setErrorMessage(message.payload.message);
          setState('error');
          break;

        case 'EVAL_ERROR':
          setErrorMessage(message.payload.message);
          setState('eval_error');
          break;

        case 'IMPROVE_ERROR':
          setImproveError(message.payload.message);
          setState('diagnosed');
          break;
      }
    }

    window.addEventListener('message', handleMessage);

    // Notify the extension that the webview is ready to receive messages.
    // The extension queues any messages sent before this point and flushes them now.
    vscode.postMessage({ type: 'WEBVIEW_READY', payload: {} } as WebviewMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  function handleImproveRequest(targetDim?: string) {
    if (!diagnosis) { return; }
    setState('improving');
    setImproveError(''); // clear previous error
    vscode.postMessage({
      type: 'IMPROVE_REQUEST',
      payload: diagnosis,
      target_dim: targetDim,
    } as any);
  }

  function handleDiscard() {
    setState('diagnosed');
    setImprovement(null);
  }

  function handleModelSelect(modelName: string) {
    setCurrentModel(modelName);
    vscode.postMessage({
      type: 'SELECT_MODEL',
      payload: { modelName },
    } as WebviewMessage);
  }

  return (
    <div style={{
      fontFamily: 'var(--vscode-font-family)',
      color: 'var(--vscode-foreground)',
      minHeight: '100vh',
    }}>

      {/* Model selector — always visible when models available */}
      {availableModels.length > 0 && (
        <ModelSelector
          models={availableModels}
          current={currentModel}
          onSelect={handleModelSelect}
        />
      )}

      {/* Waiting state */}
      {state === 'waiting' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '80vh',
          gap: 12,
          opacity: 0.5,
        }}>
          <div style={{
            width: 24,
            height: 24,
            border: '2px solid var(--vscode-foreground)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 13, margin: 0 }}>Waiting for evaluation...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Diagnosis state */}
      {(state === 'diagnosed' || state === 'improving') && diagnosis && (
        <DiagnosisPanel
          diagnosis={diagnosis}
          isImproving={state === 'improving'}
          onImproveRequest={handleImproveRequest}
          improveError={improveError}
        />
      )}

      {/* Improved state */}
      {state === 'improved' && improvement && diagnosis && (
        <>
          <DiagnosisPanel
            diagnosis={diagnosis}
            isImproving={false}
            onImproveRequest={handleImproveRequest}
            improveError={improveError}
          />
          <div style={{
            borderTop: '1px solid var(--vscode-panel-border)',
            marginTop: 8,
          }} />
          <DiffPanel
            improvement={improvement}
            vscode={vscode}
            onDiscard={handleDiscard}
          />
        </>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div style={{
          padding: 16,
          margin: 16,
          background: 'rgba(226, 75, 74, 0.1)',
          border: '1px solid #E24B4A',
          borderRadius: 6,
          fontSize: 13,
          color: '#E24B4A',
        }}>
          {errorMessage || 'An unexpected error occurred.'}
        </div>
      )}

      {/* Eval error state — quota exceeded, JSON parse error, or similar */}
      {state === 'eval_error' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '80vh',
          gap: 16,
          padding: 24,
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(226, 75, 74, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}>
            ✕
          </div>
          <p style={{
            fontSize: 13,
            color: '#E24B4A',
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.5,
          }}>
            {errorMessage}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 220 }}>
            <button
              onClick={() => {
                vscode.postMessage({ type: 'CHANGE_MODEL_REQUEST', payload: {} } as WebviewMessage);
              }}
              style={{
                padding: '8px 20px',
                background: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)',
                border: 'none',
                borderRadius: 4,
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 500,
                width: '100%',
              }}
            >
              Change model
            </button>
            <button
              onClick={() => {
                setState('waiting');
                vscode.postMessage({ type: 'RETRY_EVAL', payload: {} } as WebviewMessage);
              }}
              style={{
                padding: '8px 20px',
                background: 'transparent',
                color: 'var(--vscode-foreground)',
                border: '1px solid var(--vscode-button-border, var(--vscode-panel-border))',
                borderRadius: 4,
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 400,
                width: '100%',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}