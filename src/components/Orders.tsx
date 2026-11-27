import { useEffect, useState } from 'react';
import { ClipboardList, FileText, Pencil, Trash2, Search, ShoppingCart } from 'lucide-react';
import type { OrderRecord } from '../domain/types';

const money=(value:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(value);
const orderDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('es-HN');};

type OpenPosDraft={id:string;label?:string;customer?:string;cart:{qty:number;price:number;name?:string}[];saleType?:string;payment?:string};
type OpenPosDraftStore={activeDraftId?:string;drafts:OpenPosDraft[]};

export function Orders({orders,onDelete,onInvoice,onEdit,userId,onOpenPos}:{orders:OrderRecord[];onDelete:(id:number)=>boolean;onInvoice:(order:OrderRecord)=>void;onEdit:(order:OrderRecord)=>void;userId:string;onOpenPos:()=>void}){
 const [notice,setNotice]=useState('');
 const [openPosDrafts,setOpenPosDrafts]=useState<OpenPosDraft[]>([]);
 useEffect(()=>{
  try{
   const stored=JSON.parse(localStorage.getItem('farmi_pos_drafts_'+userId)||'null') as OpenPosDraftStore|null;
   setOpenPosDrafts(Array.isArray(stored?.drafts)?stored.drafts.filter(draft=>draft&&typeof draft.id==='string'&&Array.isArray(draft.cart)):[]);
  }catch{setOpenPosDrafts([]);}
 },[userId]);
 const [query,setQuery]=useState(''),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState('');
 const matches=(order:OrderRecord,dateValue:string)=>{const day=String(dateValue||'').slice(0,10),term=query.trim().toLocaleLowerCase('es');return (!term||[order.number,order.customer??'',order.customerRtn??'',...order.items.map(item=>item.name)].join(' ').toLocaleLowerCase('es').includes(term))&&(!dateFrom||day>=dateFrom)&&(!dateTo||day<=dateTo);};
 const pending=orders.filter(order=>order.status==='Pendiente'&&matches(order,order.date)),invoiced=orders.filter(order=>order.status==='Facturado'&&matches(order,order.updatedAt||order.date));
 return <div className="content orders-page">
  <div className="page-intro orders-heading"><div><h2>Pedidos</h2></div><span className="pill">{pending.length} pendientes</span></div>
  <section className="card open-pos-orders">
   <div className="section-heading"><div><h3>Pedidos abiertos de Venta / POS ({openPosDrafts.length})</h3><p>Pedidos en curso guardados automáticamente en este navegador.</p></div><ShoppingCart size={20}/></div>
   {!openPosDrafts.length?<p className="muted">No hay pedidos abiertos en el punto de venta.</p>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:10}}>
    {openPosDrafts.map((draft,index)=><article key={draft.id} style={{border:'1px solid var(--border)',borderRadius:10,padding:13,display:'flex',flexDirection:'column',gap:8}}>
     <strong>{draft.customer?.trim()||draft.label||('Pedido POS '+(index+1))}</strong>
     <span className="muted">{draft.cart.length} productos · {money(draft.cart.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.qty)||0),0))}</span>
     <button type="button" className="primary" onClick={()=>{try{const key='farmi_pos_drafts_'+userId;const saved=JSON.parse(localStorage.getItem(key)||'null') as OpenPosDraftStore|null;if(saved&&Array.isArray(saved.drafts)&&saved.drafts.some(item=>item.id===draft.id)){localStorage.setItem(key,JSON.stringify({...saved,activeDraftId:draft.id}));onOpenPos();}}catch{setNotice('No se pudo abrir el pedido guardado.');}}}>Continuar en Venta / POS</button>
    </article>)}
   </div>}
  </section>
  <div className="card order-filters">
   <label className="order-search-label">Buscar pedido, cliente o producto<div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="N.º de pedido, cliente o producto..."/></div></label>
   <label>Desde<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label>
   <label>Hasta<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label>
   <button type="button" className="secondary" onClick={()=>{setQuery('');setDateFrom('');setDateTo('');}}>Limpiar filtros</button>
   <span className="count order-filter-count">{pending.length+invoiced.length} pedidos encontrados · {pending.length} pendientes · {invoiced.length} facturados</span>
  </div>
  {notice&&<p className="helper" role="status">{notice}</p>}
  <section className="card"><div className="section-heading"><div><h3>Pedidos pendientes ({pending.length})</h3></div><ClipboardList size={20}/></div>
   {!pending.length?<p className="muted">{orders.some(order=>order.status==='Pendiente')?'No hay pedidos pendientes que coincidan con los filtros.':'No hay pedidos pendientes.'}</p>:<div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Unidades</th><th>Total</th><th>Acciones</th></tr></thead><tbody>{pending.map(order=><tr key={order.id}><td><strong>{order.number}</strong></td><td>{orderDate(order.date)}</td><td>{order.customer||'Consumidor final'}</td><td>{order.items.reduce((sum,item)=>sum+item.qty,0)}</td><td>{money(order.total)}</td><td><div className="order-actions"><button className="secondary" type="button" onClick={()=>onEdit(order)}><Pencil size={14}/> Editar</button><button className="primary" type="button" onClick={()=>onInvoice(order)}><FileText size={14}/> Facturar</button><button className="icon-button" type="button" aria-label={'Eliminar '+order.number} onClick={()=>{if(window.confirm('¿Eliminar '+order.number+' y devolver las cantidades reservadas al inventario?')){const deleted=onDelete(order.id);setNotice(deleted?'':'No se pudo eliminar el pedido.');}}}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
  </section>
  <section className="card"><div className="section-heading"><div><h3>Pedidos facturados ({invoiced.length})</h3><p>Historial de pedidos convertidos en factura.</p></div></div>
   {!invoiced.length?<p className="muted">{orders.some(order=>order.status==='Facturado')?'No hay pedidos facturados que coincidan con los filtros.':'Todavía no hay pedidos facturados.'}</p>:<div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha de facturación</th><th>Cliente</th><th>Factura</th><th>Total</th></tr></thead><tbody>{invoiced.map(order=><tr key={order.id}><td>{order.number}</td><td>{orderDate(order.updatedAt||order.date)}</td><td>{order.customer||'Consumidor final'}</td><td>{order.invoiceId??'—'}</td><td>{money(order.total)}</td></tr>)}</tbody></table></div>}
  </section>
 </div>;
}
