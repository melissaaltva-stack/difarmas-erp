import { useState } from 'react';
import { ClipboardList, FileText, Pencil, Save, Trash2, X } from 'lucide-react';
import type { CartItem, OrderRecord, Product } from '../domain/types';

const money=(value:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(value);

export function Orders({orders,products,onUpdate,onDelete,onInvoice,onEdit}:{orders:OrderRecord[];products:Product[];onUpdate:(id:number,items:CartItem[],customer:string,customerRtn:string,total:number)=>boolean;onDelete:(id:number)=>boolean;onInvoice:(order:OrderRecord)=>void;onEdit:(order:OrderRecord)=>void}){
 const [editing,setEditing]=useState<number|null>(null),[draft,setDraft]=useState<CartItem[]>([]),[customer,setCustomer]=useState(''),[rtn,setRtn]=useState(''),[notice,setNotice]=useState('');
 const pending=orders.filter(order=>order.status==='Pendiente'),invoiced=orders.filter(order=>order.status==='Facturado');
 const startEdit=(order:OrderRecord)=>{setEditing(order.id);setDraft(order.items.map(item=>({...item})));setCustomer(order.customer??'');setRtn(order.customerRtn??'');setNotice('');};
 const save=()=>{if(editing===null)return;const total=draft.reduce((sum,item)=>sum+item.price*item.qty,0);if(onUpdate(editing,draft,customer,rtn,total)){setEditing(null);setDraft([]);setNotice('Pedido actualizado y existencias ajustadas.');}else setNotice('No se pudo actualizar. Verifica las existencias disponibles y la sincronización.');};
 const editQty=(id:number,value:number)=>setDraft(current=>current.map(item=>item.id===id?{...item,qty:Math.max(1,Math.floor(value)||1)}:item));
 return <div className="content orders-page">
  <div className="page-intro"><div><h2>Pedidos guardados</h2></div><span className="pill">{pending.length} pendientes</span></div>
  {notice&&<p className="helper" role="status">{notice}</p>}
  {editing!==null&&<section className="card order-editor"><div className="section-heading"><div><h3>Editar pedido</h3><p>Al guardar, el inventario se ajustará a las cantidades nuevas.</p></div><button className="icon-button" type="button" onClick={()=>setEditing(null)} aria-label="Cerrar edición"><X size={17}/></button></div>
   <div className="form-grid"><label>Cliente<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Consumidor final"/></label><label>RTN<input value={rtn} onChange={e=>setRtn(e.target.value)} placeholder="RTN (opcional)"/></label></div>
   <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Existencia disponible</th><th>Cantidad reservada</th><th>Precio</th><th>Importe</th></tr></thead><tbody>{draft.map(item=><tr key={item.id}><td>{item.name}</td><td>{products.find(p=>p.id===item.id)?.stock??'—'}</td><td><input type="number" min="1" step="1" value={item.qty} onChange={e=>editQty(item.id,Number(e.target.value))}/></td><td>{money(item.price)}</td><td>{money(item.qty*item.price)}</td></tr>)}</tbody></table></div>
   <div className="modal-actions"><button className="secondary" type="button" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" type="button" onClick={save}><Save size={15}/> Guardar cambios</button></div>
  </section>}
  <section className="card"><div className="section-heading"><div><h3>Pedidos pendientes</h3></div><ClipboardList size={20}/></div>
   {!pending.length?<p className="muted">No hay pedidos pendientes.</p>:<div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Acciones</th></tr></thead><tbody>{pending.map(order=><tr key={order.id}><td><strong>{order.number}</strong></td><td>{new Date(order.date).toLocaleString('es-HN')}</td><td>{order.customer||'Consumidor final'}</td><td>{order.items.reduce((sum,item)=>sum+item.qty,0)}</td><td>{money(order.total)}</td><td><div className="order-actions"><button className="secondary" type="button" onClick={()=>onEdit(order)}><Pencil size={14}/> Editar</button><button className="primary" type="button" onClick={()=>onInvoice(order)}><FileText size={14}/> Facturar</button><button className="icon-button" type="button" aria-label={'Eliminar '+order.number} onClick={()=>{if(window.confirm('¿Eliminar '+order.number+' y devolver las cantidades reservadas al inventario?')){const deleted=onDelete(order.id);setNotice(deleted?'':'No se pudo eliminar el pedido.');}}}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
  </section>
  <section className="card"><div className="section-heading"><div><h3>Pedidos facturados</h3><p>Historial de pedidos convertidos en factura.</p></div></div>
   {!invoiced.length?<p className="muted">Todavía no hay pedidos facturados.</p>:<div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Factura</th><th>Total</th></tr></thead><tbody>{invoiced.map(order=><tr key={order.id}><td>{order.number}</td><td>{new Date(order.updatedAt).toLocaleString('es-HN')}</td><td>{order.customer||'Consumidor final'}</td><td>{order.invoiceId??'—'}</td><td>{money(order.total)}</td></tr>)}</tbody></table></div>}
  </section>
 </div>;
}
