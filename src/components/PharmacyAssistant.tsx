import { useState } from 'react';
import { AlertTriangle, BrainCircuit, LoaderCircle, MessageCircle, Send } from 'lucide-react';
import type { FormEvent } from 'react';
import type { Product } from '../domain/types';
import { requireSupabase } from '../services/supabaseClient';
type Message={role:'user'|'assistant';content:string};
export function PharmacyAssistant({products,context}:{products:Product[];context:'Facturación estándar'|'Venta POS'}){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[messages,setMessages]=useState<Message[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const send=async(event:FormEvent)=>{event.preventDefault();const question=draft.trim();if(!question||busy)return;const next=[...messages,{role:'user' as const,content:question}].slice(-12);setMessages(next);setDraft('');setBusy(true);setError('');
  try{const {data}=await requireSupabase().auth.getSession();const token=data.session?.access_token;if(!token)throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
   const catalog=products.slice(0,80).map(p=>({name:p.name,presentation:p.presentation,category:p.category,activeIngredients:p.activeIngredients??[],warnings:p.drugInfo?.warnings??''}));
   const response=await fetch('/api/pharmacy-assistant',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({context,messages:next,catalog})});
   const result=await response.json() as {answer?:string;error?:string};if(!response.ok||!result.answer)throw new Error(result.error||'No se pudo consultar al asistente.');
   setMessages(current=>[...current,{role:'assistant' as const,content:result.answer!}].slice(-12));
  }catch(e){setError(e instanceof Error?e.message:'No se pudo completar la consulta.');}finally{setBusy(false);}
 };
 return <section className="pharmacy-ai-card"><div className="pharmacy-ai-heading"><div><span className="pharmacy-ai-icon"><BrainCircuit size={19}/></span><div><strong>Asistente farmacéutico IA</strong><small>Orientación segura para clientes · {context}</small></div></div><button className="secondary" type="button" onClick={()=>setOpen(v=>!v)}><MessageCircle size={16}/>{open?'Ocultar asistente':'Consultar al asistente'}</button></div>
 {open&&<div className="pharmacy-ai-panel"><div className="pharmacy-ai-warning"><AlertTriangle size={16}/><span>Apoyo informativo: verifica antecedentes, alergias y medicamentos actuales. No sustituye al farmacéutico ni al médico. No ingreses nombres ni datos personales del cliente.</span></div>
 <div className="pharmacy-ai-messages" aria-live="polite">{messages.length===0&&<p className="pharmacy-ai-empty">Escribe la pregunta del cliente. Ejemplo: «¿Qué puedo tomar para el dolor de cabeza si tengo presión alta?»</p>}{messages.map((m,i)=><article key={i} className={'pharmacy-ai-message '+m.role}><strong>{m.role==='user'?'Consulta':'FARMI IA'}</strong><p>{m.content}</p></article>)}{busy&&<div className="pharmacy-ai-loading"><LoaderCircle size={16}/> Analizando la consulta…</div>}</div>
 {error&&<p className="form-error" role="alert">{error}</p>}<form className="pharmacy-ai-form" onSubmit={send}><textarea value={draft} onChange={e=>setDraft(e.target.value)} maxLength={1800} rows={2} placeholder="Escribe la pregunta del cliente…" aria-label="Pregunta para el asistente farmacéutico"/><button className="primary" type="submit" disabled={busy||!draft.trim()}><Send size={16}/> Enviar</button></form>
 <div className="pharmacy-ai-footer"><span>Las consultas se procesan mediante OpenAI. Evita compartir datos que identifiquen al cliente.</span><button className="text-button" type="button" onClick={()=>{setMessages([]);setError('');setDraft('');}}>Limpiar conversación</button></div></div>}</section>;
}