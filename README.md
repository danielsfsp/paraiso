# Paraíso

Letras, cifras, playlists e escala do ministério de louvor.

- `site/` — o aplicativo (um único `index.html` + PWA).
- **TH** (teste, automático a cada envio): https://paraiso-teste.danielsf-sp.workers.dev
- **PRODUÇÃO** (publicação manual no Netlify): https://cep-minist-louvor.netlify.app

## Como funciona a publicação
- Envio para o ramo `master` → publica sozinho no **TH** (Cloudflare).
- Quando a versão for aprovada, `master` é levado para o ramo `producao` → o Netlify publica sozinho na **PRODUÇÃO**.
