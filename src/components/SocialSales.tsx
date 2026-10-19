import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Plus, Search, Send, Instagram, Facebook, ShoppingBag, CheckCircle2, Clock3, UserRound, ExternalLink, Copy, Trash2 } from 'lucide-react';
import type { Customer, ErpSettings, Product } from '../domain/types';

type Channel = 'WhatsApp' | 'Instagram' | 'Facebook' | 'TikTok' | 'Otro';
type Stage = 'Nuevo' | 'En atención' | 'Esperando cliente' | 'Pedido confirmado' | 'Cerrado';
type Lead = { id:number; customerName:string; phone:string; channel:Channel; topic:string; status:Stage; notes:string; productIds:number[]; createdAt:string; updatedAt:string };
type SocialLinks = { whatsapp:string; instagram:string; facebook:string; tiktok:string };
const STORE_KEY='difarmas_social_sales_v1';
const LINKS_KEY='difarmas_social_links_v1';
const stages:Stage[]=['Nuevo','En atención','Esperando cliente','Pedido confirmado','Cerrado'];
const channels:Channel[]=['WhatsApp','Instagram','Facebook','TikTok','Otro'];
const blankLead=():Omit<Lead,'id'|'createdAt'|'updatedAt'>=>({customerName:'',phone:'',channel:'WhatsApp',topic:'Consulta de producto',status:'Nuevo',notes:'',productIds:[]});
const defaultLinks:SocialLinks={whatsapp:'',instagram:'',facebook:'',tiktok:''};
const money=(n:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(n);
const safeLoad=<T,>(key:string,fallback:T):T=>{try{const value=localStorage.getItem(key);return value?JSON.parse(value) as T:fallback;}catch{return fallback;}};
const phoneDigits=(phone:string)=>phone.replace(/\D/g,'');
const channelIcon=(channel:Channel)=>channel==='WhatsApp'?MessageCircle:channel==='Instagram'?Instagram:channel==='Facebook'?Facebook:ShoppingBag;

export function SocialSales({products,customers,settings}:{products:Product[];customers:Customer[];settings:ErpSettings}) {
  const [leads,setLeads]=useState<Lead[]>(()=>safeLoad<Lead[]>(STORE_KEY,[]));
  const [links,setLinks]=useState<SocialLinks>(()=>({...defaultLinks,...safeLoad<Partial<SocialLinks>>(LINKS_KEY,{})}));
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<'Todos'|Stage>('Todos');
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState(blankLead);
  const [message,setMessage]=useState('');
  const [notice,setNotice]=useState('');
  useEffect(()=>{try{localStorage.setItem(STORE_KEY,JSON.stringify(leads));}catch{setNotice('No se pudieron guardar los contactos en este navegador. Copia la información importante.');}},[leads]);
  useEffect(()=>{try{localStorage.setItem(LINKS_KEY,JSON.stringify(links));}catch{}},[links]);
  const filtered=useMemo(()=>leads.filter(l=>(filter==='Todos'||l.status===filter)&&[l.customerName,l.phone,l.topic,l.channel,l.notes].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),[leads,filter,query]);
  const selected=leads.find(l=>l.id===selectedId)??null;
  const count=(stage:Stage)=>leads.filter(l=>l.status===stage).length;
  const openNew=()=>{setForm(blankLead());setShowForm(true);setNotice('');};
  const saveLead=()=>{if(!form.customerName.trim()){setNotice('Escribe el nombre del cliente.');return;}const now=new Date().toISOString();const lead:Lead={...form,id:Date.now(),customerName:form.customerName.trim(),phone:form.phone.trim(),topic:form.topic.trim()||'Consulta general',notes:form.notes.trim(),createdAt:now,updatedAt:now};setLeads(current=>[lead,...current]);setSelectedId(lead.id);setShowForm(false);setForm(blankLead());setNotice('Conversación registrada.');};
  const updateLead=(id:number,patch:Partial<Lead>)=>setLeads(current=>current.map(l=>l.id===id?{...l,...patch,updatedAt:new Date().toISOString()}:l));
  const createWhatsAppUrl=(lead:Lead,text:string)=>{const number=phoneDigits(lead.phone);return number?'https://wa.me/'+number+'?text='+encodeURIComponent(text):'';};
  const makeProductMessage=(product:Product)=>'Hola, gracias por contactar a DIFARMÁS. '+product.name+' ('+product.presentation+') tiene precio de '+money(product.retail)+'. Disponibilidad sujeta a confirmación. ¿Desea que le ayudemos con su pedido?';
  const replyTemplates=[
    {label:'Consultar disponibilidad',text:'¡Hola! Gracias por contactar a DIFARMÁS. Con gusto verificamos disponibilidad y precio actualizado. ¿Qué presentación necesita?'},
    {label:'Datos para pedido',text:'Para preparar su pedido, por favor compártanos su nombre, teléfono y si prefiere recogerlo o consultar entrega. Confirmaremos existencia y total antes de cerrar la compra.'},
    {label:'Pedido confirmado',text:'¡Gracias por su compra en DIFARMÁS! Su pedido quedó registrado. Le confirmaremos los detalles de entrega o recogida por este medio.'},
    {label:'Seguimiento',text:'¡Hola! Le escribimos de DIFARMÁS para dar seguimiento a su consulta. ¿Desea que le ayudemos con algo más?'}
  ];
  const whatsappNumber=phoneDigits(links.whatsapp||settings.phone);
  const sendMessage=()=>{if(!selected){setNotice('Selecciona una conversación primero.');return;}const url=createWhatsAppUrl(selected,message);if(!url){setNotice('Registra el teléfono del cliente con código de país para abrir WhatsApp.');return;}window.open(url,'_blank','noopener,noreferrer');};
  return <div className="content social-sales">
    <div className="page-head"><div><span className="pill">VENTAS DIGITALES · DIFARMÁS</span><h2>Redes sociales y atención de ventas</h2><p>Organiza consultas, da seguimiento a clientes y prepara respuestas y pedidos desde un solo lugar.</p></div><button className="primary" onClick={openNew}><Plus size={17}/> Nueva conversación</button></div>
    <div className="social-notice"><MessageCircle size={18}/><div><strong>Centro de atención comercial</strong><p>Registra manualmente los mensajes que recibes, controla su estado y abre WhatsApp con respuestas preparadas. La recepción automática de mensajes requiere conectar las API oficiales de cada plataforma mediante un servidor seguro.</p></div></div>
    {notice&&<div className="settings-notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Cerrar aviso">×</button></div>}
    <div className="grid metrics social-metrics">
      <article className="card metric"><div className="metric-top"><span>Conversaciones</span><MessageCircle size={20}/></div><strong>{leads.length}</strong><small>Total registradas</small></article>
      <article className="card metric"><div className="metric-top"><span>Nuevas</span><Plus size={20}/></div><strong>{count('Nuevo')}</strong><small>Por atender</small></article>
      <article className="card metric"><div className="metric-top"><span>En seguimiento</span><Clock3 size={20}/></div><strong>{count('En atención')+count('Esperando cliente')}</strong><small>Abiertas</small></article>
      <article className="card metric"><div className="metric-top"><span>Pedidos confirmados</span><CheckCircle2 size={20}/></div><strong>{count('Pedido confirmado')}</strong><small>Listos para coordinar</small></article>
    </div>
    <section className="card social-links-card">
      <div className="card-title"><div><h3><ExternalLink size={17}/> Canales y perfiles de DIFARMÁS</h3><p>Configura los teléfonos y enlaces públicos para acceder rápidamente a cada canal.</p></div></div>
      <div className="social-links-grid">
        <label>WhatsApp (teléfono con código de país)<input value={links.whatsapp} onChange={e=>setLinks({...links,whatsapp:e.target.value})} placeholder={settings.phone||'504XXXXXXXX'} /></label>
        <label>Instagram (URL del perfil)<input value={links.instagram} onChange={e=>setLinks({...links,instagram:e.target.value})} placeholder="https://instagram.com/tu_perfil"/></label>
        <label>Facebook (URL de la página)<input value={links.facebook} onChange={e=>setLinks({...links,facebook:e.target.value})} placeholder="https://facebook.com/tu_pagina"/></label>
        <label>TikTok (URL del perfil)<input value={links.tiktok} onChange={e=>setLinks({...links,tiktok:e.target.value})} placeholder="https://tiktok.com/@tu_perfil"/></label>
      </div>
      <div className="social-profile-actions">{(links.whatsapp||settings.phone) ? <a className="secondary" href={'https://wa.me/'+whatsappNumber} target="_blank" rel="noreferrer"><MessageCircle size={15}/> Abrir WhatsApp</a>:null}{links.instagram&&<a className="secondary" href={links.instagram} target="_blank" rel="noreferrer"><Instagram size={15}/> Instagram</a>}{links.facebook&&<a className="secondary" href={links.facebook} target="_blank" rel="noreferrer"><Facebook size={15}/> Facebook</a>}{links.tiktok&&<a className="secondary" href={links.tiktok} target="_blank" rel="noreferrer"><ShoppingBag size={15}/> TikTok</a>}</div>
    </section>
    <div className="social-workspace">
      <section className="card social-inbox">
        <div className="card-title"><div><h3>Bandeja de conversaciones</h3><p>Consulta, busca y cambia la etapa de cada cliente.</p></div></div>
        <label className="search-box social-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nombre, teléfono o consulta"/></label>
        <div className="social-filters"><select value={filter} onChange={e=>setFilter(e.target.value as 'Todos'|Stage)}><option>Todos</option>{stages.map(s=><option key={s}>{s}</option>)}</select><span>{filtered.length} resultados</span></div>
        <div className="social-lead-list">{filtered.map(lead=>{const Icon=channelIcon(lead.channel);return <button key={lead.id} className={selectedId===lead.id?'social-lead selected':'social-lead'} onClick={()=>{setSelectedId(lead.id);setMessage('');}}><span className="social-channel-icon"><Icon size={17}/></span><span className="social-lead-main"><strong>{lead.customerName}</strong><small>{lead.channel} · {lead.topic}</small><small>{new Date(lead.updatedAt).toLocaleString('es-HN',{dateStyle:'short',timeStyle:'short'})}</small></span><span className={'social-stage stage-'+lead.status.toLowerCase().replaceAll(' ','-')}>{lead.status}</span></button>})}{filtered.length===0&&<div className="social-empty"><UserRound size={26}/><strong>No hay conversaciones</strong><p>Registra un mensaje entrante para iniciar el seguimiento.</p></div>}</div>
      </section>
      <section className="card social-detail">
        {!selected?<div className="social-empty social-empty-large"><MessageCircle size={38}/><h3>Selecciona una conversación</h3><p>O crea una nueva para registrar la consulta de un cliente.</p><button className="primary" onClick={openNew}><Plus size={16}/> Nueva conversación</button></div>:<>
          <div className="card-title"><div><span className="pill">{selected.channel}</span><h3>{selected.customerName}</h3><p>{selected.phone||'Teléfono no registrado'} · {selected.topic}</p></div><button className="icon-btn" title="Eliminar conversación" onClick={()=>{if(window.confirm('¿Eliminar esta conversación del registro local?')){setLeads(current=>current.filter(l=>l.id!==selected.id));setSelectedId(null);}}}><Trash2 size={16}/></button></div>
          <div className="social-detail-fields"><label>Estado<select value={selected.status} onChange={e=>updateLead(selected.id,{status:e.target.value as Stage})}>{stages.map(s=><option key={s}>{s}</option>)}</select></label><label>Canal<select value={selected.channel} onChange={e=>updateLead(selected.id,{channel:e.target.value as Channel})}>{channels.map(c=><option key={c}>{c}</option>)}</select></label></div>
          <label className="social-notes-label">Notas internas<textarea rows={3} value={selected.notes} onChange={e=>updateLead(selected.id,{notes:e.target.value})} placeholder="Presentación solicitada, dirección de entrega, seguimiento..."/></label>
          <div className="social-product-picker"><h4><ShoppingBag size={16}/> Compartir información de productos</h4><p>Selecciona un producto para preparar un mensaje con el precio minorista registrado.</p><div className="social-products">{products.filter(p=>p.stock>0).slice(0,30).map(product=><button key={product.id} className="social-product" onClick={()=>{setMessage(makeProductMessage(product));if(!selected.productIds.includes(product.id))updateLead(selected.id,{productIds:[...selected.productIds,product.id]});}}><span><strong>{product.name}</strong><small>{product.presentation} · Existencia: {product.stock}</small></span><b>{money(product.retail)}</b></button>)}{products.filter(p=>p.stock>0).length===0&&<p>No hay productos con existencia registrada.</p>}</div></div>
          <div className="social-replies"><h4>Respuestas rápidas</h4><div>{replyTemplates.map(t=><button key={t.label} className="secondary" onClick={()=>setMessage(t.text)}>{t.label}</button>)}</div></div>
          <label className="social-message-label">Mensaje para WhatsApp<textarea rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Escribe una respuesta o elige una plantilla..."/></label>
          <div className="social-message-actions"><button className="secondary" onClick={()=>{void navigator.clipboard?.writeText(message);setNotice('Mensaje copiado si el navegador autorizó el portapapeles.');}} disabled={!message.trim()}><Copy size={15}/> Copiar mensaje</button><button className="primary" onClick={sendMessage} disabled={!selected.phone.trim()||!message.trim()}><Send size={15}/> Abrir chat con mensaje</button></div>
          {selected.channel!=='WhatsApp'&&<p className="social-hint">Esta conversación proviene de {selected.channel}. El botón de envío abre WhatsApp si el cliente tiene teléfono registrado; para responder dentro de la red original, usa el enlace del perfil.</p>}
        </>}
      </section>
    </div>
    <section className="card social-customer-shortcuts"><div className="card-title"><div><h3>Clientes registrados en el ERP</h3><p>Usa un contacto existente para crear una conversación con menos captura manual.</p></div></div><div className="social-customer-list">{customers.filter(c=>c.active&&c.phone).slice(0,12).map(c=><button key={c.id} className="secondary" onClick={()=>{setForm({...blankLead(),customerName:c.name,phone:c.phone,channel:'WhatsApp',topic:'Seguimiento a cliente'});setShowForm(true);}}><UserRound size={15}/>{c.name}</button>)}{customers.filter(c=>c.active&&c.phone).length===0&&<p>No hay clientes activos con teléfono registrado.</p>}</div></section>
    {showForm&&<div className="modal-backdrop"><div className="modal social-modal"><div className="modal-head"><div><h3>Nueva conversación</h3><p>Registra una consulta recibida por WhatsApp u otra red.</p></div><button className="icon-btn" onClick={()=>setShowForm(false)} aria-label="Cerrar">×</button></div><div className="form-grid"><label>Nombre del cliente *<input autoFocus value={form.customerName} onChange={e=>setForm({...form,customerName:e.target.value})} placeholder="Nombre o negocio"/></label><label>Teléfono con código de país<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="504XXXXXXXX"/></label><label>Canal<select value={form.channel} onChange={e=>setForm({...form,channel:e.target.value as Channel})}>{channels.map(c=><option key={c}>{c}</option>)}</select></label><label>Motivo de consulta<input value={form.topic} onChange={e=>setForm({...form,topic:e.target.value})} placeholder="Precio, disponibilidad, pedido..."/></label><label className="social-modal-full">Notas iniciales<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Producto solicitado, presentación, entrega..."/></label></div><div className="modal-actions"><button className="secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="primary" onClick={saveLead}><Plus size={16}/> Registrar conversación</button></div></div></div>}
  </div>;
}
