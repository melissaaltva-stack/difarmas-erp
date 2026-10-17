import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { AuthGate } from './components/AuthGate';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      {(user, signOut) => <App userId={user.id} signOut={signOut} />}
    </AuthGate>
  </React.StrictMode>
);
