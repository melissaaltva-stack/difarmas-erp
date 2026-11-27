import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Barcode, Camera, Search, ShoppingCart, X, UserPlus, Pill, ExternalLink, FileText, Info, RotateCcw, ClipboardCheck, Activity, BadgePercent } from 'lucide-react';
import type { CartItem, Customer, ErpSettings, Product, SaleRecord, SaleAdjustmentRecord, Receivable, PaymentTransaction } from '../domain/types';
import { ReceivablesModule } from './FinancialModules';
import { ExpiryRecommendations } from './ExpiryRecommendations';
import { getExpiryAlert } from '../services/expiryAlertService';
import { localDateKey } from '../utils/dates';
import { normalizeFiscalCode, validateFiscalAuthorization } from '../services/fiscalService';
import { nextCustomerCode } from '../services/customerCodeService';
import { PharmacyAssistant } from './PharmacyAssistant';

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);

type PosDraft = {
  id:string;
  label:string;
  cart:CartItem[];
  saleType:'minorista'|'mayorista';
  payment:string;
  search:string;
  customer:string;
  customerRtn:string;
  lineDiscounts:Record<string,number>;
  invoiceDiscount:string;
  dueDate:string;
  amountReceived:string;
  presentationSelections:Record<number,string>;
};
type PosDraftStore = { activeDraftId:string; drafts:PosDraft[] };
const createPosDraft=(index:number,payment:string):PosDraft=>{
  const due=new Date();due.setDate(due.getDate()+30);
  return {id:'pos-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),label:'Pedido '+index,cart:[],saleType:'minorista',payment,search:'',customer:'',customerRtn:'',lineDiscounts:{},invoiceDiscount:'0',dueDate:localDateKey(due),amountReceived:'',presentationSelections:{}};
};
const readPosDrafts=(key:string,fallback:{cart:CartItem[];saleType:'minorista'|'mayorista';payment:string;search:string}):PosDraftStore=>{
  const first=createPosDraft(1,fallback.payment);
  try{
    const parsed=JSON.parse(localStorage.getItem(key)||'null') as Partial<PosDraftStore>|null;
    const stored=Array.isArray(parsed?.drafts)?parsed.drafts.filter((draft):draft is PosDraft=>Boolean(draft&&typeof draft.id==='string'&&Array.isArray(draft.cart))):[];
    if(stored.length){
      const drafts=stored.map((draft,index)=>({...createPosDraft(index+1,fallback.payment),...draft,cart:draft.cart,lineDiscounts:draft.lineDiscounts??{},presentationSelections:draft.presentationSelections??{}}));
      return {activeDraftId:drafts.some(draft=>draft.id===parsed?.activeDraftId)?String(parsed?.activeDraftId):drafts[0].id,drafts};
    }
  }catch{/* A damaged local cache must not prevent opening the point of sale. */}
  return {activeDraftId:first.id,drafts:[{...first,cart:fallback.cart,saleType:fallback.saleType,payment:fallback.payment,search:fallback.search}]};
};


export function POS({products,fefoProductIds=[],customers,cart,setCart,saleType,setSaleType,payment,setPayment,search,setSearch,onComplete,settings,setSettings,onRecordMissingProduct,sales,saleAdjustments,onRecordAdjustment,onCreateCustomer,onSaveOrder,receivables,setReceivables,transactions,setTransactions,remoteReady,syncStatus,canAccessReceivables,onOpenCashClosure,onOpenCashMovements,userId='session'}:{products:Product[];fefoProductIds?:number[];customers:Customer[];cart:CartItem[];setCart:(c:CartItem[]|((current:CartItem[])=>CartItem[]))=>void;saleType:'minorista'|'mayorista';setSaleType:(v:'minorista'|'mayorista')=>void;payment:string;setPayment:(v:string)=>void;search:string;setSearch:(v:string)=>void;onComplete:(sold:CartItem[],customer?:string,dueDate?:string,customerRtn?:string,invoiceNumber?:string)=>boolean;settings:ErpSettings;setSettings:(s:ErpSettings)=>void;onRecordMissingProduct:(request:{name:string;presentation:string;quantity:number;notes:string})=>boolean;sales:SaleRecord[];saleAdjustments:SaleAdjustmentRecord[];onRecordAdjustment:(record:SaleAdjustmentRecord)=>boolean;onCreateCustomer:(customer:Customer)=>void;onSaveOrder:(items:CartItem[],customer:string,customerRtn:string,total:number)=>boolean;receivables:Receivable[];setReceivables:Dispatch<SetStateAction<Receivable[]>>;transactions:PaymentTransaction[];setTransactions:Dispatch<SetStateAction<PaymentTransaction[]>>;remoteReady:boolean;syncStatus:'loading'|'saving'|'synced'|'error';canAccessReceivables:boolean;onOpenCashClosure?:()=>void;onOpenCashMovements?:()=>void;userId?:string}) {
  const defaultInvoicePrintFormats:NonNullable<ErpSettings['invoicePrintFormats']>={ticket:{title:'FACTURA / TICKET',subtitle:'COMPROBANTE DE VENTA',footer:'Gracias por su compra. ¡En DIFARMÁS estamos para servirle!',showLogo:true,showFiscalData:true,showCustomer:true,showPrices:true,showPaymentDetails:true,showSignatures:false,marginsMm:3},carta:{title:'FACTURA',subtitle:'COMPROBANTE DE VENTA',footer:'Gracias por su compra. ¡En DIFARMÁS estamos para servirle!',showLogo:true,showFiscalData:true,showCustomer:true,showPrices:true,showPaymentDetails:true,showSignatures:false,marginsMm:10}};

  const draftStorageKey='farmi_pos_drafts_'+userId;
  const [draftStore,setDraftStore]=useState<PosDraftStore>(()=>readPosDrafts(draftStorageKey,{cart,saleType,payment,search}));
  const [activeDraftId,setActiveDraftId]=useState(()=>draftStore.activeDraftId);
  const [draftsReady,setDraftsReady]=useState(false);
  const initialDraft=draftStore.drafts.find(draft=>draft.id===draftStore.activeDraftId)??draftStore.drafts[0];

  const invoiceTemplate=settings.templates.find(t=>t.id==='factura');
  const paymentMethods=settings.paymentMethods?.filter(method=>method.active)??[{id:'cash',name:'Efectivo',kind:'cash' as const,active:true,requiresReference:false},{id:'transfer',name:'Transferencia',kind:'other' as const,active:true,requiresReference:true},{id:'credit',name:'Crédito',kind:'credit' as const,active:true,requiresReference:false}];
  const selectedPaymentMethod=paymentMethods.find(method=>method.name===payment)??paymentMethods[0];
  const isCredit=selectedPaymentMethod?.kind==='credit'||payment==='Crédito';
  const isCash=selectedPaymentMethod?.kind==='cash'||payment==='Efectivo';
  useEffect(()=>{const firstMethod=paymentMethods[0];if(firstMethod&&!paymentMethods.some(method=>method.name===payment)){setPayment(firstMethod.name);}},[payment,paymentMethods,setPayment]);
  const promotionUnitPrice=(p:Product,qty=1)=>{const promo=p.promotion;if(!promo)return p.retail;if(promo.type==='percentage')return Number((p.retail*(1-(promo.discountPercent??0)/100)).toFixed(2));if(promo.type==='2x1')return Number((p.retail*Math.ceil(qty/2)/qty).toFixed(2));return promo.price;};
  const promotionIsActive=(p:Product)=>Boolean(p.promotion?.active&&(p.promotion?.type==='2x1'||(promotionUnitPrice(p)<p.retail&&promotionUnitPrice(p)>0))&&p.promotion.startsAt&&p.promotion.endsAt&&localDateKey(new Date())>=p.promotion.startsAt&&localDateKey(new Date())<=p.promotion.endsAt);
   const promotionDiscountPercent=(p:Product,qty=1)=>p.retail>0?Math.max(0,Math.min(100,(1-promotionUnitPrice(p,qty)/p.retail)*100)):0;
  const salePrice=(p:Product)=>saleType==='mayorista'?p.wholesale:p.retail;
  const saleUnitOptions=(p:Product)=>[{name:p.baseUnitName||'Unidad',unitsPerPresentation:1,retailPrice:p.retail,wholesalePrice:p.wholesale},...(p.unitInventoryEnabled?(p.unitPresentations??[]):[])];
  const [presentationSelections,setPresentationSelections]=useState<Record<number,string>>(()=>initialDraft.presentationSelections);
  const selectedSaleUnit=(p:Product)=>saleUnitOptions(p).find(option=>option.name===(presentationSelections[p.id]??p.baseUnitName))??saleUnitOptions(p)[0];
  const priceForSaleUnit=(p:Product,option:ReturnType<typeof saleUnitOptions>[number])=>{if(option.unitsPerPresentation===1)return salePrice(p);const configured=saleType==='mayorista'?option.wholesalePrice:option.retailPrice;return configured>0?configured:(saleType==='mayorista'?p.wholesale:p.retail)*option.unitsPerPresentation;};
  const results=products.filter(p=>[p.code,p.name,...(p.activeIngredients??[])].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0,6);
  const [lineDiscounts,setLineDiscounts]=useState<Record<string,number>>(()=>initialDraft.lineDiscounts);
  const [invoiceDiscount,setInvoiceDiscount]=useState(()=>initialDraft.invoiceDiscount);
  const cartLineKey=(item:CartItem,index:number)=>item.cartLineId??(String(item.id)+'-legacy-'+index);
  const subtotal=cart.reduce((sum,i)=>sum+i.price*i.qty,0);
  const invoiceDiscountPercent=Math.max(0,Math.min(100,Number(invoiceDiscount)||0));
  const lineDiscountPercent=(item:CartItem,index:number)=>Math.max(0,Math.min(100,Number(lineDiscounts[cartLineKey(item,index)]??0)||0));
  const lineSubtotal=(item:CartItem,index:number)=>item.price*item.qty*(1-lineDiscountPercent(item,index)/100);
  const discountedCart=cart.map((item,index)=>({...item,price:item.price*(1-lineDiscountPercent(item,index)/100)*(1-invoiceDiscountPercent/100)}));
  const total=discountedCart.reduce((sum,i)=>sum+i.price*i.qty,0);
  const productDiscountTotal=cart.reduce((sum,item,index)=>sum+item.price*item.qty*lineDiscountPercent(item,index)/100,0);
  const invoiceDiscountAmount=(subtotal-productDiscountTotal)*invoiceDiscountPercent/100;
  const totalDiscount=productDiscountTotal+invoiceDiscountAmount;
  const profit=discountedCart.reduce((sum,i)=>sum+(i.price-i.cost)*i.qty,0);
  const [customer,setCustomer]=useState(()=>initialDraft.customer);
  const [customerRtn,setCustomerRtn]=useState(()=>initialDraft.customerRtn);
  const [showCustomerResults,setShowCustomerResults]=useState(false);
  const [showNewCustomerForm,setShowNewCustomerForm]=useState(false);
  const [newCustomerName,setNewCustomerName]=useState('');
  const [newCustomerRtn,setNewCustomerRtn]=useState('');
  const [newCustomerPhone,setNewCustomerPhone]=useState('');
  const [newCustomerEmail,setNewCustomerEmail]=useState('');
  const [newCustomerType,setNewCustomerType]=useState<Customer['customerType']>('Persona natural');
  const [newCustomerError,setNewCustomerError]=useState('');
  // Normalize accents and extra spaces so names such as "José" also match "Jose".
  const normalizeCustomerSearch=(value:string)=>value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLocaleLowerCase();
  const matchingCustomers=customers
    .filter(c=>c.active!==false)
    .filter(c=>!customer.trim()||normalizeCustomerSearch([c.code??'',c.name,c.phone,c.rtn??'',c.email??''].join(' ')).includes(normalizeCustomerSearch(customer)))
    .sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}))
    .slice(0,8);
  const selectCustomer=(c:Customer)=>{setCustomer(c.name);setCustomerRtn(c.rtn??'');setShowCustomerResults(false);};
  const startNewCustomer=()=>{setNewCustomerName(customer.trim());setNewCustomerRtn('');setNewCustomerPhone('');setNewCustomerEmail('');setNewCustomerType('Persona natural');setNewCustomerError('');setShowNewCustomerForm(true);setShowCustomerResults(false);};
  const saveNewCustomer=()=>{const name=newCustomerName.trim();const rtn=newCustomerRtn.trim();if(!name){setNewCustomerError('Escribe el nombre del cliente o razón social.');return;}if(rtn&&customers.some(c=>(c.rtn??'').replace(/[^0-9A-Za-z]/g,'').toLowerCase()===rtn.replace(/[^0-9A-Za-z]/g,'').toLowerCase())){setNewCustomerError('Ya existe un cliente con ese RTN. Busca y selecciona el cliente registrado.');return;}if(customers.some(c=>normalizeCustomerSearch(c.name)===normalizeCustomerSearch(name)&&(!newCustomerPhone.trim()||c.phone===newCustomerPhone.trim()))){setNewCustomerError('Ya existe un cliente con ese nombre y teléfono. Búscalo en la lista.');return;}const record:Customer={id:nextPosCustomerId(),code:nextCustomerCode(customers),name,customerType:newCustomerType,documentType:'Identidad',documentNumber:'',rtn,legalName:'',taxRegime:newCustomerType==='Empresa'?'Régimen General':'Persona Natural',phone:newCustomerPhone.trim(),email:newCustomerEmail.trim(),billingEmail:newCustomerEmail.trim(),address:'',creditLimit:0,paymentTerms:'Contado',creditDays:0,assignedSeller:'',priceList:'Precio de venta 1',active:true,notes:''};onCreateCustomer(record);selectCustomer(record);setShowNewCustomerForm(false);setNewCustomerName('');setNewCustomerRtn('');setNewCustomerPhone('');setNewCustomerEmail('');};
  const [dueDate,setDueDate]=useState(()=>initialDraft.dueDate);
  const [error,setError]=useState('');
  const [amountReceived,setAmountReceived]=useState(()=>initialDraft.amountReceived);
  const [printFormat,setPrintFormat]=useState<'ticket'|'carta'>('ticket');
  const [invoice,setInvoice]=useState<{number:string;date:string;items:CartItem[];total:number;payment:string;customer:string;customerRtn:string;received:number;change:number;format:'ticket'|'carta'}|null>(null);
  const [showCamera,setShowCamera]=useState(false);
  const [drugProduct,setDrugProduct]=useState<Product|null>(null);
  const [showPaymentModal,setShowPaymentModal]=useState(false);
  const [printAfterCheckout,setPrintAfterCheckout]=useState(false);
  const [showMissingForm,setShowMissingForm]=useState(false);
  const [missingName,setMissingName]=useState('');
  const [missingPresentation,setMissingPresentation]=useState('');
  const [missingQuantity,setMissingQuantity]=useState('1');
  const [missingNotes,setMissingNotes]=useState('');
  const [missingNotice,setMissingNotice]=useState('');
  const [invoiceSearch,setInvoiceSearch]=useState('');
  const [showInvoiceSearchResults,setShowInvoiceSearchResults]=useState(false);
  const [showReturnsModal,setShowReturnsModal]=useState(false);
  const [showReceivablesQuickModal,setShowReceivablesQuickModal]=useState(false);
  const [selectedSaleId,setSelectedSaleId]=useState('');
  const [adjustmentType,setAdjustmentType]=useState<'Devolución parcial'|'Devolución total'|'Anulación'>('Devolución parcial');
  const [adjustmentReason,setAdjustmentReason]=useState('');
  const [adjustmentQuantities,setAdjustmentQuantities]=useState<Record<number,number>>({});
  const [returnStock,setReturnStock]=useState(true);
  const [adjustmentNotice,setAdjustmentNotice]=useState('');
  const adjustmentSubmissionLocks=useRef<Set<number>>(new Set());
  const lastPosCustomerId=useRef(0);
  const lastSaleAdjustmentId=useRef(0);
  const nextPosCustomerId=()=>{const highestStoredId=customers.reduce((highest,customer)=>Math.max(highest,Number(customer.id)||0),0);const nextId=Math.max(Date.now(),highestStoredId,lastPosCustomerId.current)+1;lastPosCustomerId.current=nextId;return nextId;};
  const nextSaleAdjustmentId=()=>{const highestStoredId=saleAdjustments.reduce((highest,record)=>Math.max(highest,Number(record.id)||0),0);const nextId=Math.max(Date.now(),highestStoredId,lastSaleAdjustmentId.current)+1;lastSaleAdjustmentId.current=nextId;return nextId;};
  useEffect(()=>{adjustmentSubmissionLocks.current.clear();},[saleAdjustments]);

  const snapshotActiveDraft=():PosDraft=>({id:activeDraftId,label:customer.trim()||draftStore.drafts.find(draft=>draft.id===activeDraftId)?.label||'Pedido',cart,saleType,payment,search,customer,customerRtn,lineDiscounts,invoiceDiscount,dueDate,amountReceived,presentationSelections});
  const persistDraftStore=(drafts:PosDraft[],activeId:string)=>{
    const next={activeDraftId:activeId,drafts};
    setDraftStore(next);
    try{localStorage.setItem(draftStorageKey,JSON.stringify(next));}catch{/* Keep working in memory if browser storage is unavailable. */}
  };
  useEffect(()=>{
    const saved=draftStore.drafts.find(draft=>draft.id===activeDraftId);
    if(saved){
      setCart(saved.cart);setSaleType(saved.saleType);setPayment(saved.payment);setSearch(saved.search);
      setLineDiscounts(saved.lineDiscounts);setInvoiceDiscount(saved.invoiceDiscount);setCustomer(saved.customer);setCustomerRtn(saved.customerRtn);
      setDueDate(saved.dueDate);setAmountReceived(saved.amountReceived);setPresentationSelections(saved.presentationSelections);
    }
    setDraftsReady(true);
  // Restore the selected draft once when the POS mounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    if(!draftsReady)return;
    const snapshot=snapshotActiveDraft();
    setDraftStore(current=>{
      const drafts=current.drafts.some(draft=>draft.id===activeDraftId)
        ?current.drafts.map(draft=>draft.id===activeDraftId?snapshot:draft)
        :[...current.drafts,snapshot];
      const next={activeDraftId,drafts};
      try{localStorage.setItem(draftStorageKey,JSON.stringify(next));}catch{/* Draft remains active in memory. */}
      return next;
    });
  },[draftsReady,activeDraftId,cart,saleType,payment,search,customer,customerRtn,lineDiscounts,invoiceDiscount,dueDate,amountReceived,presentationSelections]);
  const switchPosDraft=(targetId:string)=>{
    if(targetId===activeDraftId)return;
    const current=snapshotActiveDraft();
    const drafts=draftStore.drafts.map(draft=>draft.id===activeDraftId?current:draft);
    const target=drafts.find(draft=>draft.id===targetId);
    if(!target)return;
    persistDraftStore(drafts,targetId);
    setActiveDraftId(targetId);setCart(target.cart);setSaleType(target.saleType);setPayment(target.payment);setSearch(target.search);
    setLineDiscounts(target.lineDiscounts);setInvoiceDiscount(target.invoiceDiscount);setCustomer(target.customer);setCustomerRtn(target.customerRtn);
    setDueDate(target.dueDate);setAmountReceived(target.amountReceived);setPresentationSelections(target.presentationSelections);
    setShowPaymentModal(false);setError('');
  };
  const startNewPosDraft=()=>{
    const current=snapshotActiveDraft();
    const nextDraft=createPosDraft(draftStore.drafts.length+1,paymentMethods[0]?.name??'Efectivo');
    persistDraftStore([...draftStore.drafts.map(draft=>draft.id===activeDraftId?current:draft),nextDraft],nextDraft.id);
    setActiveDraftId(nextDraft.id);setCart([]);setSaleType('minorista');setPayment(nextDraft.payment);setSearch('');
    setLineDiscounts({});setInvoiceDiscount('0');setCustomer('');setCustomerRtn('');setDueDate(nextDraft.dueDate);
    setAmountReceived('');setPresentationSelections({});setShowPaymentModal(false);setError('');
  };
  const clearActivePosDraft=()=>{
    setCart([]);setLineDiscounts({});setInvoiceDiscount('0');setCustomer('');setCustomerRtn('');setAmountReceived('');
    const due=new Date();due.setDate(due.getDate()+30);setDueDate(localDateKey(due));setSearch('');setPresentationSelections({});
  };

  const selectedSale=sales.find(s=>String(s.id)===selectedSaleId);
  const adjustedForSale=saleAdjustments.filter(a=>a.saleId===selectedSale?.id);
  const adjustedQuantity=(productId:number)=>adjustedForSale.reduce((sum,a)=>sum+a.items.filter(i=>i.productId===productId).reduce((n,i)=>n+i.quantity,0),0);
  const remainingQuantity=(productId:number,qty:number)=>Math.max(0,qty-adjustedQuantity(productId));
  const normalizeInvoiceSearch=(value:string)=>value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLocaleLowerCase();
  const matchingSales=[...sales].filter(s=>!invoiceSearch.trim()||normalizeInvoiceSearch([String(s.id),s.invoiceNumber??'',s.customer??'',new Date(s.date).toLocaleString('es-HN'),...(s.items??[]).map(i=>i.productName)].join(' ')).includes(normalizeInvoiceSearch(invoiceSearch))).sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,8);
  const adjustmentItems=selectedSale?(adjustmentType==='Devolución parcial'?(selectedSale.items??[]).map(line=>({...line,quantity:Math.min(remainingQuantity(line.productId,line.qty),Math.max(0,Number(adjustmentQuantities[line.productId]??0)))})).filter(line=>line.quantity>0):(selectedSale.items??[]).map(line=>({...line,quantity:remainingQuantity(line.productId,line.qty)})).filter(line=>line.quantity>0)):[];
  const adjustmentAmount=adjustmentItems.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  const submitAdjustment=()=>{
    setAdjustmentNotice('');
    if(selectedSale&&adjustmentSubmissionLocks.current.has(selectedSale.id))return;
    if(!selectedSale||!adjustmentReason.trim()){setAdjustmentNotice('Selecciona una factura e indica el motivo.');return;}
    if(adjustmentType==='Anulación'&&adjustedForSale.length){setAdjustmentNotice('Esta factura ya tiene ajustes. Registra una devolución parcial por el saldo pendiente o revisa el historial.');return;}
    if(!adjustmentItems.length){setAdjustmentNotice('No hay cantidades pendientes para devolver en esta factura.');return;}
    const record:SaleAdjustmentRecord={id:nextSaleAdjustmentId(),saleId:selectedSale.id,invoiceNumber:selectedSale.invoiceNumber||('V-'+selectedSale.id),type:adjustmentType,date:new Date().toISOString(),reason:adjustmentReason.trim(),items:adjustmentItems.map(line=>({productId:line.productId,productName:line.productName,quantity:line.quantity,unitPrice:line.unitPrice,unitCost:line.unitCost,returnToStock:returnStock,baseUnitsPerSale:line.baseUnitsPerSale??1})),amount:adjustmentAmount,paymentMethod:selectedSale.payment,notes:''};
    adjustmentSubmissionLocks.current.add(selectedSale.id);
    if(onRecordAdjustment(record)){setAdjustmentNotice('Ajuste registrado. Verifica el comprobante y el procedimiento fiscal aplicable.');setSelectedSaleId('');setAdjustmentReason('');setAdjustmentQuantities({});}
    else {adjustmentSubmissionLocks.current.delete(selectedSale.id);setAdjustmentNotice('No se pudo registrar. Verifica las cantidades ya devueltas y la sincronización.');}
  };
  const invoicePrintConfig=invoice?(settings.invoicePrintFormats?.[invoice.format]??defaultInvoicePrintFormats[invoice.format]):(settings.invoicePrintFormats?.[printFormat]??defaultInvoicePrintFormats[printFormat]);
  const invoicePaymentMethod=invoice?paymentMethods.find(method=>method.name===invoice.payment):undefined;
  const invoiceIsCredit=invoicePaymentMethod?.kind==='credit'||invoice?.payment==='Crédito';
  const invoiceIsCash=invoicePaymentMethod?.kind==='cash'||invoice?.payment==='Efectivo';
  const received=Number(amountReceived);
  const changeDue=isCash&&Number.isFinite(received)?Math.max(0,received-total):0;
  const add=(p:Product,option=selectedSaleUnit(p))=>{
    const expiryAlert=getExpiryAlert(p.expiry);
    if(!fefoProductIds.includes(p.id)&&expiryAlert&&expiryAlert.daysRemaining<0){setError(`⛔ ${p.name}: producto vencido. No se puede agregar a la venta; revisa y retira el lote según el procedimiento de la farmacia.`);return;}
    if(p.stock<=0){setError(`“${p.name}” no tiene existencias disponibles.`);return;}
    const existing=cart.find(i=>i.id===p.id);
    if(existing&&(existing.baseUnitsPerSale??1)!==option.unitsPerPresentation){setError(`Ya agregaste ${p.name} como ${existing.saleUnit||existing.baseUnitName||'unidad'}. Quita esa línea antes de elegir otra presentación.`);return;}
    const currentBaseQuantity=cart.filter(i=>i.id===p.id).reduce((sum,i)=>sum+i.qty*(i.baseUnitsPerSale??1),0);
    if(currentBaseQuantity+option.unitsPerPresentation>p.stock){setError(`Stock insuficiente para ${option.name} de “${p.name}”. Disponible: ${Math.max(0,p.stock-currentBaseQuantity)} ${p.baseUnitName||'unidades'}.`);return;}
    const price=priceForSaleUnit(p,option);
    if(!Number.isFinite(price)||price<=0){setError(`Configura un precio válido para la presentación ${option.name} de “${p.name}”.`);return;}
    const applyPromotion=saleType==='minorista'&&option.unitsPerPresentation===1&&promotionIsActive(p);const nextQty=(existing?.qty??0)+1;
    if(existing){setCart(cart.map(item=>item.cartLineId===existing.cartLineId?{...item,qty:nextQty,promotionApplied:applyPromotion}:item));if(existing.cartLineId)setLineDiscounts(current=>({...current,[existing.cartLineId!]:applyPromotion?promotionDiscountPercent(p,nextQty):current[existing.cartLineId!]??0}));}
    else {const cartLineId=`${p.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;setCart([...cart,{...p,cost:p.cost*option.unitsPerPresentation,qty:1,price,saleUnit:option.name,baseUnitsPerSale:option.unitsPerPresentation,promotionApplied:applyPromotion,cartLineId}]);setLineDiscounts(current=>({...current,[cartLineId]:applyPromotion?promotionDiscountPercent(p,1):0}));}
    setSearch('');
    setError(fefoProductIds.includes(p.id)?'':(expiryAlert?.message ?? ''));
  };
  const scanOrSearch=(value:string)=>{
    const code=value.trim();
    if(!code)return;
    const product=products.find(p=>String(p.code??'').trim().toLocaleLowerCase()===code.toLocaleLowerCase());
    if(product){add(product);return;}
    setError(`No se encontró un producto con el código “${code}”. Revisa la etiqueta o búscalo por nombre.`);
  };
  const change=(lineId:string,delta:number)=>{
    const target=cart.find((item,index)=>cartLineKey(item,index)===lineId);
    if(!target)return;
    const multiplier=target.baseUnitsPerSale??1;
    const otherBaseQuantity=cart.reduce((sum,item,index)=>sum+(item.id===target.id&&cartLineKey(item,index)!==lineId?item.qty*(item.baseUnitsPerSale??1):0),0);
    const maxPackages=Math.floor(Math.max(0,target.stock-otherBaseQuantity)/multiplier);
    if(delta>0&&target.qty+delta>maxPackages){setError(`Stock máximo alcanzado para ${target.saleUnit||target.baseUnitName||'unidad'} de “${target.name}”.`);return;}
    const nextQty=Math.max(1,Math.min(target.qty+delta,maxPackages));setCart(current=>current.map((item,index)=>cartLineKey(item,index)===lineId?{...item,qty:nextQty}:item));if(target.promotionApplied)setLineDiscounts(current=>({...current,[lineId]:promotionDiscountPercent(target,nextQty)}));
    setError('');
  };
  const remove=(lineId:string)=>{setCart(current=>current.filter((item,index)=>cartLineKey(item,index)!==lineId));setLineDiscounts(current=>{const next={...current};delete next[lineId];return next;});};
  const togglePromotion=(lineId:string)=>{const item=cart.find((entry,index)=>cartLineKey(entry,index)===lineId);if(!item)return;const apply=!item.promotionApplied;setCart(current=>current.map((entry,index)=>cartLineKey(entry,index)===lineId?{...entry,promotionApplied:apply}:entry));setLineDiscounts(current=>({...current,[lineId]:apply?promotionDiscountPercent(item,item.qty):0}));};
  const openDrugAssistant=(product:Product)=>setDrugProduct(product);
  const checkout=()=>{setError('');if(cart.length)setShowPaymentModal(true);};
  useEffect(()=>{if(!printAfterCheckout||!invoice)return;const timer=window.setTimeout(()=>{window.print();setPrintAfterCheckout(false);},250);return ()=>window.clearTimeout(timer);},[printAfterCheckout,invoice]);
  const completeCheckout=()=>{
    setError('');
    if(!cart.length)return;
    if(isCredit&&(!customer.trim()||customer.trim().toLocaleLowerCase()==='consumidor final')){setError('Indica el cliente para registrar una venta al crédito.');return;}
    if(!isCredit&&(!amountReceived.trim()||!Number.isFinite(received)||received<total)){setError('Ingresa un monto recibido igual o mayor al total de la venta.');return;}
    const requestedByProduct=new Map<number,number>();cart.forEach(item=>requestedByProduct.set(item.id,(requestedByProduct.get(item.id)??0)+item.qty*(item.baseUnitsPerSale??1)));
    if([...requestedByProduct.entries()].some(([id,qty])=>qty>(products.find(p=>p.id===id)?.stock??0))){setError('El carrito supera el stock disponible. Actualiza las cantidades.');return;}
    const numbering=settings.documentNumbering??{factura:{prefix:'FAC-',nextNumber:1},orden_compra:{prefix:'OC-',nextNumber:1},nota_debito:{prefix:'ND-',nextNumber:1},nota_credito:{prefix:'NC-',nextNumber:1},orden_entrega:{prefix:'OE-',nextNumber:1}};
    const storedInvoiceSequence=Math.max(1,numbering.factura?.nextNumber??1);
    const fiscal=settings.billingInfo;
    const firstAuthorizedNumber=Number(normalizeFiscalCode(fiscal?.authorizedRangeStart));
    const hasAuthorizedStart=Number.isSafeInteger(firstAuthorizedNumber)&&firstAuthorizedNumber>0;
    const invoiceSequence=fiscal?.cai?.trim()&&hasAuthorizedStart
      ? Math.max(storedInvoiceSequence,firstAuthorizedNumber)
      : storedInvoiceSequence;
    const fiscalError=validateFiscalAuthorization(fiscal,invoiceSequence);
    if(fiscalError){setError(fiscalError);return;}
    const fiscalConfigured=Boolean(fiscal?.cai?.trim());
    const invoiceNumber=fiscalConfigured
      ? `${fiscal?.invoiceSeries?.trim()??''}${String(invoiceSequence).padStart(8,'0')}`
      : `${numbering.factura?.prefix??'FAC-'}${String(invoiceSequence).padStart(8,'0')}`;
    const customerName=customer.trim()||'Consumidor final';
    if(onComplete(discountedCart,customerName,dueDate,customerRtn.trim(),invoiceNumber)){
      setSettings({...settings,documentNumbering:{...numbering,factura:{...numbering.factura,prefix:numbering.factura?.prefix??'FAC-',nextNumber:invoiceSequence+1}}});
      setInvoice({number:invoiceNumber,date:new Date().toLocaleString('es-HN'),items:discountedCart.map(i=>({...i})),total,payment,customer:customerName,customerRtn:customerRtn.trim(),received:isCredit?0:received,change:changeDue,format:printFormat});
      clearActivePosDraft();setPrintAfterCheckout(true);
    }else{setError('No se pudo registrar la venta. Verifica el stock y las cantidades.');}
  };
  return <div className="content"><PharmacyAssistant products={products} context="Venta POS"/>
  <div className="pos-multiple-drafts" role="tablist" aria-label="Pedidos abiertos" style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12,padding:8,border:'1px solid var(--border)',borderRadius:12,background:'var(--surface)'}}>
    {draftStore.drafts.map((draft,index)=><button key={draft.id} type="button" role="tab" aria-selected={draft.id===activeDraftId} onClick={()=>switchPosDraft(draft.id)} style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:3,minWidth:120,maxWidth:190,padding:'8px 12px',borderRadius:9,border:draft.id===activeDraftId?'2px solid var(--primary)':'1px solid var(--border)',background:draft.id===activeDraftId?'var(--surface-muted)':'transparent',color:'var(--text)',cursor:'pointer',fontWeight:draft.id===activeDraftId?700:500}}>
      <span style={{maxWidth:165,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{draft.customer||draft.label||('Pedido '+(index+1))}</span>
      <small style={{fontWeight:400,opacity:.72}}>{draft.cart.length} productos · {money(draft.cart.reduce((sum,item)=>sum+item.price*item.qty,0))}</small>
    </button>)}
    <button type="button" className="secondary" onClick={startNewPosDraft} style={{minHeight:40}}>+ Nuevo pedido</button>
    {draftStore.drafts.length>1&&<button type="button" className="secondary" onClick={()=>{if(window.confirm('¿Cancelar únicamente este pedido? Los demás pedidos abiertos se conservarán.'))clearActivePosDraft();}} style={{minHeight:40}}>Vaciar pedido actual</button>}
  </div>
  <div className="pos-grid"><section><div className="pos-toolbar" style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap",marginBottom:"10px"}}><button className="pos-returns-btn" type="button" onClick={()=>setShowReturnsModal(true)} aria-label="Abrir devoluciones"><RotateCcw size={16} strokeWidth={2}/><span>Devoluciones</span></button>{onOpenCashClosure&&<button className="pos-returns-btn" type="button" onClick={onOpenCashClosure} aria-label="Abrir cierre diario de caja" title="Abrir cierre diario de caja"><ClipboardCheck size={16} strokeWidth={2}/><span>Cierre diario</span></button>}{onOpenCashMovements&&<button className="pos-returns-btn" type="button" onClick={onOpenCashMovements} aria-label="Abrir movimiento de caja" title="Registrar entrada o salida de efectivo"><Activity size={16} strokeWidth={2}/><span>Movimiento de caja</span></button>}{canAccessReceivables&&<button className="pos-returns-btn" type="button" onClick={()=>setShowReceivablesQuickModal(true)} aria-label="Abrir cuentas por cobrar"><FileText size={16} strokeWidth={2}/><span>Cuentas por cobrar</span></button>}</div><div className="card search-pos"><Search size={18}/><input autoFocus value={search} onChange={e=>{setSearch(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();scanOrSearch(search);}}} placeholder="Escanea el código y presiona Enter, o busca por nombre..." aria-label="Buscar o escanear código de producto"/><button className="icon-btn scan-submit" type="button" title="Procesar código" aria-label="Procesar código de barras" onClick={()=>scanOrSearch(search)}><Barcode size={18}/></button><button className="icon-btn camera-submit" type="button" title="Escanear con la cámara" aria-label="Escanear con la cámara del teléfono" onClick={()=>{setError("");setShowCamera(true);}}><Camera size={18}/></button></div><p className="helper scan-help">Usa un lector USB, escribe el código o escanea con la cámara del teléfono. La cámara requiere permiso y una conexión segura (HTTPS).</p><div style={{display:"flex",justifyContent:"flex-end",margin:"0 0 10px"}}><button className="secondary" type="button" onClick={()=>{setMissingName(search.trim());setMissingNotice("");setShowMissingForm(true);}}>+ Registrar producto solicitado</button></div>{search&&results.some(p=>!fefoProductIds.includes(p.id)&&getExpiryAlert(p.expiry))&&<div className="card pos-expiry-alert" role="alert"><strong>⚠️ ALERTA DE VENCIMIENTO</strong>{results.filter(p=>!fefoProductIds.includes(p.id)&&getExpiryAlert(p.expiry)).map(p=>{const alert=getExpiryAlert(p.expiry);return alert?<p key={p.id}><strong>{p.name}</strong> · {alert.daysRemaining<0?`Vencido hace ${Math.abs(alert.daysRemaining)} día(s)`:alert.daysRemaining===0?'Vence hoy':`Vence en ${alert.daysRemaining} día(s)`}. {alert.message}</p>:null;})}</div>}{search&&<div className="results card">{results.length?results.map(p=><div className="pos-result-row" key={p.id}>{p.unitInventoryEnabled&&<label className="pos-unit-picker">Presentación<select value={selectedSaleUnit(p).name} onChange={e=>setPresentationSelections(current=>({...current,[p.id]:e.target.value}))}>{saleUnitOptions(p).map(option=><option key={option.name} value={option.name}>{option.name} · {option.unitsPerPresentation} {p.baseUnitName||'unidades'}</option>)}</select></label>}<button className="pos-result-add" type="button" onClick={()=>add(p,selectedSaleUnit(p))}>{p.imageUrl?<img src={p.imageUrl} alt={p.name} loading="lazy" style={{width:64,height:64,flex:"0 0 64px",objectFit:"contain",borderRadius:8,background:"var(--surface-muted, #f3f4f6)",padding:3}}/>:<span aria-hidden="true" style={{width:64,height:64,flex:"0 0 64px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,background:"var(--surface-muted, #f3f4f6)",color:"var(--text-muted, #64748b)"}}><Pill size={25}/></span>}<span className="pos-result-copy"><strong>{p.name}</strong>{p.laboratory?.trim()&&<small>Laboratorio: {p.laboratory.trim()}</small>}{fefoProductIds.includes(p.id)?<small>Vencimiento: controlado por lotes FEFO</small>:p.expiry&&<small>Vencimiento: {p.expiry}</small>}<small>{p.code} · Stock: {p.stock}</small>{p.activeIngredients?.length ? <small>Principio(s) activo(s): {p.activeIngredients.join(' + ')}</small> : null}{saleType==='minorista'&&promotionIsActive(p)&&<small className="pos-promo-label">Promoción: {p.promotion?.name}</small>}</span><b>{money(priceForSaleUnit(p,selectedSaleUnit(p)))}</b></button><button className="pos-drug-mini" type="button" title={"Asistente farmacológico de "+p.name} aria-label={"Abrir asistente farmacológico de "+p.name} onClick={()=>openDrugAssistant(p)}><Pill size={15}/><span>Asistente</span></button></div>):<div className="missing-product-empty"><p>No se encontraron productos en el inventario.</p><button className="secondary" type="button" onClick={()=>{setMissingName(search.trim());setMissingNotice('');setShowMissingForm(true);}}>Registrar producto no disponible</button></div>}</div>}{showMissingForm&&<div className="card" style={{padding:'14px',marginBottom:'12px'}}><div className="card-title"><div><h3>Registrar producto solicitado</h3><p>Guarda la solicitud sin crear existencias ni modificar inventario.</p></div><button className="icon-btn" type="button" aria-label="Cerrar formulario" onClick={()=>setShowMissingForm(false)}><X size={18}/></button></div><label className="checkout-label">Nombre del producto *<input value={missingName} onChange={e=>setMissingName(e.target.value)} placeholder="Nombre solicitado" required/></label><label className="checkout-label">Presentación / concentración<input value={missingPresentation} onChange={e=>setMissingPresentation(e.target.value)} placeholder="Ej. 500 mg, caja x 20"/></label><label className="checkout-label">Cantidad solicitada<input type="number" min="1" step="1" value={missingQuantity} onChange={e=>setMissingQuantity(e.target.value)}/></label><label className="checkout-label">Nota opcional<input value={missingNotes} onChange={e=>setMissingNotes(e.target.value)} placeholder="Marca solicitada u observaciones"/></label>{missingNotice&&<p className="helper" role="status">{missingNotice}</p>}<div className="modal-actions"><button className="secondary" type="button" onClick={()=>setShowMissingForm(false)}>Cancelar</button><button className="primary" type="button" onClick={()=>{const quantity=Number(missingQuantity);if(!missingName.trim()||!Number.isInteger(quantity)||quantity<1){setMissingNotice('Escribe el nombre y una cantidad entera mayor que cero.');return;}if(onRecordMissingProduct({name:missingName.trim(),presentation:missingPresentation.trim(),quantity,notes:missingNotes.trim()})){setMissingNotice('Solicitud registrada correctamente.');setShowMissingForm(false);setSearch('');setMissingName('');setMissingPresentation('');setMissingQuantity('1');setMissingNotes('');}else setMissingNotice('No se pudo registrar. Revisa los datos e inténtalo de nuevo.');}}>Guardar solicitud</button></div></div>}<ExpiryRecommendations products={products} cart={cart} fefoProductIds={fefoProductIds}/>{error&&<p className="form-error scan-feedback" role="alert">{error}</p>}<div className="card cart-card"><div className="card-title"><div><h3>Carrito</h3><p>{cart.length} productos</p></div><ShoppingCart size={20}/></div>{cart.length===0?<div className="cart-empty">Agrega productos para iniciar la venta.</div>:cart.map((i,index)=><div className="cart-row" key={cartLineKey(i,index)}><div className="cart-product-info" style={{display:"flex",alignItems:"flex-start",gap:"10px",textAlign:"left"}}>{i.imageUrl?<img src={i.imageUrl} alt={i.name} loading="lazy" style={{width:"64px",height:"64px",objectFit:"contain",flexShrink:0,borderRadius:"8px",background:"var(--surface-muted, #f3f4f6)",border:"1px solid var(--border, #e5e7eb)"}}/>:<div aria-label="Producto sin imagen" style={{width:"64px",height:"64px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,borderRadius:"8px",background:"var(--surface-muted, #f3f4f6)",border:"1px solid var(--border, #e5e7eb)",color:"var(--text-muted, #64748b)"}}><Pill size={24}/></div>}<div style={{minWidth:0,flex:1}}><div className="cart-product-title" style={{justifyContent:"flex-start",textAlign:"left"}}><strong>{i.name}</strong><button className="pos-drug-mini cart-drug-mini" type="button" title={"Asistente farmacológico de "+i.name} aria-label={"Abrir asistente farmacológico de "+i.name} onClick={()=>openDrugAssistant(i)}><Pill size={14}/><span>Asistente</span></button></div><small style={{display:"block",textAlign:"left"}}>{i.code} · {i.saleUnit||i.baseUnitName||'Unidad'} · {money(i.price)} c/u</small>{saleType==='minorista'&&(i.baseUnitsPerSale??1)===1&&promotionIsActive(i)&&<button type="button" className={'invoice-promotion-toggle pos-promotion-toggle'+(i.promotionApplied?' is-applied':'')} aria-pressed={Boolean(i.promotionApplied)} title={i.promotionApplied?'Usar precio normal':'Aplicar promoción'} onClick={()=>togglePromotion(cartLineKey(i,index))}><BadgePercent size={14}/><span>{i.promotionApplied?'Promoción aplicada':'Aplicar promoción'} · {(i.promotion?.type==='2x1'?'Oferta 2x1':money(promotionUnitPrice(i,i.qty)))}</span></button>}<label className="checkout-label" style={{display:"flex",alignItems:"center",gap:"6px",margin:"6px 0",fontSize:"12px"}}>Descuento % <input aria-label={"Porcentaje de descuento para "+i.name} type="number" min="0" max="100" step="0.1" value={lineDiscounts[cartLineKey(i,index)]??0} onChange={e=>setLineDiscounts(current=>({...current,[cartLineKey(i,index)]:Math.max(0,Math.min(100,Number(e.target.value)||0))}))} style={{width:"76px",padding:"5px"}}/></label><div style={{display:"flex",flexWrap:"wrap",columnGap:"18px",rowGap:"2px",justifyContent:"flex-start",textAlign:"left"}}>{i.laboratory?.trim()&&<small>Laboratorio: {i.laboratory.trim()}</small>}{fefoProductIds.includes(i.id)?<small>Vencimiento: controlado por lotes FEFO</small>:i.expiry&&<small>Vencimiento: {i.expiry}</small>}{i.activeIngredients?.length ? <small>Principio(s) activo(s): {i.activeIngredients.join(' + ')}</small> : null}</div></div></div><div className="qty"><button onClick={()=>change(cartLineKey(i,index),-1)}>-</button><b>{i.qty}</b><button onClick={()=>change(cartLineKey(i,index),1)}>+</button></div><strong>{money(i.price*i.qty)}</strong><button className="remove" onClick={()=>remove(cartLineKey(i,index))}>×</button></div>)}</div></section><aside className="card checkout"><div className="customer-picker"><label className="checkout-label checkout-customer-name-field">Nombre del cliente (opcional en ventas al contado)<input value={customer} onFocus={()=>setShowCustomerResults(true)} onBlur={()=>{if(!customer.trim()&&!isCredit)setCustomer('Consumidor final');}} onChange={e=>{setCustomer(e.target.value);setShowCustomerResults(true);const match=customers.find(c=>c.active&&c.name.trim().toLocaleLowerCase()===e.target.value.trim().toLocaleLowerCase());if(match)setCustomerRtn(match.rtn??"");else setCustomerRtn("");}} onKeyDown={e=>{if(e.key==="Escape")setShowCustomerResults(false);if(e.key==="Enter"&&showCustomerResults&&matchingCustomers.length){e.preventDefault();selectCustomer(matchingCustomers[0]);}}} placeholder="Consumidor final (o escribe el nombre del cliente)" autoComplete="off" role="combobox" aria-expanded={showCustomerResults&&matchingCustomers.length>0} aria-autocomplete="list"/></label>{showCustomerResults&&(customer.trim()||matchingCustomers.length>0)&&<div className="results card customer-search-results" role="listbox">{matchingCustomers.length? <>{!customer.trim()&&<p className="helper customer-search-hint">Clientes disponibles · escribe para filtrar</p>}{matchingCustomers.map(c=><button key={c.id} type="button" role="option" onMouseDown={e=>e.preventDefault()} onClick={()=>selectCustomer(c)}><span><strong>{c.name}</strong><small>{[c.code?`Código: ${c.code}`:"",c.phone,c.rtn?`RTN: ${c.rtn}`:"",c.email??""].filter(Boolean).join(" · ")||"Cliente registrado"}</small></span><b>Seleccionar</b></button>)}</>:<p className="helper">No hay clientes que coincidan con “{customer}”. Puedes registrarlo aquí mismo.</p>}{customer.trim()&&<button type="button" className="customer-create-option" onMouseDown={e=>e.preventDefault()} onClick={startNewCustomer}><span><strong><UserPlus size={16}/> Registrar “{customer.trim()}”</strong><small>Crear ficha de cliente sin salir de Ventas / POS</small></span><b>+ Nuevo</b></button>}</div>}</div><label className="checkout-label checkout-rtn-field">RTN del cliente (opcional)<input value={customerRtn} onChange={e=>setCustomerRtn(e.target.value)} placeholder="RTN para la factura" inputMode="numeric" autoComplete="off"/></label><h3>Resumen de venta</h3><div className="summary-line"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div className="summary-line"><span>Descuento por productos</span><strong>-{money(productDiscountTotal)}</strong></div><label className="checkout-label">Descuento al total de la factura (%)<input aria-label="Porcentaje de descuento al total de la factura" type="number" min="0" max="100" step="0.1" value={invoiceDiscount} onChange={e=>setInvoiceDiscount(String(Math.max(0,Math.min(100,Number(e.target.value)||0))))}/></label><div className="summary-line"><span>Descuento de factura</span><strong>-{money(invoiceDiscountAmount)}</strong></div><div className="summary-line"><span>Descuento total</span><strong>-{money(totalDiscount)}</strong></div><div className="summary-line"><span>Utilidad estimada</span><strong>{money(profit)}</strong></div>{showNewCustomerForm&&<div className="modal-backdrop" role="presentation"><div className="modal customer-modal" role="dialog" aria-modal="true" aria-label="Registrar cliente desde el punto de venta"><div className="modal-head"><div><h2>Nuevo cliente</h2><p>Regístralo sin salir del punto de venta. Quedará seleccionado para esta venta.</p></div><button className="icon-btn" type="button" onClick={()=>setShowNewCustomerForm(false)} aria-label="Cerrar"><X size={18}/></button></div><div className="form-grid"><label>Tipo de cliente<select value={newCustomerType} onChange={e=>setNewCustomerType(e.target.value as Customer['customerType'])}><option value="Persona natural">Persona natural</option><option value="Empresa">Empresa</option></select></label><label>Código de cliente<input value={nextCustomerCode(customers)} readOnly aria-label="Código asignado automáticamente"/></label><label>Nombre completo / Razón social *<input autoFocus maxLength={160} value={newCustomerName} onChange={e=>setNewCustomerName(e.target.value)} placeholder="Nombre del cliente o empresa"/></label><label>RTN / Identificación<input maxLength={40} value={newCustomerRtn} onChange={e=>setNewCustomerRtn(e.target.value)} placeholder="Número de identificación"/></label><label>Teléfono<input maxLength={40} value={newCustomerPhone} onChange={e=>setNewCustomerPhone(e.target.value)} placeholder="Ej. 9999-9999"/></label><label>Correo electrónico<input type="email" maxLength={160} value={newCustomerEmail} onChange={e=>setNewCustomerEmail(e.target.value)} placeholder="cliente@correo.com"/></label></div>{newCustomerError&&<p className="form-error" role="alert">{newCustomerError}</p>}<div className="modal-actions"><button className="secondary" type="button" onClick={()=>setShowNewCustomerForm(false)}>Cancelar</button><button className="primary" type="button" onClick={saveNewCustomer}><UserPlus size={16}/> Guardar y seleccionar</button></div></div></div>}{isCredit&&<label className="checkout-label">Fecha de vencimiento<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>}<div className="grand checkout-grand-total"><span>Total a pagar</span><strong>{money(total)}</strong></div>{error&&<p className="form-error" role="alert">{error}</p>}<button className="secondary checkout-btn" disabled={!cart.length} type="button" onClick={()=>{setError('');if(onSaveOrder(discountedCart,customer.trim(),customerRtn.trim(),total)){clearActivePosDraft();setError('');}else setError('No se pudo guardar el pedido. Verifica las existencias y la sincronización.');}}><FileText size={16}/> Guardar pedido</button><button className="primary checkout-btn" disabled={!cart.length} onClick={checkout}>Cobrar</button>{invoice&&<button className="secondary checkout-btn" onClick={()=>{setShowPaymentModal(true);}}>Ver / imprimir última factura</button>}{showReturnsModal&&<div className="modal-backdrop returns-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowReturnsModal(false);}}><div className="modal returns-modal-shell" role="dialog" aria-modal="true" aria-label="Devoluciones y anulaciones de facturas"><div className="modal-head returns-modal-head"><button className="icon-btn" type="button" aria-label="Cerrar devoluciones y anulaciones" onClick={()=>setShowReturnsModal(false)}><X size={18}/></button></div><section className="card sales-return-panel">
    <div className="invoice-search-box">
      <label className="checkout-label" htmlFor="invoice-return-search">Buscar factura para devolución o anulación</label>
      <div className="invoice-search-control"><Search size={19} aria-hidden="true"/><input id="invoice-return-search" value={invoiceSearch} onFocus={()=>setShowInvoiceSearchResults(true)} onChange={e=>{setInvoiceSearch(e.target.value);setShowInvoiceSearchResults(true);}} onKeyDown={e=>{if(e.key==='Escape')setShowInvoiceSearchResults(false);if(e.key==='Enter'&&matchingSales.length){e.preventDefault();const s=matchingSales[0];setSelectedSaleId(String(s.id));setAdjustmentQuantities({});setAdjustmentNotice('');setShowInvoiceSearchResults(false);}}} placeholder="N.º de factura, cliente, fecha o producto…" autoComplete="off" aria-expanded={showInvoiceSearchResults} aria-controls="invoice-return-results"/>{invoiceSearch&&<button type="button" className="invoice-search-clear" onClick={()=>{setInvoiceSearch('');setShowInvoiceSearchResults(true);setSelectedSaleId('');}} aria-label="Limpiar búsqueda"><X size={16}/></button>}</div>
      <p className="helper invoice-search-hint">Busca por número de factura, nombre del cliente, fecha o producto vendido. Presiona Enter para elegir el primer resultado.</p>
    </div>
    {showInvoiceSearchResults&&!selectedSale&&<div className="results card invoice-return-results" id="invoice-return-results"><div className="invoice-results-heading"><strong>{invoiceSearch.trim()?'Resultados de búsqueda':'Ventas recientes'}</strong><span>{matchingSales.length} {matchingSales.length===1?'venta':'ventas'}</span></div>{matchingSales.map(s=><button key={s.id} type="button" className="invoice-result-row" onClick={()=>{setSelectedSaleId(String(s.id));setAdjustmentQuantities({});setAdjustmentNotice('');setShowInvoiceSearchResults(false);}}><span className="invoice-result-main"><strong>{s.invoiceNumber||('Venta V-'+s.id)}</strong><small>{new Date(s.date).toLocaleString('es-HN')} · {s.customer||'Consumidor final'}</small><small>{(s.items??[]).slice(0,3).map(i=>i.productName).join(' · ')||'Detalle de productos no disponible'}</small></span><span className="invoice-result-side"><strong>{money(s.total)}</strong><small>Seleccionar <span aria-hidden="true">→</span></small></span></button>)}{matchingSales.length===0&&<p className="invoice-search-empty">No se encontraron ventas. Prueba con otra parte del número de factura, cliente o producto.</p>}{sales.length===0&&<p className="invoice-search-empty">Todavía no hay ventas registradas para buscar.</p>}</div>}
    {selectedSale&&<div className="invoice-selected-banner"><div><span>Factura seleccionada</span><strong>{selectedSale.invoiceNumber||('Venta V-'+selectedSale.id)}</strong><small>{selectedSale.customer||'Consumidor final'} · {new Date(selectedSale.date).toLocaleString('es-HN')}</small></div><button type="button" className="secondary" onClick={()=>{setSelectedSaleId('');setAdjustmentNotice('');setShowInvoiceSearchResults(true);}}><Search size={15}/> Cambiar factura</button></div>}
    {selectedSale&&<div className="sales-return-detail"><div className="summary-line"><span>Factura / referencia</span><strong>{selectedSale.invoiceNumber||('Venta V-'+selectedSale.id)}</strong></div><div className="summary-line"><span>Cliente / fecha</span><strong>{selectedSale.customer||'Consumidor final'} · {new Date(selectedSale.date).toLocaleDateString('es-HN')}</strong></div><div className="form-grid"><label>Operación<select value={adjustmentType} onChange={e=>setAdjustmentType(e.target.value as typeof adjustmentType)}><option value="Devolución parcial">Devolución parcial</option><option value="Devolución total">Devolución total</option><option value="Anulación">Anulación de factura</option></select></label><label>Motivo<input value={adjustmentReason} onChange={e=>setAdjustmentReason(e.target.value)} placeholder="Motivo obligatorio"/></label></div>
    <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Vendidas</th><th>Devueltas antes</th><th>{adjustmentType==='Devolución parcial'?'Cantidad a devolver':'Cantidad de esta operación'}</th><th>Importe</th></tr></thead><tbody>{(selectedSale.items??[]).map(line=>{const remaining=remainingQuantity(line.productId,line.qty);const qty=adjustmentType==='Devolución parcial'?Math.min(remaining,Math.max(0,Number(adjustmentQuantities[line.productId]??0))):remaining;return <tr key={line.productId}><td>{line.productName}</td><td>{line.qty}</td><td>{adjustedQuantity(line.productId)}</td><td>{adjustmentType==='Devolución parcial'?<input aria-label={'Cantidad a devolver de '+line.productName} type="number" min="0" max={remaining} step="1" value={adjustmentQuantities[line.productId]??0} onChange={e=>setAdjustmentQuantities(prev=>({...prev,[line.productId]:Math.min(remaining,Math.max(0,Number(e.target.value)))}))}/>:qty}</td><td>{money(qty*line.unitPrice)}</td></tr>})}</tbody></table></div>
    <label className="inline-check"><input type="checkbox" checked={returnStock} onChange={e=>setReturnStock(e.target.checked)}/> Reingresar productos al inventario (solo si están en condiciones de venta)</label><div className="grand"><span>Importe de la devolución / anulación</span><strong>{money(adjustmentAmount)}</strong></div>{adjustmentNotice&&<p className="helper" role="status">{adjustmentNotice}</p>}<div className="modal-actions"><button className="secondary" type="button" onClick={()=>{setSelectedSaleId('');setAdjustmentNotice('');}}>Cancelar</button><button className="primary" type="button" onClick={submitAdjustment}>Registrar operación</button></div>
    </div>}
    {saleAdjustments.length>0&&<details className="sales-return-history"><summary>Historial de operaciones ({saleAdjustments.length})</summary><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Factura</th><th>Tipo</th><th>Motivo</th><th>Importe</th></tr></thead><tbody>{saleAdjustments.slice(0,30).map(a=><tr key={a.id}><td>{new Date(a.date).toLocaleString('es-HN')}</td><td>{a.invoiceNumber}</td><td>{a.type}</td><td>{a.reason}</td><td>{money(a.amount)}</td></tr>)}</tbody></table></div></details>}
    <p className="helper">El sistema registra el ajuste y el movimiento de inventario. Una anulación fiscal oficial puede requerir nota de crédito u otro procedimiento autorizado; esta función interna no sustituye ese trámite.</p>
  </section></div></div>}
  </aside></div>
  {invoice&&<section className={`print-invoice print-invoice-${invoice.format}`} style={{'--invoice-print-margin':`${invoicePrintConfig.marginsMm}mm`} as React.CSSProperties} aria-label={invoice.format==='ticket'?'Factura tipo ticket':'Factura tamaño carta'}><header className="invoice-header"><div className="invoice-brand">{invoicePrintConfig.showLogo&&invoiceTemplate?.showLogo&&(settings.logoDataUrl?<img className="invoice-brand-image" src={settings.logoDataUrl} alt="Logotipo de la empresa"/>:<span className="invoice-brand-mark" style={{background:settings.primaryColor}}>F</span>)}<div><h1>{settings.businessName||'DIFARMÁS'}</h1><p>{invoicePrintConfig.subtitle||invoiceTemplate?.subtitle||'COMPROBANTE DE VENTA'}</p>{settings.rtn&&<small>RTN: {settings.rtn}</small>}{settings.phone&&<small>Tel. {settings.phone}</small>}{settings.address&&<small>{settings.address}</small>}</div></div><span className="invoice-tag" style={{color:settings.primaryColor}}>{invoicePrintConfig.title||invoiceTemplate?.title||'FACTURA'}</span></header><div className="invoice-meta"><div><small>NÚMERO DE FACTURA</small><strong>{invoice.number}</strong></div><div><small>FECHA DE EMISIÓN</small><strong>{invoice.date}</strong></div>{invoicePrintConfig.showCustomer&&<div className="invoice-customer"><small>CLIENTE</small><strong>{invoice.customer}</strong>{invoice.customerRtn&&<><small>RTN DEL CLIENTE</small><strong>{invoice.customerRtn}</strong></>}</div>}</div>{invoicePrintConfig.showFiscalData&&settings.billingInfo&&<div className="invoice-fiscal-data"><strong>DATOS DE AUTORIZACIÓN FISCAL</strong>{settings.billingInfo.cai&&<p><span>CAI:</span> {settings.billingInfo.cai}</p>}{settings.billingInfo.invoiceSeries&&<p><span>Serie de facturación:</span> {settings.billingInfo.invoiceSeries}</p>}{settings.billingInfo.authorizedRangeStart&&settings.billingInfo.authorizedRangeEnd&&<p><span>Rango autorizado:</span> {settings.billingInfo.authorizedRangeStart} — {settings.billingInfo.authorizedRangeEnd}</p>}</div>}<table><thead><tr><th>Producto</th><th>Cant.</th>{invoicePrintConfig.showPrices&&<><th>Precio</th><th>Total</th></>}</tr></thead><tbody>{invoice.items.map((item,index)=><tr key={item.id+'-'+index}><td>{item.name}{item.activeIngredients?.length ? <small className="invoice-ingredients">{item.activeIngredients.join(' + ')}</small>:null}</td><td>{item.qty}</td>{invoicePrintConfig.showPrices&&<><td>{money(item.price)}</td><td>{money(item.price*item.qty)}</td></>}</tr>)}</tbody></table><div className="invoice-total"><p><span>Total</span><strong>{money(invoice.total)}</strong></p>{invoicePrintConfig.showPaymentDetails&&<><p><span>Método de pago</span><strong>{invoice.payment}</strong></p>{!invoiceIsCredit&&<><p><span>Recibido</span><strong>{money(invoice.received)}</strong></p>{invoiceIsCash&&<p><span>Cambio</span><strong>{money(invoice.change)}</strong></p>}</>}</>}</div>{invoicePrintConfig.showSignatures&&<div className="invoice-print-signatures"><span>Firma autorizada</span><span>Recibido por</span></div>}<footer>{invoicePrintConfig.footer||invoiceTemplate?.footer||'Gracias por su compra. ¡En DIFARMÁS estamos para servirle!'}{settings.billingInfo?.fiscalLegend&&<p className="invoice-fiscal-legend">{settings.billingInfo.fiscalLegend}</p>}</footer></section>}
  {drugProduct&&<POSDrugAssistantModal product={drugProduct} price={salePrice(drugProduct)} onClose={()=>setDrugProduct(null)}/>}
  {showPaymentModal&&<div className="modal-backdrop payment-modal-backdrop" role="presentation"><div className="modal payment-checkout-modal" role="dialog" aria-modal="true" aria-label="Cobro y emisión de factura"><div className="modal-head"><div><h2>{invoice&&!cart.length?'Factura lista':'Cobrar venta'}</h2><p>Confirma la forma de pago y el dinero recibido antes de finalizar.</p></div><button className="icon-btn" type="button" aria-label="Cerrar ventana de cobro" onClick={()=>setShowPaymentModal(false)}><X size={20}/></button></div><div className="payment-modal-total"><span>Total a pagar</span><strong>{money(invoice&&!cart.length?invoice.total:total)}</strong></div>{cart.length>0&&<><label className="checkout-label">Forma de pago<select value={payment} onChange={e=>setPayment(e.target.value)}>{paymentMethods.map(method=><option key={method.id} value={method.name}>{method.name}</option>)}</select></label>{selectedPaymentMethod?.requiresReference&&!isCredit&&<p className="helper">Recuerda registrar y conservar la referencia o comprobante del pago.</p>}{isCredit?<p className="payment-modal-note">Venta al crédito. Se registrará el cliente y la fecha de vencimiento configurada.</p>:<><label className="checkout-label checkout-received-field">Monto que entrega el cliente <span className="field-hint">Lempiras (L)</span><input type="number" min="0" step="0.01" inputMode="decimal" value={amountReceived} onChange={e=>setAmountReceived(e.target.value)} placeholder="0.00" autoFocus aria-label="Monto entregado por el cliente"/></label><div className="received-quick-actions"><button type="button" onClick={()=>setAmountReceived(total.toFixed(2))}>Exacto · {money(total)}</button><button type="button" onClick={()=>setAmountReceived(String(Math.ceil(total/50)*50))}>L {Math.ceil(total/50)*50}</button><button type="button" onClick={()=>setAmountReceived(String(Math.ceil(total/100)*100))}>L {Math.ceil(total/100)*100}</button><button type="button" onClick={()=>setAmountReceived(String(Math.ceil(total/500)*500))}>L {Math.ceil(total/500)*500}</button></div>{isCash&&<div className="payment-modal-change"><span>Cambio a devolver</span><strong>{money(changeDue)}</strong></div>}</>}<label className="checkout-label">Formato de factura<select value={printFormat} onChange={e=>setPrintFormat(e.target.value as 'ticket'|'carta')}><option value="ticket">Ticket (impresora térmica)</option><option value="carta">Tamaño carta</option></select></label>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" type="button" onClick={()=>setShowPaymentModal(false)}>Cancelar</button><button className="primary" type="button" onClick={completeCheckout}>Confirmar cobro</button></div></>}{invoice&&!cart.length&&<><label className="checkout-label">Formato de factura<select value={invoice.format} onChange={e=>{const format=e.target.value as 'ticket'|'carta';setPrintFormat(format);setInvoice(current=>current?{...current,format}:current);}}><option value="ticket">Ticket (impresora térmica)</option><option value="carta">Tamaño carta</option></select></label><div className="payment-modal-actions"><button className="secondary" type="button" onClick={()=>setShowPaymentModal(false)}>Cerrar</button><button className="primary" type="button" onClick={()=>window.print()}>Imprimir factura</button></div></>}</div></div>}
  {showCamera&&<CameraScanner onDetected={scanOrSearch} onClose={()=>setShowCamera(false)}/ >}{showReceivablesQuickModal&&<div role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowReceivablesQuickModal(false);}} style={{position:'fixed',inset:0,zIndex:1200,background:'rgba(15,23,42,.58)',display:'flex',alignItems:'center',justifyContent:'center',padding:'12px'}}><section className="pos-receivables-modal" role="dialog" aria-modal="true" aria-label="Cuentas por cobrar" style={{position:'relative',width:'840px',height:'556px',maxWidth:'calc(100vw - 24px)',maxHeight:'calc(100vh - 24px)',overflowY:'auto',borderRadius:'14px',boxShadow:'0 24px 70px rgba(0,0,0,.28)',padding:'12px'}}><div style={{position:'sticky',top:0,zIndex:5,display:'flex',justifyContent:'flex-end',marginBottom:'4px'}}><button type="button" className="icon-btn pos-receivables-modal-close" aria-label="Cerrar cuentas por cobrar" onClick={()=>setShowReceivablesQuickModal(false)}>×</button></div><div style={{zoom:.88}}><ReceivablesModule receivables={receivables} setReceivables={setReceivables} transactions={transactions} setTransactions={setTransactions} remoteReady={remoteReady} syncStatus={syncStatus}/></div></section></div>}</div>;
}


function POSDrugAssistantModal({product,price,onClose}:{product:Product;price:number;onClose:()=>void}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<{ingredients:string;indications:string;dosage:string;duration:string;warnings:string;source:string}|null>(null);
  const lookup=async()=>{
    setBusy(true);setError('');setResult(null);
    try {
      const query=product.name.trim();
      const expression=`openfda.brand_name:"${query}" OR openfda.generic_name:"${query}" OR openfda.substance_name:"${query}"`;
      const response=await fetch('https://api.fda.gov/drug/label.json?search='+encodeURIComponent(expression)+'&limit=5');
      if(!response.ok)throw new Error('No se encontró una ficha coincidente en openFDA.');
      const data=await response.json() as {results?:Array<Record<string,unknown>>};
      const record=data.results?.[0];
      if(!record)throw new Error('No se encontró una ficha coincidente en openFDA.');
      const readField=(key:string)=>{const value=record[key];return Array.isArray(value)?value.filter(v=>typeof v==='string').join('\n\n'):typeof value==='string'?value:'';};
      const openfda=record.openfda as Record<string,unknown>|undefined;
      const ingredients=openfda?.substance_name??openfda?.generic_name;
      setResult({
        ingredients:Array.isArray(ingredients)?ingredients.join(', '):'',
        indications:readField('indications_and_usage'),
        dosage:readField('dosage_and_administration'),
        duration:readField('duration_of_use'),
        warnings:readField('warnings_and_cautions')||readField('warnings'),
        source:'openFDA · etiqueta de medicamento de Estados Unidos'
      });
    } catch (e) {
      setError(e instanceof Error?e.message:'No se pudo consultar automáticamente la ficha técnica.');
    } finally { setBusy(false); }
  };
  const ingredientText=result?.ingredients||(product.activeIngredients??[]).join(' + ');
  const fields=[
    ['Indicaciones descritas en la fuente',result?.indications||product.drugInfo?.indications],
    ['Posología descrita en la fuente',result?.dosage||product.drugInfo?.dosage],
    ['Duración descrita en la fuente',result?.duration||product.drugInfo?.duration],
    ['Advertencias y precauciones',result?.warnings||product.drugInfo?.warnings]
  ].filter((entry):entry is [string,string]=>Boolean(entry[1]));
  return <div className="modal-backdrop drug-assistant-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="modal drug-assistant-modal" role="dialog" aria-modal="true" aria-labelledby="pos-drug-assistant-title">
      <div className="modal-head"><div><span className="pill">ASISTENTE FARMACOLÓGICO</span><h2 id="pos-drug-assistant-title">{product.name}</h2><p>{[product.laboratory,product.presentation,product.code].filter(Boolean).join(' · ')}</p></div><button className="icon-btn" type="button" aria-label="Cerrar asistente farmacológico" onClick={onClose}><X size={18}/></button></div>
      <div className="drug-assistant-body">
        <section className="drug-assistant-product">{product.imageUrl?<img src={product.imageUrl} alt={product.name}/>:<div className="drug-assistant-image-placeholder"><Pill size={28}/><span>Sin imagen</span></div>}<div><strong>{product.name}</strong><small>Stock: {product.stock} · Precio: {money(price)}</small><small>{ingredientText?'Principios activos: '+ingredientText:'Principios activos: no registrados'}</small></div></section>
        {product.drugInfo?.reviewStatus&&<p className="drug-assistant-review"><Info size={15}/> {product.drugInfo.reviewStatus}</p>}
        <section className="drug-assistant-fields"><h3><FileText size={16}/> Información farmacológica de referencia</h3>
          {fields.map(([label,value])=><div key={label}><strong>{label}</strong><p>{value}</p></div>)}
          {!ingredientText&&fields.length===0&&<p className="helper">No hay una ficha farmacológica registrada para este producto. Puedes consultar una fuente pública o revisar la ficha del producto en Inventario.</p>}
          {(result?.source||product.drugInfo?.source)&&<small className="drug-assistant-source">Fuente: {result?.source||product.drugInfo?.source}</small>}
        </section>
        {error&&<p className="form-error" role="alert">{error}</p>}
        <p className="drug-assistant-caution">Información de referencia: puede corresponder a otro país o presentación. Verifica principio activo, concentración y fabricante. No sustituye la valoración de un profesional autorizado.</p>
      </div>
      <div className="modal-actions drug-assistant-actions"><button type="button" className="secondary" onClick={()=>window.open('https://www.google.com/search?q='+encodeURIComponent(product.name+' '+product.presentation+' ficha técnica medicamento'),'_blank','noopener,noreferrer')}><ExternalLink size={15}/> Buscar ficha técnica</button><button type="button" className="secondary" onClick={lookup} disabled={busy}>{busy?'Consultando…':'Consultar openFDA'}</button><button type="button" className="primary" onClick={onClose}>Cerrar</button></div>
    </section>
  </div>;
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
