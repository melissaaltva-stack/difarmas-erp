import { useEffect, useId, useMemo, useState } from 'react';
import { ClipboardList, FileText, Pencil, Trash2, Search, ShoppingCart, Plus, Save, X, Package } from 'lucide-react';
import type { CartItem, Customer, OrderRecord, Product } from '../domain/types';

const money=(value:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(value);
const orderDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('es-HN');};

type OpenPosDraft={id:string;label?:string;customer?:string;cart:{qty:number;price:number;name?:string}[];saleType?:string;payment?:string};
type OpenPosDraftStore={activeDraftId?:string;drafts:OpenPosDraft[]};
type OrderDraft={id:string;customer:string;customerRtn:string;items:CartItem[]};
const draftKey=(userId:string)=>'farmi_orders_create_drafts_'+userId;
const readDrafts=(userId:string):OrderDraft[]=>{try{const value=JSON.parse(localStorage.getItem(draftKey(userId))||'[]');return Array.isArray(value)?value.filter(item=>item&&typeof item.id==='string'&&Array.isArray(item.items)):[];}catch{return [];}};

function OrderEditor({products,customers,initialItems,initialCustomer='',initialRtn='',saveLabel='Guardar pedido',onSave,onCancel}:{products:Product[];customers:Customer[];initialItems:CartItem[];initialCustomer?:string;initialRtn?:string;saveLabel?:string;onSave:(items:CartItem[],customer:string,rtn:string,total:number)=>boolean;onCancel?:()=>void}){
 const customerListId=useId();
 const [items,setItems]=useState<CartItem[]>(()=>initialItems.map(item=>({...item})));
 const [customer,setCustomer]=useState(initialCustomer);
 const [customerRtn,setCustomerRtn]=useState(initialRtn);
 const [query,setQuery]=useState('');
 const [notice,setNotice]=useState('');
 const results=useMemo(()=>products.filter(product=>[product.code,product.name,...(product.activeIngredients??[])].join(' ').toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))).slice(0,8),[products,query]);
 const total=items.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.qty)||0),0);
 const addProduct=(product:Product)=>{setItems(current=>{const found=current.find(item=>item.id===product.id&&item.saleUnit===undefined);if(found)return current.map(item=>item===found?{...item,qty:item.qty+1}:item);return [...current,{...product,qty:1,price:product.retail}];});setQuery('');};
 const updateLine=(index:number,patch:Partial<CartItem>)=>setItems(current=>current.map((item,i)=>i===index?{...item,...patch}:item));
 return <div className="card order-editor">
  <div className="section-heading"><div><h3>Detalle del pedido</h3><p>Agrega productos, cantidades y datos del cliente.</p></div><Package size={19}/></div>
  <div className="order-editor-fields">
   <label>Cliente <input list={customerListId} value={customer} onChange={e=>{setCustomer(e.target.value);const found=customers.find(c=>c.name.toLocaleLowerCase('es')===e.target.value.trim().toLocaleLowerCase('es'));if(found)setCustomerRtn(found.rtn??'');}} placeholder="Nombre del cliente / Consumidor final"/></label>
   <datalist id={customerListId}>{customers.filter(c=>c.active!==false).map(customer=><option key={customer.id} value={customer.name}/>)}</datalist>
   <label>RTN del cliente <input value={customerRtn} onChange={e=>setCustomerRtn(e.target.value)} placeholder="Opcional"/></label>
  </div>
  <label className="order-product-search">Buscar producto<div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nombre, código o principio activo..."/></div></label>
  {query&&<div className="order-product-results">{results.length?results.map(product=><button type="button" key={product.id} disabled={product.stock<=0} onClick={()=>addProduct(product)}><span><strong>{product.name}</strong><small>{product.code} · Stock {product.stock}</small></span><b>{money(product.retail)}</b><Plus size={16}/></button>):<p className="muted">No se encontraron productos.</p>}</div>}
  <div className="table-wrap order-editor-table"><table><thead><tr><th>Producto</th><th>Precio</th><th>Cantidad</th><th>Importe</th><th></th></tr></thead><tbody>
   {!items.length?<tr><td colSpan={5} className="muted">Agrega productos para completar el pedido.</td></tr>:items.map((item,index)=><tr key={item.cartLineId??item.id+'-'+index}><td><strong>{item.name}</strong><small className="order-line-sub">{item.code} · {item.presentation}</small></td><td><input aria-label={'Precio de '+item.name} className="order-number-input" type="number" min="0" step="0.01" value={item.price} onChange={e=>updateLine(index,{price:Math.max(0,Number(e.target.value)||0)})}/></td><td><input aria-label={'Cantidad de '+item.name} className="order-number-input order-quantity-input" type="number" min="1" step="1" value={item.qty} onChange={e=>updateLine(index,{qty:Math.max(1,Math.floor(Number(e.target.value)||1))})}/></td><td>{money(item.price*item.qty)}</td><td><button type="button" className="icon-button" aria-label={'Quitar '+item.name} onClick={()=>setItems(current=>current.filter((_,i)=>i!==index))}><X size={15}/></button></td></tr>)}
  </tbody></table></div>
  <div className="order-editor-footer"><strong>Total: {money(total)}</strong><div className="order-editor-actions">{onCancel&&<button type="button" className="secondary" onClick={onCancel}>Cancelar</button>}<button type="button" className="primary" disabled={!items.length} onClick={()=>{setNotice('');if(onSave(items,customer.trim(),customerRtn.trim(),total))setNotice('Pedido guardado correctamente.');else setNotice('No se pudo guardar. Revisa existencias y sincronización.');}}><Save size={15}/>{saveLabel}</button></div></div>
  {notice&&<p className="helper" role="status">{notice}</p>}
 </div>;
}

