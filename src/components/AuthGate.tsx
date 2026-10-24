import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { LockKeyhole, LogIn, Mail, KeyRound, ShieldAlert } from 'lucide-react';
import { requireSupabase, supabase, supabaseConfigured } from '../services/supabaseClient';

type Props = {
  children: (user: User, signOut: () => Promise<void>) => ReactNode;
};

function getSignInErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) return message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return 'Ocurrió un error desconocido. Revisa la conexión e inténtalo de nuevo.';
}

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice,setNotice] = useState('');
  const [recoveryMode,setRecoveryMode] = useState(false);
  const [recoveryPassword,setRecoveryPassword] = useState('');
  const [confirmRecoveryPassword,setConfirmRecoveryPassword] = useState('');

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
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setUser(session?.user ?? null);
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
    } catch (caught) {
      setError(`No se pudo iniciar sesión: ${getSignInErrorMessage(caught)}`);
    } finally {
      setBusy(false);
    }
  };

  const requestPasswordRecovery = async () => {
    const target=email.trim();
    if(!target){setError('Escribe primero el correo de la cuenta para enviar el enlace de recuperación.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      const client=requireSupabase();
      const {error:recoveryError}=await client.auth.resetPasswordForEmail(target,{redirectTo:window.location.origin});
      if(recoveryError)throw recoveryError;
      setNotice('Si la cuenta existe, Supabase enviará un enlace para recuperar la contraseña. Revisa también la carpeta de spam.');
    }catch(caught){setError(`No se pudo solicitar la recuperación: ${getSignInErrorMessage(caught)}`);}
    finally{setBusy(false);}
  };

  const updateRecoveredPassword = async (event:FormEvent) => {
    event.preventDefault();setBusy(true);setError('');setNotice('');
    if(recoveryPassword.length<12){setError('La nueva contraseña debe tener al menos 12 caracteres.');setBusy(false);return;}
    if(recoveryPassword!==confirmRecoveryPassword){setError('Las contraseñas no coinciden.');setBusy(false);return;}
    try{
      const {error:updateError}=await requireSupabase().auth.updateUser({password:recoveryPassword});
      if(updateError)throw updateError;
      setRecoveryMode(false);setRecoveryPassword('');setConfirmRecoveryPassword('');
      setNotice('Contraseña actualizada correctamente.');
    }catch(caught){setError(`No se pudo actualizar la contraseña: ${getSignInErrorMessage(caught)}`);}
    finally{setBusy(false);}
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

  if (user?.app_metadata?.farmi_active === false) {
    return <div className="auth-page"><section className="auth-card"><div className="auth-logo"><ShieldAlert size={25}/></div><h1>Acceso desactivado</h1><p className="auth-subtitle">Esta cuenta está desactivada. Pide al administrador de Farmi que reactive el acceso.</p><button className="primary auth-submit" type="button" onClick={()=>void signOut()}>Cerrar sesión</button></section></div>;
  }

  if (user && recoveryMode) {
    return <div className="auth-page"><form className="auth-card" onSubmit={updateRecoveredPassword}><div className="auth-logo"><KeyRound size={25}/></div><p className="auth-eyebrow">DIFARMÁS · FARMI ERP</p><h1>Establecer nueva contraseña</h1><p className="auth-subtitle">Elige una contraseña nueva de al menos 12 caracteres.</p><label htmlFor="recovery-password">Nueva contraseña</label><input id="recovery-password" type="password" autoComplete="new-password" minLength={12} required value={recoveryPassword} onChange={event=>setRecoveryPassword(event.target.value)}/><label htmlFor="recovery-password-confirm">Confirmar contraseña</label><input id="recovery-password-confirm" type="password" autoComplete="new-password" minLength={12} required value={confirmRecoveryPassword} onChange={event=>setConfirmRecoveryPassword(event.target.value)}/>{error&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="auth-note" role="status">{notice}</p>}<button className="primary auth-submit" type="submit" disabled={busy}>{busy?'Guardando…':'Guardar nueva contraseña'}</button></form></div>;
  }

  if (user) return <>{children(user, signOut)}</>;

  return <div className="auth-page">
    <form className="auth-card" onSubmit={signIn}>
      <div className="auth-logo"><LockKeyhole size={25}/></div>
      <p className="auth-eyebrow">DIFARMÁS · FARMI ERP</p>
      <h1>Acceso al sistema</h1>
      <p className="auth-subtitle">Inicia sesión para ingresar al sistema de gestión de DIFARMÁS.</p>
      <label htmlFor="erp-email">Correo electrónico</label>
      <input id="erp-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
      <label htmlFor="erp-password">Contraseña</label>
      <input id="erp-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-note" role="status">{notice}</p>}
      <button className="primary auth-submit" type="submit" disabled={busy}>{busy ? 'Verificando…' : <><LogIn size={17}/> Entrar al ERP</>}</button>
      <button className="secondary auth-submit" type="button" onClick={requestPasswordRecovery} disabled={busy}><Mail size={16}/> Recuperar contraseña</button>
      <p className="auth-note">Las cuentas se administran desde Configuración → Usuarios y permisos. El registro público no está habilitado.</p>
    </form>
  </div>;
}
