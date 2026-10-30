# Paraíso

Letras, cifras, playlists e escala do ministério de louvor.

- `site/` — o aplicativo (um único `index.html` + PWA).
- **App (TH)** — publicado automaticamente a cada envio: https://paraiso-teste.danielsf-sp.workers.dev
- ~~PRODUÇÃO (Netlify)~~ — **desativada em 30/10/2026**: o ramo `producao` só tem uma página que redireciona para o TH.

## Como funciona a publicação
- Envio para o ramo `master` → publica sozinho no **TH** (Cloudflare).
- O ramo `producao` não recebe mais versões do app (produção desativada).

## Antes de publicar: roteiro de testes
`node tests/smoke.js` — abre o `site/` num servidor local com um banco de dados **falso**
(não toca o Supabase de verdade) e confere, no computador e no celular: modo visitante,
cifra simplificada, compartilhar música, checklist de ensaio, tom por ministro,
participante e abertura com internet lenta/sem internet. Só publicar se terminar com `0 falha(s)`.

## Banco sempre acordado
`worker/index.js` (Cloudflare) serve o site e, a cada 2 dias, faz um acesso leve ao Supabase —
no plano grátis o projeto pausa sozinho depois de 7 dias sem acesso.
Teste manual: abrir `/__ping-db` no endereço do TH (deve mostrar `banco: 200`).
