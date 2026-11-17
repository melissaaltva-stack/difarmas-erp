import { createClient } from '@supabase/supabase-js';

type Req={method?:string;headers:Record<string,string|string[]|undefined>;body?:unknown};
type Res={status(code:number):Res;setHeader(name:string,value:string):void;json(body:unknown):void};
type ChatMessage={role:'user'|'assistant';content:string};
const reply=(res:Res,status:number,value:unknown)=>res.status(status).json(value);
const clean=(value:unknown,max=1800)=>typeof value==='string'?value.trim().slice(0,max):'';
function bodyOf(req:Req):Record<string,unknown>{
  if(req.body&&typeof req.body==='object')return req.body as Record<string,unknown>;
  if(typeof req.body==='string'){try{const value:unknown=JSON.parse(req.body);return value&&typeof value==='object'?value as Record<string,unknown>:{};}catch{return {};}}
  return {};
}

const SYSTEM_PROMPT=[
  'Eres Farmi, un asistente virtual de orientación general sobre salud para personas en Honduras. Hablas español claro, respetuoso, empático y sin tecnicismos innecesarios.',
  'No eres médico ni profesional sanitario. No afirmes tener licencia, no diagnostiques, no confirmes enfermedades y no sustituyas una consulta médica.',
  'Tu función es orientar, explicar información general, hacer preguntas breves para comprender el contexto, identificar señales de alarma y recomendar el nivel de atención apropiado.',
  'No prescribas medicamentos ni indiques dosis, frecuencia, duración, combinaciones o ajustes de tratamiento. No recomiendes iniciar, suspender ni cambiar medicamentos. No sustituyas una valoración clínica por una lista de productos.',
  'Cuando sea pertinente, pregunta solo lo necesario: edad aproximada, síntoma principal, cuándo comenzó, intensidad, evolución, síntomas acompañantes, embarazo o lactancia si aplica, enfermedades relevantes, alergias y medicamentos actuales. Nunca solicites nombre, identidad, teléfono, dirección, número de expediente u otros datos identificables.',
  'No inventes datos ni presentes posibilidades como diagnósticos. Si mencionas causas posibles, aclara que son orientativas y que no se pueden confirmar por chat.',
  'Indica atención de emergencia inmediata ante dificultad respiratoria, dolor u opresión intensa en el pecho, signos de accidente cerebrovascular (cara caída, debilidad de un lado o dificultad para hablar), pérdida del conocimiento, convulsiones nuevas, confusión súbita, sangrado abundante, reacción alérgica con hinchazón de lengua/garganta o dificultad respiratoria, dolor súbito extremo, intoxicación o riesgo de autolesión. En embarazo, dolor intenso, sangrado, convulsiones o dificultad respiratoria requieren atención urgente. En bebés menores de 3 meses, fiebre requiere valoración médica urgente.',
  'No sugieras que la persona espere una respuesta adicional si describe una emergencia. Recomienda acudir al servicio de emergencias local o al centro asistencial más cercano.',
  'Para síntomas persistentes, progresivos, recurrentes o preocupantes, recomienda valoración por un profesional de salud. Si faltan datos o existe incertidumbre, dilo claramente y elige la opción más segura.',
  'Responde de forma breve y estructurada: orientación general, señales de alarma relevantes, siguiente paso seguro y una pregunta concreta si hace falta. No alarmes ni prometas resultados.',
  'No solicites ni analices fotografías de lesiones íntimas o material que identifique a una persona. No compartas información personal ni afirmes que la conversación crea una relación médico-paciente.'
].join('\n');

