import { useState, useEffect } from 'react';
import type { DiagnosisResult, ImprovementResult, VsCodeApi, WebviewMessage } from './types';
import { DiagnosisPanel } from './components/DiagnosisPanel';
import { DiffPanel } from './components/DiffPanel';

// Get VS Code API — only available inside the Webview
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

type AppState = 'waiting' | 'diagnosed' | 'improving' | 'improved' | 'error';

export default function App() {
  const [state, setState] = useState<AppState>('waiting');
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [improvement, setImprovement] = useState<ImprovementResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

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

        case 'ERROR':
          setErrorMessage(message.payload.message);
          setState('error');
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  function handleImproveRequest() {
    if (!diagnosis) { return; }
    setState('improving');
    vscode.postMessage({
      type: 'IMPROVE_REQUEST',
      payload: diagnosis,
    });
  }

  function handleDiscard() {
    setState('diagnosed');
    setImprovement(null);
  }

  return (
    <div style={{
      fontFamily: 'var(--vscode-font-family)',
      color: 'var(--vscode-foreground)',
      minHeight: '100vh',
    }}>

      {/* Waiting state */}
      {state === 'waiting' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
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
        />
      )}

      {/* Improved state */}
      {state === 'improved' && improvement && diagnosis && (
        <>
          <DiagnosisPanel
            diagnosis={diagnosis}
            isImproving={false}
            onImproveRequest={handleImproveRequest}
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

    </div>
  );
}