export function Orders({orders,onDelete,onInvoice,userId,onOpenPos,products,customers,onSaveOrder,onUpdateOrder}:{orders:OrderRecord[];onDelete:(id:number)=>boolean;onInvoice:(order:OrderRecord)=>void;userId:string;onOpenPos:()=>void;products:Product[];customers:Customer[];onSaveOrder:(items:CartItem[],customer:string,rtn:string,total:number)=>boolean;onUpdateOrder:(id:number,items:CartItem[],customer:string,rtn:string,total:number)=>boolean}){
 const [notice,setNotice]=useState('');
 const [openPosDrafts,setOpenPosDrafts]=useState<OpenPosDraft[]>([]);
 const [newDrafts,setNewDrafts]=useState<OrderDraft[]>(()=>readDrafts(userId));
 const [editingIds,setEditingIds]=useState<number[]>([]);
 useEffect(()=>{try{const stored=JSON.parse(localStorage.getItem('farmi_pos_drafts_'+userId)||'null') as OpenPosDraftStore|null;setOpenPosDrafts(Array.isArray(stored?.drafts)?stored.drafts.filter(draft=>draft&&typeof draft.id==='string'&&Array.isArray(draft.cart)):[]);}catch{setOpenPosDrafts([]);}},[userId]);
 useEffect(()=>{try{localStorage.setItem(draftKey(userId),JSON.stringify(newDrafts));}catch{/* Los borradores siguen disponibles en memoria durante esta sesión. */}},[newDrafts,userId]);
 const [query,setQuery]=useState(''),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState('');
 const matches=(order:OrderRecord,dateValue:string)=>{const day=String(dateValue||'').slice(0,10),term=query.trim().toLocaleLowerCase('es');return (!term||[order.number,order.customer??'',order.customerRtn??'',...order.items.map(item=>item.name)].join(' ').toLocaleLowerCase('es').includes(term))&&(!dateFrom||day>=dateFrom)&&(!dateTo||day<=dateTo);};
 const pending=orders.filter(order=>order.status==='Pendiente'&&matches(order,order.date)),invoiced=orders.filter(order=>order.status==='Facturado'&&matches(order,order.updatedAt||order.date));
 const addDraft=()=>setNewDrafts(current=>[{id:'new-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),customer:'',customerRtn:'',items:[]},...current]);
 return <div className="content orders-page">
  <div className="page-intro orders-heading"><div><h2>Pedidos</h2><p>Creación, seguimiento y edición de pedidos.</p></div><button type="button" className="primary" onClick={addDraft}><Plus size={16}/> Crear pedido</button></div>
  {!!newDrafts.length&&<section className="card"><div className="section-heading"><div><h3>Pedidos en preparación ({newDrafts.length})</h3><p>Los borradores se guardan automáticamente en este navegador y pueden mantenerse abiertos a la vez.</p></div><ClipboardList size={20}/></div>
   <div className="order-drafts-grid">{newDrafts.map(draft=><article className="order-draft-card" key={draft.id}><div className="order-draft-title"><strong>Nuevo pedido</strong><button type="button" className="icon-button" aria-label="Descartar borrador" title="Descartar borrador" onClick={()=>setNewDrafts(current=>current.filter(item=>item.id!==draft.id))}><Trash2 size={15}/></button></div><OrderEditor key={draft.id} products={products} customers={customers} initialItems={draft.items} initialCustomer={draft.customer} initialRtn={draft.customerRtn} onSave={(items,customer,rtn,total)=>{const ok=onSaveOrder(items,customer,rtn,total);if(ok)setNewDrafts(current=>current.filter(item=>item.id!==draft.id));return ok;}}/></article>)}</div>
  </section>}
  <section className="card open-pos-orders"><div className="section-heading"><div><h3>Pedidos abiertos de Venta / POS ({openPosDrafts.length})</h3><p>Pedidos en curso guardados automáticamente en el punto de venta.</p></div><ShoppingCart size={20}/></div>
   {!openPosDrafts.length?<p className="muted">No hay pedidos abiertos en el punto de venta.</p>:<div className="order-drafts-grid">{openPosDrafts.map((draft,index)=><article className="order-draft-card" key={draft.id}><strong>{draft.customer?.trim()||draft.label||('Pedido POS '+(index+1))}</strong><span className="muted">{draft.cart.length} productos · {money(draft.cart.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.qty)||0),0))}</span><button type="button" className="secondary" onClick={()=>{try{const key='farmi_pos_drafts_'+userId;const saved=JSON.parse(localStorage.getItem(key)||'null') as OpenPosDraftStore|null;if(saved&&Array.isArray(saved.drafts)&&saved.drafts.some(item=>item.id===draft.id)){localStorage.setItem(key,JSON.stringify({...saved,activeDraftId:draft.id}));onOpenPos();}}catch{setNotice('No se pudo abrir el pedido guardado.');}}}>Continuar en Venta / POS</button></article>)}</div>}
  </section>
  <div className="card order-filters"><label className="order-search-label">Buscar pedido, cliente o producto<div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="N.º de pedido, cliente o producto..."/></div></label><label>Desde<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label><label>Hasta<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label><button type="button" className="secondary" onClick={()=>{setQuery('');setDateFrom('');setDateTo('');}}>Limpiar filtros</button><span className="count order-filter-count">{pending.length+invoiced.length} pedidos encontrados · {pending.length} pendientes · {invoiced.length} facturados</span></div>
  {notice&&<p className="helper" role="status">{notice}</p>}
  <section className="card"><div className="section-heading"><div><h3>Pedidos pendientes ({pending.length})</h3><p>Selecciona varios pedidos para abrir sus editores de forma independiente.</p></div></div>
   {!pending.length?<p className="muted">{orders.some(order=>order.status==='Pendiente')?'No hay pedidos pendientes que coincidan con los filtros.':'No hay pedidos pendientes.'}</p>:<div className="order-saved-list">{pending.map(order=><article className="order-saved-card" key={order.id}><div className="order-saved-summary"><div><strong>{order.number}</strong><small>{orderDate(order.date)} · {order.customer||'Consumidor final'} · {order.items.reduce((sum,item)=>sum+item.qty,0)} unidades</small></div><strong>{money(order.total)}</strong></div><div className="order-saved-actions"><button type="button" className="secondary" onClick={()=>setEditingIds(current=>current.includes(order.id)?current.filter(id=>id!==order.id):[...current,order.id])}><Pencil size={14}/>{editingIds.includes(order.id)?'Cerrar editor':'Editar pedido'}</button><button type="button" className="primary" onClick={()=>onInvoice(order)}><FileText size={14}/> Facturar</button><button type="button" className="icon-button" aria-label={'Eliminar '+order.number} onClick={()=>{if(window.confirm('¿Eliminar '+order.number+' y devolver las cantidades reservadas al inventario?')){const deleted=onDelete(order.id);setNotice(deleted?'':'No se pudo eliminar el pedido.');}}}><Trash2 size={15}/></button></div>{editingIds.includes(order.id)&&<OrderEditor key={order.id} products={products} customers={customers} initialItems={order.items} initialCustomer={order.customer??''} initialRtn={order.customerRtn??''} saveLabel="Guardar cambios" onCancel={()=>setEditingIds(current=>current.filter(id=>id!==order.id))} onSave={(items,customer,rtn,total)=>{const ok=onUpdateOrder(order.id,items,customer,rtn,total);if(ok)setEditingIds(current=>current.filter(id=>id!==order.id));return ok;}}/>}</article>)}</div>}
  </section>
  <section className="card"><div className="section-heading"><div><h3>Pedidos facturados ({invoiced.length})</h3><p>Historial de pedidos convertidos en factura.</p></div></div>
   {!invoiced.length?<p className="muted">{orders.some(order=>order.status==='Facturado')?'No hay pedidos facturados que coincidan con los filtros.':'Todavía no hay pedidos facturados.'}</p>:<div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha de facturación</th><th>Cliente</th><th>Factura</th><th>Total</th></tr></thead><tbody>{invoiced.map(order=><tr key={order.id}><td>{order.number}</td><td>{orderDate(order.updatedAt||order.date)}</td><td>{order.customer||'Consumidor final'}</td><td>{order.invoiceId??'—'}</td><td>{money(order.total)}</td></tr>)}</tbody></table></div>}
  </section>
 </div>;
}
