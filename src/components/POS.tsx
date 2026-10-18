import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Barcode, Camera, Search, ShoppingCart, X } from 'lucide-react';
import type { CartItem, Product } from '../domain/types';
import { localDateKey } from '../utils/dates';

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);

export function POS({products,cart,setCart,saleType,setSaleType,payment,setPayment,search,setSearch,onComplete}:{products:Product[];cart:CartItem[];setCart:(c:CartItem[])=>void;saleType:'minorista'|'mayorista';setSaleType:(v:'minorista'|'mayorista')=>void;payment:'Efectivo'|'Transferencia'|'Crédito';setPayment:(v:'Efectivo'|'Transferencia'|'Crédito')=>void;search:string;setSearch:(v:string)=>void;onComplete:(sold:CartItem[],customer?:string,dueDate?:string)=>boolean}) {
  const results=products.filter(p=>[p.code,p.name,...(p.activeIngredients??[])].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0,6);
  const total=cart.reduce((sum,i)=>sum+i.price*i.qty,0);
  const profit=cart.reduce((sum,i)=>sum+(i.price-i.cost)*i.qty,0);
  const [customer,setCustomer]=useState('');
  const [dueDate,setDueDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()+30);return localDateKey(d);});
  const [error,setError]=useState('');
  const [showCamera,setShowCamera]=useState(false);
  const add=(p:Product)=>{
    if(p.stock<=0){setError(`“${p.name}” no tiene existencias disponibles.`);return;}
    const current=cart.find(i=>i.id===p.id);
    if(current&&current.qty>=p.stock){setError(`Stock máximo alcanzado para “${p.name}” (${p.stock}).`);return;}
    setCart(current?cart.map(i=>i.id===p.id?{...i,qty:Math.min(i.qty+1,p.stock),price:saleType==='mayorista'?p.wholesale:p.retail}:i):[...cart,{...p,qty:1,price:saleType==='mayorista'?p.wholesale:p.retail}]);
    setSearch('');
    setError('');
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
  const checkout=()=>{setError('');if(!cart.length)return;if(payment==='Crédito'&&!customer.trim()){setError('Indica el cliente para registrar una venta al crédito.');return;}if(cart.some(i=>i.qty>(products.find(p=>p.id===i.id)?.stock??0))){setError('El carrito supera el stock disponible. Actualiza las cantidades.');return;}if(onComplete(cart,customer.trim(),dueDate)){setCart([]);setCustomer('');}else{setError('No se pudo registrar la venta. Verifica el stock y las cantidades.');}};
  return <div className="content"><div className="page-head"><div><span className="pill">MVP · MÓDULO 3</span><h2>Punto de venta</h2><p>Venta rápida con precio minorista o mayorista.</p></div><div className="sale-type"><button className={saleType==='minorista'?'type active':'type'} onClick={()=>setSaleType('minorista')}>Minorista</button><button className={saleType==='mayorista'?'type active':'type'} onClick={()=>setSaleType('mayorista')}>Mayorista</button></div></div>
  <div className="pos-grid"><section><div className="card search-pos"><Search size={18}/><input autoFocus value={search} onChange={e=>{setSearch(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();scanOrSearch(search);}}} placeholder="Escanea el código y presiona Enter, o busca por nombre..." aria-label="Buscar o escanear código de producto"/><button className="icon-btn scan-submit" type="button" title="Procesar código" aria-label="Procesar código de barras" onClick={()=>scanOrSearch(search)}><Barcode size={18}/></button><button className="icon-btn camera-submit" type="button" title="Escanear con la cámara" aria-label="Escanear con la cámara del teléfono" onClick={()=>{setError("");setShowCamera(true);}}><Camera size={18}/></button></div><p className="helper scan-help">Usa un lector USB, escribe el código o escanea con la cámara del teléfono. La cámara requiere permiso y una conexión segura (HTTPS).</p>{search&&<div className="results card">{results.length?results.map(p=><button key={p.id} onClick={()=>add(p)}><span><strong>{p.name}</strong><small>{p.code} · Stock: {p.stock}</small>{p.activeIngredients?.length ? <small>Principio(s) activo(s): {p.activeIngredients.join(' + ')}</small> : null}</span><b>{money(saleType==='mayorista'?p.wholesale:p.retail)}</b></button>):<p>No se encontraron productos.</p>}</div>}{error&&<p className="form-error scan-feedback" role="alert">{error}</p>}<div className="card cart-card"><div className="card-title"><div><h3>Carrito</h3><p>{cart.length} productos</p></div><ShoppingCart size={20}/></div>{cart.length===0?<div className="cart-empty">Agrega productos para iniciar la venta.</div>:cart.map(i=><div className="cart-row" key={i.id}><div><strong>{i.name}</strong><small>{i.code} · {money(i.price)} c/u</small>{i.activeIngredients?.length ? <small>Principio(s) activo(s): {i.activeIngredients.join(' + ')}</small> : null}</div><div className="qty"><button onClick={()=>change(i.id,-1)}>-</button><b>{i.qty}</b><button onClick={()=>change(i.id,1)}>+</button></div><strong>{money(i.price*i.qty)}</strong><button className="remove" onClick={()=>remove(i.id)}>×</button></div>)}</div></section><aside className="card checkout"><h3>Resumen de venta</h3><div className="summary-line"><span>Subtotal</span><strong>{money(total)}</strong></div><div className="summary-line"><span>Utilidad estimada</span><strong>{money(profit)}</strong></div><label className="checkout-label">Método de pago<select value={payment} onChange={e=>setPayment(e.target.value as typeof payment)}><option>Efectivo</option><option>Transferencia</option><option>Crédito</option></select></label>{payment==='Crédito'&&<><label className="checkout-label">Cliente<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Nombre del cliente"/></label><label className="checkout-label">Fecha de vencimiento<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label></>}<div className="grand"><span>Total</span><strong>{money(total)}</strong></div>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary checkout-btn" disabled={!cart.length} onClick={checkout}>Registrar venta</button></aside></div>{showCamera&&<CameraScanner onDetected={scanOrSearch} onClose={()=>setShowCamera(false)}/>}</div>;
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
