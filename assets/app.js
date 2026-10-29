/* KCL website — renders the pages from data.json (written by the KCL Discord bot). */
(function () {
  'use strict';

  const RANKS = [
    { key: 'WRAITH', name: 'Wraith', min: 1000, color: '#E8473C' },
    { key: 'SHADE', name: 'Shade', min: 800, color: '#6B4FD8' },
    { key: 'PHANTOM', name: 'Phantom', min: 600, color: '#0F4CFC' },
    { key: 'STALKER', name: 'Stalker', min: 400, color: '#4F7FA8' },
    { key: 'LURKER', name: 'Lurker', min: 200, color: '#5B6672' },
    { key: 'ROOKIE', name: 'Rookie', min: 0, color: '#B65E22' },
  ];
  const REGIONS = [['ALL', 'All regions'], ['EU', 'EU'], ['NA', 'NA'], ['ASIA', 'Asia']];
  const rankOf = (elo) => RANKS.find((r) => elo >= r.min) || RANKS[RANKS.length - 1];
  const page = document.body.dataset.page;
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* DOM helper: text is always set as text, never as HTML */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  function ago(ts) {
    const s = Math.max(0, Date.now() / 1000 - ts);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    const d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  function avatar(p, size) {
    const r = rankOf(p.elo);
    const box = h('span', { class: 'avatar', style: `width:${size}px;height:${size}px;background:${r.color};font-size:${Math.round(size / 3)}px` });
    const ini = (p.name || '?').slice(0, 2).toUpperCase();
    if (p.avatar) {
      const img = h('img', { src: p.avatar, alt: '', loading: 'lazy', width: size, height: size });
      img.addEventListener('error', () => { img.remove(); box.textContent = ini; });
      box.append(img);
    } else box.textContent = ini;
    return box;
  }
  const badge = (elo) => { const r = rankOf(elo); return h('span', { class: 'badge', style: `background:${r.color}` }, r.name.toUpperCase()); };
  const clanTag = (tag, dark) => (tag ? h('span', { class: dark ? 'clan-tag dark' : 'clan-tag' }, tag) : null);
  function emblem(c, size) {
    const tagSize = Math.round(size / (c.tag.length > 3 ? 3.6 : 3));
    const box = h('span', { class: 'emblem', style: `width:${size}px;height:${size}px;background:${c.color || '#0B0B0B'};font-size:${tagSize}px` });
    if (c.logo) {
      /* clan logo = the clan role's icon on Discord; falls back to the tag if it can't load */
      box.classList.add('has-logo');
      box.append(h('img', { src: c.logo, alt: c.tag, loading: 'lazy',
        onerror: () => { box.classList.remove('has-logo'); box.textContent = c.tag; } }));
    } else if (c.emoji) {
      box.style.fontSize = `${Math.round(size * 0.55)}px`;
      box.style.fontFamily = 'system-ui, sans-serif';
      box.textContent = c.emoji;
    } else box.textContent = c.tag;
    return box;
  }

  /* ---------- animations ---------- */
  // run fn once the element scrolls into view (right away if the browser can't tell)
  const waiting = new Map();
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
    let k = 0;
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const fn = waiting.get(e.target);
      waiting.delete(e.target);
      if (fn) fn(k++);
    });
  }, { rootMargin: '0px 0px -40px 0px' }) : null;
  function whenVisible(el, fn) {
    if (!io) return fn(0);
    waiting.set(el, fn);
    io.observe(el);
  }
  // slide/pop an element in when it becomes visible; `extra` = extra delay in ms
  function reveal(el, extra) {
    if (REDUCED || !el) return el;
    el.classList.add('rv');
    whenVisible(el, (k) => {
      el.style.setProperty('--d', `${(extra || 0) + Math.min(k, 12) * 55}ms`);
      requestAnimationFrame(() => el.classList.add('in'));
      const done = (e) => {
        if (e.target !== el || e.propertyName !== 'transform') return;
        el.removeEventListener('transitionend', done);
        el.classList.remove('rv', 'in');
        el.style.removeProperty('--d');
      };
      el.addEventListener('transitionend', done);
    });
    return el;
  }
  // number that counts up from 0 when it becomes visible
  function counter(value, cls, text) {
    const el = h('span', { class: cls || 'num' }, text || fmt(value));
    const to = Number(value) || 0;
    if (REDUCED || text || to <= 0) return el;
    el.textContent = '0';
    whenVisible(el, () => {
      const start = performance.now(), dur = Math.min(1400, 600 + to / 3);
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return el;
  }
  // big titles: letters jump in one by one, and jump again under the mouse
  function bounceTitles() {
    document.querySelectorAll('.h1').forEach((title) => {
      const text = title.textContent.trim();
      title.setAttribute('aria-label', text);
      title.textContent = '';
      let i = 0;
      text.split(' ').forEach((word, n) => {
        if (n) title.append(' ');
        const w = h('span', { class: 'word', 'aria-hidden': 'true' });
        [...word].forEach((ch) => {
          const l = h('span', { class: 'ltr', style: REDUCED ? null : `animation-delay:${120 + i++ * 60}ms` }, ch);
          if (!REDUCED) {
            l.addEventListener('mouseenter', () => { l.classList.remove('in-done'); l.classList.add('jump'); });
            l.addEventListener('animationend', () => { l.classList.remove('jump'); l.classList.add('in-done'); });
          }
          w.append(l);
        });
        title.append(w);
      });
    });
  }

  /* header + footer */
  function chrome(data) {
    const links = [['leaderboard', 'Leaderboard', 'index.html'], ['clans', 'Clans', 'clans.html']];
    const invite = data && data.invite;
    $('#site-header').append(h('div', { class: 'wrap site-header' },
      h('a', { href: 'index.html', class: 'logo', 'aria-label': 'KCL home' }, h('img', { src: 'assets/logo.png', alt: 'KCL', width: 60, height: 60 })),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, links.map(([k, label, href]) =>
        h('a', { href, class: 'pill', 'aria-current': k === page ? 'page' : null }, label))),
      h('a', { href: invite || '#', class: 'btn', target: invite ? '_blank' : null, rel: invite ? 'noopener' : null }, 'Join Discord')));
    $('#site-footer').append(h('div', { class: 'wrap site-footer' },
      h('div', { class: 'foot-card' }, h('img', { src: 'assets/logo.png', alt: '', width: 44, height: 44 }),
        h('span', {}, 'Knife Competitive League · fan-made, not affiliated with Roblox')),
      h('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:14px' },
        data && data.updated ? h('span', { class: 'updated foot-card' }, `Updated ${ago(data.updated)}`) : null,
        h('a', { href: invite || '#', class: 'btn', target: invite ? '_blank' : null, rel: invite ? 'noopener' : null }, 'Join the Discord'))));
  }

  /* ---------- leaderboard ---------- */
  function leaderboard(data) {
    const s = data.stats || {};
    $('#season').textContent = `SEASON ${data.season || 1} · RANKED 1V1 · KNIFE ONLY`;
    $('#min-games').textContent = data.min_games || 5;
    $('#stats').replaceChildren(
      ...[[s.players, 'PLAYERS', ''], [s.matches, 'MATCHES', ''], [s.live, 'LIVE NOW', ' hot']].map(([v, l, c], i) =>
        reveal(h('div', { class: 'stat' + c }, counter(v),
          h('span', { class: 'label' }, l === 'LIVE NOW' && v > 0 ? h('span', { class: 'live-dot' }) : null, l)), 250 + i * 90)));

    const players = data.players || [];
    const podium = $('#podium');
    if (!players.length) {
      podium.replaceWith(h('div', { class: 'notice' }, `No ranked players yet. Play ${data.min_games || 5} ranked matches to get on the board!`));
    } else {
      players.slice(0, 3).forEach((p) => {
        podium.append(reveal(h('div', { class: `pod p${p.place}${p.place === 1 ? ' first' : ''}` },
          h('div', { class: 'pod-top' },
            h('span', { class: 'pop pod-place', style: `color:${p.place === 1 ? '#FFFFFF' : p.place === 2 ? '#C9D4E0' : '#E0894A'}` }, `#${p.place}`),
            clanTag(p.clan, true)),
          h('div', { class: 'who' }, avatar(p, 64),
            h('div', { style: 'display:flex;flex-direction:column;gap:4px;min-width:0' }, h('span', { class: 'name' }, p.name), h('span', {}, badge(p.elo)))),
          h('div', { class: 'pod-bottom' }, counter(p.elo), h('span', { style: 'font-weight:900' }, `${p.w}W · ${p.l}L`))),
          { 1: 420, 2: 200, 3: 0 }[p.place]));
      });
    }

    let q = (new URLSearchParams(location.search).get('q') || '').trim().toLowerCase();
    let rank = 'ALL', region = 'ALL';
    const search = $('#search');
    search.value = q;
    search.addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
    const regionBox = $('#regions'), rankBox = $('#ranks');
    REGIONS.forEach(([k, label]) => regionBox.append(h('button', { type: 'button', class: 'chip region', 'data-k': k, 'aria-pressed': k === region ? 'true' : 'false',
      onclick: () => { region = k; press(regionBox, k); draw(); } }, label)));
    [['ALL', 'All ranks', '#FFFFFF'], ...RANKS.map((r) => [r.key, r.name, r.color])].forEach(([k, label, color]) =>
      rankBox.append(h('button', { type: 'button', class: 'chip small', 'data-k': k, 'aria-pressed': k === rank ? 'true' : 'false',
        onclick: () => { rank = k; press(rankBox, k); draw(); } }, h('span', { class: 'dot', style: `background:${color}` }), label)));
    function press(box, k) { box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === k ? 'true' : 'false')); }

    const rows = $('#rows'), empty = $('#empty');
    function draw() {
      const list = players.filter((p) => (!q || p.name.toLowerCase().includes(q) || (p.clan || '').toLowerCase() === q)
        && (rank === 'ALL' || rankOf(p.elo).key === rank) && (region === 'ALL' || p.region === region));
      // the podium players are in the list only when someone searches or filters
      const show = (q || rank !== 'ALL' || region !== 'ALL') ? list : list.filter((p) => p.place > 3);
      rows.replaceChildren(...show.map((p) => {
        const games = p.w + p.l;
        return reveal(h('div', { class: 'row', role: 'row' },
          h('span', { class: 'place', role: 'cell' }, p.place),
          h('span', { class: 'player', role: 'cell' }, avatar(p, 40),
            h('div', {}, h('div', { style: 'display:flex;align-items:center;gap:8px;min-width:0' }, h('span', { class: 'pname' }, p.name), clanTag(p.clan)),
              h('div', { class: 'meta' }, `${rankOf(p.elo).name} · ${p.w}W ${p.l}L`))),
          h('span', { class: 'rankcell', role: 'cell' }, badge(p.elo)),
          h('span', { class: 'elo', role: 'cell' }, fmt(p.elo)),
          h('span', { class: 'right wlcell', role: 'cell' }, `${p.w} / ${p.l}`),
          h('span', { class: 'right wrcell', role: 'cell' }, games ? `${Math.round(p.w / games * 100)}%` : '—'),
          h('span', { class: 'formcell', role: 'cell' }, h('span', { class: 'form', 'aria-label': `Last results: ${p.form || 'none'}` },
            (p.form || '').split('').map((t) => h('span', { class: `wl ${t}` }, t))))));
      }));
      empty.hidden = show.length > 0;
      empty.textContent = players.length > 3 || q || rank !== 'ALL' || region !== 'ALL'
        ? 'No players match this search.' : 'Only the top 3 so far. Play ranked to join them!';
    }
    draw();
  }

  /* ---------- clans ---------- */
  function clans(data) {
    const list = data.clans || [];
    $('#season').textContent = `SEASON ${data.season || 1} · ${list.length} REGISTERED CLAN${list.length === 1 ? '' : 'S'}`;
    const rank = $('#clan-rank');
    if (!list.length) rank.append(h('div', { class: 'notice' }, 'No clans registered yet. Clan owners register through a ticket on the Discord.'));
    list.forEach((c) => rank.append(reveal(h('div', { class: `clan-row${c.place === 1 ? ' first' : ''}` },
      h('span', { class: 'num', style: 'font-size:26px' }, `#${c.place}`),
      emblem(c, 60),
      h('div', { style: 'display:flex;flex-direction:column;gap:6px;min-width:0' },
        h('span', { style: 'font-weight:900;font-size:20px' }, c.tag),
        h('div', { class: 'facts' }, h('span', { class: 'fact' }, `avg Elo ${fmt(c.avg)}`),
          h('span', { class: 'fact' }, `wars ${c.w}W / ${c.l}L`), h('span', { class: 'fact' }, `${c.members} members`))),
      h('div', { class: 'score' }, counter(c.score), h('span', {}, 'SCORE'))))));

    const colors = Object.fromEntries(list.map((c) => [c.tag, c]));
    const wars = $('#wars');
    const warList = data.wars || [];
    if (!warList.length) wars.append(h('div', { class: 'notice', style: 'grid-column:1/-1' }, 'No clan wars yet this season.'));
    warList.slice(0, 6).forEach((w) => {
      const side = (tag) => h('span', { class: 'side' }, emblem(colors[tag] || { tag, color: '#0B0B0B' }, 46), h('span', {}, tag));
      wars.append(reveal(h('div', { class: 'mini' },
        h('div', { class: 'mini-top' }, h('span', {}, `CLAN WAR #${w.id}`), h('span', {}, w.t ? ago(w.t) : '')),
        h('div', { class: 'vs' }, side(w.a), h('span', { class: 'num', style: 'font-size:18px' }, 'VS'), side(w.b)),
        h('span', { class: 'winner' }, `${w.winner} won · +25 score`))));
    });

    const cards = $('#clan-cards');
    list.forEach((c) => cards.append(reveal(h('div', { class: 'mini' },
      h('div', { style: 'display:flex;align-items:center;gap:12px' }, emblem(c, 52),
        h('div', { style: 'display:flex;flex-direction:column' }, h('span', { style: 'font-weight:900;font-size:19px' }, c.tag),
          h('span', { style: 'font-size:13px;color:#33404D' }, `#${c.place} · score ${fmt(c.score)}`))),
      h('div', { class: 'boxes' },
        ...[['MEMBERS', c.members], ['ROSTER', `${c.roster}/10`], ['AVG ELO', fmt(c.avg)], ['WARS', `${c.w}–${c.l}`]].map(([k, v]) =>
          h('div', { class: 'box' }, h('div', { class: 'k' }, k), h('div', { class: 'num' }, v))))))));
  }

  /* ---------- boot ---------- */
  bounceTitles();
  document.querySelectorAll('.h2, .formula, .hero-row .lead').forEach((el) => reveal(el));
  fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      chrome(data);
      if (page === 'leaderboard') leaderboard(data);
      if (page === 'clans') clans(data);
    })
    .catch(() => {
      chrome(null);
      const main = document.querySelector('main');
      if (main) main.prepend(h('div', { class: 'notice' }, 'Could not load the league data right now. Try again in a minute.'));
    });
})();
