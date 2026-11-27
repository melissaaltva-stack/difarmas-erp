import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Pencil, Trash2, Search, Plus, Save, X, ClipboardList } from 'lucide-react';
import { RegisterCustomerModal } from './Customers';
import { CustomerSearchInput } from './CustomerSearchInput';
import type { CartItem, Customer, OrderRecord, Product } from '../domain/types';

const money=(value:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(value);
const orderDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('es-HN');};

type OrderDraft={id:string;orderNumber?:string;tabTitle?:string;customer:string;customerRtn:string;items:CartItem[]};
const draftKey=(userId:string)=>'farmi_orders_create_drafts_'+userId;
const tabTitleKey=(userId:string)=>'farmi_orders_tab_titles_'+userId;
const readDrafts=(userId:string):OrderDraft[]=>{try{const value=JSON.parse(localStorage.getItem(draftKey(userId))||'[]');return Array.isArray(value)?value.filter(item=>item&&typeof item.id==='string'&&Array.isArray(item.items)):[];}catch{return [];}};
const readSavedTabTitles=(userId:string):Record<string,string>=>{try{const value=JSON.parse(localStorage.getItem(tabTitleKey(userId))||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}};

function OrderEditor({products,customers,initialItems,initialCustomer='',initialRtn='',orderNumber='',saveLabel='Guardar pedido',onSave,onCancel,onDraftChange,onCreateCustomer}:{products:Product[];customers:Customer[];initialItems:CartItem[];initialCustomer?:string;initialRtn?:string;orderNumber?:string;saveLabel?:string;onSave:(items:CartItem[],customer:string,rtn:string,total:number,number:string)=>boolean;onCancel?:()=>void;onDraftChange?:(items:CartItem[],customer:string,rtn:string)=>void;onCreateCustomer:(customer:Customer)=>void}){
 const [items,setItems]=useState<CartItem[]>(()=>initialItems.map(item=>({...item})));
 const [customer,setCustomer]=useState(initialCustomer);
 const [customerSearch,setCustomerSearch]=useState(initialCustomer);
 const [customerPickerOpen,setCustomerPickerOpen]=useState(false);
 const [customerRtn,setCustomerRtn]=useState(initialRtn);
 const [query,setQuery]=useState('');
 const [notice,setNotice]=useState('');
 const [newCustomer,setNewCustomer]=useState(false);
 const [seller,setSeller]=useState('General');
 const [priceList,setPriceList]=useState('Precio de venta 1');
 const [payment,setPayment]=useState('Efectivo');
 const [notes,setNotes]=useState('');
 const invoiceDate=new Date().toISOString().slice(0,10);
 const [maxDate,setMaxDate]=useState(invoiceDate);
 useEffect(()=>{onDraftChange?.(items,customer,customerRtn);},[items,customer,customerRtn]);
 const results=useMemo(()=>products.filter(product=>product.stock>0&&[product.code,product.name,product.laboratory,product.category,product.presentation,...(product.activeIngredients??[])].join(' ').toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))).slice(0,8),[products,query]);
 const subtotal=items.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.qty)||0),0);
 const taxTotal=items.reduce((sum,item)=>{if(!item.taxEnabled)return sum;const rate=Math.max(0,Number(item.taxRate??15));const line=Math.max(0,Number(item.price)||0)*(Number(item.qty)||0);return sum+(item.priceIncludesTax?line*rate/(100+rate):line*rate/100);},0);
 const addProduct=(product:Product)=>{setItems(current=>{const found=current.find(item=>item.id===product.id&&item.saleUnit===undefined);if(found)return current.map(item=>item===found?{...item,qty:item.qty+1}:item);return [...current,{...product,qty:1,price:priceList==='Precio de venta mayoreo'?product.wholesale:product.retail}];});setQuery('');};
 const updateLine=(index:number,patch:Partial<CartItem>)=>setItems(current=>current.map((item,i)=>i===index?{...item,...patch}:item));
 const selectedCustomer=customers.find(c=>c.name===customer);
 return <div className="card order-editor standard-invoice">
  <div className="invoice-layout">
   <section className="card invoice-header-card order-invoice-header"><div className="invoice-header-grid">
    <div className="invoice-top-fields-row">
     <div className="invoice-field invoice-field-number"><label className="field-label">N.º de pedido</label><input value={orderNumber||'Asignando correlativo…'} readOnly/></div>
     <div className="invoice-field invoice-field-seller"><label className="field-label">Vendedor</label><select value={seller} onChange={e=>setSeller(e.target.value)}><option>General</option></select></div>
     <div className="invoice-field invoice-field-date"><label className="field-label">Fecha</label><input type="date" value={invoiceDate} readOnly/></div>
     <div className="invoice-field invoice-field-max-date"><label className="field-label">Fecha máxima</label><input type="date" min={invoiceDate} value={maxDate} onChange={e=>setMaxDate(e.target.value)}/></div>
    </div>
    <div className="invoice-field invoice-customer-field"><label className="field-label" htmlFor="order-customer">Cliente</label>
     <CustomerSearchInput id="order-customer" customers={customers} query={customerSearch} open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}
      onQueryChange={value=>{setCustomerSearch(value);setCustomer('');setCustomerRtn('');}}
      onSelect={selectedCustomer=>{setCustomer(selectedCustomer?.name??'');setCustomerSearch(selectedCustomer?.name??'Consumidor Final');setCustomerRtn(selectedCustomer?.rtn??'');}}
      onRegisterNew={()=>setNewCustomer(true)} includeConsumerFinal placeholder="Buscar cliente por nombre, código o RTN">
      <div className="invoice-payment-inline"><label className="field-label">Forma de pago</label><select value={payment} onChange={e=>setPayment(e.target.value)}><option>Efectivo</option><option>Transferencia</option><option>Crédito</option></select></div>
     </CustomerSearchInput>
    </div>
    <div className="invoice-bottom-fields-row">
     <div className="invoice-field invoice-field-price"><label className="field-label">Precio de venta</label><select value={priceList} onChange={e=>setPriceList(e.target.value)}><option>Precio de venta 1</option><option>Precio de venta mayoreo</option></select></div>
     <div className="invoice-field invoice-field-address"><label className="field-label">Dirección</label><input value={customers.find(c=>c.name===customer)?.address??''} readOnly placeholder="Dirección del cliente"/></div>
     <div className="invoice-field invoice-field-phone"><label className="field-label">Teléfono</label><input value={customers.find(c=>c.name===customer)?.phone??''} readOnly placeholder="Teléfono del cliente"/></div>
     <div className="invoice-field invoice-field-rtn"><label className="field-label">RTN</label><input value={customerRtn} onChange={e=>setCustomerRtn(e.target.value)} placeholder="RTN del cliente"/></div>
    </div></div>
    {newCustomer&&<RegisterCustomerModal customers={customers} onClose={()=>setNewCustomer(false)} onSave={customerRecord=>{onCreateCustomer(customerRecord);setCustomer(customerRecord.name);setCustomerSearch(customerRecord.name);setCustomerPickerOpen(false);setCustomerRtn(customerRecord.rtn??'');setNewCustomer(false);}}/>}
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
   <div className="invoice-summary"><div className="invoice-summary-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div className="invoice-summary-row"><span>Descuento</span><strong>{money(0)}</strong></div><div className="invoice-summary-row invoice-summary-isv"><span>ISV</span><strong>{money(taxTotal)}</strong></div></div>
   <div className="invoice-total"><span>Total del pedido</span><strong>{money(subtotal)}</strong></div>
   <div className="invoice-actions">{onCancel&&<button type="button" className="secondary" onClick={onCancel}>Cancelar</button>}<button type="button" className="primary" disabled={!items.length||!orderNumber} onClick={()=>{setNotice('');if(onSave(items,customer,customerRtn.trim(),subtotal,orderNumber))setNotice('Pedido guardado correctamente.');else setNotice('No se pudo guardar. Revisa existencias y sincronización.');}}><Save size={15}/>{saveLabel}</button></div>
   {notice&&<p className="helper" role="status">{notice}</p>}
  </section>
 <section className="card invoice-header-card invoice-notes-card"><div className="invoice-field inv-span-12"><label className="field-label">Notas del pedido</label><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ingresar notas en el pedido (opcional)"/></div></section>
 </div>;
}