export default async function handler(req:Req,res:Res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Vary','Authorization');
  if(req.method==='OPTIONS')return reply(res,204,{});
  if(req.method!=='POST')return reply(res,405,{error:'Usa POST para esta consulta.'});

  const body=bodyOf(req),raw=body.messages;
  if(!Array.isArray(raw)||raw.length<1||raw.length>12)return reply(res,400,{error:'La conversación no tiene un formato válido.'});
  const messages:ChatMessage[]=[];
  for(const item of raw){
    if(!item||typeof item!=='object')return reply(res,400,{error:'Mensaje no válido.'});
    const value=item as Record<string,unknown>;
    const role=value.role;
    const content=clean(value.content);
    if((role!=='user'&&role!=='assistant')||!content)return reply(res,400,{error:'Mensaje no válido.'});
    messages.push({role,content});
  }
  if(Buffer.byteLength(JSON.stringify(body),'utf8')>12000)return reply(res,413,{error:'La consulta supera el tamaño permitido.'});

  const authorization=req.headers.authorization;
  const header=Array.isArray(authorization)?authorization[0]:authorization;
  const token=header?.startsWith('Bearer ')?header.slice(7).trim():'';
  if(!token)return reply(res,401,{error:'Inicia sesión para usar Farmi.'});

  const url=process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_ANON_KEY??process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const openAiKey=process.env.OPENAI_API_KEY?.trim();
  if(!url||!key)return reply(res,503,{error:'Falta configurar la autenticación segura del servidor.'});
  if(!openAiKey)return reply(res,503,{error:'Farmi aún no está habilitado. El administrador debe configurar OPENAI_API_KEY en Vercel.'});

  try{
    const authClient=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
    const {data,error}=await authClient.auth.getUser(token);
    if(error||!data.user)return reply(res,401,{error:'La sesión no es válida o ha caducado. Inicia sesión de nuevo.'});
    const metadata=data.user.app_metadata??{};
    const role=metadata.farmi_role;
    const permissions=Array.isArray(metadata.farmi_permissions)?metadata.farmi_permissions:[];
    if(metadata.farmi_active!==true||!(role==='Administrador'||permissions.includes('asistente_ia')))return reply(res,403,{error:'Tu cuenta no está activa o no tiene permiso para usar Farmi.'});

    const input=[{role:'system',content:SYSTEM_PROMPT},...messages.map(message=>({role:message.role,content:message.content}))];
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:'Bearer '+openAiKey,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.FARMI_DOCTOR_MODEL||process.env.OPENAI_MODEL||'gpt-4.1-mini',input,max_output_tokens:750,store:false})
    });
    let result:{output_text?:string;error?:{message?:string;code?:string;type?:string};output?:Array<{content?:Array<{text?:string}>}>};
    try{result=await response.json() as typeof result;}
    catch{
      console.error('[farmi-doctor] invalid_openai_response',{status:response.status,requestId:response.headers.get('x-request-id')});
      return reply(res,502,{error:'El servicio de IA devolvió una respuesta no válida. Intenta nuevamente.'});
    }
    if(!response.ok){
      const code=result.error?.code??result.error?.type??'unknown';
      console.error('[farmi-doctor] openai_error',{status:response.status,code,requestId:response.headers.get('x-request-id')});
      if(response.status===401||response.status===403)return reply(res,502,{error:'OpenAI no autorizó la consulta. El administrador debe revisar la clave y los permisos de la API.'});
      if(response.status===429)return reply(res,503,{error:'El servicio de IA alcanzó su límite o no tiene crédito disponible. Revisa la facturación y los límites de OpenAI Platform.'});
      return reply(res,502,{error:'OpenAI no pudo procesar la consulta. Intenta nuevamente.'});
    }
    const answer=result.output_text||result.output?.flatMap(item=>item.content??[]).map(part=>part.text??'').join('\n').trim();
    if(!answer)return reply(res,502,{error:'Farmi no generó una respuesta. Intenta reformular la consulta.'});
    return reply(res,200,{answer});
  }catch(error){
    console.error('[farmi-doctor] request_failed',{name:error instanceof Error?error.name:'UnknownError'});
    return reply(res,502,{error:'No se pudo conectar con el servicio de IA. Intenta nuevamente.'});
  }
}
