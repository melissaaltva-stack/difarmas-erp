import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { LockKeyhole, LogIn, Mail, KeyRound, ShieldAlert, ImagePlus, RotateCcw } from 'lucide-react';
import './AuthGate.css';
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
  const [loginBackground,setLoginBackground] = useState(()=>{try{return window.localStorage.getItem('farmi-login-background')??'';}catch{return '';}});
  const [backgroundError,setBackgroundError] = useState('');
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
      const initialLinkType=new URLSearchParams(window.location.hash.replace(/^#/,'')).get('type');
      if(initialLinkType==='invite'||initialLinkType==='recovery')setRecoveryMode(true);
      setChecking(false);
    }).catch((sessionError: unknown) => {
      if (!mounted) return;
      // A rejected session lookup must not leave the login screen loading forever
      // or create an unhandled promise rejection.
      setUser(null);
      setError(getSignInErrorMessage(sessionError));
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const linkType=new URLSearchParams(window.location.hash.replace(/^#/,'')).get('type');
      if (event === 'PASSWORD_RECOVERY' || linkType === 'invite' || linkType === 'recovery') setRecoveryMode(true);
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleBackgroundUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file=event.currentTarget.files?.[0];
    event.currentTarget.value='';
    if(!file)return;
    if(!file.type.startsWith('image/')){setBackgroundError('Selecciona un archivo de imagen.');return;}
    if(file.size>12*1024*1024){setBackgroundError('La imagen debe pesar menos de 12 MB.');return;}
    const reader=new FileReader();
    reader.onerror=()=>setBackgroundError('No se pudo leer la imagen. Inténtalo de nuevo.');
    reader.onload=()=>{
      const image=new Image();
      image.onerror=()=>setBackgroundError('El archivo seleccionado no es una imagen válida.');
      image.onload=()=>{
        const scale=Math.min(1,1920/Math.max(image.width,image.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(image.width*scale));
        canvas.height=Math.max(1,Math.round(image.height*scale));
        const context=canvas.getContext('2d');
        if(!context){setBackgroundError('No se pudo procesar la imagen en este navegador.');return;}
        context.drawImage(image,0,0,canvas.width,canvas.height);
        let compressed=canvas.toDataURL('image/jpeg',0.78);
        if(compressed.length>2_800_000)compressed=canvas.toDataURL('image/jpeg',0.58);
        try{
          window.localStorage.setItem('farmi-login-background',compressed);
          setLoginBackground(compressed);
          setBackgroundError('');
        }catch{
          setBackgroundError('No hay espacio suficiente en el navegador para guardar esta imagen. Prueba con una imagen más pequeña.');
        }
      };
      image.src=String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const clearLoginBackground = () => {
    try{window.localStorage.removeItem('farmi-login-background');}catch{}
    setLoginBackground('');
    setBackgroundError('');
  };

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const client = requireSupabase();
      const identifier = email.trim().toLowerCase();
      const loginEmail = identifier.includes('@') ? identifier : `${identifier}@users.farmi.invalid`;
      const { error: signInError } = await client.auth.signInWithPassword({
        email: loginEmail,
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
    if(!target){setError('Escribe primero tu correo electrónico.');return;}
    if(!target.includes('@')){setError('Las cuentas que entran con nombre de usuario deben pedir al administrador que les asigne una contraseña nueva.');return;}
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
      window.history.replaceState({},document.title,window.location.pathname+window.location.search);
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

  return <div className={`auth-page auth-login-page${loginBackground?' has-custom-background':''}`} style={loginBackground?{backgroundImage:`linear-gradient(110deg,rgba(5,28,27,.78),rgba(8,43,39,.48)),url("${loginBackground}")`}:undefined}>
    <div className="auth-background-actions">
      <label className="auth-background-button"><ImagePlus size={16}/> Cambiar imagen de fondo<input type="file" accept="image/*" onChange={handleBackgroundUpload}/></label>
      {loginBackground&&<button type="button" className="auth-background-reset" onClick={clearLoginBackground}><RotateCcw size={14}/> Restablecer</button>}
      {backgroundError&&<span className="auth-background-error" role="alert">{backgroundError}</span>}
    </div>
    <div className="auth-login-layout">
      <section className="auth-brand-panel">
        <div className="auth-brand-lockup"><span className="auth-brand-symbol">F</span><span>FARMI</span></div>
        <div className="auth-brand-copy"><p>PLATAFORMA DE GESTIÓN</p><h2>Tu negocio,<br/>bajo control.</h2><span>Una forma más simple de administrar DIFARMÁS: ventas, inventario y finanzas en un solo lugar.</span></div>
        <div className="auth-brand-footer"><span className="auth-brand-line"/> Gestión inteligente para DIFARMÁS</div>
      </section>
      <form className="auth-card auth-login-card" onSubmit={signIn}>
        <div className="auth-logo"><LockKeyhole size={24}/></div>
        <p className="auth-eyebrow">BIENVENIDO A FARMI</p>
        <h1>Iniciar sesión</h1>
        <p className="auth-subtitle">Ingresa tus credenciales para continuar.</p>
        <label htmlFor="erp-email">Nombre de usuario o correo electrónico</label>
        <input id="erp-email" type="text" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="Ej. vendedor01" />
        <label htmlFor="erp-password">Contraseña</label>
        <input id="erp-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Ingresa tu contraseña"/>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="auth-note" role="status">{notice}</p>}
        <button className="primary auth-submit" type="submit" disabled={busy}>{busy ? 'Verificando…' : <><LogIn size={17}/> Entrar a FARMI</>}</button>
        <button className="secondary auth-submit" type="button" onClick={requestPasswordRecovery} disabled={busy}><Mail size={16}/> Recuperar contraseña</button>
        <p className="auth-note">Las cuentas se administran desde Configuración → Usuarios y permisos.</p>
      </form>
    </div>
  </div>;
}
