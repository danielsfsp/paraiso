# Paraíso

Letras, cifras, playlists e escala do ministério de louvor.

- `site/` — o aplicativo (um único `index.html` + PWA).
- **TH** (teste, automático a cada envio): https://paraiso-teste.danielsf-sp.workers.dev
- **PRODUÇÃO** (publicação manual no Netlify): https://cep-minist-louvor.netlify.app

## Como funciona a publicação
- Envio para o ramo `master` → publica sozinho no **TH** (Cloudflare).
- Quando a versão for aprovada, `master` é levado para o ramo `producao` → o Netlify publica sozinho na **PRODUÇÃO**.

## Antes de publicar: roteiro de testes
`node tests/smoke.js` — abre o `site/` num servidor local com um banco de dados **falso**
(não toca o Supabase de verdade) e confere, no computador e no celular: modo visitante,
cifra simplificada, compartilhar música, telão, checklist de ensaio, tom por ministro,
participante e abertura com internet lenta/sem internet. Só publicar se terminar com `0 falha(s)`.

## Banco sempre acordado
`worker/index.js` (Cloudflare) serve o site e, a cada 2 dias, faz um acesso leve ao Supabase —
no plano grátis o projeto pausa sozinho depois de 7 dias sem acesso.
Teste manual: abrir `/__ping-db` no endereço do TH (deve mostrar `banco: 200`).
