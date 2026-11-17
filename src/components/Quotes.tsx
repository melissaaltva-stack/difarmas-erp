import { useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Customer, Product, ErpSettings, QuoteRecord, QuoteLine } from '../domain/types';
import { Plus, Search, Printer, Trash2, FileText, Eye, Save, ChevronDown } from 'lucide-react';
const money=(n:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL'}).format(n);
const lineDiscountAmount=(line:QuoteLine)=>line.qty*line.price*Math.max(0,Math.min(100,Number(line.discountPercent)||0))/100;
const discountedLineTotal=(line:QuoteLine)=>Math.max(0,line.qty*line.price-lineDiscountAmount(line));
const formatProductExpiry=(value:string)=>{const match=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?`${match[3]}/${match[2]}/${match[1]}`:value;};
export function Quotes({customers,products,settings,quotes,setQuotes,saveQuotes}:{customers:Customer[];products:Product[];settings:ErpSettings;quotes:QuoteRecord[];setQuotes:Dispatch<SetStateAction<QuoteRecord[]>>;saveQuotes:(nextQuotes:QuoteRecord[])=>Promise<void>}){
const [creating,setCreating]=useState(false);const [showList,setShowList]=useState(false);const [selected,setSelected]=useState<QuoteRecord|null>(null);const [editingId,setEditingId]=useState<number|null>(null);const [saving,setSaving]=useState(false);const [saveError,setSaveError]=useState('');const [search,setSearch]=useState('');const [client,setClient]=useState('');const [clientSearch,setClientSearch]=useState('');const [clientOpen,setClientOpen]=useState(false);const [valid,setValid]=useState('');const [discount,setDiscount]=useState('0');const [notes,setNotes]=useState('');const [term,setTerm]=useState('');const [lines,setLines]=useState<QuoteLine[]>([]);const [seller,setSeller]=useState("");const [deliveryTime,setDeliveryTime]=useState("1 - 3 días");const [includeNotes,setIncludeNotes]=useState(true);const [expandedQuoteProductDetails,setExpandedQuoteProductDetails]=useState<Record<number,boolean>>({});
const lastQuoteId=useRef(0);
const nextQuoteId=()=>{const highestStoredId=quotes.reduce((highest,quote)=>Math.max(highest,Number(quote.id)||0),0);const nextId=Math.max(Date.now(),highestStoredId,lastQuoteId.current)+1;lastQuoteId.current=nextId;return nextId;};
const persist=(q:QuoteRecord[])=>setQuotes(q);const printFormat=settings.quotePrintFormat??{title:'COTIZACIÓN',subtitle:'Propuesta comercial',footer:'Gracias por considerar a DIFARMÁS. Estamos para servirle.',showLogo:true,showBusinessData:true,showClientData:true,showProductCodes:true,showDiscount:true,showNotes:true,paperSize:'A4' as const,marginsMm:12};const printQuote=()=>{if(!selected)return;const w=window.open('','_blank','width=900,height=700');if(!w){alert('Permite las ventanas emergentes para imprimir la cotización.');return;}const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch] as string));const f=printFormat;const sub=selected.lines.reduce((s,l)=>s+l.qty*l.price,0);const lineDiscountTotal=selected.lines.reduce((s,l)=>s+lineDiscountAmount(l),0);const total=Math.max(0,sub-lineDiscountTotal-Math.min(Math.max(0,sub-lineDiscountTotal),Math.max(0,selected.discount)));const logo=f.showLogo?(settings.logoDataUrl?'<img class="logo" src="'+esc(settings.logoDataUrl)+'" alt="DIFARMÁS">':'<strong class="brand">DIFARMÁS</strong>'):'';const business=f.showBusinessData?'<p>'+esc([settings.businessSubtitle,settings.phone,settings.email,settings.address,settings.rtn?'RTN: '+settings.rtn:''].filter(Boolean).join(' · '))+'</p>':'';const client=f.showClientData?'<section class="client"><strong>Cliente:</strong> '+esc(selected.client)+'<br><strong>Fecha:</strong> '+esc(selected.date)+'<br><strong>Válida hasta:</strong> '+esc(selected.valid)+'</section>':'';const rows=selected.lines.map(l=>{const product=products.find(p=>p.id===l.id);const isvPercent=product?.taxEnabled?Number(product.taxRate??settings.billingInfo?.isvRate??15):0;return '<tr><td>'+esc(l.name)+'</td>'+(f.showProductCodes?'<td>'+esc(l.code)+'</td>':'')+'<td>'+esc(l.qty)+'</td><td>'+money(l.price)+'</td>'+(f.showDiscount?'<td>'+Number(l.discountPercent??0)+'%</td>':'')+'<td>'+isvPercent+'%</td><td>'+money(discountedLineTotal(l))+'</td></tr>';}).join('');w.document.open();w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+esc(f.title)+' '+esc(selected.number)+'</title><style>@page{size:'+ (f.paperSize==='ticket'?'80mm auto':f.paperSize) +';margin:'+Number(f.marginsMm||12)+'mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#172033;margin:0}.sheet{width:100%;}.head{border-bottom:2px solid #0f766e;padding-bottom:14px;margin-bottom:18px}.logo{max-width:150px;max-height:65px;object-fit:contain}.brand{font-size:23px;color:'+esc(settings.primaryColor||'#0f766e')+'}h1{font-size:23px;margin:14px 0 5px}h2{font-size:17px;margin:10px 0}p{line-height:1.5;margin:6px 0;color:#475569}.client{background:#f8fafc;padding:12px;margin:14px 0;line-height:1.8}table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#f1f5f9;font-weight:700}th,td{padding:9px 7px;border-bottom:1px solid #dbe2ea;text-align:left;vertical-align:top}th:not(:first-child),td:not(:first-child){white-space:nowrap}.totals{margin:18px 0 0 auto;width:min(100%,300px)}.totals p{display:flex;justify-content:space-between;gap:16px}.grand{font-size:17px;font-weight:700;border-top:2px solid #0f766e;padding-top:10px;color:#0f172a}.notes{margin-top:20px}.footer{text-align:center;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:14px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><main class="sheet"><header class="head">'+logo+'<h2>'+esc(settings.businessName||'DIFARMÁS')+'</h2>'+business+'<h1>'+esc(f.title)+' '+esc(selected.number)+'</h1>'+(f.subtitle?'<p>'+esc(f.subtitle)+'</p>':'')+'</header>'+client+'<table><thead><tr><th>Producto</th>'+(f.showProductCodes?'<th>Código</th>':'')+'<th>Cantidad</th><th>Precio unitario</th>'+(f.showDiscount?'<th>Descuento %</th>':'')+'<th>ISV %</th><th>Importe</th></tr></thead><tbody>'+rows+'</tbody></table><section class="totals"><p><span>Subtotal</span><strong>'+money(sub)+'</strong></p>'+(f.showDiscount?'<p><span>Descuento</span><strong>'+money(lineDiscountTotal+Math.min(Math.max(0,sub-lineDiscountTotal),Math.max(0,selected.discount)))+'</strong></p>':'')+'<p class="grand"><span>Total</span><strong>'+money(total)+'</strong></p></section>'+(f.showNotes&&selected.notes?'<p class="notes"><strong>Observaciones:</strong> '+esc(selected.notes)+'</p>':'')+'<p class="footer">'+esc(f.footer||'')+'</p></main><script>window.onload=()=>{window.focus();window.print();};<\/script></body></html>');w.document.close();};const priceWithTax=(p:Product)=>{const base=Number(p.retail)||0;if(!p.taxEnabled||p.priceIncludesTax)return base;const rate=Number(p.taxRate??settings.billingInfo?.isvRate??15);return base*(1+Math.max(0,rate)/100)};const activeCustomers=customers.filter(c=>c.active);const chosenClient=activeCustomers.find(c=>String(c.id)===client);const matchingCustomers=activeCustomers.filter(c=>c.name.toLowerCase().includes(clientSearch.toLowerCase())).slice(0,8);const subtotal=lines.reduce((s,l)=>s+l.qty*l.price,0);const lineDiscountTotal=lines.reduce((s,l)=>s+lineDiscountAmount(l),0);const netSubtotal=Math.max(0,subtotal-lineDiscountTotal);const quoteDiscount=Math.min(netSubtotal,Math.max(0,Number(discount)||0));const normalizedTerm=term.trim().toLocaleLowerCase('es');const results=products.filter(p=>[p.name,p.code,p.category,p.laboratory,p.presentation,...(p.activeIngredients??[])].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(normalizedTerm)).slice(0,8);
const add=(p:Product)=>{setLines(old=>old.some(l=>l.id===p.id)?old.map(l=>l.id===p.id?{...l,qty:l.qty+1}:l):[...old,{id:p.id,name:p.name,code:p.code,qty:1,price:priceWithTax(p),discountPercent:0}]);setTerm("");};
const startEdit=(q:QuoteRecord)=>{setSaveError('');setSelected(null);setEditingId(q.id);const matchedCustomer=customers.find(c=>c.name===q.client);setClient(String(matchedCustomer?.id??''));setClientSearch(matchedCustomer?.name??q.client);setClientOpen(false);setValid(q.valid);setDiscount(String(q.discount));setNotes(q.notes??'');setIncludeNotes(true);setLines(q.lines.map(l=>({...l})));setTerm('');setShowList(false);setCreating(true)}; const save=async()=>{
if(saving)return;
if(!lines.length){setSaveError('Agrega al menos un producto antes de guardar.');return;}
const previous=editingId===null?undefined:quotes.find(x=>x.id===editingId);
if(editingId!==null&&!previous){setSaveError('No encontramos la cotización original en los datos cargados. Recarga el sistema y vuelve a intentarlo.');return;}
const c=customers.find(x=>String(x.id)===client);
// Al editar una cotización antigua, conserva el cliente guardado si ya no
// coincide con un registro actual de clientes; no bloquees el botón por eso.
const clientName=c?.name??previous?.client;
if(!clientName){setSaveError('Selecciona un cliente válido antes de guardar.');return;}
const id=editingId??nextQuoteId();
const q:QuoteRecord={id,number:previous?.number??'COT-'+String(id).slice(-8),client:clientName,date:previous?.date??new Date().toISOString().slice(0,10),valid,discount:Math.min(Math.max(0,subtotal-lineDiscountTotal),Math.max(0,Number(discount)||0)),lines:lines.map(l=>({...l,discountPercent:Math.max(0,Math.min(100,Number(l.discountPercent)||0))})),notes:includeNotes?notes:''};
const nextQuotes=editingId===null?[q,...quotes]:quotes.map(x=>x.id===editingId?q:x);
setSaving(true);setSaveError('');
try{
await saveQuotes(nextQuotes);
setCreating(false);setSelected(q);setEditingId(null);setLines([]);setClient('');setClientSearch('');setClientOpen(false);setDiscount('0');setNotes('');
}catch(error){
setSaveError(error instanceof Error?error.message:'No se pudo guardar la cotización. Inténtalo de nuevo.');
}finally{setSaving(false);}
}; const startNew=()=>{setSaveError('');setSelected(null);setEditingId(null);setLines([]);setClient('');setClientSearch('');setClientOpen(false);setDiscount('0');setNotes('');setSeller('');setDeliveryTime('1 - 3 días');setIncludeNotes(true);setValid(new Date(Date.now()+15*86400000).toISOString().slice(0,10));setShowList(false);setCreating(true)};
return <div className="content standard-invoice quotes-page"><style>{`
.quotes-page .quote-summary {
  width: min(100%, 360px);
  margin: 8px 0 0 auto;
  padding: 8px 0 2px;
  border-top: 1px solid #e5ece8;
}
.quotes-page .quote-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 5px 0;
  font-size: 12px;
}
.quotes-page .quote-summary-row > span:first-child { color: #637d78; }
.quotes-page .quote-summary-row strong {
  color: #17252a;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.quotes-page .quote-notes-switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}
.quotes-page .quote-notes-switch input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  display: inline-block;
  flex: 0 0 42px;
  width: 42px !important;
  min-width: 42px;
  height: 24px !important;
  min-height: 24px !important;
  margin: 0 !important;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #cbd5e1;
  cursor: pointer;
  box-sizing: border-box;
  transition: background .18s ease;
}
.quotes-page .quote-notes-switch input[type="checkbox"]::before {
  content: "";
  position: absolute;
  left: 3px;
  top: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15,23,42,.25);
  transition: transform .18s ease;
}
.quotes-page .quote-notes-switch input[type="checkbox"]:checked { background: #0f766e; }
.quotes-page .quote-notes-switch input[type="checkbox"]:checked::before { transform: translateX(18px); }
.quotes-page .quote-notes-switch input[type="checkbox"]:focus-visible {
  outline: 2px solid #0f766e;
  outline-offset: 3px;
}
.quotes-page .invoice-layout > .card:first-child .invoice-customer-field .invoice-customer-select-row {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  width: 100% !important;
  min-width: 0 !important;
}
.quotes-page .quote-client-picker { position: relative; width: 100%; min-width: 0; }
.quotes-page .quote-client-picker .invoice-search {
  width: 100%;
  min-width: 0;
  height: 32px;
  min-height: 32px;
  box-sizing: border-box;
}
.quotes-page #quote-client-search {
  width: 100%;
  min-width: 0;
  height: 30px;
  min-height: 30px;
  box-sizing: border-box;
}
.quotes-page .quote-client-matches {
  position: absolute;
  z-index: 30;
  top: calc(100% + 5px);
  left: 0;
  right: 0;
  max-height: 230px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(15,23,42,.14);
}
.quotes-page .quote-client-matches button {
  display: block;
  width: 100%;
  padding: 10px 13px;
  text-align: left;
  background: #fff;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  color: #0f172a;
}
.quotes-page .quote-client-matches button:hover,
.quotes-page .quote-client-matches button[aria-selected="true"] { background: #f0fdfa; }
.quotes-page .quote-client-matches-empty { padding: 14px; font-size: 13px; color: #64748b; }
.quotes-page .quote-product-add .quote-product-copy small { display: block; }
.quotes-page .quote-product-add .quote-product-copy strong { display: block; }
.quotes-page .quotes-list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: 4px 0 12px;
}
.quotes-page .quotes-list-heading h2 { margin: 5px 0; color: #1c3c32; font-size: 20px; }
.quotes-page .quotes-list-heading p { margin: 0; color: #75877f; font-size: 12px; }
.quotes-page .quotes-list-kicker { font-size: 10px; font-weight: 800; letter-spacing: 1.2px; color: #21845c; }
.quotes-page .quotes-list-metrics {
  display: grid;
  grid-template-columns: repeat(4,minmax(0,1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.quotes-page .quotes-list-metrics > div {
  min-width: 0;
  padding: 13px 15px;
  border: 1px solid #e0e9e4;
  border-radius: 10px;
  background: #fff;
}
.quotes-page .quotes-list-metrics span,
.quotes-page .quotes-list-metrics strong { display: block; }
.quotes-page .quotes-list-metrics span { font-size: 10px; color: #75877f; }
.quotes-page .quotes-list-metrics strong {
  margin-top: 7px;
  font-size: 19px;
  color: #1c4436;
  overflow-wrap: anywhere;
}
.quotes-page .quotes-list-table table { min-width: 760px; }
.quotes-page .quotes-list-table th { white-space: nowrap; }
.quotes-page .quote-editable-row { cursor: pointer; transition: background-color .15s ease; }
.quotes-page .quote-editable-row:hover { background: #f2faf7; }
.quotes-page .quote-editable-row:focus-visible { outline: 2px solid #0f766e; outline-offset: -2px; }
.quotes-page .quote-status {
  display: inline-flex;
  padding: 5px 9px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.quotes-page .quote-status.active { background: #eaf6ef; color: #23734e; }
.quotes-page .quote-status.expired { background: #fff1ed; color: #a94f3e; }
@media (max-width: 850px) {
  .quotes-page .quotes-list-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
@media (max-width: 560px) {
  .quotes-page .quote-summary { padding: 8px 0 2px; }
  .quotes-page .quote-summary-row { gap: 10px; }
  .quotes-page .quote-summary-total strong { font-size: 21px; }
  .quotes-page .quotes-list-heading { align-items: flex-start; flex-direction: column; }
  .quotes-page .quotes-list-heading > .primary { width: 100%; }
  .quotes-page .quotes-list-metrics > div { padding: 10px; }
  .quotes-page .quotes-list-metrics strong { font-size: 16px; }
}
`}</style><div className="page-head quote-page-head-compact" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>{!creating&&<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{!selected&&<button className="secondary" onClick={()=>{setSelected(null);setCreating(false);setEditingId(null);setShowList(v=>!v)}}><FileText size={16}/> {showList?"Volver al formulario":"Ver cotizaciones"}</button>}</div>}</div>
{selected&&!creating?<div className="card quote-document"><style>{`@media print{@page{size:${printFormat.paperSize==='ticket'?'80mm auto':printFormat.paperSize};margin:${printFormat.marginsMm}mm}body *{visibility:hidden!important}.quote-document,.quote-document *{visibility:visible!important}.quote-document{position:absolute!important;left:0!important;top:0!important;width:100%!important;box-shadow:none!important;border:0!important;padding:0!important;background:white!important}.quote-document .no-print{display:none!important}.quote-document .quote-total{background:white!important;border-top:1px solid #ddd!important;border-radius:0!important} .quote-document table{width:100%!important;border-collapse:collapse!important}.quote-document th,.quote-document td{border-bottom:1px solid #ddd!important;padding:7px 5px!important;text-align:left!important}}`}</style><div className="page-head"><div>{printFormat.showLogo&&(settings.logoDataUrl?<img src={settings.logoDataUrl} alt="Logotipo DIFARMÁS" style={{maxWidth:150,maxHeight:65,objectFit:'contain',marginBottom:8}}/>:<strong style={{color:settings.primaryColor,fontSize:22}}>DIFARMÁS</strong>)}<h2>{settings.businessName||'DIFARMÁS'}</h2>{printFormat.showBusinessData&&<p>{[settings.businessSubtitle,settings.phone,settings.email,settings.address,settings.rtn?'RTN: '+settings.rtn:''].filter(Boolean).join(' · ')}</p>}<h2>{printFormat.title} {selected.number}</h2>{printFormat.subtitle&&<p>{printFormat.subtitle}</p>}{printFormat.showClientData&&<p>Cliente: {selected.client} · Fecha: {selected.date} · Válida hasta: {selected.valid}</p>}</div><button className="primary no-print" onClick={printQuote}><Printer size={16}/> Imprimir</button></div><div className="quote-detail-overview" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,margin:"18px 0"}}><div style={{padding:15,border:"1px solid #dbe7ee",borderRadius:12,background:"#f8fafc"}}><div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"#64748b"}}>Cliente</div><div style={{fontWeight:700,color:"#102c43",marginTop:6,overflowWrap:"anywhere"}}>{selected.client}</div></div><div style={{padding:15,border:"1px solid #dbe7ee",borderRadius:12,background:"#f8fafc"}}><div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"#64748b"}}>Fecha de emisión</div><div style={{fontWeight:700,color:"#102c43",marginTop:6}}>{selected.date}</div></div><div style={{padding:15,border:"1px solid #dbe7ee",borderRadius:12,background:"#f8fafc"}}><div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"#64748b"}}>Vigencia</div><div style={{fontWeight:700,color:"#102c43",marginTop:6}}>{selected.valid||"No definida"}</div></div><div style={{padding:15,border:"1px solid #dbe7ee",borderRadius:12,background:"#f0fdfa"}}><div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"#0f766e"}}>Productos</div><div style={{fontWeight:700,fontSize:20,color:"#0f766e",marginTop:3}}>{selected.lines.reduce((s,l)=>s+l.qty,0)} <span style={{fontSize:12,fontWeight:500}}>unidades · {selected.lines.length} artículos</span></div></div></div><div className="table-wrap"><table><thead><tr><th>Producto</th>{printFormat.showProductCodes&&<th>Código</th>}<th>Cantidad</th><th>Precio unitario</th>{printFormat.showDiscount&&<th>Descuento %</th>}<th>ISV %</th><th>Importe</th></tr></thead><tbody>{selected.lines.map(l=>{const product=products.find(p=>p.id===l.id);const isvPercent=product?.taxEnabled?Number(product.taxRate??settings.billingInfo?.isvRate??15):0;return <tr key={l.id}><td>{l.name}</td>{printFormat.showProductCodes&&<td>{l.code}</td>}<td>{l.qty}</td><td>{money(l.price)}</td>{printFormat.showDiscount&&<td>{Number(l.discountPercent??0)}%</td>}<td>{isvPercent}%</td><td>{money(discountedLineTotal(l))}</td></tr>})}</tbody></table></div><div className="invoice-total quote-total" style={{marginTop:22,padding:22,borderRadius:14,textAlign:"left",display:"flex",flexDirection:"column",alignItems:"stretch",background:"#f8fafc",border:"1px solid #dbe7ee"}}><div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"#64748b",marginBottom:8}}>Resumen económico</div><p style={{display:"flex",justifyContent:"space-between",gap:12,margin:"7px 0"}}><span>Subtotal de productos</span><strong>{money(selected.lines.reduce((s,l)=>s+l.qty*l.price,0))}</strong></p>{printFormat.showDiscount&&<p>Descuento: {money(selected.discount+selected.lines.reduce((s,l)=>s+lineDiscountAmount(l),0))}</p>}<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:12,paddingTop:14,borderTop:"2px solid #0f766e"}}><span style={{fontSize:16,fontWeight:700,color:"#102c43"}}>TOTAL A PAGAR</span><h2 style={{margin:0,textAlign:"right",color:"#0f766e",fontSize:25}}>{money(Math.max(0,selected.lines.reduce((s,l)=>s+discountedLineTotal(l),0)-selected.discount))}</h2></div></div>{printFormat.showNotes&&selected.notes&&<div style={{marginTop:18,padding:16,borderRadius:12,border:"1px solid #dbe7ee",background:"#fff"}}><div style={{fontWeight:700,color:"#102c43",marginBottom:6}}>Observaciones</div><p style={{margin:0,whiteSpace:"pre-wrap",color:"#475569"}}>{selected.notes}</p></div>}<p className="helper">Cotización comercial; no es una factura fiscal.</p>{printFormat.footer&&<p style={{textAlign:'center',marginTop:28}}>{printFormat.footer}</p>}<div className="no-print"><button className="secondary" onClick={()=>setSelected(null)}>Volver a cotizaciones</button> <button className="primary" onClick={()=>startEdit(selected)}>Editar cotización</button></div></div>:null}
{!selected&&!creating&&showList?<><div className="quotes-list-heading"><div><span className="quotes-list-kicker">GESTIÓN COMERCIAL</span><h2>Historial de cotizaciones</h2><p>Consulta, revisa y administra tus propuestas.</p></div><button className="primary" onClick={startNew}><Plus size={16}/> Nueva cotización</button></div><div className="quotes-list-metrics"><div><span>Total registradas</span><strong>{quotes.length}</strong></div><div><span>Vigentes</span><strong>{quotes.filter(q=>!q.valid||q.valid>=new Date().toISOString().slice(0,10)).length}</strong></div><div><span>Vencidas</span><strong>{quotes.filter(q=>q.valid&&q.valid<new Date().toISOString().slice(0,10)).length}</strong></div><div><span>Valor cotizado</span><strong>{money(quotes.reduce((sum,q)=>sum+Math.max(0,q.lines.reduce((s,l)=>s+discountedLineTotal(l),0)-q.discount),0))}</strong></div></div><div className="inventory-toolbar card"><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por número o cliente..."/></div><span className="count">{quotes.filter(q=>(q.number+' '+q.client).toLowerCase().includes(search.toLowerCase())).length} resultados</span></div><div className="card table-wrap quotes-list-table"><table><thead><tr><th>Número</th><th>Cliente</th><th>Fecha</th><th>Válida hasta</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead><tbody>{quotes.filter(q=>(q.number+' '+q.client).toLowerCase().includes(search.toLowerCase())).map(q=><tr key={q.id} className="quote-editable-row"><td><strong>{q.number}</strong></td><td>{q.client}</td><td>{q.date}</td><td>{q.valid||'—'}</td><td><span className={q.valid&&q.valid<new Date().toISOString().slice(0,10)?'quote-status expired':'quote-status active'}>{q.valid&&q.valid<new Date().toISOString().slice(0,10)?'Vencida':'Vigente'}</span></td><td>{money(Math.max(0,q.lines.reduce((s,l)=>s+discountedLineTotal(l),0)-q.discount))}</td><td><button className="secondary" onClick={()=>setSelected(q)}><Eye size={14}/> Ver</button> <button className="secondary" onClick={()=>startEdit(q)}>Editar</button> <button className="icon-btn" aria-label="Eliminar cotización" onClick={()=>{if(confirm('¿Eliminar esta cotización?'))persist(quotes.filter(x=>x.id!==q.id))}}><Trash2 size={15}/></button></td></tr>)}{quotes.filter(q=>(q.number+' '+q.client).toLowerCase().includes(search.toLowerCase())).length===0&&<tr><td colSpan={7}><div className="empty"><h2>{quotes.length===0?'Aún no hay cotizaciones':'No hay resultados'}</h2><p>{quotes.length===0?'Crea tu primera cotización para empezar.':'Prueba con otro número o cliente.'}</p></div></td></tr>}</tbody></table></div></>:null}
{(creating||(!selected&&!showList))?<>
 <div className="invoice-layout">
  <section className="card invoice-header-card quote-editor-card">
   <div className="invoice-header-grid">
    <div className="invoice-top-fields-row">
     <div className="invoice-field invoice-field-number">
      <label className="field-label" htmlFor="quote-number">N.º de cotización</label>
      <input id="quote-number" value={editingId!==null?(quotes.find(q=>q.id===editingId)?.number??''):''} readOnly placeholder="Se asigna al guardar"/>
     </div>
     <div className="invoice-field invoice-field-seller">
      <label className="field-label" htmlFor="quote-seller">Vendedor</label>
      <select id="quote-seller" value={seller} onChange={e=>setSeller(e.target.value)}>
       <option value="General">General</option>
       {(settings.users??[]).filter(u=>u.active).map(u=><option key={u.id} value={u.name}>{u.name}</option>)}
      </select>
     </div>
     <div className="invoice-field invoice-field-date">
      <label className="field-label" htmlFor="quote-date">Fecha</label>
      <input id="quote-date" type="date" value={new Date().toISOString().slice(0,10)} readOnly/>
     </div>
     <div className="invoice-field invoice-field-max-date">
      <label className="field-label" htmlFor="quote-valid">Válida hasta</label>
      <input id="quote-valid" type="date" value={valid} onChange={e=>setValid(e.target.value)}/>
     </div>
    </div>
    <div className="invoice-field invoice-customer-field">
     <label className="field-label" htmlFor="quote-client-search">Cliente *</label>
     <div className="invoice-customer-select-row">
      <div className="quote-client-picker">
       <div className="invoice-search">
        <Search size={17}/>
        <input id="quote-client-search" autoComplete="off" value={clientSearch} onFocus={()=>setClientOpen(true)} onChange={e=>{setClientSearch(e.target.value);setClient('');setClientOpen(true)}} placeholder="Buscar cliente por nombre o código"/>
       </div>
       {clientOpen&&<div className="quote-client-matches" role="listbox" aria-label="Clientes encontrados">
        {matchingCustomers.map(c=><button type="button" role="option" aria-selected={String(c.id)===client} key={c.id} onClick={()=>{setClient(String(c.id));setClientSearch(c.name);setClientOpen(false)}}>
         <span style={{display:'block',fontWeight:600}}>{c.code?c.code+' · ':''}{c.name}</span>
        </button>)}
        {matchingCustomers.length===0&&<div className="quote-client-matches-empty">No se encontraron clientes activos.</div>}
       </div>}
      </div>
     </div>
    </div>
    <div className="invoice-bottom-fields-row">
     <div className="invoice-field invoice-field-price">
      <label className="field-label" htmlFor="quote-price-list">Precio de venta</label>
      <select id="quote-price-list" value={chosenClient?.priceList??"Precio de venta 1"} disabled>
       <option>{chosenClient?.priceList??"Precio de venta 1"}</option>
      </select>
     </div>
     <div className="invoice-field invoice-field-address">
      <label className="field-label" htmlFor="quote-address">Dirección</label>
      <input id="quote-address" value={chosenClient?.address??''} readOnly placeholder="Dirección del cliente"/>
     </div>
     <div className="invoice-field invoice-field-phone">
      <label className="field-label" htmlFor="quote-phone">Teléfono</label>
      <input id="quote-phone" value={chosenClient?.phone??''} readOnly placeholder="Teléfono del cliente"/>
     </div>
     <div className="invoice-field invoice-field-rtn">
      <label className="field-label" htmlFor="quote-rtn">RTN</label>
      <input id="quote-rtn" value={chosenClient?.rtn??''} readOnly placeholder="RTN del cliente"/>
     </div>
    </div>
   </div>
  </section>
  <section className="card invoice-products-card">
   <div className="section-heading">
    <div>
     <h3>Detalle de productos</h3>
     <p>Busca por nombre, código o principio activo; luego selecciona los productos para agregarlos a la cotización.</p>
    </div>
   </div>
   <div className="invoice-search">
    <Search size={17}/>
    <input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Buscar producto o escanear código"/>
   </div>
   {term.trim()&&<div className="invoice-product-results">
    {results.map(p=><div className="invoice-product" key={p.id}>
     <button type="button" className="invoice-product-add" onClick={()=>add(p)}>
      <span className="invoice-product-copy">
       <strong>{p.name}</strong>
       {p.laboratory?.trim()&&<small>Laboratorio: {p.laboratory.trim()}</small>}
       {p.expiry&&<small>Vencimiento: {formatProductExpiry(p.expiry)}</small>}
       <small>{p.code} · {p.presentation||p.category} · Existencia: {p.stock}</small>
      </span>
      <span className="invoice-product-price">{money(priceWithTax(p))}</span>
      <Plus size={16}/>
     </button>
    </div>)}
    {!results.length&&<p className="muted">No se encontraron productos disponibles.</p>}
   </div>}
  </section>
 </div>
 <section className="card invoice-cart">
  <div className="section-heading">
   <div>
    <h3>Detalle de cotización</h3>
    <p>{lines.length} producto(s) en la cotización</p>
   </div>
  </div>
  {!lines.length?<p className="muted">Busca un producto arriba y selecciónalo para agregarlo a la cotización.</p>:<div className="table-wrap">
   <table className="standard-invoice-lines">
    <thead>
     <tr><th>Código</th><th>Descripción</th><th>Cantidad</th><th>Precio de venta</th><th>Descuento %</th><th>ISV %</th><th>Total</th><th></th></tr>
    </thead>
    <tbody>
     {lines.map(l=>{
      const product=products.find(p=>p.id===l.id);
      const expanded=Boolean(expandedQuoteProductDetails[l.id]);
      return <tr key={l.id}>
       <td>{l.code||"—"}</td>
       <td>
        <div className="invoice-product-detail">
         <strong className="invoice-product-detail-name">{l.name}</strong>
         <div className="invoice-product-meta invoice-product-meta-primary">
          {product?.presentation&&<span>{product.presentation}</span>}
          <span>Vence: {product?.expiry?formatProductExpiry(product.expiry):"Sin fecha"}</span>
         </div>
         <div className="invoice-product-meta invoice-product-meta-secondary">
          {product?.laboratory?.trim()&&<span>{product.laboratory.trim()}</span>}
          <span className={"invoice-product-stock"+(product&&product.stock<=product.minStock?" is-low":"")}>Existencia: {product?.stock??"—"}</span>
          <button type="button" className="invoice-product-details-toggle" aria-expanded={expanded} aria-label={(expanded?"Ocultar":"Ver")+" detalles de "+l.name} onClick={()=>setExpandedQuoteProductDetails(current=>({...current,[l.id]:!current[l.id]}))}>
           {expanded?"Ocultar detalles":"Ver detalles"}<ChevronDown size={14} style={{transform:expanded?"rotate(180deg)":"none",transition:"transform .18s ease"}}/>
          </button>
         </div>
         {expanded&&<div className="invoice-product-extra-details">
          {product?.category&&<span>Categoría:<strong>{product.category}</strong></span>}
          {Boolean(product?.activeIngredients?.length)&&<span>Principio activo:<strong>{product?.activeIngredients?.join(", ")}</strong></span>}
         </div>}
        </div>
       </td>
       <td><input className="invoice-qty" aria-label={"Cantidad de "+l.name} type="number" min="1" value={l.qty} onChange={e=>setLines(old=>old.map(x=>x.id===l.id?{...x,qty:Math.max(1,Number(e.target.value)||1)}:x))}/></td>
       <td><input className="invoice-line-price" aria-label={"Precio de venta de "+l.name} type="number" min="0" step="0.01" value={l.price} onChange={e=>setLines(old=>old.map(x=>x.id===l.id?{...x,price:Math.max(0,Number(e.target.value)||0)}:x))}/></td>
       <td><input className="invoice-line-percent" aria-label={"Descuento de "+l.name+" en porcentaje"} type="number" min="0" max="100" step="0.1" value={Math.max(0,Math.min(100,Number(l.discountPercent)||0))} onChange={e=>setLines(old=>old.map(x=>x.id===l.id?{...x,discountPercent:Math.max(0,Math.min(100,Number(e.target.value)||0))}:x))}/></td>
       <td style={{textAlign:"center",whiteSpace:"nowrap"}}>{product?.taxEnabled?Number(product.taxRate??settings.billingInfo?.isvRate??15)+"%":"0%"}</td>
       <td><strong>{money(discountedLineTotal(l))}</strong></td>
       <td><button className="icon-button" aria-label={"Quitar "+l.name} onClick={()=>setLines(old=>old.filter(x=>x.id!==l.id))}><Trash2 size={16}/></button></td>
      </tr>;
     })}
    </tbody>
   </table>
  </div>}
  <div className="quote-summary" aria-label="Resumen de cotización">
   <div className="quote-summary-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
   <div className="quote-summary-row"><span>Descuento</span><strong>{money(lineDiscountTotal+quoteDiscount)}</strong></div>
   <div className="quote-summary-row quote-summary-isv"><span>ISV</span></div>
  </div>
  <div className="invoice-total"><span>Total de la cotización</span><strong>{money(Math.max(0,subtotal-lineDiscountTotal-quoteDiscount))}</strong></div>
  {saveError&&<p className="error-text" role="alert">{saveError}</p>}
  <div className="invoice-actions">
   <button className="secondary" onClick={()=>{setLines([]);setDiscount('0');}} disabled={!lines.length}>Vaciar detalle</button>
   <button className="secondary" onClick={()=>{setCreating(false);setEditingId(null);setClientOpen(false);}}>Cancelar</button>
   <button className="primary" disabled={saving||(!client&&editingId===null)||!lines.length} onClick={save}>
    <Save size={16}/> {saving?"Guardando...":editingId!==null?"Guardar cambios":"Guardar cotización"}
   </button>
  </div>
 </section>
 <section className="card invoice-header-card invoice-notes-card">
  <div className="invoice-field">
   <label className="field-label" htmlFor="quote-notes">Notas de la cotización</label>
   <textarea id="quote-notes" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} placeholder="Ingresar notas u observaciones (opcional)"/>
  </div>
  <label className="quote-notes-switch">
   <input type="checkbox" role="switch" checked={includeNotes} onChange={e=>setIncludeNotes(e.target.checked)}/>
   <span>Incluir notas en la cotización</span>
  </label>
  <div className="invoice-code" style={{textAlign:"right"}}>{notes.length}/500</div>
 </section>
 </>:null}</div>}
