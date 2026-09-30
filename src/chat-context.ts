export function chatMessages(system: string, history: any[], user: string) {
  const recent: {role:string;content:string}[]=[];
  let budget=24000;
  for(const message of [...history].reverse()) {
    if(!['user','assistant'].includes(message.role) || typeof message.content!=='string') continue;
    if(message.content.length>budget) break;
    recent.unshift({role:message.role,content:message.content}); budget-=message.content.length;
    if(recent.length>=20) break;
  }
  return [{role:'system',content:system},...recent,{role:'user',content:user}];
}
export function completionUrl(baseUrl: string, kind: string) {
  const base=baseUrl.replace(/\/+$/,'');
  return kind==='gemini'||/\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}