export function Orders({orders,onDelete,onInvoice,userId,products,customers,onSaveOrder,onUpdateOrder,onCreateCustomer,reserveOrderNumber,remoteReady}:{orders:OrderRecord[];onDelete:(id:number)=>boolean;onInvoice:(order:OrderRecord)=>void;userId:string;products:Product[];customers:Customer[];onCreateCustomer:(customer:Customer)=>void;reserveOrderNumber:()=>string;remoteReady:boolean;onSaveOrder:(items:CartItem[],customer:string,rtn:string,total:number,number:string)=>boolean;onUpdateOrder:(id:number,items:CartItem[],customer:string,rtn:string,total:number)=>boolean}){
 const [notice,setNotice]=useState('');
 const [pendingModalOpen,setPendingModalOpen]=useState(false);
 const [pendingSearch,setPendingSearch]=useState('');
 const [newDrafts,setNewDrafts]=useState<OrderDraft[]>(()=>{const saved=readDrafts(userId);return saved.length?saved:[{id:'new-initial-'+userId,customer:'',customerRtn:'',items:[]}];});
 const [editingIds,setEditingIds]=useState<number[]>([]);
 const [savedTabTitles,setSavedTabTitles]=useState<Record<string,string>>(()=>readSavedTabTitles(userId));
 const [activeTab,setActiveTab]=useState('new:'+ (readDrafts(userId)[0]?.id??'new-initial-'+userId));
 const draftNumbersAssigned=useRef(false);
 useEffect(()=>{
  if(!remoteReady||draftNumbersAssigned.current)return;
  draftNumbersAssigned.current=true;
  const reserved=new Map(newDrafts.filter(draft=>!draft.orderNumber).map(draft=>[draft.id,reserveOrderNumber()]));
  if(reserved.size)setNewDrafts(current=>current.map(draft=>reserved.has(draft.id)?{...draft,orderNumber:reserved.get(draft.id)}:draft));
 },[remoteReady,userId]);
 useEffect(()=>{try{localStorage.setItem(draftKey(userId),JSON.stringify(newDrafts));}catch{/* Los borradores siguen disponibles en memoria durante esta sesión. */}},[newDrafts,userId]);
 useEffect(()=>{try{localStorage.setItem(tabTitleKey(userId),JSON.stringify(savedTabTitles));}catch{/* Los nombres personalizados siguen disponibles en memoria durante esta sesión. */}},[savedTabTitles,userId]);
 const [query,setQuery]=useState(''),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState('');
 const matches=(order:OrderRecord,dateValue:string)=>{const day=String(dateValue||'').slice(0,10),term=query.trim().toLocaleLowerCase('es');return (!term||[order.number,order.customer??'',order.customerRtn??'',...order.items.map(item=>item.name)].join(' ').toLocaleLowerCase('es').includes(term))&&(!dateFrom||day>=dateFrom)&&(!dateTo||day<=dateTo);};
 const pending=orders.filter(order=>order.status==='Pendiente'&&matches(order,order.date));
 const visiblePending=pending.filter(order=>!pendingSearch.trim()||[order.number,order.customer??'',order.customerRtn??'',...order.items.map(item=>item.name)].join(' ').toLocaleLowerCase('es').includes(pendingSearch.trim().toLocaleLowerCase('es')));
 const createDraft=():OrderDraft=>({id:'new-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),orderNumber:remoteReady?reserveOrderNumber():'',customer:'',customerRtn:'',items:[]});
 const addDraft=()=>{const draft=createDraft();setNewDrafts(current=>[draft,...current]);setActiveTab('new:'+draft.id);};
 const openSavedOrder=(id:number)=>{setPendingModalOpen(false);setEditingIds(current=>current.includes(id)?current:[...current,id]);setActiveTab('saved:'+id);};
 const closeTab=(tabId:string)=>{
  if(tabId.startsWith('new:')){
   const id=tabId.slice(4),remainingDrafts=newDrafts.filter(draft=>draft.id!==id);
   setNewDrafts(remainingDrafts);
   if(remainingDrafts.length)setActiveTab('new:'+remainingDrafts[0].id);
   else if(editingIds[0]!==undefined)setActiveTab('saved:'+editingIds[0]);
   else{const fresh=createDraft();setNewDrafts([fresh]);setActiveTab('new:'+fresh.id);}
  }else{
   const id=Number(tabId.slice(6)),remainingEditing=editingIds.filter(value=>value!==id);
   setEditingIds(remainingEditing);
   if(remainingEditing.length)setActiveTab('saved:'+remainingEditing[0]);
   else if(newDrafts.length)setActiveTab('new:'+newDrafts[0].id);
   else{const fresh=createDraft();setNewDrafts([fresh]);setActiveTab('new:'+fresh.id);}
  }
 };
 const activeNew=newDrafts.find(draft=>'new:'+draft.id===activeTab);
 const activeSaved=orders.find(order=>'saved:'+order.id===activeTab&&editingIds.includes(order.id));
 return <div className="content orders-page">
  <div className="page-intro orders-heading"><button type="button" className="orders-pending-shortcut" onClick={()=>setPendingModalOpen(true)} aria-haspopup="dialog" aria-expanded={pendingModalOpen}><span className="orders-pending-shortcut-icon"><ClipboardList size={18}/></span><span className="orders-pending-shortcut-copy"><strong>Pedidos pendientes</strong><small>Consultar pedidos por facturar</small></span><span className="orders-pending-shortcut-count">{pending.length}</span></button></div>
  <section className="card orders-workspace">
   <div className="orders-tabs-bar" role="tablist" aria-label="Pedidos abiertos">
    {newDrafts.map((draft,index)=><div className={'orders-tab'+(activeTab==='new:'+draft.id?' active':'')} key={draft.id} role="tab" aria-selected={activeTab==='new:'+draft.id}><div className="orders-tab-select" onClick={()=>setActiveTab('new:'+draft.id)}><span className="orders-tab-dot"/><input type="text" className="orders-tab-title-input" aria-label="Nombre de la pestaña del pedido" value={draft.tabTitle??''} placeholder="Pedido" onFocus={()=>setActiveTab('new:'+draft.id)} onChange={event=>setNewDrafts(current=>current.map(item=>item.id===draft.id?{...item,tabTitle:event.target.value}:item))}/></div><button type="button" className="orders-tab-close" aria-label="Cerrar borrador" onClick={()=>closeTab('new:'+draft.id)}><X size={13}/></button></div>)}
    {editingIds.map(id=>{const order=orders.find(item=>item.id===id);if(!order)return null;return <div className={'orders-tab'+(activeTab==='saved:'+id?' active':'')} key={id} role="tab" aria-selected={activeTab==='saved:'+id}><div className="orders-tab-select" onClick={()=>setActiveTab('saved:'+id)}><span className="orders-tab-dot saved"/><input type="text" className="orders-tab-title-input" aria-label={'Nombre de la pestaña del pedido '+order.number} value={savedTabTitles[String(id)]??''} placeholder="Pedido" onFocus={()=>setActiveTab('saved:'+id)} onChange={event=>setSavedTabTitles(current=>({...current,[String(id)]:event.target.value}))}/></div><button type="button" className="orders-tab-close" aria-label={'Cerrar '+order.number} onClick={()=>closeTab('saved:'+id)}><X size={13}/></button></div>;})}
    <button type="button" className="orders-tab-add" onClick={addDraft} disabled={!remoteReady}><Plus size={15}/> Nuevo</button>
   </div>
   <div className="orders-tab-content">
    {newDrafts.map(draft=><div key={draft.id} className="orders-tab-panel" hidden={activeTab!=='new:'+draft.id}><div className="orders-tab-panel-heading"><div>{draft.customer&&<strong>{draft.customer}</strong>}</div><span>{draft.items.length} producto(s)</span></div><OrderEditor key={draft.id} products={products} customers={customers} initialItems={draft.items} initialCustomer={draft.customer} initialRtn={draft.customerRtn} orderNumber={draft.orderNumber} onDraftChange={(items,customer,customerRtn)=>setNewDrafts(current=>current.map(item=>item.id===draft.id?{...item,items,customer,customerRtn}:item))} onCreateCustomer={onCreateCustomer} onSave={(items,customer,rtn,total,number)=>{const ok=onSaveOrder(items,customer,rtn,total,number);if(ok){const next=newDrafts.find(item=>item.id!==draft.id);if(next){setNewDrafts(current=>current.filter(item=>item.id!==draft.id));setActiveTab('new:'+next.id);}else{const fresh=createDraft();setNewDrafts([fresh]);setActiveTab('new:'+fresh.id);}}return ok;}}/></div>)}
    {editingIds.map(id=>{const order=orders.find(item=>item.id===id);if(!order)return null;return <div key={id} className="orders-tab-panel" hidden={activeTab!=='saved:'+id}><div className="orders-tab-panel-heading"><div><strong>{order.number}</strong><small>Pedido pendiente · {order.customer||'Consumidor final'}</small></div><span>{money(order.total)}</span></div><OrderEditor key={id} products={products} customers={customers} initialItems={order.items} initialCustomer={order.customer??''} initialRtn={order.customerRtn??''} orderNumber={order.number} saveLabel="Guardar cambios" onCreateCustomer={onCreateCustomer} onCancel={()=>closeTab('saved:'+id)} onSave={(items,customer,rtn,total)=>{const ok=onUpdateOrder(order.id,items,customer,rtn,total);if(ok)closeTab('saved:'+id);return ok;}}/></div>;})}
   </div>
  </section>
  <div className="card order-filters"><label className="order-search-label">Buscar pedido, cliente o producto<div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="N.º de pedido, cliente o producto..."/></div></label><label>Desde<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label><label>Hasta<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label><button type="button" className="secondary" onClick={()=>{setQuery('');setDateFrom('');setDateTo('');}}>Limpiar filtros</button><span className="count order-filter-count">{pending.length} pedidos pendientes</span></div>
  {notice&&<p className="helper" role="status">{notice}</p>}
  {pendingModalOpen&&<div className="orders-pending-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPendingModalOpen(false);}}>
   <section className="orders-pending-modal" role="dialog" aria-modal="true" aria-labelledby="orders-pending-title">
    <header className="orders-pending-modal-header"><div><h3 id="orders-pending-title">Pedidos pendientes</h3><p>{visiblePending.length} de {pending.length} pedido(s) por facturar</p></div><button type="button" className="icon-button" aria-label="Cerrar pedidos pendientes" onClick={()=>setPendingModalOpen(false)}><X size={18}/></button></header>
    <div className="orders-pending-modal-body">
     <label className="orders-pending-filter"><Search size={15}/><input type="search" value={pendingSearch} onChange={event=>setPendingSearch(event.target.value)} placeholder="Filtrar por número, cliente o producto..." aria-label="Filtrar pedidos pendientes"/><button type="button" className="secondary" onClick={()=>setPendingSearch('')} disabled={!pendingSearch}>Limpiar</button></label>
     {!pending.length?<p className="muted orders-pending-empty">{orders.some(order=>order.status==='Pendiente')?'No hay pedidos pendientes que coincidan con los filtros.':'Todavía no hay pedidos pendientes.'}</p>:!visiblePending.length?<p className="muted orders-pending-empty">No hay pedidos que coincidan con el filtro.</p>:<div className="orders-pending-rows">
      <div className="orders-pending-row orders-pending-row-head"><span>Pedido / fecha</span><span>Cliente</span><span>Artículos</span><span>Total</span><span>Acciones</span></div>
      {visiblePending.map(order=><article className="orders-pending-row" key={order.id}>
       <div className="orders-pending-order"><strong>{order.number}</strong><small>{orderDate(order.date)}</small></div>
       <span className="orders-pending-customer">{order.customer||'Consumidor final'}</span>
       <span>{order.items.reduce((sum,item)=>sum+item.qty,0)} unidades</span>
       <strong className="orders-pending-total">{money(order.total)}</strong>
       <div className="orders-pending-actions"><button type="button" className="secondary" onClick={()=>openSavedOrder(order.id)}><Pencil size={13}/>{editingIds.includes(order.id)?'Ver':'Abrir'}</button><button type="button" className="primary" onClick={()=>{setPendingModalOpen(false);onInvoice(order);}}><FileText size={13}/> Facturar</button><button type="button" className="icon-button" aria-label={'Eliminar '+order.number} title="Eliminar pedido" onClick={()=>{if(window.confirm('¿Eliminar '+order.number+' y devolver las cantidades reservadas al inventario?')){const deleted=onDelete(order.id);setNotice(deleted?'':'No se pudo eliminar el pedido.');}}}><Trash2 size={14}/></button></div>
      </article>)}
     </div>}
    </div>
   </section>
  </div>}


 </div>;
}
