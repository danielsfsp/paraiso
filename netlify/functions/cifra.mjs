// Paraíso — busca a página de uma música do Cifra Club para o
// "Criar pelo link". Só aceita links do cifraclub.com.br.
export default async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/html; charset=utf-8' };
  const raw = new URL(req.url).searchParams.get('url') || '';
  let target;
  try { target = new URL(raw); } catch { return new Response('link inválido', { status: 400, headers: cors }); }
  if (!/^(www\.|m\.)?cifraclub\.com\.br$/i.test(target.hostname)) return new Response('só cifraclub.com.br', { status: 400, headers: cors });
  target.hostname = 'www.cifraclub.com.br';
  const r = await fetch(target.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9'
    }
  });
  const html = await r.text();
  return new Response(html, { status: r.status, headers: cors });
};
