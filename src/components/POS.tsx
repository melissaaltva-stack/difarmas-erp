import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Barcode, Camera, Search, ShoppingCart, X } from 'lucide-react';
import type { CartItem, ErpSettings, Product } from '../domain/types';
import { ExpiryRecommendations } from './ExpiryRecommendations';
import { getExpiryAlert } from '../services/expiryAlertService';
import { localDateKey } from '../utils/dates';
import { validateFiscalAuthorization } from '../services/fiscalService';

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);

export function POS({products,cart,setCart,saleType,setSaleType,payment,setPayment,search,setSearch,onComplete,settings,setSettings}:{products:Product[];cart:CartItem[];setCart:(c:CartItem[])=>void;saleType:'minorista'|'mayorista';setSaleType:(v:'minorista'|'mayorista')=>void;payment:string;setPayment:(v:string)=>void;search:string;setSearch:(v:string)=>void;onComplete:(sold:CartItem[],customer?:string,dueDate?:string)=>boolean;settings:ErpSettings;setSettings:(s:ErpSettings)=>void}) {
  const defaultInvoicePrintFormats:NonNullable<ErpSettings['invoicePrintFormats']>={ticket:{title:'FACTURA / TICKET',subtitle:'COMPROBANTE DE VENTA',footer:'Gracias por su compra. ¡En DIFARMÁS estamos para servirle!',showLogo:true,showFiscalData:true,showCustomer:true,showPrices:true,showPaymentDetails:true,showSignatures:false,marginsMm:3},carta:{title:'FACTURA',subtitle:'COMPROBANTE DE VENTA',footer:'Gracias por su compra. ¡En DIFARMÁS estamos para servirle!',showLogo:true,showFiscalData:true,showCustomer:true,showPrices:true,showPaymentDetails:true,showSignatures:false,marginsMm:10}};
  const invoiceTemplate=settings.templates.find(t=>t.id==='factura');
  const paymentMethods=settings.paymentMethods?.filter(method=>method.active)??[{id:'cash',name:'Efectivo',kind:'cash' as const,active:true,requiresReference:false},{id:'transfer',name:'Transferencia',kind:'other' as const,active:true,requiresReference:true},{id:'credit',name:'Crédito',kind:'credit' as const,active:true,requiresReference:false}];
  const selectedPaymentMethod=paymentMethods.find(method=>method.name===payment)??paymentMethods[0];
  const isCredit=selectedPaymentMethod?.kind==='credit'||payment==='Crédito';
  const isCash=selectedPaymentMethod?.kind==='cash'||payment==='Efectivo';
  useEffect(()=>{const firstMethod=paymentMethods[0];if(firstMethod&&!paymentMethods.some(method=>method.name===payment)){setPayment(firstMethod.name);}},[payment,paymentMethods,setPayment]);
  const results=products.filter(p=>[p.code,p.name,...(p.activeIngredients??[])].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0,6);
  const total=cart.reduce((sum,i)=>sum+i.price*i.qty,0);
  const profit=cart.reduce((sum,i)=>sum+(i.price-i.cost)*i.qty,0);
  const [customer,setCustomer]=useState('');
  const [dueDate,setDueDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()+30);return localDateKey(d);});
  const [error,setError]=useState('');
  const [amountReceived,setAmountReceived]=useState('');
  const [printFormat,setPrintFormat]=useState<'ticket'|'carta'>('ticket');
  const [invoice,setInvoice]=useState<{number:string;date:string;items:CartItem[];total:number;payment:string;customer:string;received:number;change:number;format:'ticket'|'carta'}|null>(null);
  const [showCamera,setShowCamera]=useState(false);
  useEffect(()=>{if(invoice)window.print();},[invoice]);
  const invoicePrintConfig=invoice?(settings.invoicePrintFormats?.[invoice.format]??defaultInvoicePrintFormats[invoice.format]):(settings.invoicePrintFormats?.[printFormat]??defaultInvoicePrintFormats[printFormat]);
  const invoicePaymentMethod=invoice?paymentMethods.find(method=>method.name===invoice.payment):undefined;
  const invoiceIsCredit=invoicePaymentMethod?.kind==='credit'||invoice?.payment==='Crédito';
  const invoiceIsCash=invoicePaymentMethod?.kind==='cash'||invoice?.payment==='Efectivo';
  const received=Number(amountReceived);
  const changeDue=isCash&&Number.isFinite(received)?Math.max(0,received-total):0;
  const add=(p:Product)=>{
    const expiryAlert=getExpiryAlert(p.expiry);
    if(expiryAlert&&expiryAlert.daysRemaining<0){setError(`⛔ ${p.name}: producto vencido. No se puede agregar a la venta; revisa y retira el lote según el procedimiento de la farmacia.`);return;}
    if(p.stock<=0){setError(`“${p.name}” no tiene existencias disponibles.`);return;}
    const current=cart.find(i=>i.id===p.id);
    if(current&&current.qty>=p.stock){setError(`Stock máximo alcanzado para “${p.name}” (${p.stock}).`);return;}
    setCart(current?cart.map(i=>i.id===p.id?{...i,qty:Math.min(i.qty+1,p.stock),price:saleType==='mayorista'?p.wholesale:p.retail}:i):[...cart,{...p,qty:1,price:saleType==='mayorista'?p.wholesale:p.retail}]);
    setSearch('');
    setError(expiryAlert?.message ?? '');
  };
  const scanOrSearch=(value:string)=>{
    const code=value.trim();
    if(!code)return;
    const product=products.find(p=>String(p.code??'').trim().toLocaleLowerCase()===code.toLocaleLowerCase());
    if(product){add(product);return;}
    setError(`No se encontró un producto con el código “${code}”. Revisa la etiqueta o búscalo por nombre.`);
  };
  const change=(id:number,delta:number)=>setCart(cart.map(i=>i.id===id?{...i,qty:Math.max(1,Math.min(i.qty+delta,i.stock))}:i));
  const remove=(id:number)=>setCart(cart.filter(i=>i.id!==id));
  const checkout=()=>{
    setError('');
    if(!cart.length)return;
    if(isCredit&&!customer.trim()){setError('Indica el cliente para registrar una venta al crédito.');return;}
    if(!isCredit&&(!amountReceived.trim()||!Number.isFinite(received)||received<total)){setError('Ingresa un monto recibido igual o mayor al total de la venta.');return;}
    if(cart.some(i=>i.qty>(products.find(p=>p.id===i.id)?.stock??0))){setError('El carrito supera el stock disponible. Actualiza las cantidades.');return;}
    const numbering=settings.documentNumbering??{factura:{prefix:'FAC-',nextNumber:1},orden_compra:{prefix:'OC-',nextNumber:1},nota_debito:{prefix:'ND-',nextNumber:1},nota_credito:{prefix:'NC-',nextNumber:1},orden_entrega:{prefix:'OE-',nextNumber:1}};
    const invoiceSequence=Math.max(1,numbering.factura?.nextNumber??1);
    const fiscal=settings.billingInfo;
    const fiscalError=validateFiscalAuthorization(fiscal,invoiceSequence);
    if(fiscalError){setError(fiscalError);return;}
    const fiscalConfigured=Boolean(fiscal?.cai);
    if(onComplete(cart,customer.trim(),dueDate)){
      const fiscalPoint=(fiscal?.establishmentCode??'')+(fiscal?.emissionPoint??'');
      const invoiceNumber=fiscalConfigured
        ? `${fiscalPoint.padStart(4,'0')}-${(fiscal?.documentTypeCode??'01').padStart(2,'0')}-${String(invoiceSequence).padStart(8,'0')}`
        : `${numbering.factura?.prefix??'FAC-'}${String(invoiceSequence).padStart(8,'0')}`;
      setSettings({...settings,documentNumbering:{...numbering,factura:{...numbering.factura,prefix:numbering.factura?.prefix??'FAC-',nextNumber:invoiceSequence+1}}});
      setInvoice({number:invoiceNumber,date:new Date().toLocaleString('es-HN'),items:cart.map(i=>({...i})),total,payment,customer:customer.trim()||'Consumidor final',received:isCredit?0:received,change:changeDue,format:printFormat});
      setCart([]);setCustomer('');setAmountReceived('');
    }else{setError('No se pudo registrar la venta. Verifica el stock y las cantidades.');}
  };
  return <div className="content"><div className="page-head"><div><span className="pill">MVP · MÓDULO 3</span><h2>Punto de venta</h2><p>Venta rápida con precio minorista o mayorista.</p></div><div className="sale-type"><button className={saleType==='minorista'?'type active':'type'} onClick={()=>setSaleType('minorista')}>Minorista</button><button className={saleType==='mayorista'?'type active':'type'} onClick={()=>setSaleType('mayorista')}>Mayorista</button></div></div>
  <div className="pos-grid"><section><div className="card search-pos"><Search size={18}/><input autoFocus value={search} onChange={e=>{setSearch(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();scanOrSearch(search);}}} placeholder="Escanea el código y presiona Enter, o busca por nombre..." aria-label="Buscar o escanear código de producto"/><button className="icon-btn scan-submit" type="button" title="Procesar código" aria-label="Procesar código de barras" onClick={()=>scanOrSearch(search)}><Barcode size={18}/></button><button className="icon-btn camera-submit" type="button" title="Escanear con la cámara" aria-label="Escanear con la cámara del teléfono" onClick={()=>{setError("");setShowCamera(true);}}><Camera size={18}/></button></div><p className="helper scan-help">Usa un lector USB, escribe el código o escanea con la cámara del teléfono. La cámara requiere permiso y una conexión segura (HTTPS).</p>{search&&results.some(p=>getExpiryAlert(p.expiry))&&<div className="card" role="alert" style={{border:'2px solid #dc2626',background:'#fff7ed',color:'#9a3412',padding:'12px 14px',marginBottom:'10px'}}><strong>⚠️ ALERTA DE VENCIMIENTO</strong>{results.filter(p=>getExpiryAlert(p.expiry)).map(p=>{const alert=getExpiryAlert(p.expiry);return alert?<p key={p.id} style={{margin:'8px 0 0'}}><strong>{p.name}</strong> · {alert.daysRemaining<0?`Vencido hace ${Math.abs(alert.daysRemaining)} día(s)`:alert.daysRemaining===0?'Vence hoy':`Vence en ${alert.daysRemaining} día(s)`}. {alert.message}</p>:null;})}</div>}{search&&<div className="results card">{results.length?results.map(p=><button key={p.id} onClick={()=>add(p)}><span><strong>{p.name}</strong><small>{p.code} · Stock: {p.stock}</small>{p.activeIngredients?.length ? <small>Principio(s) activo(s): {p.activeIngredients.join(' + ')}</small> : null}</span><b>{money(saleType==='mayorista'?p.wholesale:p.retail)}</b></button>):<p>No se encontraron productos.</p>}</div>}<ExpiryRecommendations products={products} cart={cart}/>{error&&<p className="form-error scan-feedback" role="alert">{error}</p>}<div className="card cart-card"><div className="card-title"><div><h3>Carrito</h3><p>{cart.length} productos</p></div><ShoppingCart size={20}/></div>{cart.length===0?<div className="cart-empty">Agrega productos para iniciar la venta.</div>:cart.map(i=><div className="cart-row" key={i.id}><div><strong>{i.name}</strong><small>{i.code} · {money(i.price)} c/u</small>{i.activeIngredients?.length ? <small>Principio(s) activo(s): {i.activeIngredients.join(' + ')}</small> : null}</div><div className="qty"><button onClick={()=>change(i.id,-1)}>-</button><b>{i.qty}</b><button onClick={()=>change(i.id,1)}>+</button></div><strong>{money(i.price*i.qty)}</strong><button className="remove" onClick={()=>remove(i.id)}>×</button></div>)}</div></section><aside className="card checkout"><h3>Resumen de venta</h3><div className="summary-line"><span>Subtotal</span><strong>{money(total)}</strong></div><div className="summary-line"><span>Utilidad estimada</span><strong>{money(profit)}</strong></div><label className="checkout-label">Método de pago<select value={payment} onChange={e=>setPayment(e.target.value)}>{paymentMethods.map(method=><option key={method.id} value={method.name}>{method.name}</option>)}</select></label>{selectedPaymentMethod?.requiresReference&&!isCredit&&<p className="helper">Recuerda registrar y conservar la referencia o comprobante del pago.</p>}{isCredit&&<><label className="checkout-label">Cliente<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Nombre del cliente"/></label><label className="checkout-label">Fecha de vencimiento<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label></>}<div className="grand"><span>Total</span><strong>{money(total)}</strong></div>{!isCredit&&<><label className="checkout-label">Monto recibido<input type="number" min="0" step="0.01" inputMode="decimal" value={amountReceived} onChange={e=>setAmountReceived(e.target.value)} placeholder="Ingresa el monto que entrega el cliente"/></label>{isCash&&<div className="summary-line change-line"><span>Cambio a devolver</span><strong>{money(changeDue)}</strong></div>}</>}{error&&<p className="form-error" role="alert">{error}</p>}<label className="checkout-label">Formato de impresión<select value={printFormat} onChange={e=>setPrintFormat(e.target.value as 'ticket'|'carta')}><option value="ticket">Factura tipo ticket (impresora térmica)</option><option value="carta">Factura tamaño carta</option></select></label><button className="primary checkout-btn" disabled={!cart.length} onClick={checkout}>Cobrar e imprimir factura</button>{invoice&&<button className="secondary checkout-btn" onClick={()=>window.print()}>Imprimir última factura</button>}</aside></div>
  {invoice&&<section className={`print-invoice print-invoice-${invoice.format}`} style={{'--invoice-print-margin':`${invoicePrintConfig.marginsMm}mm`} as React.CSSProperties} aria-label={invoice.format==='ticket'?'Factura tipo ticket':'Factura tamaño carta'}><header className="invoice-header"><div className="invoice-brand">{invoicePrintConfig.showLogo&&invoiceTemplate?.showLogo&&<span className="invoice-brand-mark" style={{background:settings.primaryColor}}>D</span>}<div><h1>{settings.businessName||'DIFARMÁS'}</h1><p>{invoicePrintConfig.subtitle||invoiceTemplate?.subtitle||'COMPROBANTE DE VENTA'}</p>{settings.rtn&&<small>RTN: {settings.rtn}</small>}{settings.phone&&<small>Tel. {settings.phone}</small>}{settings.address&&<small>{settings.address}</small>}</div></div><span className="invoice-tag" style={{color:settings.primaryColor}}>{invoicePrintConfig.title||invoiceTemplate?.title||'FACTURA'}</span></header><div className="invoice-meta"><div><small>NÚMERO DE FACTURA</small><strong>{invoice.number}</strong></div><div><small>FECHA DE EMISIÓN</small><strong>{invoice.date}</strong></div>{invoicePrintConfig.showCustomer&&<div className="invoice-customer"><small>CLIENTE</small><strong>{invoice.customer}</strong></div>}</div>{invoicePrintConfig.showFiscalData&&settings.billingInfo&&<div className="invoice-fiscal-data"><strong>DATOS DE AUTORIZACIÓN FISCAL</strong>{settings.billingInfo.cai&&<p><span>CAI:</span> {settings.billingInfo.cai}</p>}{settings.billingInfo.authorizedRangeStart&&<p><span>Rango autorizado:</span> {settings.billingInfo.authorizedRangeStart} — {settings.billingInfo.authorizedRangeEnd}</p>}{settings.billingInfo.authorizationExpiry&&<p><span>Fecha límite de emisión:</span> {settings.billingInfo.authorizationExpiry}</p>}{(settings.billingInfo.establishmentCode||settings.billingInfo.emissionPoint||settings.billingInfo.documentTypeCode)&&<p><span>Establecimiento:</span> {settings.billingInfo.establishmentCode||'—'} · <span>Punto de emisión:</span> {settings.billingInfo.emissionPoint||'—'} · <span>Tipo:</span> {settings.billingInfo.documentTypeCode||'—'}</p>}</div>}<table><thead><tr><th>Producto</th><th>Cant.</th>{invoicePrintConfig.showPrices&&<><th>Precio</th><th>Total</th></>}</tr></thead><tbody>{invoice.items.map((item,index)=><tr key={item.id+'-'+index}><td>{item.name}{item.activeIngredients?.length ? <small className="invoice-ingredients">{item.activeIngredients.join(' + ')}</small>:null}</td><td>{item.qty}</td>{invoicePrintConfig.showPrices&&<><td>{money(item.price)}</td><td>{money(item.price*item.qty)}</td></>}</tr>)}</tbody></table><div className="invoice-total"><p><span>Total</span><strong>{money(invoice.total)}</strong></p>{invoicePrintConfig.showPaymentDetails&&<><p><span>Método de pago</span><strong>{invoice.payment}</strong></p>{!invoiceIsCredit&&<><p><span>Recibido</span><strong>{money(invoice.received)}</strong></p>{invoiceIsCash&&<p><span>Cambio</span><strong>{money(invoice.change)}</strong></p>}</>}</>}</div><footer>{invoicePrintConfig.footer||invoiceTemplate?.footer||'Gracias por su compra. ¡En DIFARMÁS estamos para servirle!'}{settings.billingInfo?.fiscalLegend&&<p className="invoice-fiscal-legend">{settings.billingInfo.fiscalLegend}</p>}</footer></section>}
  {showCamera&&<CameraScanner onDetected={scanOrSearch} onClose={()=>setShowCamera(false)}/>}</div>;
}

