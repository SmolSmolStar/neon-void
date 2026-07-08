/*
 * NEON VOID — online leaderboard + codex (Supabase REST, no SDK).
 *
 * Zero-edit add-on: observes the game via `window.__game`, needs no changes to
 * game.js. Presents an arcade-style results board — Rank · Pilot · Score · Wave
 * · Date — with the player's row highlighted and a "YOU PLACED #N" callout on
 * game over (conventions drawn from classic shmup high-score tables and modern
 * results screens). A CODEX tab explains every enemy and pickup symbol.
 *
 * The `key` below is the PUBLIC publishable key — safe to ship. Writes are
 * locked down by row-level-security policies (insert-only, sanity-checked; no
 * update/delete), so nobody can wipe or tamper with the board.
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
  var hasWave = false; // probed at init — degrades gracefully before the DB migration

  var LS_NAME = 'neonvoid_name';
  var LS_CACHE = 'neonvoid_lb_cache';

  // --- Supabase REST client ----------------------------------------------
  function headers(extra) {
    return Object.assign({
      'apikey': CFG.key,
      'Authorization': 'Bearer ' + CFG.key,
      'Content-Type': 'application/json',
    }, extra || {});
  }

  // Detect whether the optional `wave` column exists yet (added by a later DB
  // migration). Prefer sniffing a real row — a quiet 200 — so there's no console
  // noise; only on a genuinely empty table do we fall back to a column probe
  // (which 400s if the column is absent).
  function probeWave() {
    if (!configured) return Promise.resolve(false);
    return fetch(CFG.url + '/rest/v1/scores?select=*&limit=1', { headers: headers() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (rows && rows.length) { hasWave = Object.prototype.hasOwnProperty.call(rows[0], 'wave'); return hasWave; }
        return fetch(CFG.url + '/rest/v1/scores?select=wave&limit=1', { headers: headers() })
          .then(function (r2) { hasWave = r2.ok; return hasWave; });
      })
      .catch(function () { hasWave = false; return false; });
  }

  function fetchTop() {
    if (!configured) return Promise.reject(new Error('not configured'));
    var sel = 'name,score,created_at' + (hasWave ? ',wave' : '');
    var q = CFG.url + '/rest/v1/scores'
      + '?game=eq.' + encodeURIComponent(CFG.game)
      + '&select=' + sel
      + '&order=score.desc&order=created_at.asc'
      + '&limit=' + CFG.top;
    return fetch(q, { headers: headers() }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function submitScore(name, score, wave) {
    if (!configured) return Promise.reject(new Error('not configured'));
    var row = { game: CFG.game, name: name, score: score };
    if (hasWave && wave != null) row.wave = wave;
    return fetch(CFG.url + '/rest/v1/scores', {
      method: 'POST',
      headers: headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(row),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t); });
      return true;
    });
  }

  // Global placement: how many scores strictly beat `score`, and total entries.
  function getPlacement(score) {
    if (!configured) return Promise.resolve(null);
    var base = CFG.url + '/rest/v1/scores?game=eq.' + encodeURIComponent(CFG.game);
    var countHead = headers({ 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' });
    var better = fetch(base + '&score=gt.' + score + '&select=id', { headers: countHead }).then(total);
    var all = fetch(base + '&select=id', { headers: countHead }).then(total);
    function total(r) { var cr = r.headers.get('content-range') || ''; return parseInt((cr.split('/')[1] || '0'), 10) || 0; }
    return Promise.all([better, all]).then(function (a) { return { rank: a[0] + 1, total: Math.max(a[1], a[0] + 1) }; })
      .catch(function () { return null; });
  }

  // --- Local cache / handle -----------------------------------------------
  function readCache() { try { return JSON.parse(localStorage.getItem(LS_CACHE) || '[]'); } catch (e) { return []; } }
  function writeCache(rows) { try { localStorage.setItem(LS_CACHE, JSON.stringify(rows.slice(0, CFG.top))); } catch (e) {} }
  function getName() { try { return (localStorage.getItem(LS_NAME) || '').slice(0, 20); } catch (e) { return ''; } }
  function setName(v) { try { localStorage.setItem(LS_NAME, v.slice(0, 20)); } catch (e) {} }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function fmtDateFull(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString(); }

  // --- DOM helpers --------------------------------------------------------
  var el = {};
  var lastRows = [];
  var highlightKey = null;
  var activeTab = 'ranks';

  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function injectStyles() {
    var css = [
      '#nv-lb{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;color:#cfe9ff;width:312px;max-width:94vw;',
      'background:linear-gradient(180deg,rgba(12,8,28,.94),rgba(6,4,16,.94));border:1px solid rgba(77,243,255,.25);',
      'border-radius:12px;padding:14px;box-shadow:0 0 42px rgba(77,243,255,.09),inset 0 0 30px rgba(255,90,240,.05);',
      'user-select:none;-webkit-user-select:none;}',
      '#nv-lb h2{margin:0;font-size:13px;letter-spacing:.16em;color:#4df3ff;text-shadow:0 0 10px rgba(77,243,255,.5);font-weight:700;}',
      '#nv-lb .sub{font-size:9px;letter-spacing:.22em;color:#ff5af0;opacity:.85;margin:2px 0 10px;}',
      '#nv-lb .tabs{display:flex;gap:6px;margin-bottom:10px;}',
      '#nv-lb .tab{flex:1;background:rgba(0,0,0,.35);border:1px solid rgba(77,243,255,.2);color:#8fb2cf;',
      'font-family:inherit;font-size:10px;letter-spacing:.12em;padding:6px 0;border-radius:6px;cursor:pointer;}',
      '#nv-lb .tab.on{background:rgba(77,243,255,.16);border-color:#4df3ff;color:#eaffff;}',
      '#nv-lb .body{min-height:190px;}',
      '#nv-lb .hidden{display:none;}',
      '#nv-lb .banner{background:linear-gradient(90deg,rgba(77,243,255,.18),rgba(255,90,240,.12));',
      'border:1px solid rgba(77,243,255,.4);border-radius:7px;padding:7px 9px;margin-bottom:9px;text-align:center;}',
      '#nv-lb .banner .big{font-size:15px;font-weight:800;color:#fff;letter-spacing:.04em;}',
      '#nv-lb .banner .small{font-size:9.5px;color:#bfe4ff;letter-spacing:.08em;margin-top:2px;}',
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
      '#nv-lb .empty{color:#5f7794;font-size:11px;text-align:center;padding:44px 0;}',
      '#nv-lb ol{list-style:none;margin:0;padding:0;}',
      '#nv-lb .foot{margin-top:11px;border-top:1px solid rgba(120,150,190,.15);padding-top:10px;}',
      '#nv-lb label{font-size:9px;letter-spacing:.18em;color:#8fb2cf;display:block;margin-bottom:4px;}',
      '#nv-lb .frow{display:flex;gap:6px;align-items:center;}',
      '#nv-lb input{flex:1;min-width:0;background:rgba(0,0,0,.4);border:1px solid rgba(77,243,255,.3);color:#eaffff;',
      'font-family:inherit;font-size:12px;padding:6px 8px;border-radius:6px;outline:none;}',
      '#nv-lb input:focus{border-color:#4df3ff;box-shadow:0 0 0 2px rgba(77,243,255,.2);}',
      '#nv-lb button.save{background:rgba(77,243,255,.14);border:1px solid rgba(77,243,255,.45);color:#4df3ff;',
      'font-family:inherit;font-size:11px;letter-spacing:.08em;padding:6px 11px;border-radius:6px;cursor:pointer;white-space:nowrap;}',
      '#nv-lb button.save:hover{background:rgba(77,243,255,.28);}#nv-lb button.save:disabled{opacity:.5;cursor:default;}',
      '#nv-lb .status{font-size:10px;letter-spacing:.05em;min-height:14px;margin-top:8px;color:#8fb2cf;}',
      '#nv-lb .status.ok{color:#5affc8;}#nv-lb .status.err{color:#ff6b8a;}',
      // codex
      '#nv-codex .grp{font-size:9px;letter-spacing:.16em;color:#ff5af0;margin:4px 0 5px;}',
      '#nv-codex .cx{display:flex;align-items:center;gap:9px;padding:3px 4px;}',
      '#nv-codex canvas{flex:0 0 30px;width:30px;height:30px;}',
      '#nv-codex .cx .nm{font-size:11px;color:#eaffff;letter-spacing:.04em;}',
      '#nv-codex .cx .nt{font-size:9.5px;color:#8fb2cf;}',
      '#nv-codex .scroll,#nv-ranks .scroll{max-height:238px;overflow-y:auto;}',
      '#nv-codex .scroll::-webkit-scrollbar,#nv-ranks .scroll::-webkit-scrollbar{width:6px;}',
      '#nv-codex .scroll::-webkit-scrollbar-thumb,#nv-ranks .scroll::-webkit-scrollbar-thumb{background:rgba(77,243,255,.25);border-radius:3px;}',
      '#nv-wrap{display:flex;gap:22px;align-items:center;justify-content:center;flex-wrap:wrap;flex-direction:row-reverse;}',
      '@media(max-width:940px){#nv-wrap{flex-direction:column;gap:14px;}#nv-lb{width:min(460px,94vw);}}',
    ].join('');
    var s = h('style'); s.textContent = css; document.head.appendChild(s);
  }

  // --- CODEX data + icon rendering (faithful to game.js shapes) ------------
  var ENEMIES = [
    { t: 'darter', c: '#ff5a5a', nm: 'DARTER', nt: 'fast, fragile diver' },
    { t: 'drone', c: '#ffd25a', nm: 'DRONE', nt: 'spins in, fires bursts' },
    { t: 'weaver', c: '#5affc8', nm: 'WEAVER', nt: 'weaves side to side' },
    { t: 'splitter', c: '#ff8cd2', nm: 'SPLITTER', nt: 'bursts into shards' },
    { t: 'shard', c: '#ff8cd2', nm: 'SHARD', nt: 'splinter from a splitter' },
    { t: 'tank', c: '#b98cff', nm: 'TANK', nt: 'armored, high HP' },
    { t: 'boss', c: '#ff3b3b', nm: 'BOSS', nt: 'wave boss — massive HP' },
  ];
  var PICKUPS = [
    { kind: 'drop', c: '#4df3ff', lb: 'B', nm: 'BLASTER', nt: 'rapid straight shots' },
    { kind: 'drop', c: '#7dff4d', lb: 'S', nm: 'SPREAD', nt: 'wide fan of shots' },
    { kind: 'drop', c: '#ff4df0', lb: 'L', nm: 'LASER', nt: 'piercing beam' },
    { kind: 'drop', c: '#ffb84d', lb: 'M', nm: 'MISSILE', nt: 'homing missiles' },
    { kind: 'drop', c: '#7dff4d', lb: '+', nm: 'REPAIR', nt: 'restore hull' },
    { kind: 'drop', c: '#4dc3ff', lb: 'S', nm: 'SHIELD', nt: 'absorb one hit' },
    { kind: 'drop', c: '#ffb84d', lb: 'B', nm: 'BOMB', nt: 'screen-clearing nova · press X' },
  ];
  var TAU = Math.PI * 2;

  function iconCanvas(size) {
    var c = h('canvas'); var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr; c.style.width = size + 'px'; c.style.height = size + 'px';
    var x = c.getContext('2d'); x.scale(dpr, dpr); x.translate(size / 2, size / 2);
    return { c: c, x: x };
  }

  function drawEnemyIcon(x, type, col) {
    x.save(); x.shadowColor = col; x.shadowBlur = 7; x.fillStyle = col;
    var s;
    if (type === 'darter') {
      s = 0.9; x.beginPath(); x.moveTo(0, 14 * s); x.lineTo(-10 * s, -8 * s); x.lineTo(0, -3 * s); x.lineTo(10 * s, -8 * s); x.closePath(); x.fill();
    } else if (type === 'drone') {
      s = 0.82; x.beginPath();
      for (var k = 0; k < 6; k++) { var a = (k / 6) * TAU, r = (k % 2 ? 8 : 15) * s; x[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
      x.closePath(); x.fill();
    } else if (type === 'weaver') {
      s = 0.8; x.beginPath(); x.ellipse(0, 0, 16 * s, 9 * s, 0.35, 0, TAU); x.fill();
      x.fillStyle = '#0a3f30'; x.beginPath(); x.arc(0, 0, 4 * s, 0, TAU); x.fill();
    } else if (type === 'splitter') {
      s = 0.72; x.save(); x.rotate(0.5); x.fillRect(-12 * s, -12 * s, 24 * s, 24 * s);
      x.fillStyle = '#7a2054'; x.fillRect(-5 * s, -5 * s, 10 * s, 10 * s); x.restore();
    } else if (type === 'shard') {
      s = 1.35; x.beginPath(); x.moveTo(0, -9 * s); x.lineTo(6 * s, 5 * s); x.lineTo(-6 * s, 5 * s); x.closePath(); x.fill();
    } else if (type === 'tank') {
      s = 0.54; x.beginPath();
      for (var j = 0; j < 8; j++) { var a2 = (j / 8) * TAU + Math.PI / 8; x[j ? 'lineTo' : 'moveTo'](Math.cos(a2) * 24 * s, Math.sin(a2) * 24 * s); }
      x.closePath(); x.fill();
      x.fillStyle = '#4a2a80'; x.beginPath(); x.arc(0, 0, 11 * s, 0, TAU); x.fill();
      x.fillStyle = col; x.beginPath(); x.arc(0, 0, 5 * s, 0, TAU); x.fill();
    } else if (type === 'boss') {
      s = 0.24; x.beginPath();
      x.moveTo(0, 46 * s); x.lineTo(-30 * s, 26 * s); x.lineTo(-52 * s, -4 * s); x.lineTo(-30 * s, -34 * s);
      x.lineTo(30 * s, -34 * s); x.lineTo(52 * s, -4 * s); x.lineTo(30 * s, 26 * s); x.closePath(); x.fill();
      x.fillStyle = '#5a0f0f'; x.beginPath(); x.arc(0, 0, 22 * s, 0, TAU); x.fill();
      x.fillStyle = '#ff8c4d'; x.beginPath(); x.arc(0, 0, 10 * s, 0, TAU); x.fill();
    }
    x.restore();
  }

  function drawDropIcon(x, col, label) {
    x.save(); x.shadowColor = col; x.shadowBlur = 9;
    x.save(); x.rotate(Math.PI / 4);
    x.fillStyle = 'rgba(10,10,30,0.85)'; x.fillRect(-8, -8, 16, 16);
    x.strokeStyle = col; x.lineWidth = 2.2; x.strokeRect(-8, -8, 16, 16);
    x.restore();
    x.fillStyle = col; x.font = 'bold 11px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, 0, 0.5);
    x.restore();
  }

  function buildCodex() {
    var wrap = h('div'); wrap.id = 'nv-codex'; wrap.className = 'hidden';
    var scroll = h('div', 'scroll');
    scroll.appendChild(h('div', 'grp', '◄ HOSTILES ►'));
    ENEMIES.forEach(function (e) {
      var row = h('div', 'cx'); var ic = iconCanvas(30); drawEnemyIcon(ic.x, e.t, e.c);
      row.appendChild(ic.c);
      var txt = h('div'); txt.appendChild(h('div', 'nm', e.nm)); txt.appendChild(h('div', 'nt', e.nt));
      row.appendChild(txt); scroll.appendChild(row);
    });
    scroll.appendChild(h('div', 'grp', '◄ PICKUPS ►'));
    PICKUPS.forEach(function (p) {
      var row = h('div', 'cx'); var ic = iconCanvas(30); drawDropIcon(ic.x, p.c, p.lb);
      row.appendChild(ic.c);
      var txt = h('div'); txt.appendChild(h('div', 'nm', p.nm)); txt.appendChild(h('div', 'nt', p.nt));
      row.appendChild(txt); scroll.appendChild(row);
    });
    wrap.appendChild(scroll);
    return wrap;
  }

  // --- Build panel --------------------------------------------------------
  function build() {
    var panel = h('aside'); panel.id = 'nv-lb';
    panel.appendChild(h('h2', null, 'TOP PILOTS'));
    panel.appendChild(h('div', 'sub', 'NEON VOID · GLOBAL'));

    var tabs = h('div', 'tabs');
    el.tabRanks = h('button', 'tab on', 'RANKS');
    el.tabCodex = h('button', 'tab', 'CODEX');
    el.tabRanks.addEventListener('click', function () { switchTab('ranks'); });
    el.tabCodex.addEventListener('click', function () { switchTab('codex'); });
    tabs.appendChild(el.tabRanks); tabs.appendChild(el.tabCodex);
    panel.appendChild(tabs);

    var body = h('div', 'body');
    // RANKS tab
    el.ranks = h('div'); el.ranks.id = 'nv-ranks';
    el.banner = h('div', 'banner hidden');
    el.ranks.appendChild(el.banner);
    var head = h('div', 'hrow');
    ['#', 'PILOT', 'SCORE', 'WV', 'DATE'].forEach(function (t, i) {
      head.appendChild(h('span', ['c-rk', 'c-nm', 'c-sc', 'c-wv', 'c-dt'][i], t));
    });
    el.ranks.appendChild(head);
    var scroll = h('div', 'scroll');
    el.list = h('ol'); scroll.appendChild(el.list); el.ranks.appendChild(scroll);
    body.appendChild(el.ranks);
    // CODEX tab
    el.codex = buildCodex();
    body.appendChild(el.codex);
    panel.appendChild(body);

    // Footer: handle + status
    var foot = h('div', 'foot');
    foot.appendChild(h('label', null, 'YOUR HANDLE'));
    var frow = h('div', 'frow');
    el.input = h('input'); el.input.maxLength = 20; el.input.placeholder = 'callsign…'; el.input.value = getName();
    el.save = h('button', 'save', 'SAVE');
    frow.appendChild(el.input); frow.appendChild(el.save);
    foot.appendChild(frow);
    el.status = h('div', 'status'); foot.appendChild(el.status);
    panel.appendChild(foot);

    ['keydown', 'keyup', 'keypress'].forEach(function (t) { el.input.addEventListener(t, function (e) { e.stopPropagation(); }); });
    el.input.addEventListener('input', function () { setName(el.input.value.trim()); });
    el.save.addEventListener('click', onManualSubmit);
    return panel;
  }

  function switchTab(which) {
    activeTab = which;
    var r = which === 'ranks';
    el.tabRanks.classList.toggle('on', r);
    el.tabCodex.classList.toggle('on', !r);
    el.ranks.classList.toggle('hidden', !r);
    el.codex.classList.toggle('hidden', r);
  }

  function mount(panel) {
    var canvas = document.getElementById('game');
    var wrap = h('div'); wrap.id = 'nv-wrap';
    canvas.parentNode.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);
    wrap.appendChild(panel);
  }

  function setStatus(msg, kind) { el.status.textContent = msg || ''; el.status.className = 'status' + (kind ? ' ' + kind : ''); }

  function showBanner(rank, total, score, wave) {
    if (rank == null) { el.banner.classList.add('hidden'); return; }
    el.banner.innerHTML = '';
    var suffix = (rank % 10 === 1 && rank !== 11) ? 'ST' : (rank % 10 === 2 && rank !== 12) ? 'ND' : (rank % 10 === 3 && rank !== 13) ? 'RD' : 'TH';
    el.banner.appendChild(h('div', 'big', 'YOU PLACED ' + rank + suffix));
    var meta = score.toLocaleString() + ' PTS';
    if (hasWave && wave > 0) meta += ' · WAVE ' + wave;
    meta += ' · #' + rank + ' of ' + total;
    el.banner.appendChild(h('div', 'small', meta));
    el.banner.classList.remove('hidden');
  }

  function render(rows) {
    lastRows = rows || [];
    el.list.innerHTML = '';
    var me = getName().toLowerCase();
    if (!lastRows.length) {
      el.list.appendChild(h('div', 'empty', configured ? 'no scores yet — be the first!' : 'leaderboard offline'));
      return;
    }
    lastRows.forEach(function (r, i) {
      var li = h('li', 'row' + (i < 3 ? ' top' : ''));
      var key = (r.name || '') + '|' + r.score;
      if (me && (r.name || '').toLowerCase() === me) li.classList.add('me');
      if (highlightKey && key === highlightKey) li.classList.add('flash');
      li.appendChild(h('span', 'c-rk', '' + (i + 1)));
      var nm = h('span', 'c-nm', r.name || '???'); nm.title = r.name || '';
      li.appendChild(nm);
      li.appendChild(h('span', 'c-sc', Number(r.score).toLocaleString()));
      li.appendChild(h('span', 'c-wv', (r.wave > 0) ? String(r.wave) : '—'));
      var dt = h('span', 'c-dt', fmtDate(r.created_at)); dt.title = fmtDateFull(r.created_at);
      li.appendChild(dt);
      el.list.appendChild(li);
    });
    highlightKey = null;
  }

  function refresh() {
    render(readCache());
    return fetchTop().then(function (rows) { writeCache(rows); render(rows); return rows; })
      .catch(function () {
        if (!configured) setStatus('leaderboard not configured', 'err');
        else setStatus('offline — showing cached', 'err');
        render(readCache());
      });
  }

  function doSubmit(name, score, wave, opts) {
    opts = opts || {};
    name = (name || '').trim().slice(0, 20);
    if (!name) { setStatus('enter a handle to save your score', 'err'); el.input.focus(); return Promise.resolve(false); }
    if (!(score > 0)) { setStatus('play a round first!', ''); return Promise.resolve(false); }
    setName(name);
    el.save.disabled = true;
    setStatus(opts.auto ? 'saving your run…' : 'saving…', '');
    return submitScore(name, score, wave).then(function () {
      highlightKey = name + '|' + score;
      setStatus('saved · ' + score.toLocaleString() + ' pts', 'ok');
      return Promise.all([refresh(), getPlacement(score)]);
    }).then(function (res) {
      if (res && res[1]) showBanner(res[1].rank, res[1].total, score, wave);
      switchTab('ranks');
    }).catch(function (err) {
      setStatus('save failed — ' + (err && err.message ? err.message.slice(0, 40) : 'try again'), 'err');
    }).then(function () { el.save.disabled = false; });
  }

  function onManualSubmit() {
    var g = window.__game;
    if (g && g.state === 'over' && g.score > 0) return doSubmit(el.input.value, g.score, g.wave, {});
    setName(el.input.value.trim());
    setStatus(el.input.value.trim() ? 'handle saved' : '', 'ok');
  }

  // --- Observe the game ----------------------------------------------------
  var prevState = null;

  function tick() {
    var g = window.__game;
    if (g && g.state !== prevState) {
      if (g.state === 'over') {
        el.banner.classList.add('hidden');
        var nm = getName();
        if (nm && g.score > 0) doSubmit(nm, g.score, g.wave, { auto: true });
        else if (g.score > 0) { setStatus('enter a handle, then SAVE your ' + g.score.toLocaleString() + ' pt run', ''); switchTab('ranks'); el.input.focus(); }
      } else if (g.state === 'play') {
        setStatus(''); el.banner.classList.add('hidden');
      } else if (g.state === 'menu') {
        setStatus('');
      }
      prevState = g.state;
    }
    requestAnimationFrame(tick);
  }

  function init() {
    injectStyles();
    mount(build());
    probeWave().then(refresh);
    requestAnimationFrame(tick);
    window.__lb = {
      refresh: refresh, submit: doSubmit, fetchTop: fetchTop, getPlacement: getPlacement,
      switchTab: switchTab, get rows() { return lastRows; }, get hasWave() { return hasWave; }, configured: configured,
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
