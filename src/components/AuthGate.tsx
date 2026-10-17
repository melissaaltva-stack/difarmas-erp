import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { LockKeyhole, LogIn } from 'lucide-react';
import { requireSupabase, supabase, supabaseConfigured } from '../services/supabaseClient';

type Props = {
  children: (user: User, signOut: () => Promise<void>) => ReactNode;
};

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) setError('No se pudo comprobar la sesión. Intenta de nuevo.');
      setUser(data.session?.user ?? null);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const client = requireSupabase();
      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
    } catch {
      setError('No se pudo iniciar sesión. Verifica el correo, la contraseña y la configuración de Supabase.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const client = requireSupabase();
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) throw signOutError;
    setUser(null);
  };

  if (!supabaseConfigured) {
    return <div className="auth-page"><section className="auth-card"><div className="auth-logo">D</div><h1>Configura DIFARMÁS ERP</h1><p>Antes de iniciar sesión, configura la URL y la clave pública de Supabase en las variables de entorno del proyecto.</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_PUBLISHABLE_KEY</code><p className="auth-note">No agregues claves secretas ni service_role al navegador.</p></section></div>;
  }

  if (checking) {
    return <div className="auth-page"><section className="auth-card"><div className="auth-logo">D</div><p>Comprobando sesión segura…</p></section></div>;
  }

  if (user) return <>{children(user, signOut)}</>;

  return <div className="auth-page">
    <form className="auth-card" onSubmit={signIn}>
      <div className="auth-logo"><LockKeyhole size={25}/></div>
      <p className="auth-eyebrow">DIFARMÁS · SISTEMA INTERNO</p>
      <h1>Iniciar sesión</h1>
      <p className="auth-subtitle">Acceso privado al sistema de gestión de la farmacia.</p>
      <label htmlFor="erp-email">Correo electrónico</label>
      <input id="erp-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
      <label htmlFor="erp-password">Contraseña</label>
      <input id="erp-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary auth-submit" type="submit" disabled={busy}>{busy ? 'Verificando…' : <><LogIn size={17}/> Entrar al ERP</>}</button>
      <p className="auth-note">Las cuentas se crean desde el panel seguro de Supabase. El registro público no está habilitado en esta pantalla.</p>
    </form>
  </div>;
}
