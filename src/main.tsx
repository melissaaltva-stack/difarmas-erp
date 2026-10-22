import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { AuthGate } from './components/AuthGate';

type BoundaryState = { error: string | null };

class AppErrorBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error instanceof Error ? error.message : 'Error inesperado al iniciar el sistema.' };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('DIFARMÁS ERP no pudo renderizar la aplicación:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7f7', color: '#17252a', fontFamily: 'system-ui, sans-serif' }}>
          <section style={{ maxWidth: 640, width: '100%', background: '#fff', border: '1px solid #e2ebe9', borderRadius: 16, padding: 24 }}>
            <h1 style={{ marginTop: 0 }}>DIFARMÁS ERP no pudo iniciar</h1>
            <p>La página sí se cargó, pero ocurrió un error al abrir el sistema. No se han eliminado tus datos.</p>
            <p style={{ overflowWrap: 'anywhere', padding: 12, background: '#f8eeee', borderRadius: 8 }}><strong>Detalle:</strong> {this.state.error}</p>
            <button onClick={() => window.location.reload()} style={{ border: 0, borderRadius: 8, padding: '11px 16px', background: '#167b61', color: '#fff', cursor: 'pointer' }}>Volver a cargar</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <AuthGate>
          {(user, signOut) => <App userId={user.id} userEmail={user.email ?? ''} signOut={signOut} />}
        </AuthGate>
      </AppErrorBoundary>
    </React.StrictMode>
  );
}
