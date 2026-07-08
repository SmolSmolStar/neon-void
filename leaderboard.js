/*
 * NEON VOID — living CODEX field guide + end-of-round online leaderboard.
 *
 * Zero-edit add-on: observes the game via `window.__game`, no changes to game.js.
 *
 *  • CODEX  — a persistent left-side field guide. Each enemy, boss and pickup
 *             stays locked ("???") until the first time it appears in a run,
 *             then reveals with a NEW flash. Discoveries persist (localStorage).
 *  • BOARD  — the global leaderboard only appears at the END of a round, as a
 *             results overlay (Rank · Pilot · Score · Wave · Date) with a
 *             "YOU PLACED #N" callout, following classic shmup results screens.
 *
 * The `key` is the PUBLIC publishable key — safe to ship. Writes are locked down
 * by row-level-security (insert-only, sanity-checked); nobody can wipe the board.
 */
(function () {
  'use strict';

  // --- Config -------------------------------------------------------------
  var CFG = Object.assign({
    url: 'https://dlqjghhlxnonfuptltts.supabase.co',
    key: 'sb_publishable_b22LCS6rJ8O-Va2iW4Be2A_ggK8IYQ7',
    game: 'neonvoid',
    top: 10,
  }, window.NEONVOID_LB || {});

  var configured = CFG.url.indexOf('http') === 0 && CFG.key.indexOf('__') !== 0;
  var hasWave = false;

  var LS_NAME = 'neonvoid_name';
  var LS_CACHE = 'neonvoid_lb_cache';
  var LS_CODEX = 'neonvoid_codex';
  var TAU = Math.PI * 2;

  // --- Supabase REST ------------------------------------------------------
  function headers(extra) {
    return Object.assign({ 'apikey': CFG.key, 'Authorization': 'Bearer ' + CFG.key, 'Content-Type': 'application/json' }, extra || {});
  }
  function probeWave() {
    if (!configured) return Promise.resolve(false);
    return fetch(CFG.url + '/rest/v1/scores?select=*&limit=1', { headers: headers() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (rows && rows.length) { hasWave = Object.prototype.hasOwnProperty.call(rows[0], 'wave'); return hasWave; }
        return fetch(CFG.url + '/rest/v1/scores?select=wave&limit=1', { headers: headers() }).then(function (r2) { hasWave = r2.ok; return hasWave; });
      })
      .catch(function () { hasWave = false; return false; });
  }
  function fetchTop() {
    if (!configured) return Promise.reject(new Error('not configured'));
    var sel = 'name,score,created_at' + (hasWave ? ',wave' : '');
    var q = CFG.url + '/rest/v1/scores?game=eq.' + encodeURIComponent(CFG.game) + '&select=' + sel + '&order=score.desc&order=created_at.asc&limit=' + CFG.top;
    return fetch(q, { headers: headers() }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function submitScore(name, score, wave) {
    if (!configured) return Promise.reject(new Error('not configured'));
    var row = { game: CFG.game, name: name, score: score };
    if (hasWave && wave != null) row.wave = wave;
    return fetch(CFG.url + '/rest/v1/scores', { method: 'POST', headers: headers({ 'Prefer': 'return=minimal' }), body: JSON.stringify(row) })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t); }); return true; });
  }
  function getPlacement(score) {
    if (!configured) return Promise.resolve(null);
    var base = CFG.url + '/rest/v1/scores?game=eq.' + encodeURIComponent(CFG.game);
    var ch = headers({ 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' });
    function total(r) { var cr = r.headers.get('content-range') || ''; return parseInt((cr.split('/')[1] || '0'), 10) || 0; }
    return Promise.all([
      fetch(base + '&score=gt.' + score + '&select=id', { headers: ch }).then(total),
      fetch(base + '&select=id', { headers: ch }).then(total),
    ]).then(function (a) { return { rank: a[0] + 1, total: Math.max(a[1], a[0] + 1) }; }).catch(function () { return null; });
  }

  // --- Storage ------------------------------------------------------------
  function readCache() { try { return JSON.parse(localStorage.getItem(LS_CACHE) || '[]'); } catch (e) { return []; } }
  function writeCache(rows) { try { localStorage.setItem(LS_CACHE, JSON.stringify(rows.slice(0, CFG.top))); } catch (e) {} }
  function getName() { try { return (localStorage.getItem(LS_NAME) || '').slice(0, 20); } catch (e) { return ''; } }
  function setName(v) { try { localStorage.setItem(LS_NAME, v.slice(0, 20)); } catch (e) {} }
  function readDiscovered() { try { return new Set(JSON.parse(localStorage.getItem(LS_CODEX) || '[]')); } catch (e) { return new Set(); } }
  function saveDiscovered(s) { try { localStorage.setItem(LS_CODEX, JSON.stringify(Array.from(s))); } catch (e) {} }
  function fmtDate(iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function fmtDateFull(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString(); }

  // --- Data ---------------------------------------------------------------
  var ENEMIES = [
    { id: 'e:darter', t: 'darter', c: '#ff5a5a', nm: 'DARTER', nt: 'fast, fragile diver' },
    { id: 'e:drone', t: 'drone', c: '#ffd25a', nm: 'DRONE', nt: 'spins in, fires bursts' },
    { id: 'e:weaver', t: 'weaver', c: '#5affc8', nm: 'WEAVER', nt: 'weaves side to side' },
    { id: 'e:splitter', t: 'splitter', c: '#ff8cd2', nm: 'SPLITTER', nt: 'bursts into shards' },
    { id: 'e:shard', t: 'shard', c: '#ff8cd2', nm: 'SHARD', nt: 'splinter from a splitter' },
    { id: 'e:tank', t: 'tank', c: '#b98cff', nm: 'TANK', nt: 'armored, high HP' },
    { id: 'e:boss', t: 'boss', c: '#ff3b3b', nm: 'BOSS', nt: 'wave boss — massive HP' },
  ];
  var PICKUPS = [
    { id: 'p:blaster', c: '#4df3ff', lb: 'B', nm: 'BLASTER', nt: 'rapid straight shots' },
    { id: 'p:spread', c: '#7dff4d', lb: 'S', nm: 'SPREAD', nt: 'wide fan of shots' },
    { id: 'p:laser', c: '#ff4df0', lb: 'L', nm: 'LASER', nt: 'piercing beam' },
    { id: 'p:missile', c: '#ffb84d', lb: 'M', nm: 'MISSILE', nt: 'homing missiles' },
    { id: 'p:heal', c: '#7dff4d', lb: '+', nm: 'REPAIR', nt: 'restore hull' },
    { id: 'p:shield', c: '#4dc3ff', lb: 'S', nm: 'SHIELD', nt: 'absorb one hit' },
    { id: 'p:bomb', c: '#ffb84d', lb: 'B', nm: 'BOMB', nt: 'screen-clearing nova · press X' },
  ];
  var BY_ID = {}; ENEMIES.concat(PICKUPS).forEach(function (e) { BY_ID[e.id] = e; });
  function dropKindToId(kind) {
    if (!kind) return null;
    if (kind.indexOf('weapon:') === 0) return 'p:' + kind.slice(7);
    if (kind === 'heal') return 'p:heal';
    if (kind === 'shield') return 'p:shield';
    if (kind === 'bomb') return 'p:bomb';
    return null;
  }

  // --- Icon rendering (faithful to game.js shapes) ------------------------
  function iconCanvas(size) {
    var c = document.createElement('canvas'); var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr; c.style.width = size + 'px'; c.style.height = size + 'px';
    var x = c.getContext('2d'); x.scale(dpr, dpr); x.translate(size / 2, size / 2); return { c: c, x: x };
  }
  function drawEnemyIcon(x, type, col) {
    x.save(); x.shadowColor = col; x.shadowBlur = 7; x.fillStyle = col; var s, k, a;
    if (type === 'darter') { s = 0.9; x.beginPath(); x.moveTo(0, 14 * s); x.lineTo(-10 * s, -8 * s); x.lineTo(0, -3 * s); x.lineTo(10 * s, -8 * s); x.closePath(); x.fill(); }
    else if (type === 'drone') { s = 0.82; x.beginPath(); for (k = 0; k < 6; k++) { a = (k / 6) * TAU; var r = (k % 2 ? 8 : 15) * s; x[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); }
    else if (type === 'weaver') { s = 0.8; x.beginPath(); x.ellipse(0, 0, 16 * s, 9 * s, 0.35, 0, TAU); x.fill(); x.fillStyle = '#0a3f30'; x.beginPath(); x.arc(0, 0, 4 * s, 0, TAU); x.fill(); }
    else if (type === 'splitter') { s = 0.72; x.save(); x.rotate(0.5); x.fillRect(-12 * s, -12 * s, 24 * s, 24 * s); x.fillStyle = '#7a2054'; x.fillRect(-5 * s, -5 * s, 10 * s, 10 * s); x.restore(); }
    else if (type === 'shard') { s = 1.35; x.beginPath(); x.moveTo(0, -9 * s); x.lineTo(6 * s, 5 * s); x.lineTo(-6 * s, 5 * s); x.closePath(); x.fill(); }
    else if (type === 'tank') { s = 0.54; x.beginPath(); for (k = 0; k < 8; k++) { a = (k / 8) * TAU + Math.PI / 8; x[k ? 'lineTo' : 'moveTo'](Math.cos(a) * 24 * s, Math.sin(a) * 24 * s); } x.closePath(); x.fill(); x.fillStyle = '#4a2a80'; x.beginPath(); x.arc(0, 0, 11 * s, 0, TAU); x.fill(); x.fillStyle = col; x.beginPath(); x.arc(0, 0, 5 * s, 0, TAU); x.fill(); }
    else if (type === 'boss') { s = 0.24; x.beginPath(); x.moveTo(0, 46 * s); x.lineTo(-30 * s, 26 * s); x.lineTo(-52 * s, -4 * s); x.lineTo(-30 * s, -34 * s); x.lineTo(30 * s, -34 * s); x.lineTo(52 * s, -4 * s); x.lineTo(30 * s, 26 * s); x.closePath(); x.fill(); x.fillStyle = '#5a0f0f'; x.beginPath(); x.arc(0, 0, 22 * s, 0, TAU); x.fill(); x.fillStyle = '#ff8c4d'; x.beginPath(); x.arc(0, 0, 10 * s, 0, TAU); x.fill(); }
    x.restore();
  }
  function drawDropIcon(x, col, label) {
    x.save(); x.shadowColor = col; x.shadowBlur = 9;
    x.save(); x.rotate(Math.PI / 4); x.fillStyle = 'rgba(10,10,30,0.85)'; x.fillRect(-8, -8, 16, 16); x.strokeStyle = col; x.lineWidth = 2.2; x.strokeRect(-8, -8, 16, 16); x.restore();
    x.fillStyle = col; x.font = 'bold 11px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 0, 0.5); x.restore();
  }
  function drawLockedIcon(x) {
    x.save(); x.strokeStyle = 'rgba(120,150,190,.45)'; x.lineWidth = 1.6;
    x.save(); x.rotate(Math.PI / 4); x.strokeRect(-7, -7, 14, 14); x.restore();
    x.fillStyle = 'rgba(150,175,210,.55)'; x.font = 'bold 12px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 0, 0.5); x.restore();
  }

  // --- Styles -------------------------------------------------------------
  function injectStyles() {
    var mono = '"SFMono-Regular",Consolas,"Liberation Mono",monospace';
    var css = [
      '#nv-wrap{display:flex;gap:22px;align-items:center;justify-content:center;flex-wrap:wrap;}',
      '@media(max-width:900px){#nv-wrap{flex-direction:column-reverse;gap:14px;}}',
      // shared panel chrome
      '#nv-codex,#nv-lb{font-family:' + mono + ';color:#cfe9ff;background:linear-gradient(180deg,rgba(12,8,28,.94),rgba(6,4,16,.94));',
      'border:1px solid rgba(77,243,255,.25);border-radius:12px;padding:14px;box-shadow:0 0 42px rgba(77,243,255,.09),inset 0 0 30px rgba(255,90,240,.05);',
      'user-select:none;-webkit-user-select:none;}',
      '#nv-codex h2,#nv-lb h2{margin:0;font-size:13px;letter-spacing:.16em;color:#4df3ff;text-shadow:0 0 10px rgba(77,243,255,.5);font-weight:700;}',
      '#nv-codex .sub,#nv-lb .sub{font-size:9px;letter-spacing:.2em;color:#ff5af0;opacity:.85;margin:2px 0 10px;}',
      // codex panel
      '#nv-codex{width:250px;max-width:94vw;}',
      '#nv-codex .grp{display:flex;justify-content:space-between;font-size:9px;letter-spacing:.16em;color:#ff5af0;margin:8px 0 5px;}',
      '#nv-codex .grp .ct{color:#5f7794;}',
      '#nv-codex .scroll{max-height:calc(94vh - 120px);overflow-y:auto;}',
      '#nv-codex .cx{display:flex;align-items:center;gap:9px;padding:4px 4px;border-radius:6px;position:relative;}',
      '#nv-codex .cx canvas{flex:0 0 30px;width:30px;height:30px;}',
      '#nv-codex .cx .nm{font-size:11px;color:#eaffff;letter-spacing:.04em;}',
      '#nv-codex .cx .nt{font-size:9.5px;color:#8fb2cf;}',
      '#nv-codex .cx.locked .nm{color:#6f8aa8;}#nv-codex .cx.locked .nt{color:#4a6076;}',
      '#nv-codex .cx .tag{margin-left:auto;font-size:8px;font-weight:700;letter-spacing:.1em;color:#04121c;background:#4df3ff;',
      'padding:2px 5px;border-radius:4px;box-shadow:0 0 10px rgba(77,243,255,.7);}',
      '@keyframes nvreveal{0%{background:rgba(77,243,255,.35)}100%{background:transparent}}',
      '#nv-codex .cx.reveal{animation:nvreveal 1.4s ease;}',
      '#nv-codex .scroll::-webkit-scrollbar{width:6px;}#nv-codex .scroll::-webkit-scrollbar-thumb{background:rgba(77,243,255,.25);border-radius:3px;}',
      // leaderboard overlay
      '#nv-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:16px;z-index:60;',
      'background:rgba(3,1,9,.82);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);}',
      '#nv-overlay.show{display:flex;}',
      '#nv-lb{width:320px;max-width:94vw;max-height:94vh;overflow:auto;}',
      '@keyframes nvpop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}',
      '#nv-overlay.show #nv-lb{animation:nvpop .26s ease;}',
      '#nv-lb .banner{background:linear-gradient(90deg,rgba(77,243,255,.18),rgba(255,90,240,.12));border:1px solid rgba(77,243,255,.4);',
      'border-radius:7px;padding:8px 9px;margin-bottom:10px;text-align:center;}',
      '#nv-lb .banner.hidden{display:none;}',
      '#nv-lb .banner .big{font-size:16px;font-weight:800;color:#fff;letter-spacing:.04em;}',
      '#nv-lb .banner .small{font-size:9.5px;color:#bfe4ff;letter-spacing:.08em;margin-top:3px;}',
      '#nv-lb .hrow,#nv-lb .row{display:flex;align-items:center;gap:7px;font-size:11px;line-height:1.5;padding:3px 5px;border-radius:5px;}',
      '#nv-lb .hrow{font-size:8.5px;letter-spacing:.12em;color:#5f7794;border-bottom:1px solid rgba(120,150,190,.15);padding-bottom:5px;margin-bottom:2px;}',
      '#nv-lb .c-rk{width:22px;flex:0 0 22px;color:#5f7794;text-align:right;font-size:10px;}',
      '#nv-lb .c-nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#eaffff;}',
      '#nv-lb .c-sc{width:60px;flex:0 0 60px;text-align:right;color:#ffd25a;font-variant-numeric:tabular-nums;}',
      '#nv-lb .c-wv{width:30px;flex:0 0 30px;text-align:right;color:#5affc8;font-variant-numeric:tabular-nums;}',
      '#nv-lb .c-dt{width:44px;flex:0 0 44px;text-align:right;color:#8fb2cf;font-size:10px;}',
      '#nv-lb .row.top .c-rk{color:#4df3ff;font-weight:700;}',
      '#nv-lb .row.me{background:rgba(77,243,255,.10);box-shadow:inset 0 0 0 1px rgba(77,243,255,.3);}',
      '@keyframes nvflash{0%,100%{background:rgba(77,243,255,.10)}50%{background:rgba(255,90,240,.4)}}',
      '#nv-lb .row.flash{animation:nvflash .5s ease 3;}',
      '#nv-lb .empty{color:#5f7794;font-size:11px;text-align:center;padding:40px 0;}',
      '#nv-lb ol{list-style:none;margin:0;padding:0;}#nv-lb .scroll{max-height:40vh;overflow-y:auto;}',
      '#nv-lb .foot{margin-top:11px;border-top:1px solid rgba(120,150,190,.15);padding-top:10px;}',
      '#nv-lb label{font-size:9px;letter-spacing:.18em;color:#8fb2cf;display:block;margin-bottom:4px;}',
      '#nv-lb .frow{display:flex;gap:6px;align-items:center;}',
      '#nv-lb input{flex:1;min-width:0;background:rgba(0,0,0,.4);border:1px solid rgba(77,243,255,.3);color:#eaffff;font-family:inherit;font-size:12px;padding:6px 8px;border-radius:6px;outline:none;}',
      '#nv-lb input:focus{border-color:#4df3ff;box-shadow:0 0 0 2px rgba(77,243,255,.2);}',
      '#nv-lb button.save{background:rgba(77,243,255,.14);border:1px solid rgba(77,243,255,.45);color:#4df3ff;font-family:inherit;font-size:11px;letter-spacing:.08em;padding:6px 11px;border-radius:6px;cursor:pointer;white-space:nowrap;}',
      '#nv-lb button.save:hover{background:rgba(77,243,255,.28);}#nv-lb button.save:disabled{opacity:.5;cursor:default;}',
      '#nv-lb .status{font-size:10px;letter-spacing:.05em;min-height:14px;margin-top:8px;color:#8fb2cf;}',
      '#nv-lb .status.ok{color:#5affc8;}#nv-lb .status.err{color:#ff6b8a;}',
      '#nv-lb .again{width:100%;margin-top:11px;background:linear-gradient(90deg,rgba(77,243,255,.2),rgba(255,90,240,.16));',
      'border:1px solid rgba(77,243,255,.55);color:#eaffff;font-family:inherit;font-size:12px;font-weight:700;letter-spacing:.12em;padding:9px 0;border-radius:7px;cursor:pointer;}',
      '#nv-lb .again:hover{background:linear-gradient(90deg,rgba(77,243,255,.34),rgba(255,90,240,.28));}',
      '#nv-lb .hint{text-align:center;font-size:9px;letter-spacing:.14em;color:#6f8aa8;margin-top:7px;}',
    ].join('');
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }

  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  // --- CODEX (persistent, progressive) ------------------------------------
  var discovered = readDiscovered();
  var revealing = {}; // id -> true while flashing NEW
  var codexEl = {};

  function buildCodex() {
    var panel = h('aside'); panel.id = 'nv-codex';
    panel.appendChild(h('h2', null, 'CODEX'));
    panel.appendChild(h('div', 'sub', 'NEON VOID · FIELD GUIDE'));
    codexEl.scroll = h('div', 'scroll');
    panel.appendChild(codexEl.scroll);
    renderCodex();
    return panel;
  }

  function codexRow(entry, isEnemy) {
    var seen = discovered.has(entry.id);
    var row = h('div', 'cx' + (seen ? '' : ' locked') + (revealing[entry.id] ? ' reveal' : ''));
    var ic = iconCanvas(30);
    if (!seen) drawLockedIcon(ic.x);
    else if (isEnemy) drawEnemyIcon(ic.x, entry.t, entry.c);
    else drawDropIcon(ic.x, entry.c, entry.lb);
    row.appendChild(ic.c);
    var txt = h('div');
    txt.appendChild(h('div', 'nm', seen ? entry.nm : '???'));
    txt.appendChild(h('div', 'nt', seen ? entry.nt : 'undiscovered'));
    row.appendChild(txt);
    if (revealing[entry.id]) row.appendChild(h('span', 'tag', 'NEW'));
    return row;
  }

  function renderCodex() {
    if (!codexEl.scroll) return;
    var s = codexEl.scroll; s.innerHTML = '';
    var eSeen = ENEMIES.filter(function (e) { return discovered.has(e.id); }).length;
    var pSeen = PICKUPS.filter(function (e) { return discovered.has(e.id); }).length;
    var gh = h('div', 'grp'); gh.appendChild(h('span', null, '◄ HOSTILES ►')); gh.appendChild(h('span', 'ct', eSeen + '/' + ENEMIES.length)); s.appendChild(gh);
    ENEMIES.forEach(function (e) { s.appendChild(codexRow(e, true)); });
    var gp = h('div', 'grp'); gp.appendChild(h('span', null, '◄ PICKUPS ►')); gp.appendChild(h('span', 'ct', pSeen + '/' + PICKUPS.length)); s.appendChild(gp);
    PICKUPS.forEach(function (e) { s.appendChild(codexRow(e, false)); });
  }

  function discover(id) {
    if (!BY_ID[id] || discovered.has(id)) return;
    discovered.add(id); saveDiscovered(discovered);
    revealing[id] = true; renderCodex();
    setTimeout(function () { delete revealing[id]; renderCodex(); }, 2600);
  }

  // --- Leaderboard overlay ------------------------------------------------
  var lbEl = {};
  var lastRows = [];
  var highlightKey = null;

  function buildOverlay() {
    var overlay = h('div'); overlay.id = 'nv-overlay';
    var card = h('aside'); card.id = 'nv-lb';
    card.appendChild(h('h2', null, 'TOP PILOTS'));
    card.appendChild(h('div', 'sub', 'NEON VOID · GLOBAL'));
    lbEl.banner = h('div', 'banner hidden'); card.appendChild(lbEl.banner);
    var head = h('div', 'hrow');
    ['#', 'PILOT', 'SCORE', 'WV', 'DATE'].forEach(function (t, i) { head.appendChild(h('span', ['c-rk', 'c-nm', 'c-sc', 'c-wv', 'c-dt'][i], t)); });
    card.appendChild(head);
    var scroll = h('div', 'scroll'); lbEl.list = h('ol'); scroll.appendChild(lbEl.list); card.appendChild(scroll);

    var foot = h('div', 'foot');
    foot.appendChild(h('label', null, 'YOUR HANDLE'));
    var frow = h('div', 'frow');
    lbEl.input = h('input'); lbEl.input.maxLength = 20; lbEl.input.placeholder = 'callsign…'; lbEl.input.value = getName();
    lbEl.save = h('button', 'save', 'SAVE');
    frow.appendChild(lbEl.input); frow.appendChild(lbEl.save); foot.appendChild(frow);
    lbEl.status = h('div', 'status'); foot.appendChild(lbEl.status);
    lbEl.again = h('button', 'again', '▶ PLAY AGAIN'); foot.appendChild(lbEl.again);
    foot.appendChild(h('div', 'hint', 'or press SPACE'));
    card.appendChild(foot);

    ['keydown', 'keyup', 'keypress'].forEach(function (t) { lbEl.input.addEventListener(t, function (e) { e.stopPropagation(); }); });
    lbEl.input.addEventListener('input', function () { setName(lbEl.input.value.trim()); });
    lbEl.save.addEventListener('click', onManualSubmit);
    lbEl.again.addEventListener('click', function () { var g = window.__game; if (g && g.start) g.start(); hideOverlay(); });

    overlay.appendChild(card);
    lbEl.overlay = overlay;
    return overlay;
  }

  function showOverlay() { lbEl.overlay.classList.add('show'); }
  function hideOverlay() { lbEl.overlay.classList.remove('show'); }
  function setStatus(msg, kind) { lbEl.status.textContent = msg || ''; lbEl.status.className = 'status' + (kind ? ' ' + kind : ''); }

  function showBanner(rank, tot, score, wave) {
    if (rank == null) { lbEl.banner.classList.add('hidden'); return; }
    lbEl.banner.innerHTML = '';
    var suf = (rank % 10 === 1 && rank !== 11) ? 'ST' : (rank % 10 === 2 && rank !== 12) ? 'ND' : (rank % 10 === 3 && rank !== 13) ? 'RD' : 'TH';
    lbEl.banner.appendChild(h('div', 'big', 'YOU PLACED ' + rank + suf));
    var meta = score.toLocaleString() + ' PTS';
    if (hasWave && wave > 0) meta += ' · WAVE ' + wave;
    meta += ' · #' + rank + ' of ' + tot;
    lbEl.banner.appendChild(h('div', 'small', meta));
    lbEl.banner.classList.remove('hidden');
  }

  function render(rows) {
    lastRows = rows || []; lbEl.list.innerHTML = '';
    var me = getName().toLowerCase();
    if (!lastRows.length) { lbEl.list.appendChild(h('div', 'empty', configured ? 'no scores yet — be the first!' : 'leaderboard offline')); return; }
    lastRows.forEach(function (r, i) {
      var li = h('li', 'row' + (i < 3 ? ' top' : ''));
      var key = (r.name || '') + '|' + r.score;
      if (me && (r.name || '').toLowerCase() === me) li.classList.add('me');
      if (highlightKey && key === highlightKey) li.classList.add('flash');
      li.appendChild(h('span', 'c-rk', '' + (i + 1)));
      var nm = h('span', 'c-nm', r.name || '???'); nm.title = r.name || ''; li.appendChild(nm);
      li.appendChild(h('span', 'c-sc', Number(r.score).toLocaleString()));
      li.appendChild(h('span', 'c-wv', (r.wave > 0) ? String(r.wave) : '—'));
      var dt = h('span', 'c-dt', fmtDate(r.created_at)); dt.title = fmtDateFull(r.created_at); li.appendChild(dt);
      lbEl.list.appendChild(li);
    });
    highlightKey = null;
  }

  function refresh() {
    render(readCache());
    return fetchTop().then(function (rows) { writeCache(rows); render(rows); return rows; })
      .catch(function () { setStatus(configured ? 'offline — showing cached' : 'leaderboard not configured', 'err'); render(readCache()); });
  }

  function doSubmit(name, score, wave, opts) {
    opts = opts || {}; name = (name || '').trim().slice(0, 20);
    if (!name) { setStatus('enter a handle to save your score', 'err'); lbEl.input.focus(); return Promise.resolve(false); }
    if (!(score > 0)) { setStatus('play a round first!', ''); return Promise.resolve(false); }
    setName(name); lbEl.save.disabled = true; setStatus(opts.auto ? 'saving your run…' : 'saving…', '');
    return submitScore(name, score, wave).then(function () {
      highlightKey = name + '|' + score; setStatus('saved · ' + score.toLocaleString() + ' pts', 'ok');
      return Promise.all([refresh(), getPlacement(score)]);
    }).then(function (res) { if (res && res[1]) showBanner(res[1].rank, res[1].total, score, wave); })
      .catch(function (err) { setStatus('save failed — ' + (err && err.message ? err.message.slice(0, 40) : 'try again'), 'err'); })
      .then(function () { lbEl.save.disabled = false; });
  }

  function onManualSubmit() {
    var g = window.__game;
    if (g && g.state === 'over' && g.score > 0) return doSubmit(lbEl.input.value, g.score, g.wave, {});
    setName(lbEl.input.value.trim()); setStatus(lbEl.input.value.trim() ? 'handle saved' : '', 'ok');
  }

  // --- Mount + observe ----------------------------------------------------
  function mount(codexPanel, overlay) {
    var canvas = document.getElementById('game');
    var wrap = h('div'); wrap.id = 'nv-wrap';
    canvas.parentNode.insertBefore(wrap, canvas);
    wrap.appendChild(codexPanel); // left of the canvas
    wrap.appendChild(canvas);
    document.body.appendChild(overlay);
  }

  var prevState = null;
  function tick() {
    var g = window.__game;
    if (g) {
      // Living codex: reveal anything currently on the field.
      if (g.enemies) for (var i = 0; i < g.enemies.length; i++) discover('e:' + g.enemies[i].type);
      if (g.drops) for (var j = 0; j < g.drops.length; j++) { var id = dropKindToId(g.drops[j].kind); if (id) discover(id); }
      // Leaderboard only at the end of a round.
      if (g.state !== prevState) {
        if (g.state === 'over') {
          lbEl.banner.classList.add('hidden');
          var nm = getName();
          if (nm && g.score > 0) doSubmit(nm, g.score, g.wave, { auto: true });
          else { if (g.score > 0) setStatus('enter a handle, then SAVE your ' + g.score.toLocaleString() + ' pt run', ''); refresh(); }
          showOverlay();
        } else {
          hideOverlay(); setStatus('');
        }
        prevState = g.state;
      }
    }
    requestAnimationFrame(tick);
  }

  function init() {
    injectStyles();
    var codexPanel = buildCodex();
    var overlay = buildOverlay();
    mount(codexPanel, overlay);
    probeWave().then(refresh);
    requestAnimationFrame(tick);
    window.__lb = {
      refresh: refresh, submit: doSubmit, fetchTop: fetchTop, getPlacement: getPlacement,
      discover: discover, renderCodex: renderCodex,
      showOverlay: showOverlay, hideOverlay: hideOverlay,
      get rows() { return lastRows; }, get discovered() { return Array.from(discovered); },
      get overlayShown() { return lbEl.overlay.classList.contains('show'); },
      get hasWave() { return hasWave; }, configured: configured,
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
