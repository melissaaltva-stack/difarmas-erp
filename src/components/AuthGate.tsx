import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode, type CSSProperties } from 'react';
import type { User } from '@supabase/supabase-js';
import { LogIn, Mail, KeyRound, ShieldAlert, ImagePlus, RotateCcw, Settings, Palette, Check, FlaskConical, Save } from 'lucide-react';
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
  const [demoMode, setDemoMode] = useState(() => { try { return window.localStorage.getItem('farmi_demo_session') === 'active'; } catch { return false; } });
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice,setNotice] = useState('');
  const [loginBackground,setLoginBackground] = useState(()=>{try{return window.localStorage.getItem('farmi-login-background')??'';}catch{return '';}});
  const [backgroundError,setBackgroundError] = useState('');
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [settingsSaved,setSettingsSaved] = useState(false);
  const [backgroundOpacity,setBackgroundOpacity] = useState(()=>{try{return Number(window.localStorage.getItem('farmi-background-opacity')??'58');}catch{return 58;}});
  const [loginTheme,setLoginTheme] = useState(()=>{try{const saved=window.localStorage.getItem('farmi-system-theme')??'emerald';return ['emerald','blue','violet','slate','rose'].includes(saved)?saved:'emerald';}catch{return 'emerald';}});
  const [loginBrandEyebrow,setLoginBrandEyebrow] = useState(()=>{try{return window.localStorage.getItem('farmi-login-brand-eyebrow')??'PLATAFORMA DE GESTIÓN';}catch{return 'PLATAFORMA DE GESTIÓN';}});
  const [loginBrandTitle,setLoginBrandTitle] = useState(()=>{try{return window.localStorage.getItem('farmi-login-brand-title')??'Tu negocio,\nbajo control.';}catch{return 'Tu negocio,\nbajo control.';}});
  const themes=[{id:'emerald',name:'Esmeralda',color:'#16856b'},{id:'blue',name:'Azul',color:'#2867b2'},{id:'violet',name:'Violeta',color:'#7653b5'},{id:'slate',name:'Grafito',color:'#526477'},{id:'rose',name:'Rosa',color:'#b65370'}];
  useEffect(()=>{document.documentElement.dataset.farmiTheme=loginTheme;},[loginTheme]);
  const resetLoginBrandText = () => {
    setLoginBrandEyebrow('PLATAFORMA DE GESTIÓN');
    setLoginBrandTitle('Tu negocio,\nbajo control.');
    setSettingsSaved(false);
  };
  const saveLoginSettings = () => {
    try {
      window.localStorage.setItem('farmi-system-theme',loginTheme);
      window.localStorage.setItem('farmi-login-brand-eyebrow',loginBrandEyebrow);
      window.localStorage.setItem('farmi-login-brand-title',loginBrandTitle);
      window.localStorage.setItem('farmi-background-opacity',String(backgroundOpacity));
      if(loginBackground) window.localStorage.setItem('farmi-login-background',loginBackground);
      else window.localStorage.removeItem('farmi-login-background');
      setSettingsSaved(true);
      setBackgroundError('');
      setSettingsOpen(false);
    } catch {
      setSettingsSaved(false);
      setBackgroundError('No se pudieron guardar los cambios. Libera espacio en el navegador e inténtalo de nuevo.');
    }
  };
  const [recoveryMode,setRecoveryMode] = useState(false);
  const [recoveryPassword,setRecoveryPassword] = useState('');
  const [confirmRecoveryPassword,setConfirmRecoveryPassword] = useState('');
  const shouldMeasureBrandWordmark = supabaseConfigured && !checking && !user && !demoMode && !recoveryMode;
  const brandWordmarkRef = useRef<HTMLSpanElement | null>(null);
  const brandLetterRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const brandPeriodRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    if (!shouldMeasureBrandWordmark) return;
    const wordmark = brandWordmarkRef.current;
    if (!wordmark) return;

    const measureLetterPositions = () => {
      const letters = brandLetterRefs.current.slice(0, 5);
      const period = brandPeriodRef.current;
      if (letters.length !== 5 || letters.some((letter) => letter === null) || !period) return;

      const wordmarkRect = wordmark.getBoundingClientRect();
      const centers = letters.map((letter) => {
        const rect = letter!.getBoundingClientRect();
        return rect.left + rect.width / 2 - wordmarkRect.left;
      });
      const periodRect = period.getBoundingClientRect();
      const periodCenter = periodRect.left + periodRect.width / 2 - wordmarkRect.left;

      ['f', 'a', 'r', 'm', 'i'].forEach((letter, index) => {
        wordmark.style.setProperty(`--farmi-${letter}-x`, `${centers[index]}px`);
      });
      wordmark.style.setProperty('--farmi-period-x', `${periodCenter}px`);
    };

    measureLetterPositions();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measureLetterPositions)
      : null;
    resizeObserver?.observe(wordmark);
    brandLetterRefs.current.forEach((letter) => {
      if (letter) resizeObserver?.observe(letter);
    });
    window.addEventListener('resize', measureLetterPositions);

    let active = true;
    document.fonts?.ready.then(() => {
      if (active) measureLetterPositions();
    });

    return () => {
      active = false;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measureLetterPositions);
    };
  }, [shouldMeasureBrandWordmark]);


  useEffect(() => {
    if (demoMode) { setChecking(false); setUser(null); return; }
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
  }, [demoMode]);

  const enterDemo = () => { try { window.localStorage.setItem('farmi_demo_session', 'active'); } catch {} setError(''); setNotice(''); setDemoMode(true); };
  const exitDemo = async () => { try { window.localStorage.removeItem('farmi_demo_session'); } catch {} setDemoMode(false); };
  const demoUser = { id: 'farmi-demo-local', email: 'demo@farmi.local', app_metadata: { farmi_demo: true, farmi_active: true, farmi_role: 'Supervisor', farmi_permissions: ['dashboard','facturacion_estandar','ventas','pedidos','redes_sociales','inventario','clientes','compras','finanzas','contabilidad','cuentas_cobrar','cuentas_pagar','reportes','asistente_ia','proveedores','rrhh','configuracion'] }, user_metadata: {}, aud: 'authenticated', created_at: new Date(0).toISOString() } as unknown as User;

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
          setLoginBackground(compressed);
          setSettingsSaved(false);
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
    setLoginBackground('');
    setSettingsSaved(false);
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

  if (!supabaseConfigured && !demoMode) {
    return <div className="auth-page"><section className="auth-card"><div className="auth-logo">D</div><h1>Configura DIFARMÁS ERP</h1><p>Antes de iniciar sesión, configura la URL y la clave pública de Supabase en las variables de entorno del proyecto.</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_PUBLISHABLE_KEY</code><p className="auth-note">No agregues claves secretas ni service_role al navegador.</p><button className="primary auth-submit" type="button" onClick={enterDemo}><FlaskConical size={16}/> Entrar a empresa de prueba</button></section></div>;
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
  if (demoMode) return <>{children(demoUser, exitDemo)}</>;

  return <div className={`auth-page auth-login-page${loginBackground?' has-custom-background':''}`} style={{'--login-overlay-opacity':backgroundOpacity/100} as CSSProperties}>
    {loginBackground&&<div className="auth-login-background-image" style={{backgroundImage:`url("${loginBackground}")`}} aria-hidden="true"/>}
    <div className="auth-settings">
      <button type="button" className="auth-settings-trigger" aria-label="Ajustes de apariencia" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(value=>!value)}><Settings size={19}/></button>
      {settingsOpen&&<div className="auth-settings-menu">
        <div className="auth-settings-header"><p className="auth-settings-heading">Personalizar FARMI</p><button type="button" className={`auth-settings-save${settingsSaved?' is-saved':''}`} onClick={saveLoginSettings} aria-label="Guardar cambios" title={settingsSaved?'Cambios guardados':'Guardar cambios'}><Save size={17}/></button></div>
        <div className="auth-copy-settings">
          <p className="auth-settings-section-title">Texto del panel de inicio</p>
          <label htmlFor="login-brand-eyebrow">Texto superior</label>
          <div className="auth-copy-field-row">
            <input id="login-brand-eyebrow" type="text" value={loginBrandEyebrow} onChange={event=>{setLoginBrandEyebrow(event.target.value);setSettingsSaved(false);}} placeholder="PLATAFORMA DE GESTIÓN" maxLength={80}/>
            <button type="button" onClick={()=>{setLoginBrandEyebrow('');setSettingsSaved(false);}} disabled={!loginBrandEyebrow}>Quitar</button>
          </div>
          <label htmlFor="login-brand-title">Título principal</label>
          <div className="auth-copy-field-row auth-copy-field-row-title">
            <textarea id="login-brand-title" rows={2} value={loginBrandTitle} onChange={event=>{setLoginBrandTitle(event.target.value);setSettingsSaved(false);}} placeholder="Escribe el título que quieras mostrar" maxLength={120}/>
            <button type="button" onClick={()=>{setLoginBrandTitle('');setSettingsSaved(false);}} disabled={!loginBrandTitle}>Quitar</button>
          </div>
          <p className="auth-copy-hint">Puedes escribir otro texto o dejar cada campo vacío para ocultarlo.</p>
          <button type="button" className="auth-copy-reset" onClick={resetLoginBrandText}>Restablecer textos originales</button>
        </div>
        <label className="auth-settings-item"><span className="auth-settings-icon"><ImagePlus size={17}/></span><span>Cambiar imagen de fondo</span><input type="file" accept="image/*" onChange={handleBackgroundUpload}/></label>
        <div className="auth-settings-themes"><div className="auth-settings-item-title"><Palette size={17}/> Tema de colores</div><div className="auth-theme-options">{themes.map(theme=><button key={theme.id} type="button" className={loginTheme===theme.id?'selected':''} title={theme.name} aria-label={`Tema ${theme.name}`} onClick={()=>{setLoginTheme(theme.id);setSettingsSaved(false);}}><span style={{background:theme.color}}/>{loginTheme===theme.id&&<Check size={12}/>}</button>)}</div><small>{themes.find(theme=>theme.id===loginTheme)?.name}</small><div className="auth-opacity-control"><label htmlFor="login-background-opacity">Transparencia del fondo <strong>{backgroundOpacity}%</strong></label><input id="login-background-opacity" type="range" min="0" max="90" step="5" value={backgroundOpacity} onChange={event=>{setBackgroundOpacity(Number(event.target.value));setSettingsSaved(false);}}/><div><span>Más visible</span><span>Más oscuro</span></div></div></div>
        {loginBackground&&<button type="button" className="auth-settings-item auth-settings-reset" onClick={clearLoginBackground}><span className="auth-settings-icon"><RotateCcw size={16}/></span><span>Restablecer fondo</span></button>}
        {settingsSaved&&!backgroundError&&<span className="auth-settings-saved" role="status">Cambios guardados</span>}{backgroundError&&<span className="auth-background-error" role="alert">{backgroundError}</span>}
      </div>}
    </div>
    <div className="auth-login-layout">
      <section className="auth-brand-panel">
        <div className="auth-brand-lockup" aria-label="Farmi"><span className="auth-brand-wordmark" ref={brandWordmarkRef}><span className="auth-brand-letter" ref={(element) => { brandLetterRefs.current[0] = element; }}>F</span><span className="auth-brand-letter" ref={(element) => { brandLetterRefs.current[1] = element; }}>a</span><span className="auth-brand-letter" ref={(element) => { brandLetterRefs.current[2] = element; }}>r</span><span className="auth-brand-letter" ref={(element) => { brandLetterRefs.current[3] = element; }}>m</span><span className="auth-brand-letter auth-brand-letter-i" ref={(element) => { brandLetterRefs.current[4] = element; }}>ı</span><span className="auth-brand-final-period" ref={brandPeriodRef} aria-hidden="true">.</span><span className="auth-brand-i-dot" aria-hidden="true"/><span className="auth-brand-end-dot" aria-hidden="true"/></span></div>
        {(loginBrandEyebrow.trim()||loginBrandTitle.trim())&&<div className="auth-brand-copy">{loginBrandEyebrow.trim()&&<p>{loginBrandEyebrow}</p>}{loginBrandTitle.trim()&&<h2>{loginBrandTitle}</h2>}</div>}
        
      </section>
      <form className="auth-card auth-login-card" onSubmit={signIn}>
        <div className="auth-logo auth-login-symbol"><LogIn size={25} aria-hidden="true"/></div>
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
        <button className="secondary auth-submit" type="button" onClick={enterDemo} disabled={busy}><FlaskConical size={16}/> Entrar a empresa de prueba</button>
        <button className="secondary auth-submit" type="button" onClick={requestPasswordRecovery} disabled={busy}><Mail size={16}/> Recuperar contraseña</button>
        <p className="auth-note">Las cuentas se administran desde Configuración → Usuarios y permisos.</p>
      </form>
    </div>
  </div>;
}