function CameraScanner({onDetected,onClose}:{onDetected:(code:string)=>void;onClose:()=>void}) {
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const detectedRef=useRef(onDetected);
  const closeRef=useRef(onClose);
  detectedRef.current=onDetected;
  closeRef.current=onClose;
  const [cameraError,setCameraError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    let controls:{stop:()=>void}|undefined;
    const reader=new BrowserMultiFormatReader();
    const video=videoRef.current;
    if(!video){setCameraError('No se pudo preparar la vista de la cámara.');return;}
    reader.decodeFromVideoDevice(undefined,video,(result)=>{
      if(result&&!cancelled){
        const code=result.getText();
        cancelled=true;
        controls?.stop();
        detectedRef.current(code);
        closeRef.current();
      }
    }).then(started=>{controls=started;if(cancelled)started.stop();}).catch(()=>{
      if(!cancelled)setCameraError('No se pudo iniciar la cámara. Verifica los permisos del navegador y que el sitio use HTTPS.');
    });
    return ()=>{cancelled=true;controls?.stop();};
  },[]);
  return <div className="modal-backdrop camera-backdrop" role="dialog" aria-modal="true" aria-label="Escanear código con cámara"><div className="modal camera-modal"><div className="modal-head"><div><h2>Escanear con cámara</h2><p>Centra el código de barras dentro del recuadro.</p></div><button className="icon-btn" onClick={onClose} aria-label="Cerrar cámara"><X size={18}/></button></div><div className="camera-view"><video ref={videoRef} muted playsInline autoPlay/><div className="camera-guide"/></div>{cameraError?<p className="form-error" role="alert">{cameraError}</p>:<p className="helper">Mantén el teléfono estable y con buena iluminación. Al reconocer el código, se agregará el producto automáticamente.</p>}<div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button></div></div></div>;
}
