import { useState } from 'react';
import { AlertTriangle, HeartPulse, LoaderCircle, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { requireSupabase } from '../services/supabaseClient';

type Message = { role: 'user' | 'assistant'; content: string };

export function FarmiDoctor() {
  const [draft,setDraft]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const send=async(event:FormEvent)=>{
    event.preventDefault();
    const question=draft.trim();
    if(!question||busy)return;
    const next=[...messages,{role:'user' as const,content:question}].slice(-12);
    setMessages(next);
    setDraft('');
    setBusy(true);
    setError('');
    try{
      const {data}=await requireSupabase().auth.getSession();
      const token=data.session?.access_token;
      if(!token)throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      const response=await fetch('/api/farmi-doctor',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({messages:next})
      });
      const result=await response.json() as {answer?:string;error?:string};
      if(!response.ok||!result.answer)throw new Error(result.error||'No se pudo consultar a Farmi.');
      setMessages(current=>[...current,{role:'assistant' as const,content:result.answer!}].slice(-12));
    }catch(e){
      setError(e instanceof Error?e.message:'No se pudo completar la consulta.');
    }finally{
      setBusy(false);
    }
  };

  return <div className="content farmi-doctor-page">
    <section className="card farmi-doctor-hero">
      <div className="farmi-doctor-brand">
        <span className="farmi-doctor-mark"><HeartPulse size={25}/></span>
        <div><p className="eyebrow">DIFARMÁS · ORIENTACIÓN DE SALUD</p><h2>Farmi</h2><p>Asistente virtual de orientación médica y bienestar</p></div>
      </div>
      <div className="farmi-doctor-disclaimer"><ShieldCheck size={17}/><span>Farmi ofrece información general. No es un médico, no diagnostica ni sustituye una valoración profesional.</span></div>
    </section>

    <section className="card farmi-doctor-chat">
      <div className="farmi-doctor-chat-head">
        <div><Sparkles size={18}/><div><strong>Conversación con Farmi</strong><small>Describe la situación sin incluir nombres ni datos personales.</small></div></div>
        <button className="secondary" type="button" disabled={!messages.length||busy} onClick={()=>{setMessages([]);setError('');setDraft('');}}><Trash2 size={15}/> Limpiar</button>
      </div>
      <div className="farmi-doctor-emergency"><AlertTriangle size={17}/><span>Si hay dificultad para respirar, dolor intenso de pecho, signos de derrame cerebral, pérdida del conocimiento, sangrado abundante o una emergencia, busca atención inmediata.</span></div>
      <div className="farmi-doctor-messages" aria-live="polite">
        {messages.length===0&&<div className="farmi-doctor-welcome"><HeartPulse size={28}/><strong>Hola, soy Farmi.</strong><p>Puedo ayudarte a comprender síntomas, identificar señales de alarma y saber cuándo buscar atención médica. Cuéntame qué está pasando.</p><small>Para orientar mejor, puede ser útil indicar edad, desde cuándo ocurre, intensidad, antecedentes, alergias y medicamentos actuales.</small></div>}
        {messages.map((message,index)=><article key={index} className={'farmi-doctor-message '+message.role}><strong>{message.role==='user'?'Tú':'Farmi'}</strong><p>{message.content}</p></article>)}
        {busy&&<div className="farmi-doctor-loading"><LoaderCircle size={17}/> Farmi está revisando tu consulta…</div>}
      </div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <form className="farmi-doctor-form" onSubmit={send}>
        <textarea value={draft} onChange={e=>setDraft(e.target.value)} maxLength={1800} rows={3} placeholder="Escribe tu consulta de salud…" aria-label="Consulta para Farmi" />
        <button className="primary" type="submit" disabled={busy||!draft.trim()}><Send size={16}/>{busy?'Consultando…':'Enviar consulta'}</button>
      </form>
      <div className="farmi-doctor-footnote">No compartas identidad, teléfono, dirección, expedientes ni fotografías identificables. La conversación no se guarda en el historial del ERP.</div>
    </section>
  </div>;
}
