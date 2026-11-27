import { createClient } from '@supabase/supabase-js';
type Req={method?:string;headers:Record<string,string|string[]|undefined>;body?:unknown};
type Res={status(code:number):Res;setHeader(name:string,value:string):void;json(body:unknown):void};
type ChatMessage={role:'user'|'assistant';content:string};
const reply=(res:Res,status:number,value:unknown)=>res.status(status).json(value);
const clean=(value:unknown,max=220)=>typeof value==='string'?value.trim().slice(0,max):'';
function bodyOf(req:Req):Record<string,unknown>{if(req.body&&typeof req.body==='object')return req.body as Record<string,unknown>;if(typeof req.body==='string'){try{const v:unknown=JSON.parse(req.body);return v&&typeof v==='object'?v as Record<string,unknown>:{};}catch{return {};}}return {};}
const SYSTEM_PROMPT=[
'Eres FARMI, un asistente de orientación farmacéutica para el personal de una farmacia en Honduras. Hablas español claro, amable y breve.',
'Apoyas la conversación con el cliente y la revisión por un farmacéutico; NO eres médico ni sustituyes la valoración profesional.',
'No diagnostiques, no prescribas, no indiques dosis, frecuencia, duración ni ajustes de tratamientos. No recomiendes iniciar, suspender o cambiar medicamentos.',
'Antes de orientar sobre medicamentos, pregunta lo que falte y sea relevante: edad, embarazo/lactancia, alergias, enfermedades (especialmente hipertensión, riñón, hígado, úlcera, asma), medicamentos actuales y síntomas/duración/intensidad. No solicites nombre, identidad, teléfono ni datos identificables.',
'Considera interacciones, contraindicaciones y principios activos duplicados. No asumas que un producto es seguro por ser de venta libre. En hipertensión, advierte que ibuprofeno, naproxeno y diclofenaco pueden elevar la presión o afectar su control; no los recomiendes como primera opción. No declares que paracetamol/acetaminofén sea adecuado sin revisar antecedentes, otros productos que lo contengan y posibles riesgos hepáticos.',
'Ante señales de alarma, indica atención médica urgente y no sugieras comprar un medicamento para retrasarla. Para cefalea: inicio súbito/intensidad extrema, debilidad o adormecimiento de un lado, dificultad para hablar, confusión, desmayo, alteración visual nueva, fiebre con rigidez de cuello, dolor tras golpe, dolor intenso durante embarazo/posparto, dolor de pecho o dificultad respiratoria. Si PA >=180/120 mmHg con síntomas, urgencias. Si >=180/120 sin síntomas, repetir correctamente tras reposo y buscar valoración médica inmediata el mismo día.',
'Usa el catálogo suministrado solo como referencia de productos existentes. No inventes presentaciones, principios activos ni disponibilidad. No recomiendes un producto si faltan datos para establecer seguridad. No muestres precios ni presiones para vender.',
'Responde con orientación inicial, precauciones, una o dos preguntas concretas si faltan datos y cuándo derivar. Si no puedes establecer seguridad, dilo y solicita intervención del farmacéutico.',
'No afirmes que eres profesional sanitario. No uses lenguaje alarmista. No prometas resultados.'
].join('\n');
export default async function handler(req:Req,res:Res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
 if(req.method==='OPTIONS')return reply(res,204,{});
 if(req.method!=='POST')return reply(res,405,{error:'Usa POST para esta consulta.'});
 const body=bodyOf(req),raw=body.messages;
 if(!Array.isArray(raw)||raw.length<1||raw.length>12)return reply(res,400,{error:'La conversación no tiene un formato válido.'});
 const messages:ChatMessage[]=[];
 for(const item of raw){if(!item||typeof item!=='object')return reply(res,400,{error:'Mensaje no válido.'});const value=item as Record<string,unknown>;const role=value.role;const content=clean(value.content,1800);if((role!=='user'&&role!=='assistant')||!content)return reply(res,400,{error:'Mensaje no válido.'});messages.push({role,content});}
 if(Buffer.byteLength(JSON.stringify(body),'utf8')>12000)return reply(res,413,{error:'La consulta supera el tamaño permitido.'});
 const auth=req.headers.authorization,header=Array.isArray(auth)?auth[0]:auth,token=header?.startsWith('Bearer ')?header.slice(7).trim():'';
 if(!token)return reply(res,401,{error:'Inicia sesión para usar el asistente.'});
 const url=process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL;
 const key=process.env.SUPABASE_ANON_KEY??process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 const openAiKey=process.env.OPENAI_API_KEY?.trim();
 if(!url||!key)return reply(res,503,{error:'Falta configurar la autenticación segura del servidor.'});
 if(!openAiKey)return reply(res,503,{error:'El asistente aún no está habilitado. El administrador debe configurar OPENAI_API_KEY en Vercel.'});
 let stage='supabase_auth';
 try{
  const authClient=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const {data,error}=await authClient.auth.getUser(token);
  if(error||!data.user)return reply(res,401,{error:'La sesión no es válida o ha caducado. Inicia sesión de nuevo.'});
  const metadata=data.user.app_metadata??{},role=metadata.farmi_role,permissions=Array.isArray(metadata.farmi_permissions)?metadata.farmi_permissions:[];
  if(metadata.farmi_active!==true||!(role==='Administrador'||permissions.includes('facturacion_estandar')||permissions.includes('ventas')))return reply(res,403,{error:'Tu cuenta no está activa o no tiene permiso para usar el asistente en ventas.'});
  const catalog=(Array.isArray(body.catalog)?body.catalog.slice(0,80):[]).map(item=>{if(!item||typeof item!=='object')return null;const p=item as Record<string,unknown>;return{name:clean(p.name,100),presentation:clean(p.presentation,80),category:clean(p.category,80),activeIngredients:Array.isArray(p.activeIngredients)?p.activeIngredients.slice(0,8).map(v=>clean(v,80)).filter(Boolean):[],warnings:clean(p.warnings,350)};}).filter((p):p is NonNullable<typeof p>=>Boolean(p?.name));
  const context=clean(body.context,60)||'Atención en farmacia';
  const input=[{role:'system',content:SYSTEM_PROMPT+'\nContexto: '+context+'\nCatálogo disponible (referencia, no garantiza stock): '+JSON.stringify(catalog)},...messages.map(m=>({role:m.role,content:m.content}))];
  stage='openai_request';
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+openAiKey,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',input,max_output_tokens:650,store:false})});
  stage='openai_response';
  let result:{output_text?:string;error?:{message?:string;code?:string;type?:string};output?:Array<{content?:Array<{text?:string}>}>};
  try{result=await response.json() as typeof result;}catch{console.error('[pharmacy-assistant] invalid_openai_response',{status:response.status,requestId:response.headers.get('x-request-id')});return reply(res,502,{error:'El servicio de IA devolvió una respuesta no válida. Intenta nuevamente.'});}
  if(!response.ok){const code=result.error?.code??result.error?.type??'unknown';console.error('[pharmacy-assistant] openai_error',{status:response.status,code,requestId:response.headers.get('x-request-id')});if(response.status===401||response.status===403)return reply(res,502,{error:'La clave de OpenAI no tiene autorización para responder. El administrador debe revisar los permisos de la clave API en OpenAI Platform.'});if(response.status===429)return reply(res,503,{error:'El servicio de IA alcanzó su límite o no tiene crédito disponible. Revisa la facturación y los límites de OpenAI Platform.'});return reply(res,502,{error:'OpenAI rechazó la consulta. Revisa el modelo y los permisos de la clave API.'});}
  const answer=result.output_text||result.output?.flatMap(item=>item.content??[]).map(part=>part.text??'').join('\n').trim();
  if(!answer)return reply(res,502,{error:'El asistente no generó una respuesta. Intenta reformular la pregunta.'});
  return reply(res,200,{answer});
 }catch(error){const detail=error instanceof Error?error.message:String(error);console.error('[pharmacy-assistant] request_failed',{stage,name:error instanceof Error?error.name:'UnknownError',message:detail.slice(0,240)});if(stage==='supabase_auth')return reply(res,502,{error:'No se pudo validar la sesión con Supabase. Verifica la conexión e inicia sesión nuevamente.'});return reply(res,502,{error:'No se pudo conectar con el servicio de IA. Intenta nuevamente en unos momentos.'});}
}