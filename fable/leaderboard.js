/*
 * NEON VOID — online leaderboard (Supabase REST, no SDK).
 *
 * Self-contained add-on: it observes the game via `window.__game` and needs no
 * changes to game.js. It renders a side/bottom panel, lets the player set a
 * handle, auto-submits their score on game over, and shows the global top 10.
 *
 * The `anon` key below is the PUBLIC key — safe to ship in a static site. Writes
 * are locked down by row-level-security policies in Supabase (insert-only, with
 * sanity checks; no update/delete), so nobody can wipe or tamper with the board.
 */
(function () {
  'use strict';

  // --- Config -------------------------------------------------------------
  // Overridable via window.NEONVOID_LB (used by the test harness).
  var CFG = Object.assign({
    url: 'https://dlqjghhlxnonfuptltts.supabase.co',
    key: 'sb_publishable_b22LCS6rJ8O-Va2iW4Be2A_ggK8IYQ7',
    game: 'neonvoid',
    top: 10,
  }, window.NEONVOID_LB || {});

  var configured = CFG.url.indexOf('http') === 0 && CFG.key.indexOf('__') !== 0;

  var LS_NAME = 'neonvoid_name';
  var LS_CACHE = 'neonvoid_lb_cache';

  // --- Supabase REST client ----------------------------------------------
  function headers() {
    return {
      'apikey': CFG.key,
      'Authorization': 'Bearer ' + CFG.key,
      'Content-Type': 'application/json',
    };
  }

  function fetchTop() {
    if (!configured) return Promise.reject(new Error('not configured'));
    var q = CFG.url + '/rest/v1/scores'
      + '?game=eq.' + encodeURIComponent(CFG.game)
      + '&select=name,score,created_at'
      + '&order=score.desc&order=created_at.asc'
      + '&limit=' + CFG.top;
    return fetch(q, { headers: headers() }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function submitScore(name, score) {
    if (!configured) return Promise.reject(new Error('not configured'));
    return fetch(CFG.url + '/rest/v1/scores', {
      method: 'POST',
      headers: Object.assign(headers(), { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ game: CFG.game, name: name, score: score }),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t); });
      return true;
    });
  }

  // --- Local cache (offline fallback / instant paint) ---------------------
  function readCache() {
    try { return JSON.parse(localStorage.getItem(LS_CACHE) || '[]'); } catch (e) { return []; }
  }
  function writeCache(rows) {
    try { localStorage.setItem(LS_CACHE, JSON.stringify(rows.slice(0, CFG.top))); } catch (e) {}
  }
  function getName() {
    try { return (localStorage.getItem(LS_NAME) || '').slice(0, 20); } catch (e) { return ''; }
  }
  function setName(v) {
    try { localStorage.setItem(LS_NAME, v.slice(0, 20)); } catch (e) {}
  }

  // --- DOM -----------------------------------------------------------------
  var el = {};
  var lastRows = [];
  var highlightKey = null; // "name|score" to flash after a submit

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function injectStyles() {
    var css = ''
      + '#nv-lb{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;'
      + 'color:#cfe9ff;width:260px;max-width:90vw;background:linear-gradient(180deg,rgba(12,8,28,.92),rgba(6,4,16,.92));'
      + 'border:1px solid rgba(77,243,255,.25);border-radius:10px;padding:14px 14px 12px;'
      + 'box-shadow:0 0 40px rgba(77,243,255,.08),inset 0 0 30px rgba(255,90,240,.04);'
      + 'user-select:none;-webkit-user-select:none;}'
      + '#nv-lb h2{margin:0 0 2px;font-size:13px;letter-spacing:.14em;color:#4df3ff;'
      + 'text-shadow:0 0 10px rgba(77,243,255,.5);font-weight:700;}'
      + '#nv-lb .sub{font-size:9px;letter-spacing:.2em;color:#ff5af0;opacity:.85;margin-bottom:10px;}'
      + '#nv-lb ol{list-style:none;margin:0 0 10px;padding:0;counter-reset:r;min-height:120px;}'
      + '#nv-lb li{display:flex;align-items:baseline;gap:8px;padding:3px 4px;border-radius:5px;'
      + 'font-size:12px;line-height:1.5;}'
      + '#nv-lb li .rk{width:20px;color:#5f7794;text-align:right;font-size:10px;}'
      + '#nv-lb li .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#eaffff;}'
      + '#nv-lb li .sc{color:#ffd25a;font-variant-numeric:tabular-nums;}'
      + '#nv-lb li.top .rk{color:#4df3ff;}'
      + '#nv-lb li.me{background:rgba(77,243,255,.10);box-shadow:0 0 0 1px rgba(77,243,255,.3);}'
      + '@keyframes nvflash{0%,100%{background:rgba(77,243,255,.10)}50%{background:rgba(255,90,240,.35)}}'
      + '#nv-lb li.flash{animation:nvflash .5s ease 3;}'
      + '#nv-lb .empty{color:#5f7794;font-size:11px;text-align:center;padding:34px 0;}'
      + '#nv-lb .row{display:flex;gap:6px;align-items:center;margin-top:2px;}'
      + '#nv-lb label{font-size:9px;letter-spacing:.18em;color:#8fb2cf;display:block;margin-bottom:4px;}'
      + '#nv-lb input{flex:1;min-width:0;background:rgba(0,0,0,.4);border:1px solid rgba(77,243,255,.3);'
      + 'color:#eaffff;font-family:inherit;font-size:12px;padding:6px 8px;border-radius:6px;outline:none;}'
      + '#nv-lb input:focus{border-color:#4df3ff;box-shadow:0 0 0 2px rgba(77,243,255,.2);}'
      + '#nv-lb button{background:rgba(77,243,255,.14);border:1px solid rgba(77,243,255,.45);'
      + 'color:#4df3ff;font-family:inherit;font-size:11px;letter-spacing:.08em;padding:6px 10px;'
      + 'border-radius:6px;cursor:pointer;white-space:nowrap;}'
      + '#nv-lb button:hover{background:rgba(77,243,255,.28);}'
      + '#nv-lb button:disabled{opacity:.5;cursor:default;}'
      + '#nv-lb .status{font-size:10px;letter-spacing:.06em;min-height:14px;margin-top:8px;color:#8fb2cf;}'
      + '#nv-lb .status.ok{color:#5affc8;}#nv-lb .status.err{color:#ff6b8a;}'
      + '#nv-wrap{display:flex;gap:22px;align-items:center;justify-content:center;'
      + 'flex-wrap:wrap;flex-direction:row-reverse;}'
      + '@media(max-width:900px){#nv-wrap{flex-direction:column;gap:14px;}#nv-lb{width:min(440px,92vw);}}';
    var s = h('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function build() {
    var panel = h('aside', null); panel.id = 'nv-lb';
    panel.appendChild(h('h2', null, 'TOP PILOTS'));
    panel.appendChild(h('div', 'sub', 'NEON VOID · GLOBAL'));

    el.list = h('ol');
    panel.appendChild(el.list);

    var nameWrap = h('div');
    nameWrap.appendChild(h('label', null, 'YOUR HANDLE'));
    var row = h('div', 'row');
    el.input = h('input');
    el.input.maxLength = 20;
    el.input.placeholder = 'callsign…';
    el.input.value = getName();
    el.submit = h('button', null, 'SAVE');
    row.appendChild(el.input);
    row.appendChild(el.submit);
    nameWrap.appendChild(row);
    panel.appendChild(nameWrap);

    el.status = h('div', 'status');
    panel.appendChild(el.status);

    // Keep game keyboard controls from firing while typing a handle.
    ['keydown', 'keyup', 'keypress'].forEach(function (t) {
      el.input.addEventListener(t, function (e) { e.stopPropagation(); });
    });
    el.input.addEventListener('change', function () { setName(el.input.value.trim()); });
    el.input.addEventListener('input', function () { setName(el.input.value.trim()); });
    el.submit.addEventListener('click', onManualSubmit);

    return panel;
  }

  // Wrap the existing canvas + panel in a flex row so nothing overlaps the art.
  function mount(panel) {
    var canvas = document.getElementById('game');
    var wrap = h('div'); wrap.id = 'nv-wrap';
    canvas.parentNode.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);   // canvas first (row-reverse puts panel on the left visually)
    wrap.appendChild(panel);
  }

  function setStatus(msg, kind) {
    el.status.textContent = msg || '';
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function render(rows) {
    lastRows = rows || [];
    el.list.innerHTML = '';
    var me = getName().toLowerCase();
    if (!lastRows.length) {
      var e = h('li'); e.appendChild(h('div', 'empty', configured ? 'no scores yet — be the first!' : 'leaderboard offline'));
      el.list.appendChild(e);
      return;
    }
    lastRows.forEach(function (r, i) {
      var li = h('li', i < 3 ? 'top' : null);
      var key = (r.name || '') + '|' + r.score;
      if (me && (r.name || '').toLowerCase() === me) li.classList.add('me');
      if (highlightKey && key === highlightKey) li.classList.add('flash');
      li.appendChild(h('span', 'rk', '#' + (i + 1)));
      li.appendChild(h('span', 'nm', r.name || '???'));
      li.appendChild(h('span', 'sc', Number(r.score).toLocaleString()));
      el.list.appendChild(li);
    });
    highlightKey = null;
  }

  function refresh() {
    render(readCache()); // instant paint from cache
    return fetchTop().then(function (rows) {
      writeCache(rows);
      render(rows);
      return rows;
    }).catch(function () {
      if (!configured) setStatus('leaderboard not configured', 'err');
      else setStatus('offline — showing cached', 'err');
      render(readCache());
    });
  }

  function doSubmit(name, score, opts) {
    opts = opts || {};
    name = (name || '').trim().slice(0, 20);
    if (!name) { setStatus('enter a handle to save your score', 'err'); el.input.focus(); return Promise.resolve(false); }
    if (!(score > 0)) { setStatus('play a round first!', ''); return Promise.resolve(false); }
    setName(name);
    el.submit.disabled = true;
    setStatus(opts.auto ? 'saving your run…' : 'saving…', '');
    return submitScore(name, score).then(function () {
      highlightKey = name + '|' + score;
      setStatus('saved · ' + score.toLocaleString() + ' pts', 'ok');
      return refresh();
    }).catch(function (err) {
      setStatus('save failed — ' + (err && err.message ? err.message.slice(0, 40) : 'try again'), 'err');
    }).then(function () { el.submit.disabled = false; });
  }

  function onManualSubmit() {
    var g = window.__game;
    // On the game-over screen, SAVE submits this run; otherwise it just stores the handle.
    if (g && g.state === 'over' && g.score > 0) return doSubmit(el.input.value, g.score, {});
    setName(el.input.value.trim());
    setStatus(el.input.value.trim() ? 'handle saved' : '', 'ok');
  }

  // --- Observe the game ----------------------------------------------------
  var prevState = null;
  var submittedThisOver = false;

  function tick() {
    var g = window.__game;
    if (g) {
      if (g.state !== prevState) {
        if (g.state === 'over') {
          submittedThisOver = false;
          var nm = getName();
          if (nm && g.score > 0) {
            submittedThisOver = true;
            doSubmit(nm, g.score, { auto: true });
          } else if (g.score > 0) {
            setStatus('enter a handle, then SAVE your ' + g.score.toLocaleString() + ' pt run', '');
            el.input.focus();
          }
        } else if (g.state === 'play') {
          setStatus('');
        } else if (g.state === 'menu') {
          setStatus('');
        }
        prevState = g.state;
      }
    }
    requestAnimationFrame(tick);
  }

  function init() {
    injectStyles();
    var panel = build();
    mount(panel);
    refresh();
    requestAnimationFrame(tick);
    // expose for tests
    window.__lb = { refresh: refresh, submit: doSubmit, fetchTop: fetchTop, get rows() { return lastRows; }, configured: configured };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
