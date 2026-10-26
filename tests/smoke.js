// Roteiro de testes do CEP Louvor — roda ANTES de cada publicação no TH.
//   node tests/smoke.js          (precisa do Playwright instalado)
// Abre o site/ num servidor local, com um banco de dados FALSO (nada toca
// o Supabase de verdade), e confere as funções principais no computador e
// no celular. Termina com código 1 se alguma coisa falhar.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');

const ROOT = path.join(__dirname, '..', 'site');
const PORT = 8790, BASE = 'http://127.0.0.1:' + PORT + '/index.html';
const fails = [], oks = [];
const check = (cond, msg) => { (cond ? oks : fails).push(msg); console.log((cond ? '  ✓ ' : '  ✗ ') + msg); };

// ---------- servidor local (com opção de ficar lento / fora do ar) ----------
let netMode = 'ok', netDelay = 0;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if(p === '/') p = '/index.html';
  setTimeout(() => {
    if(netMode === 'down'){ r.destroy(); return; }
    fs.readFile(path.join(ROOT, p), (e, d) => { if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
  }, netDelay);
});

// ---------- banco falso ----------
function freshDb(){
  const iso = d => d.toISOString().slice(0, 10);
  const fut = iso(new Date(Date.now() + 2 * 864e5));
  return {
    profiles: [
      { id: 'u1', email: 'lider@x.com', name: 'Líder Teste', phone: '11999990000', functions: ['Baixo'], is_leader: true, is_minister: false, active: true, approved: true },
      { id: 'u2', email: 'ana@x.com', name: 'Ana Souza', phone: '11988887777', functions: ['Vocal'], is_leader: false, is_minister: false, is_participant: true, active: true, approved: true },
      { id: 'u3', email: 'joao@x.com', name: 'João Lima', phone: '', functions: ['Teclado'], is_leader: false, is_minister: true, active: true, approved: true },
    ],
    app_admins: [{ email: 'lider@x.com' }], playlist_changes: [], user_data: [], share_links: [], pre_profiles: [], unavailability: [],
    songs: [{ id: 'cloud-1', data: { title: 'Música da Nuvem', artist: 'Teste', key: 'C', body: '[Refrão]\n{C}Linha um\n{G}Linha dois' }, deleted: false, updated_at: '2026-10-01T00:00:00Z' }],
    teams: [{ id: 't1', name: 'Equipe A', member_ids: ['u1', 'u2', 'u3'], pre_ids: [] }],
    events: [{ id: 'e1', date: fut, time: '18:00', title: 'Culto de Domingo', minister_id: 'u3', playlist: { id: 'pl-c', name: 'Culto teste' }, dress_code: '', notes: '' }],
    assignments: [{ id: 'a1', event_id: 'e1', profile_id: 'u2', function: 'Vocal', status: 'pendente', reason: '' }],
    minister_keys: [],
  };
}
let db = freshDb(), seq = 1;
function filt(rows, params){
  for(const [k, v] of params){
    if(['select', 'order', 'on_conflict', 'columns', 'limit', 'offset'].includes(k)) continue;
    const m = String(v).match(/^(eq|gte|lte|gt|in)\.(.*)$/); if(!m) continue;
    const [, op, val] = m;
    rows = rows.filter(r => { const x = r[k] == null ? '' : String(r[k]);
      return op === 'eq' ? x === val : op === 'gte' ? x >= val : op === 'lte' ? x <= val : op === 'gt' ? x > val : val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(x); });
  }
  return rows;
}
async function newCtx(b, opts){
  const c = await b.newContext(opts);
  await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  await c.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'vendor', 'supabase.js'), 'utf8') }));
  await c.route(/euphdfesqlnfiyfshjbm\.supabase\.co/, async r => {
    const req = r.request(), u = new URL(req.url()), method = req.method();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
    if(method === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const m = u.pathname.match(/^\/rest\/v1\/(\w+)/);
    if(!m || u.pathname.includes('/rpc/')) return r.fulfill({ status: m ? 200 : 404, headers: cors, body: m ? 'null' : '{}' });
    const t = m[1]; if(!db[t]) db[t] = [];
    const params = [...u.searchParams.entries()];
    let out;
    if(method === 'GET' || method === 'HEAD') out = filt(db[t].slice(), params);
    else if(method === 'POST'){ const body = JSON.parse(req.postData() || '[]'); out = (Array.isArray(body) ? body : [body]).map(x => { const row = Object.assign({ id: 'id' + (seq++) }, x); db[t].push(row); return row; }); }
    else if(method === 'PATCH'){ const body = JSON.parse(req.postData()); out = filt(db[t], params); out.forEach(x => Object.assign(x, body)); }
    else if(method === 'DELETE'){ const del = filt(db[t], params); db[t] = db[t].filter(x => !del.includes(x)); out = del; }
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    return r.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Range': '0-' + out.length + '/' + out.length }, cors), body: JSON.stringify(single ? out[0] : out) });
  });
  return c;
}
async function page(c, errs, tag){ const p = await c.newPage(); p.on('pageerror', e => errs.push(tag + ': ' + e.message)); return p; }
async function asUser(p, uid, email, setup){
  await p.goto(BASE); await p.waitForTimeout(300);
  await p.evaluate(([uid, email]) => { localStorage.clear(); localStorage['cifraset:tourV1'] = '1'; const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
    localStorage['paraiso-auth'] = JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', expires_in: 3600, expires_at: exp, token_type: 'bearer', user: { id: uid, email, aud: 'authenticated', role: 'authenticated' } }); }, [uid, email]);
  if(setup) await p.evaluate(setup);
  await p.reload(); await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('confirmModalOverlay').classList.remove('open'));
}
const openSongById = (p, id) => p.evaluate(id => document.querySelector('.home-song-row[data-id="' + id + '"] a').click(), id);

(async () => {
  await new Promise(res => srv.listen(PORT, res));
  const b = await chromium.launch();
  const errs = [];
  try{
    // 1) VISITANTE — computador e celular
    for(const [tag, opts] of [['PC', { viewport: { width: 1366, height: 800 } }], ['Celular', devices['Pixel 7']]]){
      console.log('\n▶ Visitante (' + tag + ')');
      db = freshDb();
      const c = await newCtx(b, opts), p = await page(c, errs, 'visitante-' + tag);
      await p.goto(BASE); await p.evaluate(() => { localStorage.clear(); localStorage['cifraset:tourV1'] = '1'; }); await p.reload(); await p.waitForTimeout(2000);
      check(await p.isVisible('#gateVisit'), tag + ': tela de login mostra "Entrar como visitante"');
      await p.click('#gateVisit'); await p.waitForTimeout(1800);
      const st = await p.evaluate(() => ({ visit: document.body.classList.contains('role-visit'), esc: getComputedStyle(document.getElementById('btnEscala')).display, cloud: JSON.parse(localStorage['cifraset:songs'] || '[]').some(x => x.id === 'cloud-1') }));
      check(st.visit && st.esc === 'none', tag + ': modo visitante esconde Escala');
      check(st.cloud, tag + ': visitante recebe o repertório da nuvem');
      await c.close();
    }

    // 2) CIFRA / COMPARTILHAR / TELÃO / ENSAIO (visitante, computador)
    console.log('\n▶ Cifra, compartilhar e ensaio');
    db = freshDb();
    const c2 = await newCtx(b, { viewport: { width: 1366, height: 800 } }); await c2.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + PORT });
    const p2 = await page(c2, errs, 'cifra');
    await p2.goto(BASE); await p2.waitForTimeout(800);
    const pod = await p2.evaluate(() => { localStorage['cifraset:visitor'] = '1'; localStorage['cifraset:tourV1'] = '1'; const s = JSON.parse(localStorage['cifraset:songs']); const x = s.find(x => /^Poderoso/i.test(x.title) && /D9 +7\+/.test(x.body || ''));
      const ids = s.filter(y => /^(A Boa Parte|Raridade)/.test(y.title)).map(y => y.id).concat(x ? [x.id] : []);
      localStorage['cifraset:playlists'] = JSON.stringify([{ id: 'pl-1', name: 'Culto teste', songIds: ids, overrides: {}, date: '', archived: false }]); return x && x.id; });
    check(!!pod, 'música "Poderoso" (Renascer) está no repertório embutido');
    const txt = async mode => { await p2.evaluate(m => localStorage['cifraset:chordMode'] = m, mode); await p2.reload(); await p2.waitForTimeout(1300); await openSongById(p2, pod); await p2.waitForTimeout(900); return p2.evaluate(() => document.getElementById('cifraBody').innerText); };
    const full = await txt('full'), simple = await txt('simple');
    check(/\s7\+\s/.test(full), 'cifra completa mantém "7+" solto (igual ao original)');
    check(!/(^|\s)(7\+|5\+|9\+)(\s|$)/m.test(simple), 'simplificada tira números soltos (7+, 5+, 9+)');
    // compartilhar música
    await p2.click('#btnKeyUp'); await p2.waitForTimeout(200);
    const sentKey = await p2.evaluate(() => document.getElementById('keyDisplay').textContent);
    await p2.click('#btnOptionsMenu'); await p2.click('#btnShareSong'); await p2.waitForTimeout(300);
    await p2.click('[data-ss="copy-link"]'); await p2.waitForTimeout(300);
    const link = await p2.evaluate(() => navigator.clipboard.readText());
    check(/#m=/.test(link), 'compartilhar gera link da música');
    await p2.evaluate(() => document.querySelector('.decl-ov') && document.querySelector('.decl-ov').remove());
    await p2.click('#btnKeyDown'); await p2.waitForTimeout(200);
    const p3 = await page(c2, errs, 'link'); await p3.goto(BASE + link.slice(link.indexOf('#'))); await p3.waitForTimeout(3500);
    const recv = await p3.evaluate(() => ({ t: document.getElementById('songTitle').textContent, k: document.getElementById('keyDisplay').textContent }));
    check(recv.t === 'Poderoso' && recv.k === sentKey, 'link abre a música no tom compartilhado (' + recv.t + ' · ' + recv.k + ')');
    await p3.close();
    // playlist: ensaio + telão
    await p2.evaluate(() => document.getElementById('navHome').click()); await p2.waitForTimeout(400);
    await p2.evaluate(() => { if(document.getElementById('confirmModalOverlay').classList.contains('open')) document.getElementById('confirmModalOk').click(); }); await p2.waitForTimeout(400);
    await p2.click('.sidebar-tabs [data-view="playlists"]'); await p2.waitForTimeout(700);
    await p2.click('[data-ens]'); await p2.waitForTimeout(300);
    check(/1\/3/.test(await p2.evaluate(() => document.querySelector('.ens-prog').innerText)), 'checklist de ensaio marca e mostra o progresso');
    // setas fixas
    await p2.click('[data-plp-song]'); await p2.waitForTimeout(900);
    const ys = [];
    for(let i = 0; i < 3; i++){ ys.push(await p2.evaluate(() => Math.round(document.getElementById('btnPrevSong').getBoundingClientRect().top))); if(i < 2){ await p2.click('#btnNextSong'); await p2.waitForTimeout(500); } }
    check(ys.every(y => y === ys[0]), 'setas ◀ ▶ ficam no mesmo lugar ao trocar de música');
    await c2.close();

    // 2b) TELA CHEIA: editar → desmarcar "1 coluna" → fonte A− → salvar: a leitura fica igual à edição (e continua depois de recarregar)
    console.log('\n▶ Tela cheia: colunas iguais depois de salvar a edição');
    db = freshDb();
    const c7 = await newCtx(b, { viewport: { width: 1366, height: 767 } }), p7 = await page(c7, errs, 'telacheia');
    await p7.goto(BASE); await p7.waitForTimeout(800);
    const sid7 = await p7.evaluate(() => { localStorage['cifraset:visitor'] = '1'; localStorage['cifraset:tourV1'] = '1'; return JSON.parse(localStorage['cifraset:songs']).find(x => /^1000 Graus/.test(x.title)).id; });
    await p7.reload(); await p7.waitForTimeout(1200);
    await openSongById(p7, sid7); await p7.waitForTimeout(800);
    await p7.evaluate(() => { const c = document.getElementById('chkSingleColumn'); if(!c.checked) c.click(); }); await p7.waitForTimeout(400);
    await p7.evaluate(() => document.getElementById('btnFullscreen').click()); await p7.waitForTimeout(800);
    await p7.evaluate(() => { if(document.getElementById('confirmModalOverlay').classList.contains('open')) document.getElementById('confirmModalOk').click(); }); await p7.waitForTimeout(1200);
    await p7.evaluate(() => document.getElementById('btnFullscreenEdit').click()); await p7.waitForTimeout(1200);
    await p7.evaluate(() => { const c = document.getElementById('chkSingleColumn'); if(c.checked) c.click(); }); await p7.waitForTimeout(700);
    await p7.evaluate(() => document.getElementById('btnFontDown').click()); await p7.waitForTimeout(700);
    const byPos = sel => p7.evaluate(sel => { const w = document.querySelector(sel); if(w.classList.contains('adaptive-cols')) return [...w.querySelectorAll(':scope > .cifra-col')].map(c => c.querySelectorAll('.cifra-line').length).join(','); const ls = [...document.querySelectorAll(sel + ' .cifra-line')]; const out = []; let cl = null; ls.forEach(el => { const r = el.getBoundingClientRect(); if(cl === null || r.left > cl + 20){ out.push(0); cl = r.left; } out[out.length - 1]++; }); return out.join(','); }, sel);
    const ed = await byPos('#cifraBodyEditCols');
    await p7.evaluate(() => document.getElementById('btnFullscreenEditSave').click()); await p7.waitForTimeout(2500);
    const sv = await byPos('#cifraBody');
    check(ed === sv && ed.split(',').length > 1, 'depois de salvar, a leitura tem as mesmas colunas da edição (' + ed + ' → ' + sv + ')');
    await p7.reload(); await p7.waitForTimeout(1300); await openSongById(p7, sid7); await p7.waitForTimeout(800);
    await p7.evaluate(() => document.getElementById('btnFullscreen').click()); await p7.waitForTimeout(1500);
    const rl = await byPos('#cifraBody');
    check(rl === ed, 'colunas continuam iguais depois de recarregar (' + rl + ')');
    await c7.close();

    // 2c) CIFRA POR MÓDULOS — cada parte uma vez + roteiro; ▶ volta para a completa
    console.log('\n▶ Cifra por módulos');
    db = freshDb();
    const c8 = await newCtx(b, { viewport: { width: 1366, height: 767 } }), p8 = await page(c8, errs, 'modulos');
    await p8.goto(BASE); await p8.waitForTimeout(800);
    await p8.evaluate(() => { localStorage['cifraset:visitor'] = '1'; localStorage['cifraset:tourV1'] = '1';
      const R = 'G7M/D                D\n     És fiel em todo tempo\nG7M/D                D        A6\n     Em todo tempo Tu és tão, tão bom\n       G7M/D     A6      D\nEu cantarei da bondade de Deus';
      const P = 'D/F#              G7M/D\n    Tua bondade me seguirá\n    A6       D\nMe seguirá Senhor\n\n      D/F#           G7M/D\nEu me rendo a Ti, te dou o meu ser';
      const body = '[Intro] D  D4  D  D4\n\n[Primeira Parte]\n         D\nTe amo, Deus\n\n[Refrão]\n' + R + '\n\n[Segunda Parte]\n          D\nTua doce voz\n\n[Refrão]\n' + R + '\n\n' + R + '\n\n( D9  D  D4 )\n\n[Ponte]\n' + P + '\n\n' + P;
      const s = JSON.parse(localStorage['cifraset:songs']); s.unshift({ id: 'mod-test', title: 'AAA Módulos Teste', artist: 'Teste', key: 'D', body }); localStorage['cifraset:songs'] = JSON.stringify(s); });
    await p8.reload(); await p8.waitForTimeout(1300); await openSongById(p8, 'mod-test'); await p8.waitForTimeout(900);
    const linesFull = await p8.evaluate(() => document.querySelectorAll('#cifraBody .cifra-line').length);
    await p8.click('#btnModules'); await p8.waitForTimeout(900);
    const md = await p8.evaluate(() => ({ chips: [...document.querySelectorAll('#cifraBody .rot-chip')].map(x => x.innerText.trim()), tags: [...document.querySelectorAll('#cifraBody .cifra-sec')].map(x => x.textContent.trim()), n: document.querySelectorAll('#cifraBody .cifra-line').length }));
    check(md.chips.join('|') === 'Intro|Primeira Parte|Refrão|Segunda Parte|Refrão ×2 + final|Ponte ×2', 'módulos: roteiro na ordem (' + md.chips.join(' › ') + ')');
    check(md.tags.filter(t => /^Refrão/.test(t)).length === 1 && md.tags.includes('Refrão · 3×') && md.tags.includes('Ponte · 2×') && md.n < linesFull, 'módulos: cada parte aparece uma vez (' + linesFull + ' → ' + md.n + ' linhas)');
    check(await p8.evaluate(() => document.querySelectorAll('#cifraBody .mod-box.mod-top').length === 5 && document.querySelectorAll('#cifraBody .mod-box.mod-bot').length === 5), 'módulos: cada parte tem a sua moldura');
    await p8.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/modulos.png' : '/dev/null' }).catch(() => {});
    await p8.evaluate(() => document.querySelectorAll('#cifraBody .rot-chip')[4].click()); await p8.waitForTimeout(300);
    check(await p8.evaluate(() => document.querySelectorAll('#cifraBody .mod-flash').length === 2), 'módulos: tocar no roteiro destaca o refrão e o final');
    await p8.click('#btnPlay'); await p8.waitForTimeout(700);
    const pl = await p8.evaluate(() => ({ rot: document.querySelectorAll('#cifraBody .rot-chip').length, n: document.querySelectorAll('#cifraBody .cifra-line').length }));
    await p8.click('#btnPlay');
    check(pl.rot === 0 && pl.n === linesFull, 'módulos: ▶ rolagem passa para a cifra completa');
    await p8.evaluate(() => { const s = JSON.parse(localStorage['cifraset:songs']); s.unshift({ id: 'mod-est', title: 'AAA Estrofes Teste', artist: 'Teste', key: 'C', body: 'C\nLinha um\nG\nLinha dois\n\nAm\nLinha tres\n\nF\nLinha quatro\nC\nLinha cinco' }); localStorage['cifraset:songs'] = JSON.stringify(s); });
    await p8.reload(); await p8.waitForTimeout(1300); await openSongById(p8, 'mod-est'); await p8.waitForTimeout(900);
    const est = await p8.evaluate(() => ({ on: document.getElementById('btnModules').classList.contains('on'), tops: document.querySelectorAll('#cifraBody .mod-box.mk-estrofe.mod-top').length, rot: document.querySelectorAll('#cifraBody .rot-chip').length }));
    check(est.on && est.tops === 3 && est.rot === 0, 'módulos: música sem rótulos ganha uma moldura por estrofe (' + est.tops + ')');
    await p8.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/estrofes.png' : '/dev/null' }).catch(() => {});
    // texto colado com caracteres invisíveis (espaço de largura zero no começo das linhas)
    await p8.evaluate(() => { const z = '\u200B'; const s = JSON.parse(localStorage['cifraset:songs']); s.unshift({ id: 'mod-zw', title: 'AAA Invisivel Teste', artist: 'Teste', key: 'E', body: [z + '[Intro] C  D  Em7  D', z + '\u00A0', z + '[Primeira Parte]', z + 'E          A', z + 'Ele é exaltado'].join('\n') }); localStorage['cifraset:songs'] = JSON.stringify(s); });
    await p8.reload(); await p8.waitForTimeout(1300); await openSongById(p8, 'mod-zw'); await p8.waitForTimeout(900);
    const zw = await p8.evaluate(() => ({ tops: document.querySelectorAll('#cifraBody .mod-top').length, tags: document.querySelectorAll('#cifraBody .cifra-sec').length, chords: document.querySelectorAll('#cifraBody .chord-row').length }));
    check(zw.tags === 2 && zw.chords >= 1 && zw.tops === 2, 'texto com caracteres invisíveis: reconhece rótulos e acordes (' + zw.tags + ' rótulos, ' + zw.chords + ' acorde)');
    // edição em tela cheia com módulos: mesma coisa que a leitura; mudar o refrão muda todas as vezes
    await openSongById(p8, 'mod-test'); await p8.waitForTimeout(900);
    await p8.evaluate(() => { const c = document.getElementById('chkSingleColumn'); if(c.checked) c.click(); }); await p8.waitForTimeout(400);
    await p8.evaluate(() => document.getElementById('btnFullscreen').click()); await p8.waitForTimeout(800);
    await p8.evaluate(() => { if(document.getElementById('confirmModalOverlay').classList.contains('open')) document.getElementById('confirmModalOk').click(); }); await p8.waitForTimeout(1200);
    const rdN = await p8.evaluate(() => [...document.querySelectorAll('#cifraBody .cifra-line')].filter(x => x.textContent.trim()).length);
    await p8.evaluate(() => document.getElementById('btnFullscreenEdit').click()); await p8.waitForTimeout(1200);
    const edm = await p8.evaluate(() => ({ n: [...document.querySelectorAll('#cifraBodyEditCols .cifra-line')].filter(x => x.textContent.trim()).length, rot: !!document.querySelector('#cifraBodyEditCols .roteiro-line') }));
    check(edm.rot && edm.n === rdN, 'módulos: a edição em tela cheia mostra o mesmo que a leitura (' + rdN + ' → ' + edm.n + ' linhas)');
    await p8.evaluate(() => { const r = [...document.querySelectorAll('#cifraBodyEditCols [contenteditable]')].find(x => /fiel em todo tempo/.test(x.textContent)); r.textContent = r.textContent.replace('És fiel', 'ÉS FIEL'); });
    await p8.evaluate(() => document.getElementById('btnFullscreenEditSave').click()); await p8.waitForTimeout(1200);
    const mb = await p8.evaluate(() => { const x = JSON.parse(localStorage['cifraset:songs']).find(x => x.id === 'mod-test'); return x.bodyFs || x.body; });
    check((mb.match(/ÉS FIEL/g) || []).length === 3 && !/És fiel/.test(mb) && /Tua doce voz/.test(mb), 'módulos: salvar a edição muda o refrão nas 3 vezes em que ele aparece');
    await c8.close();

    // 3) LÍDER — tom do ministro na playlist do culto
    console.log('\n▶ Líder: tom por ministro');
    db = freshDb();
    const c4 = await newCtx(b, { viewport: { width: 1366, height: 800 } }), p4 = await page(c4, errs, 'lider');
    await p4.goto(BASE); await p4.waitForTimeout(600);
    const sid = await p4.evaluate(() => JSON.parse(localStorage['cifraset:songs']).find(x => x.title === 'A Boa Parte').id);
    db.minister_keys.push({ song_id: sid, profile_id: 'u3', key: 'G' });
    await asUser(p4, 'u1', 'lider@x.com', `localStorage['cifraset:playlists'] = JSON.stringify([{ id:'pl-c', name:'Culto teste', songIds:['${sid}'], overrides:{}, date:'', archived:false }]);`);
    await p4.click('.sidebar-tabs [data-view="playlists"]'); await p4.waitForTimeout(700);
    await p4.click('[data-plp-song]'); await p4.waitForTimeout(1000);
    const mk = await p4.evaluate(() => ({ k: document.getElementById('keyDisplay').textContent, row: document.getElementById('mkRow').innerText }));
    check(mk.k === 'G' && /João · G/.test(mk.row), 'música do culto abre no tom do ministro escalado (' + mk.k + ')');
    await p4.click('#btnKeyUp'); await p4.waitForTimeout(200);
    await p4.click('[data-mk-save]'); await p4.waitForTimeout(600);
    check(db.minister_keys.some(x => x.profile_id === 'u1'), 'líder salva o próprio tom');
    await p4.click('[data-mk-del="u1"]'); await p4.waitForTimeout(300); await p4.click('#confirmModalOk'); await p4.waitForTimeout(600);
    check(!db.minister_keys.some(x => x.profile_id === 'u1') && !/Você ·/.test(await p4.evaluate(() => document.getElementById('mkRow').innerText)), 'tom salvo pode ser removido (✕)');
    // nova playlist mostra o que está na Agenda e liga ao culto escolhido
    db.events.push({ id: 'e2', date: db.events[0].date, time: '19:30', title: 'Culto Quinta', minister_id: null, playlist: null, dress_code: '', notes: '' });
    await p4.reload(); await p4.waitForTimeout(2500);
    await p4.evaluate(() => document.getElementById('confirmModalOverlay').classList.remove('open'));
    await p4.click('.sidebar-tabs [data-view="playlists"]'); await p4.waitForTimeout(700);
    await p4.click('#plpNew'); await p4.waitForTimeout(400);
    const ag = await p4.evaluate(() => ({ vis: !document.getElementById('plAgBox').hidden, n: document.querySelectorAll('#plAgBox [data-ag-ev]').length, busy: document.querySelectorAll('#plAgBox .pl-ag-ev.busy').length }));
    check(ag.vis && ag.n === 2 && ag.busy === 1, 'nova playlist mostra os cultos da Agenda (' + ag.n + ', ' + ag.busy + ' já com playlist)');
    await p4.click('[data-ag-ev="e2"]'); await p4.waitForTimeout(200);
    const nm = await p4.evaluate(() => [document.getElementById('inputPlaylistName').value, document.getElementById('inputPlaylistDate').value]);
    await p4.click('#btnSavePlaylistModal'); await p4.waitForTimeout(1200);
    const e2 = db.events.find(x => x.id === 'e2');
    check(/^Culto Quinta \d\d\/\d\d$/.test(nm[0]) && nm[1] === e2.date && e2.playlist && e2.playlist.name === nm[0], 'escolher o culto preenche nome/data e liga a playlist a ele (' + nm[0] + ')');
    await c4.close();

    // 4) PARTICIPANTE — menus restritos (celular)
    console.log('\n▶ Participante');
    db = freshDb();
    const c5 = await newCtx(b, devices['Pixel 7']), p5 = await page(c5, errs, 'participante');
    await asUser(p5, 'u2', 'ana@x.com');
    const tb = await p5.evaluate(() => [...document.querySelectorAll('#mobileTabbar button')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.dataset.tb));
    check(JSON.stringify(tb) === '["home","escala"]', 'participante vê só Início e Escala (' + tb.join(',') + ')');
    await c5.close();

    // 5) SEM INTERNET / INTERNET LENTA (service worker)
    console.log('\n▶ Abrir com internet lenta / sem internet');
    const c6 = await b.newContext(); await c6.route(/fonts\.|supabase|jsdelivr/, r => r.fulfill({ status: 200, body: '' }));
    const p6 = await c6.newPage();
    await p6.goto('http://localhost:' + PORT + '/'); await p6.waitForTimeout(2500); await p6.reload(); await p6.waitForTimeout(1200);
    netDelay = 8000; let t0 = Date.now(); await p6.reload({ waitUntil: 'domcontentloaded' }); const slow = Date.now() - t0;
    check(slow < 4500, 'internet lenta: abre em até ~3 s com a cópia guardada (' + slow + ' ms)');
    netDelay = 0; netMode = 'down'; t0 = Date.now(); await p6.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); const off = Date.now() - t0;
    check(/CEP Louvor/.test(await p6.title()), 'sem internet: o app abre (' + off + ' ms)');
    netMode = 'ok';
    await c6.close();
  }catch(e){ fails.push('erro no roteiro: ' + e.message); console.log('  ✗ erro no roteiro: ' + e.message); }
  check(!errs.length, 'nenhum erro de JavaScript nas páginas' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); srv.close();
  console.log('\n' + oks.length + ' ok, ' + fails.length + ' falha(s)');
  process.exit(fails.length ? 1 : 0);
})();
