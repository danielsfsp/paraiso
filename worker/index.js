// Worker do TH (Cloudflare): serve o site (pasta site/) e, a cada 2 dias,
// faz um acesso leve ao banco (Supabase) para ele não "dormir" — no plano
// grátis o Supabase pausa o projeto depois de 7 dias sem nenhum acesso.
// A chave usada é a pública (a mesma que já está no app).
const SUPA = 'https://euphdfesqlnfiyfshjbm.supabase.co';
const KEY = 'sb_publishable_lTBZcFXKDsNNV3WGTdVIbw_k0eTBM5W';

async function wakeDb(){
  const r = await fetch(SUPA + '/rest/v1/songs?select=id&limit=1', { headers: { apikey: KEY } });
  return r.status;
}

export default {
  async fetch(req, env){
    const u = new URL(req.url);
    if(u.pathname === '/__ping-db'){ // teste manual do despertador
      const st = await wakeDb().catch(e => 'erro: ' + e.message);
      return new Response('banco: ' + st, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx){
    ctx.waitUntil(wakeDb().then(st => console.log('wakeDb', st)).catch(e => console.log('wakeDb erro', e.message)));
  }
};
