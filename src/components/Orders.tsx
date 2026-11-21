import { useState } from 'react';
import { ClipboardList, FileText, Pencil, Trash2, Search } from 'lucide-react';
import type { OrderRecord } from '../domain/types';

const money=(value:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(value);
const orderDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('es-HN');};

export function Orders({orders,onDelete,onInvoice,onEdit}:{orders:OrderRecord[];onDelete:(id:number)=>boolean;onInvoice:(order:OrderRecord)=>void;onEdit:(order:OrderRecord)=>void}){
 const [notice,setNotice]=useState('');
 const [query,setQuery]=useState(''),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState('');
 const matches=(order:OrderRecord,dateValue:string)=>{const day=String(dateValue||'').slice(0,10),term=query.trim().toLocaleLowerCase('es');return (!term||[order.number,order.customer??'',order.customerRtn??'',...order.items.map(item=>item.name)].join(' ').toLocaleLowerCase('es').includes(term))&&(!dateFrom||day>=dateFrom)&&(!dateTo||day<=dateTo);};
 const pending=orders.filter(order=>order.status==='Pendiente'&&matches(order,order.date)),invoiced=orders.filter(order=>order.status==='Facturado'&&matches(order,order.updatedAt||order.date));
 return <div className="content orders-page">
  <div className="page-intro orders-heading"><div><h2>Pedidos</h2></div><span className="pill">{pending.length} pendientes</span></div>
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
