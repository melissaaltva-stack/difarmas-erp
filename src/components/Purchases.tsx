import { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, Search, Boxes, CalendarClock, History, TrendingUp, TrendingDown, Minus, AlertTriangle, Sparkles, Plus, Trash2 } from 'lucide-react';
import type { PurchaseItem, Product, Supplier, PurchaseCostHistoryEntry, SaleRecord } from '../domain/types';
import { buildPurchaseRecommendations } from '../services/purchaseRecommendationService';
import { localDateKey } from '../utils/dates';
import { isExpiryAtLeastSixMonths, sixMonthExpiryThreshold } from '../services/expiryService';
import { Suppliers } from './Suppliers';
import type { SupplierReturnRecord } from '../domain/types';
const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);
const percent = (value:number) => `${value.toLocaleString('es-HN',{maximumFractionDigits:1,minimumFractionDigits:1})}%`;

export function Purchases({products,sales,cart,setCart,search,setSearch,supplier,setSupplier,suppliers=[],setSuppliers,records=[],setRecords,onDispatch,showSuppliers=true,costHistory=[],onReceive,onOpenNewProduct,onEditProduct,sectionRequest=0,requestedSection='compras'}:{products:Product[];sales:SaleRecord[];cart:PurchaseItem[];setCart:(c:PurchaseItem[])=>void;search:string;setSearch:(v:string)=>void;supplier:string;setSupplier:(v:string)=>void;suppliers?:Supplier[];setSuppliers:(items:Supplier[])=>void;records?:SupplierReturnRecord[];setRecords:(items:SupplierReturnRecord[])=>void;onDispatch:(record:SupplierReturnRecord)=>boolean;showSuppliers?:boolean;costHistory?:PurchaseCostHistoryEntry[];onReceive:(items:PurchaseItem[],paymentMethod:'Efectivo'|'Transferencia'|'Crédito',dueDate:string,invoiceNumber:string,invoiceDate:string,notes:string,purchaseTotal?:number,paymentTerms?:string)=>boolean;onOpenNewProduct:()=>void;onEditProduct:(product:Product)=>void;sectionRequest?:number;requestedSection?:'compras'|'proveedores'|'nueva-compra'}) {
  const [section,setSection]=useState<'compras'|'proveedores'>('compras');
  useEffect(()=>{setSection(requestedSection==='proveedores'?'proveedores':'compras');if(requestedSection==='nueva-compra'){setPurchaseHeaderError('');setShowPurchaseModal(true);}},[sectionRequest,requestedSection]);
  const [showSuggestedPurchases,setShowSuggestedPurchases]=useState(false);
  const [showPurchaseHistory,setShowPurchaseHistory]=useState(false);
  const [showCostComparison,setShowCostComparison]=useState(false);
  const results=products.filter(p=>[p.code,p.name].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0,6);
  const purchaseTaxRate=(item:PurchaseItem)=>{const rate=item.purchaseTaxRate??(item.taxEnabled?Number(item.taxRate??15):0);return Number.isFinite(rate)&&rate>0?rate:0;};
  const linePurchaseTax=(item:PurchaseItem)=>item.unitCost*item.qty*purchaseTaxRate(item)/100;
  const itemsTotal=cart.reduce((sum,i)=>sum+i.unitCost*i.qty,0);
  const purchaseTaxTotal=cart.reduce((sum,item)=>sum+linePurchaseTax(item),0);
  const [paymentMethod,setPaymentMethod]=useState<'Efectivo'|'Transferencia'|'Crédito'>('Efectivo');
  const [paymentTerms,setPaymentTerms]=useState('Contado - Efectivo');
  const [invoiceTotal,setInvoiceTotal]=useState('');
  const [showPurchaseModal,setShowPurchaseModal]=useState(false);
  const [purchaseSetupComplete,setPurchaseSetupComplete]=useState(false);
  const [showNewSupplierModal,setShowNewSupplierModal]=useState(false);
  const [purchaseHeaderError,setPurchaseHeaderError]=useState('');
  const [supplierFormError,setSupplierFormError]=useState('');
  const emptyNewSupplier=()=>({name:'',contact:'',phone:'',email:'',rtn:'',address:'',paymentTerms:'Contado',notes:'',active:true});
  const [newSupplierForm,setNewSupplierForm]=useState(emptyNewSupplier());
  const [invoiceNumber,setInvoiceNumber]=useState('');
  const [invoiceDate,setInvoiceDate]=useState(()=>localDateKey(new Date()));
  const [purchaseNotes,setPurchaseNotes]=useState('');
  const [error,setError]=useState('');
  const [dueDate,setDueDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()+30);return localDateKey(d);});
  const enteredInvoiceTotal=invoiceTotal.trim()===''?NaN:Number(invoiceTotal);
  const total=Number.isFinite(enteredInvoiceTotal)&&enteredInvoiceTotal>=0?enteredInvoiceTotal:itemsTotal+purchaseTaxTotal;
  const creditTerm=paymentTerms.startsWith('Crédito');
  const updatePaymentTerms=(value:string)=>{
    setPaymentTerms(value);
    setPaymentMethod(value.includes('Transferencia')?'Transferencia':value.startsWith('Crédito')?'Crédito':'Efectivo');
    if(value.startsWith('Crédito')){
      const days=Number((value.match(/(7|15|30|45|60)\s*días?/i)||[])[1]||30);
      const base=new Date((invoiceDate||localDateKey(new Date()))+'T12:00:00');
      if(!Number.isNaN(base.getTime())){base.setDate(base.getDate()+days);setDueDate(localDateKey(base));}
    }
  };
  const saveNewSupplierFromPurchase=()=>{
    const name=newSupplierForm.name.trim();
    if(!name){setSupplierFormError('El nombre del proveedor es obligatorio.');return;}
    if(suppliers.some(item=>item.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){
      setSupplierFormError('Ya existe un proveedor con ese nombre.');return;
    }
    const created:Supplier={...newSupplierForm,id:Date.now(),name};
    setSuppliers([created,...suppliers]);
    setSupplier(created.name);
    updatePaymentTerms(created.paymentTerms==='Contado'?'Contado - Efectivo':created.paymentTerms);
    setNewSupplierForm(emptyNewSupplier());
    setSupplierFormError('');
    setShowNewSupplierModal(false);
    setPurchaseHeaderError('');
  };
  const continuePurchaseSetup=()=>{
    if(!supplier.trim()){setPurchaseHeaderError('Selecciona o escribe el nombre del proveedor.');return;}
    if(!invoiceDate){setPurchaseHeaderError('Indica la fecha de la factura.');return;}
    if(creditTerm&&!dueDate){setPurchaseHeaderError('Indica la fecha de crédito.');return;}
    if(invoiceTotal.trim()!==''&&(!Number.isFinite(enteredInvoiceTotal)||enteredInvoiceTotal<0)){setPurchaseHeaderError('Ingresa un total válido.');return;}
    setPurchaseHeaderError('');
    setPurchaseSetupComplete(true);
    setShowPurchaseModal(false);
  };
  const minExpiry=sixMonthExpiryThreshold();
  const add=(p:Product)=>{setCart(cart.some(i=>i.id===p.id)?cart.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i):[...cart,{...p,expiry:'',qty:1,unitCost:p.cost,purchaseTaxRate:p.taxEnabled?Number(p.taxRate??15):0}]);setSearch('');setError('');};
  const change=(id:number,delta:number)=>setCart(cart.map(i=>i.id===id?{...i,qty:Math.max(1,i.qty+delta)}:i));
  const updateCost=(id:number,value:number)=>setCart(cart.map(i=>i.id===id?{...i,unitCost:value}:i));
  const updatePurchaseTax=(id:number,rate:number)=>setCart(cart.map(i=>i.id===id?{...i,purchaseTaxRate:rate}:i));
  const updateExpiry=(id:number,value:string)=>{setCart(cart.map(i=>i.id===id?{...i,expiry:value}:i));setError('');};
  const invalidExpiry=cart.filter(i=>!isExpiryAtLeastSixMonths(i.expiry));
  const priceChanges=cart.map(item=>{const product=products.find(p=>p.id===item.id);const oldCost=product?.cost??item.cost;const delta=item.unitCost-oldCost;const changePct=oldCost>0?delta/oldCost*100:(item.unitCost>0?100:0);const oldMargin=product&&product.retail>0?(product.retail-oldCost)/product.retail*100:null;const newMargin=product&&product.retail>0?(product.retail-item.unitCost)/product.retail*100:null;return {item,oldCost,delta,changePct,oldMargin,newMargin};});
  const increases=priceChanges.filter(x=>x.delta>0.005);
  const marginWarnings=priceChanges.filter(x=>x.newMargin!==null&&x.newMargin<0);
  const recommendations=useMemo(()=>buildPurchaseRecommendations(products,sales),[products,sales]);
  if(section==='proveedores'&&showSuppliers)return <div className="content"><div id="suppliers-panel"><Suppliers suppliers={suppliers} setSuppliers={setSuppliers} products={products} records={records} setRecords={setRecords} onDispatch={onDispatch}/></div></div>;
  const addRecommended=(product:Product,quantity:number)=>{
    setCart(cart.some(item=>item.id===product.id)
      ? cart.map(item=>item.id===product.id?{...item,qty:item.qty+quantity}:item)
      : [...cart,{...product,expiry:'',qty:quantity,unitCost:product.cost}]);
    setSearch('');
    setError('');
  };
  return <div className="content">
  <div id="purchases-panel">
  <div className="purchase-page-heading"><button type="button" className="primary" onClick={()=>{setPurchaseHeaderError('');setShowPurchaseModal(true);}}><Plus size={16}/> Nueva compra</button></div>
  
  <div className="ai-purchase-launch" id="purchase-ai"><button className="primary" type="button" onClick={()=>setShowSuggestedPurchases(open=>!open)}><Sparkles size={17}/>{showSuggestedPurchases?'Ocultar compras sugeridas con IA':'Compras sugeridas con IA'}</button></div>
  {showSuggestedPurchases&&<section className="card ai-purchase-recommendations">
    <div className="ai-purchase-heading"><div className="ai-purchase-icon"><Sparkles size={20}/></div><div><h3>Compras sugeridas inteligentes</h3><p>Analiza ventas de los últimos 60 días, existencia, stock mínimo y cobertura estimada. No genera pedidos automáticamente.</p></div><span className="ai-purchase-count">{recommendations.length} sugerencia(s)</span></div>
    {recommendations.length===0?<div className="ai-purchase-empty"><strong>No se detectan reposiciones prioritarias.</strong><p>Verifica que las ventas tengan detalle por producto y que el stock mínimo esté configurado.</p></div>:<div className="ai-purchase-list">{recommendations.slice(0,8).map(item=><article className="ai-purchase-row" key={item.product.id}><div className="ai-purchase-product"><strong>{item.product.name}</strong><small>{item.product.code||'Sin código'} · Stock {item.product.stock} · Mín. {item.product.minStock}</small><span className={item.priority==='Alta'?'ai-priority high':item.priority==='Media'?'ai-priority medium':'ai-priority'}>Prioridad {item.priority}</span></div><div className="ai-purchase-quantity"><small>Cantidad sugerida</small><strong>{item.suggestedQuantity} u.</strong><small>Estimado: {money(item.estimatedCost)}</small></div><div className="ai-purchase-reason"><p>{item.reason}</p>{item.limitedData&&<small>Datos limitados: recomendación basada en el mínimo, no en pronóstico de ventas.</small>}</div><button className="secondary ai-add-suggestion" onClick={()=>addRecommended(item.product,item.suggestedQuantity)}><Plus size={15}/> Agregar</button></article>)}</div>}
    {recommendations.length>8&&<p className="helper">Se muestran las 8 prioridades principales de {recommendations.length} sugerencias.</p>}
    <small className="helper">La recomendación es una estimación operativa; revisa vencimientos por lote, pedidos pendientes, presupuesto y disponibilidad del proveedor antes de comprar.</small>
  </section>}
  <div className="purchase-grid" id="purchase-order"><section><div className="card purchase-head">{purchaseSetupComplete?<div className="purchase-inline-header"><div className="purchase-inline-header-top"><strong>Datos de la compra</strong><button type="button" className="secondary" onClick={()=>{setPurchaseHeaderError('');setShowPurchaseModal(true);}}>Editar / Nuevo proveedor</button></div><div className="purchase-inline-header-form"><label>Proveedor<input list="purchase-inline-supplier-list" value={supplier} onChange={e=>setSupplier(e.target.value)} /><datalist id="purchase-inline-supplier-list">{suppliers.filter(item=>item.active).map(item=><option key={item.id} value={item.name}/>)}</datalist></label><label>N.º de factura<input value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} placeholder="N.º de factura"/></label><label>Términos de pago<select value={paymentTerms} onChange={e=>updatePaymentTerms(e.target.value)}><option value="Contado - Efectivo">Contado · Efectivo</option><option value="Contado - Transferencia">Contado · Transferencia</option><option value="Crédito a 7 días">Crédito a 7 días</option><option value="Crédito a 15 días">Crédito a 15 días</option><option value="Crédito a 30 días">Crédito a 30 días</option><option value="Crédito a 45 días">Crédito a 45 días</option><option value="Crédito a 60 días">Crédito a 60 días</option></select></label><label>Fecha de factura<input type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></label>{creditTerm&&<label>Fecha de crédito<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>}<label>Total de la compra<input type="number" min="0" step="0.01" value={invoiceTotal} onChange={e=>setInvoiceTotal(e.target.value)} placeholder={(itemsTotal+purchaseTaxTotal).toFixed(2)}/></label></div></div>:<div className="purchase-data-launch"><button type="button" className="secondary" onClick={()=>{setPurchaseHeaderError('');setShowPurchaseModal(true);}}>Ingresar datos de compra</button></div>}<div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar producto para agregar..." /></div></div>{search&&<div className="results card purchase-product-results" role="listbox" aria-label="Productos encontrados">{results.map(p=><button type="button" className="purchase-product-option" key={p.id} onClick={()=>add(p)} aria-label={`Agregar ${p.name} a la compra`}><span className="purchase-product-option-main"><strong>{p.name}</strong><span className="purchase-product-option-meta"><span className="purchase-product-code">{p.code||'Sin código'}</span>{p.category&&<span className="purchase-product-category">{p.category}</span>}<span className={p.stock>p.minStock?'purchase-stock-ok':'purchase-stock-low'}>Existencia: {p.stock}</span></span></span><span className="purchase-product-option-end"><strong className="purchase-product-cost">{money(p.cost)}</strong><span className="purchase-product-add"><Plus size={14}/> Agregar</span></span></button>)}{results.length===0&&<div className="purchase-no-results"><Search size={18}/><strong>No se encontraron productos</strong><span>Prueba con otro nombre o código.</span></div>}</div>}
  {cart.length>0&&<div className="purchase-history-launch"><button type="button" className="secondary cost-comparison-button" onClick={()=>setShowCostComparison(true)}><TrendingUp size={16}/> Comparación de precios <span>{priceChanges.length}</span></button></div>}
  {showCostComparison&&<div className="modal-backdrop cost-comparison-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCostComparison(false);}}><section className="modal cost-comparison-dialog" role="dialog" aria-modal="true" aria-labelledby="cost-comparison-title"><div className="modal-head"><div><h2 id="cost-comparison-title">Comparación de precios</h2><p>Compara el costo actual registrado en inventario con el costo ofrecido en esta compra.</p></div><button type="button" className="icon-btn" onClick={()=>setShowCostComparison(false)} aria-label="Cerrar">×</button></div><div className="cost-comparison-dialog-content"><div className="card cost-review">
  {priceChanges.map(({item,oldCost,delta,changePct,oldMargin,newMargin})=><div className="cost-review-row" key={item.id}><div className="cost-product"><strong>{item.name}</strong><small>{item.code}</small></div><div><small>Costo actual</small><strong>{money(oldCost)}</strong></div><div><small>Costo nuevo</small><strong>{money(item.unitCost)}</strong></div><div className={delta>0.005?'cost-change-up':delta< -0.005?'cost-change-down':'cost-change-same'}>{delta>0.005?<TrendingUp size={15}/>:delta< -0.005?<TrendingDown size={15}/>:<Minus size={15}/>}<strong>{delta>0?'+':''}{money(delta)}</strong><small>{oldCost===0?(item.unitCost>0?'Nuevo costo':'Sin cambio'):(changePct>0?'+':'')+percent(changePct)}</small></div><div className="margin-comparison"><small>Margen al precio minorista actual</small><span>{oldMargin===null?'—':percent(oldMargin)} → <strong className={newMargin!==null&&newMargin<0?'negative-margin':''}>{newMargin===null?'—':percent(newMargin)}</strong></span></div></div>)}
  {increases.length>0&&<div className="cost-alert"><AlertTriangle size={17}/><div><strong>Se detectó aumento en {increases.length} producto(s)</strong><p>Revisa si el precio de venta actual sigue siendo rentable antes de confirmar la compra. El sistema no cambia los precios de venta automáticamente.</p></div></div>}
  {marginWarnings.length>0&&<div className="cost-alert cost-alert-danger"><AlertTriangle size={17}/><div><strong>Atención: posible venta con pérdida</strong><p>El costo nuevo supera el precio minorista registrado en {marginWarnings.map(x=>x.item.name).join(', ')}. Revisa el precio antes de vender.</p></div></div>}
  </div></div></section></div>}
  {cart.length>0&&<div className="purchase-history-launch"><button type="button" className="secondary purchase-history-button" onClick={()=>setShowPurchaseHistory(true)}><History size={16}/> Historial de costos <span>{costHistory.length}</span></button></div>}
  {showPurchaseHistory&&<div className="modal-backdrop purchase-history-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowPurchaseHistory(false);}}><section className="modal purchase-history-dialog" role="dialog" aria-modal="true" aria-labelledby="purchase-history-title"><div className="modal-head"><div><h2 id="purchase-history-title">Historial de costos por producto y proveedor</h2><p>Consulta los últimos costos registrados y compara proveedores.</p></div><button type="button" className="icon-btn" onClick={()=>setShowPurchaseHistory(false)} aria-label="Cerrar">×</button></div><div className="purchase-history-dialog-content"><div className="card purchase-history">
  {cart.map(item=>{const entries=costHistory.filter(entry=>entry.productId===item.id).sort((a,b)=>b.date.localeCompare(a.date));const supplierEntries=entries.filter(entry=>entry.supplier.trim().toLocaleLowerCase()===supplier.trim().toLocaleLowerCase());const best=entries.reduce<PurchaseCostHistoryEntry|undefined>((lowest,entry)=>!lowest||entry.unitCost<lowest.unitCost?entry:lowest,undefined);return <div className="purchase-history-product" key={item.id}><div className="purchase-history-product-head"><strong>{item.name}</strong><small>{item.code}</small></div><div className="purchase-history-stats"><div><small>Último costo de este proveedor</small><strong>{supplierEntries.length?money(supplierEntries[0].unitCost):'Sin historial'}</strong>{supplierEntries[0]&&<small>{new Date(supplierEntries[0].date).toLocaleDateString('es-HN')}</small>}</div><div><small>Mejor costo registrado</small><strong>{best?money(best.unitCost):'Sin historial'}</strong>{best&&<small>{best.supplier}</small>}</div><div><small>Última compra registrada</small><strong>{entries.length?money(entries[0].unitCost):'Sin historial'}</strong>{entries[0]&&<small>{entries[0].supplier} · {new Date(entries[0].date).toLocaleDateString('es-HN')}</small>}</div></div>{entries.length>0?<details className="purchase-history-details"><summary>Ver movimientos anteriores ({entries.length})</summary><div className="purchase-history-table"><div className="purchase-history-table-row purchase-history-table-head"><span>Fecha</span><span>Proveedor</span><span>Costo unitario</span><span>Unidades</span></div>{entries.slice(0,8).map(entry=><div className="purchase-history-table-row" key={entry.id}><span>{new Date(entry.date).toLocaleDateString('es-HN')}</span><span>{entry.supplier}</span><strong>{money(entry.unitCost)}</strong><span>{entry.quantity}</span></div>)}</div></details>:<p className="purchase-history-empty">Todavía no hay compras recibidas registradas para este producto. Este historial empieza con la próxima recepción.</p>}</div>})}
  </div></div></section></div>}
  <div className="card cart-card purchase-detail-card" id="purchase-detail">
    <div className="purchase-detail-heading">
      <div>
        <h3>Detalle de compra</h3>
        <p>{cart.length} {cart.length===1?'producto agregado':'productos agregados'}</p>
      </div>
      <button type="button" className="secondary purchase-add-product" onClick={onOpenNewProduct}><Plus size={15}/>Agregar producto</button>
    </div>
    {cart.length===0
      ? <div className="purchase-detail-empty">
          <ShoppingCart size={24}/>
          <strong>Aún no hay productos</strong>
          <span>Busca un producto arriba para añadirlo a esta compra.</span>
        </div>
      : <>
        <div className="purchase-detail-table">
          <div className="purchase-detail-columns" aria-hidden="true">
            <span>Producto</span><span>Vencimiento</span><span>Costo unitario</span><span>ISV</span><span>Cantidad</span><span>Total c/ISV</span><span></span>
          </div>
          <div className="purchase-detail-list">
            {cart.map(i=><div className="purchase-row purchase-row-expiry" key={i.id}>
              <div className="purchase-detail-product">
                <button type="button" className="purchase-product-edit-link" style={{border:0,background:"transparent",padding:0,color:"inherit",font:"inherit",textAlign:"left",cursor:"pointer"}} onClick={()=>onEditProduct(products.find(product=>product.id===i.id)??i)} title={`Editar ${i.name}`}><strong>{i.name}</strong></button><small>{i.code||'Sin código'}</small>
              </div>
              <div className="purchase-detail-expiry-cell">
                <label className="purchase-expiry-label">
                  
                  <input type="date" min={minExpiry} value={i.expiry||''} onChange={e=>updateExpiry(i.id,e.target.value)} aria-label={`Fecha de vencimiento de ${i.name}`}/>
                </label>
                {i.expiry&&!isExpiryAtLeastSixMonths(i.expiry)&&<small className="expiry-error">Debe vencer a partir de {minExpiry}.</small>}
              </div>
              <label className="purchase-cost-label">
                
                <input type="number" min="0" step="0.01" value={i.unitCost} onChange={e=>updateCost(i.id,Number(e.target.value))} aria-label={`Costo unitario de ${i.name}`}/>
              </label>
              <label className="purchase-isv-label">
                
                <select value={purchaseTaxRate(i)} onChange={e=>updatePurchaseTax(i.id,Number(e.target.value))} aria-label={`ISV de compra de ${i.name}`}>
                  <option value={0}>Exento</option><option value={15}>15%</option><option value={18}>18%</option>
                </select>
              </label>
              <div className="qty purchase-detail-qty" aria-label={`Cantidad de ${i.name}`}>
                <button type="button" aria-label={`Disminuir cantidad de ${i.name}`} onClick={()=>change(i.id,-1)}>-</button>
                <b>{i.qty}</b>
                <button type="button" aria-label={`Aumentar cantidad de ${i.name}`} onClick={()=>change(i.id,1)}>+</button>
              </div>
              <div className="purchase-detail-total-cell"><strong className="purchase-detail-line-total">{money(i.unitCost*i.qty+linePurchaseTax(i))}</strong><small>ISV: {money(linePurchaseTax(i))}</small></div>
              <button type="button" className="purchase-remove-item" aria-label={`Quitar ${i.name} de la compra`} title="Quitar producto" onClick={()=>setCart(cart.filter(item=>item.id!==i.id))}><Trash2 size={16}/></button>
            </div>)}
          </div>
        </div>
      </>
    }
    <label className="purchase-notes-label purchase-detail-notes">
      Observaciones de la compra
      <textarea value={purchaseNotes} onChange={e=>setPurchaseNotes(e.target.value)} rows={2} placeholder="Observaciones opcionales..."/>
    </label>
    <div className="purchase-detail-footer">
      <div className="purchase-detail-counts">
        <span>Productos <strong>{cart.length}</strong></span>
        <span>Unidades <strong>{cart.reduce((sum,item)=>sum+item.qty,0)}</strong></span>
      </div>
      <div className="purchase-detail-totals">
        <div><small>Subtotal de productos</small><strong>{money(itemsTotal)}</strong></div>
        <div><small>ISV total</small><strong>{money(purchaseTaxTotal)}</strong></div>
        <div className="purchase-detail-grand-total"><small>Total con ISV</small><strong>{money(itemsTotal+purchaseTaxTotal)}</strong></div>
      </div>
    </div>
  </div></section><aside className="card checkout" id="purchase-reception"><h3>Resumen y recepción</h3><div className="purchase-invoice-summary"><span>Factura proveedor</span><strong>{invoiceNumber.trim()||'Sin número registrado'}</strong><small>{invoiceDate?new Date(invoiceDate+'T12:00:00').toLocaleDateString('es-HN'):'Fecha no indicada'}</small></div><div className="summary-line"><span>Subtotal de productos</span><strong>{money(itemsTotal)}</strong></div><div className="summary-line"><span>ISV</span><strong>{money(purchaseTaxTotal)}</strong></div><div className="summary-line"><span>Términos de pago</span><strong>{paymentTerms}</strong></div>{creditTerm&&<div className="summary-line"><span>Fecha de crédito</span><strong>{dueDate?new Date(dueDate+'T12:00:00').toLocaleDateString('es-HN'):'—'}</strong></div>}<div className="summary-line"><span>Unidades</span><strong>{cart.reduce((s,i)=>s+i.qty,0)}</strong></div><div className="grand"><span>Total factura</span><strong>{money(total)}</strong></div>{invalidExpiry.length>0&&<p className="form-error" role="alert">No se puede recibir la compra: {invalidExpiry.length} producto(s) sin fecha válida o con menos de 6 meses restantes.</p>}{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary checkout-btn" disabled={!cart.length||!supplier.trim()||invalidExpiry.length>0} onClick={()=>{setError('');if(cart.some(i=>!Number.isFinite(i.qty)||i.qty<=0||!Number.isFinite(i.unitCost)||i.unitCost<0)){setError('Revisa las cantidades y los costos de la compra.');return;}if(onReceive(cart,paymentMethod,dueDate,invoiceNumber.trim(),invoiceDate,purchaseNotes.trim(),total,paymentTerms)){setCart([]);setSupplier('');setPaymentMethod('Efectivo');setPaymentTerms('Contado - Efectivo');setInvoiceNumber('');setInvoiceDate(localDateKey(new Date()));setInvoiceTotal('');setPurchaseNotes('');}else{setError('No se pudo recibir la compra. Revisa vencimientos, cantidades y costos.');}}}>Recibir mercancía</button><small className="helper">La recepción está bloqueada si falta una fecha de vencimiento o quedan menos de seis meses. El sistema actualiza stock y costo promedio.</small><div className="card expiry-policy" id="purchase-policy"><CalendarClock size={19}/><div><strong>Política de vencimiento: mínimo 6 meses</strong><p>No se puede recibir un producto cuya fecha de vencimiento sea anterior al <b>{minExpiry}</b>. Registra la fecha impresa en el envase de la mercancía que llega.</p></div></div></aside></div></div>
  {showPurchaseModal&&<div className="modal-backdrop purchase-header-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowPurchaseModal(false);}}><section className="modal purchase-header-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-header-title"><div className="modal-head"><div><h2 id="purchase-header-title">Nueva compra</h2><p>Ingresa los datos de la factura antes de agregar los productos.</p></div><button type="button" className="icon-btn" onClick={()=>setShowPurchaseModal(false)} aria-label="Cerrar">×</button></div><div className="purchase-header-modal-layout"><div className="purchase-header-form"><div className="purchase-supplier-field"><label>Nombre del proveedor<input list="purchase-supplier-list" value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Buscar o escribir proveedor"/><datalist id="purchase-supplier-list">{suppliers.filter(item=>item.active).map(item=><option key={item.id} value={item.name}/>)}</datalist></label><button type="button" className="secondary purchase-create-supplier" onClick={()=>{setSupplierFormError('');setNewSupplierForm(emptyNewSupplier());setShowNewSupplierModal(true);}}><Plus size={15}/> Nuevo proveedor</button></div><label>N.º de factura<input value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} placeholder="Ej. FAC-00125"/></label><label>Términos de pago<select value={paymentTerms} onChange={e=>updatePaymentTerms(e.target.value)}><option value="Contado - Efectivo">Contado · Efectivo</option><option value="Contado - Transferencia">Contado · Transferencia</option><option value="Crédito a 7 días">Crédito a 7 días</option><option value="Crédito a 15 días">Crédito a 15 días</option><option value="Crédito a 30 días">Crédito a 30 días</option><option value="Crédito a 45 días">Crédito a 45 días</option><option value="Crédito a 60 días">Crédito a 60 días</option></select></label><label>Fecha de factura<input type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></label>{creditTerm&&<label>Fecha de crédito<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>}</div><aside className="purchase-invoice-total-panel"><span>Total de la compra</span><label className="purchase-total-input-label"><span>L. </span><input type="number" min="0" step="0.01" value={invoiceTotal} onChange={e=>setInvoiceTotal(e.target.value)} placeholder={(itemsTotal+purchaseTaxTotal).toFixed(2)}/></label><strong>{money(total)}</strong><small>{invoiceTotal.trim()===''?'Se calculará con los productos si dejas este campo vacío.':'Total introducido para la factura.'}</small></aside></div>{purchaseHeaderError&&<p className="form-error" role="alert">{purchaseHeaderError}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowPurchaseModal(false)}>Cancelar</button><button type="button" className="primary" onClick={continuePurchaseSetup}>Continuar a productos</button></div></section></div>}
  {showNewSupplierModal&&<div className="modal-backdrop purchase-new-supplier-backdrop" style={{zIndex:30}} onMouseDown={e=>{if(e.target===e.currentTarget)setShowNewSupplierModal(false);}}><section className="modal purchase-new-supplier-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-new-supplier-title"><div className="modal-head"><div><h2 id="purchase-new-supplier-title">Crear proveedor</h2><p>Registra el proveedor y quedará seleccionado en la compra.</p></div><button type="button" className="icon-btn" onClick={()=>setShowNewSupplierModal(false)} aria-label="Cerrar">×</button></div><div className="purchase-new-supplier-form"><label>Nombre del proveedor *<input autoFocus value={newSupplierForm.name} onChange={e=>setNewSupplierForm({...newSupplierForm,name:e.target.value})} placeholder="Nombre comercial"/></label><label>Persona de contacto<input value={newSupplierForm.contact} onChange={e=>setNewSupplierForm({...newSupplierForm,contact:e.target.value})} placeholder="Nombre del contacto"/></label><label>Teléfono<input type="tel" value={newSupplierForm.phone} onChange={e=>setNewSupplierForm({...newSupplierForm,phone:e.target.value})} placeholder="Teléfono o WhatsApp"/></label><label>Correo electrónico<input type="email" value={newSupplierForm.email} onChange={e=>setNewSupplierForm({...newSupplierForm,email:e.target.value})} placeholder="correo@empresa.com"/></label><label>RTN<input value={newSupplierForm.rtn} onChange={e=>setNewSupplierForm({...newSupplierForm,rtn:e.target.value})} placeholder="RTN"/></label><label>Condiciones de pago<select value={newSupplierForm.paymentTerms} onChange={e=>setNewSupplierForm({...newSupplierForm,paymentTerms:e.target.value})}><option value="Contado">Contado</option><option value="Crédito a 7 días">Crédito a 7 días</option><option value="Crédito a 15 días">Crédito a 15 días</option><option value="Crédito a 30 días">Crédito a 30 días</option><option value="Crédito a 45 días">Crédito a 45 días</option><option value="Crédito a 60 días">Crédito a 60 días</option></select></label><label className="purchase-new-supplier-address">Dirección<input value={newSupplierForm.address} onChange={e=>setNewSupplierForm({...newSupplierForm,address:e.target.value})} placeholder="Dirección del proveedor"/></label></div>{supplierFormError&&<p className="form-error" role="alert">{supplierFormError}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowNewSupplierModal(false)}>Cancelar</button><button type="button" className="primary" onClick={saveNewSupplierFromPurchase}>Guardar proveedor</button></div></section></div>}
  </div>;
}
