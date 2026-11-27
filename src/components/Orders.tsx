import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, FileText, Pencil, Trash2, Search, Plus, Save } from 'lucide-react';
import type { CartItem, Customer, OrderRecord, Product } from '../domain/types';

const money=(value:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(value);
const orderDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('es-HN');};

type OrderDraft={id:string;customer:string;customerRtn:string;items:CartItem[]};
const draftKey=(userId:string)=>'farmi_orders_create_drafts_'+userId;
const readDrafts=(userId:string):OrderDraft[]=>{try{const value=JSON.parse(localStorage.getItem(draftKey(userId))||'[]');return Array.isArray(value)?value.filter(item=>item&&typeof item.id==='string'&&Array.isArray(item.items)):[];}catch{return [];}};

function OrderEditor({products,customers,initialItems,initialCustomer='',initialRtn='',orderNumber='',saveLabel='Guardar pedido',onSave,onCancel}:{products:Product[];customers:Customer[];initialItems:CartItem[];initialCustomer?:string;initialRtn?:string;orderNumber?:string;saveLabel?:string;onSave:(items:CartItem[],customer:string,rtn:string,total:number)=>boolean;onCancel?:()=>void}){
 const [items,setItems]=useState<CartItem[]>(()=>initialItems.map(item=>({...item})));
 const [customer,setCustomer]=useState(initialCustomer);
 const [customerRtn,setCustomerRtn]=useState(initialRtn);
 const [query,setQuery]=useState('');
 const [notice,setNotice]=useState('');
 const results=useMemo(()=>products.filter(product=>product.stock>0&&[product.code,product.name,product.laboratory,product.category,product.presentation,...(product.activeIngredients??[])].join(' ').toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))).slice(0,8),[products,query]);
 const subtotal=items.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.qty)||0),0);
 const addProduct=(product:Product)=>{setItems(current=>{const found=current.find(item=>item.id===product.id&&item.saleUnit===undefined);if(found)return current.map(item=>item===found?{...item,qty:item.qty+1}:item);return [...current,{...product,qty:1,price:product.retail}];});setQuery('');};
 const updateLine=(index:number,patch:Partial<CartItem>)=>setItems(current=>current.map((item,i)=>i===index?{...item,...patch}:item));
 const selectedCustomer=customers.find(c=>c.name===customer);
 return <div className="card order-editor standard-invoice">
  <div className="invoice-layout">
   <section className="card invoice-header-card order-invoice-header">
    <div className="invoice-header-grid">
     <div className="invoice-top-fields-row">
      <div className="invoice-field invoice-field-number"><label className="field-label">N.º de pedido</label><input value={orderNumber||'Se asigna al guardar'} readOnly/></div>
      <div className="invoice-field invoice-field-date"><label className="field-label">Fecha</label><input type="date" value={new Date().toISOString().slice(0,10)} readOnly/></div>
     </div>
     <div className="invoice-field invoice-customer-field">
      <label className="field-label">Cliente</label>
      <div className="invoice-customer-select-row">
       <select aria-label="Cliente" value={customer} onChange={e=>{const next=e.target.value;const found=customers.find(c=>c.name===next);setCustomer(next);setCustomerRtn(found?.rtn??'');}}><option value="">Consumidor final</option>{customers.filter(c=>c.active!==false).map(c=><option key={c.id} value={c.name}>{c.code?c.code+' · ':''}{c.name}</option>)}</select>
      </div>
     </div>
     <div className="invoice-bottom-fields-row">
      <div className="invoice-field invoice-field-price"><label className="field-label">Precio de venta</label><input value={selectedCustomer?.priceList??'Precio de venta 1'} readOnly/></div>
      <div className="invoice-field invoice-field-address"><label className="field-label">Dirección</label><input value={selectedCustomer?.address??''} readOnly placeholder="Dirección del cliente"/></div>
      <div className="invoice-field invoice-field-phone"><label className="field-label">Teléfono</label><input value={selectedCustomer?.phone??''} readOnly placeholder="Teléfono del cliente"/></div>
      <div className="invoice-field invoice-field-rtn"><label className="field-label">RTN</label><input value={customerRtn} onChange={e=>setCustomerRtn(e.target.value)} placeholder="RTN del cliente"/></div>
     </div>
    </div>
   </section>
   <section className="card invoice-products-card">
    <div className="section-heading"><div><h3>Detalle de productos</h3><p>Busca por nombre, código o principio activo; selecciona los productos para agregarlos al pedido.</p></div></div>
    <div className="invoice-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar producto o escanear código"/></div>
    {query.trim()&&<div className="invoice-product-results">{results.map(product=><div className="invoice-product" key={product.id}><button type="button" className="invoice-product-add" disabled={product.stock<=0} onClick={()=>addProduct(product)}><span className="invoice-product-copy"><strong>{product.name}</strong><small>{product.code} · {product.presentation} · Existencia: {product.stock}</small></span><span className="invoice-product-price">{money(product.retail)}</span><Plus size={16}/></button></div>)}{!results.length&&<p className="muted">No se encontraron productos disponibles.</p>}</div>}
   </section>
  </div>
  <section className="card invoice-cart">
   <div className="section-heading"><div><h3>Detalle del pedido</h3><p>{items.length} producto(s) en el pedido</p></div></div>
   {!items.length?<p className="muted">Busca un producto arriba y selecciónalo para agregarlo al pedido.</p>:<div className="table-wrap"><table className="standard-invoice-lines"><thead><tr><th>Código</th><th>Descripción</th><th>Cantidad</th><th>Precio de venta</th><th>Total</th><th></th></tr></thead><tbody>{items.map((item,index)=><tr key={item.cartLineId??item.id+'-'+index}><td>{item.code}</td><td><div className="invoice-product-detail"><strong className="invoice-product-detail-name">{item.name}</strong><div className="invoice-product-meta invoice-product-meta-primary"><span>{item.saleUnit||item.presentation||item.baseUnitName||'Unidad'}</span></div><div className="invoice-product-meta invoice-product-meta-secondary"><span>{item.laboratory||''}</span><span className="invoice-product-stock">Existencia: {item.stock}</span></div></div></td><td><input className="invoice-qty" aria-label={'Cantidad de '+item.name} type="number" min="1" step="1" value={item.qty} onChange={e=>updateLine(index,{qty:Math.max(1,Math.floor(Number(e.target.value)||1))})}/></td><td><input className="order-number-input" aria-label={'Precio de '+item.name} type="number" min="0" step="0.01" value={item.price} onChange={e=>updateLine(index,{price:Math.max(0,Number(e.target.value)||0)})}/></td><td><strong>{money(item.price*item.qty)}</strong></td><td><button type="button" className="icon-button" aria-label={'Quitar '+item.name} onClick={()=>setItems(current=>current.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>}
   <div className="invoice-summary"><div className="invoice-summary-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div></div>
   <div className="invoice-total"><span>Total del pedido</span><strong>{money(subtotal)}</strong></div>
   <div className="invoice-actions">{onCancel&&<button type="button" className="secondary" onClick={onCancel}>Cancelar</button>}<button type="button" className="primary" disabled={!items.length} onClick={()=>{setNotice('');if(onSave(items,customer,customerRtn.trim(),subtotal))setNotice('Pedido guardado correctamente.');else setNotice('No se pudo guardar. Revisa existencias y sincronización.');}}><Save size={15}/>{saveLabel}</button></div>
   {notice&&<p className="helper" role="status">{notice}</p>}
  </section>
 </div>;
}

export function Orders({orders,onDelete,onInvoice,userId,products,customers,onSaveOrder,onUpdateOrder}:{orders:OrderRecord[];onDelete:(id:number)=>boolean;onInvoice:(order:OrderRecord)=>void;userId:string;products:Product[];customers:Customer[];onSaveOrder:(items:CartItem[],customer:string,rtn:string,total:number)=>boolean;onUpdateOrder:(id:number,items:CartItem[],customer:string,rtn:string,total:number)=>boolean}){
 const [notice,setNotice]=useState('');
 const [newDrafts,setNewDrafts]=useState<OrderDraft[]>(()=>{const saved=readDrafts(userId);return saved.length?saved:[{id:'new-initial-'+userId,customer:'',customerRtn:'',items:[]}];});
 const [editingIds,setEditingIds]=useState<number[]>([]);
 useEffect(()=>{try{localStorage.setItem(draftKey(userId),JSON.stringify(newDrafts));}catch{/* Los borradores siguen disponibles en memoria durante esta sesión. */}},[newDrafts,userId]);
 useEffect(()=>{if(!newDrafts.length)setNewDrafts([{id:'new-initial-'+userId,customer:'',customerRtn:'',items:[]}]);},[newDrafts.length,userId]);
 const [query,setQuery]=useState(''),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState('');
 const matches=(order:OrderRecord,dateValue:string)=>{const day=String(dateValue||'').slice(0,10),term=query.trim().toLocaleLowerCase('es');return (!term||[order.number,order.customer??'',order.customerRtn??'',...order.items.map(item=>item.name)].join(' ').toLocaleLowerCase('es').includes(term))&&(!dateFrom||day>=dateFrom)&&(!dateTo||day<=dateTo);};
 const pending=orders.filter(order=>order.status==='Pendiente'&&matches(order,order.date)),invoiced=orders.filter(order=>order.status==='Facturado'&&matches(order,order.updatedAt||order.date));
 const addDraft=()=>setNewDrafts(current=>[{id:'new-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),customer:'',customerRtn:'',items:[]},...current]);
 return <div className="content orders-page">
  <div className="page-intro orders-heading"><div><h2>Pedidos</h2><p>Creación, seguimiento y edición de pedidos.</p></div><button type="button" className="primary" onClick={addDraft}><Plus size={16}/> Crear pedido</button></div>
  {!!newDrafts.length&&<section className="card"><div className="section-heading"><div><h3>Pedidos en preparación ({newDrafts.length})</h3><p>Los borradores se guardan automáticamente en este navegador y pueden mantenerse abiertos a la vez.</p></div><ClipboardList size={20}/></div>
   <div className="order-drafts-grid">{newDrafts.map(draft=><article className="order-draft-card" key={draft.id}><div className="order-draft-title"><strong>Nuevo pedido</strong><button type="button" className="icon-button" aria-label="Descartar borrador" title="Descartar borrador" onClick={()=>setNewDrafts(current=>current.filter(item=>item.id!==draft.id))}><Trash2 size={15}/></button></div><OrderEditor key={draft.id} products={products} customers={customers} initialItems={draft.items} initialCustomer={draft.customer} initialRtn={draft.customerRtn} onSave={(items,customer,rtn,total)=>{const ok=onSaveOrder(items,customer,rtn,total);if(ok)setNewDrafts(current=>current.filter(item=>item.id!==draft.id));return ok;}}/></article>)}</div>
  </section>}
  <div className="card order-filters"><label className="order-search-label">Buscar pedido, cliente o producto<div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="N.º de pedido, cliente o producto..."/></div></label><label>Desde<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label><label>Hasta<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label><button type="button" className="secondary" onClick={()=>{setQuery('');setDateFrom('');setDateTo('');}}>Limpiar filtros</button><span className="count order-filter-count">{pending.length+invoiced.length} pedidos encontrados · {pending.length} pendientes · {invoiced.length} facturados</span></div>
  {notice&&<p className="helper" role="status">{notice}</p>}
  <section className="card"><div className="section-heading"><div><h3>Pedidos pendientes ({pending.length})</h3><p>Selecciona varios pedidos para abrir sus editores de forma independiente.</p></div></div>
   {!pending.length?<p className="muted">{orders.some(order=>order.status==='Pendiente')?'No hay pedidos pendientes que coincidan con los filtros.':'No hay pedidos pendientes.'}</p>:<div className="order-saved-list">{pending.map(order=><article className="order-saved-card" key={order.id}><div className="order-saved-summary"><div><strong>{order.number}</strong><small>{orderDate(order.date)} · {order.customer||'Consumidor final'} · {order.items.reduce((sum,item)=>sum+item.qty,0)} unidades</small></div><strong>{money(order.total)}</strong></div><div className="order-saved-actions"><button type="button" className="secondary" onClick={()=>setEditingIds(current=>current.includes(order.id)?current.filter(id=>id!==order.id):[...current,order.id])}><Pencil size={14}/>{editingIds.includes(order.id)?'Cerrar editor':'Editar pedido'}</button><button type="button" className="primary" onClick={()=>onInvoice(order)}><FileText size={14}/> Facturar</button><button type="button" className="icon-button" aria-label={'Eliminar '+order.number} onClick={()=>{if(window.confirm('¿Eliminar '+order.number+' y devolver las cantidades reservadas al inventario?')){const deleted=onDelete(order.id);setNotice(deleted?'':'No se pudo eliminar el pedido.');}}}><Trash2 size={15}/></button></div>{editingIds.includes(order.id)&&<OrderEditor key={order.id} products={products} customers={customers} initialItems={order.items} initialCustomer={order.customer??''} initialRtn={order.customerRtn??''} orderNumber={order.number} saveLabel="Guardar cambios" onCancel={()=>setEditingIds(current=>current.filter(id=>id!==order.id))} onSave={(items,customer,rtn,total)=>{const ok=onUpdateOrder(order.id,items,customer,rtn,total);if(ok)setEditingIds(current=>current.filter(id=>id!==order.id));return ok;}}/>}</article>)}</div>}
  </section>
  <section className="card"><div className="section-heading"><div><h3>Pedidos facturados ({invoiced.length})</h3><p>Historial de pedidos convertidos en factura.</p></div></div>
   {!invoiced.length?<p className="muted">{orders.some(order=>order.status==='Facturado')?'No hay pedidos facturados que coincidan con los filtros.':'Todavía no hay pedidos facturados.'}</p>:<div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha de facturación</th><th>Cliente</th><th>Factura</th><th>Total</th></tr></thead><tbody>{invoiced.map(order=><tr key={order.id}><td>{order.number}</td><td>{orderDate(order.updatedAt||order.date)}</td><td>{order.customer||'Consumidor final'}</td><td>{order.invoiceId??'—'}</td><td>{money(order.total)}</td></tr>)}</tbody></table></div>}
  </section>
 </div>;
}
