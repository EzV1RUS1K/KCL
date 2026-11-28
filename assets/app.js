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
    if (data && data.event) links.push(['event', '❄️ Winter Event', 'event.html']);
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

  /* ---------- winter event (1 Dec – 31 Jan): snow + banner, switched on by data.event ---------- */
  function winter(ev) {
    if (!ev) return;
    const now = Date.now() / 1000;
    const live = now >= ev.start && now < ev.end;
    document.head.append(h('style', {}, `
      .snow{position:fixed;inset:0;pointer-events:none;z-index:60}
      .winter{position:relative;margin:18px auto 6px;max-width:1100px;padding:18px 20px;border-radius:22px;
        border:3px solid #0B0B0B;box-shadow:0 6px 0 #0B0B0B;color:#0B2033;overflow:hidden;
        background:linear-gradient(135deg,#F4FBFF 0%,#CFEFFF 55%,#9ED8F5 100%)}
      .winter .wt{font-family:'Titan One',system-ui,sans-serif;font-size:28px;color:#fff;
        -webkit-text-stroke:2px #0B0B0B;paint-order:stroke fill;letter-spacing:.5px}
      .winter .ws{font-weight:900;margin-top:4px}
      .winter .x2{display:inline-block;margin-top:8px;padding:5px 12px;border-radius:999px;border:2px solid #0B0B0B;
        background:#E8473C;color:#fff;font-weight:900}
      .winter .x2.off{background:#fff;color:#0B2033}
      .winter .wtop{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .winter .wp{display:flex;align-items:center;gap:8px;padding:6px 10px 6px 6px;border-radius:999px;background:#fff;
        border:2px solid #0B0B0B;font-weight:800;font-size:14px}
      .winter .wp img,.winter .wp .ini{width:28px;height:28px;border-radius:50%;background:#5BC0EB;object-fit:cover;
        display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:#fff}
      .winter .flake{position:absolute;right:16px;top:8px;font-size:64px;opacity:.35;transform:rotate(12deg)}
      @media (max-width:600px){.winter{padding:14px}.winter .wt{font-size:23px}.winter .ws{font-size:13px}
        .winter .flake{display:none}.winter .wp:nth-child(n+4){display:none}}`));
    if (now >= ev.start - 7 * 86400 && now < ev.end) { snow(); decorate(); }

    const d = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const when = (t) => new Date(t * 1000).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    let status;
    if (now < ev.start) status = h('span', { class: 'x2 off' }, `Starts ${d(ev.start)}`);
    else if (!live) status = h('span', { class: 'x2 off' }, 'Event over · thanks for playing!');
    else if (ev.x2) status = h('span', { class: 'x2' }, `🎄 x${ev.mult} DAY · double Elo + snowflakes · until ${when(ev.x2_when)}`);
    else status = h('span', { class: 'x2 off' }, ev.x2_when ? `Next x${ev.mult} day: ${when(ev.x2_when)}` : 'Earn snowflakes in every ranked match');
    const top = [];
    const box = h('section', { class: 'winter', 'aria-label': 'Winter event' },
      h('span', { class: 'flake', 'aria-hidden': 'true' }, '❄️'),
      h('div', { class: 'wt' }, live || now < ev.start ? '❄️ WINTER EVENT' : '🏁 WINTER EVENT RESULTS'),
      h('div', { class: 'ws' }, `${d(ev.start)} – ${d(ev.end - 1)} · snowflakes for every ranked match · spend them on winter roles in the shop · ${ev.ticket} matches = giveaway ticket`),
      status, ' ', h('a', { class: 'x2 off', href: 'event.html', style: 'text-decoration:none' }, '🛒 Shop & details →'),
      top.length ? h('div', { class: 'wtop' }, top.map((p, i) => h('span', { class: 'wp' },
        p.avatar ? h('img', { src: p.avatar, alt: '', loading: 'lazy' }) : h('span', { class: 'ini' }, (p.name || '?').slice(0, 2).toUpperCase()),
        `${['🥇', '🥈', '🥉'][i] || `#${i + 1}`} ${p.name} · ${fmt(p.flakes)} ❄️`))) : null);
    const main = document.querySelector('main');
    if (main && page !== 'event') main.prepend(h('div', { class: 'wrap' }, reveal(box)));
  }

  /* ---------- winter event page ---------- */
  const DAY = 86400;
  const evHoliday = (ev) => ev.holiday || [Date.UTC(2026, 11, 24) / 1000, Date.UTC(2027, 0, 2) / 1000];
  // same rule as the bot: x2 Elo for wins on Saturdays/Sundays (UTC) and every day of the holiday week
  function isX2(ev, t) {
    if (t < ev.start || t >= ev.end) return false;
    const [a, b] = evHoliday(ev);
    if (t >= a && t < b) return true;
    const wd = new Date(t * 1000).getUTCDay();
    return wd === 0 || wd === 6;
  }
  function x2State(ev, now) {
    const on = isX2(ev, now);
    let t = now < ev.start ? ev.start : Math.floor(now / DAY) * DAY + DAY;
    while (t < ev.end && isX2(ev, t) === on) t += DAY;
    return { on, at: on ? Math.min(t, ev.end) : (t < ev.end ? t : 0) };
  }
  function dur(s) {
    s = Math.max(0, Math.floor(s));
    const d = Math.floor(s / DAY), hh = Math.floor(s % DAY / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return `${d ? `${d}d ` : ''}${p(hh)}:${p(mm)}:${p(ss)}`;
  }
  function eventPage(data) {
    const ev = data.event;
    const main = $('main');
    if (!ev) {
      main.replaceChildren(h('div', { class: 'notice' }, 'The Winter Event is not running right now.'));
      return;
    }
    const mult = ev.mult || 2, need = ev.ticket || 20;
    const dd = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const when = (t) => new Date(t * 1000).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    $('#ev-tag').textContent = `${dd(ev.start)} – ${dd(ev.end - 1)} · SNOWFLAKE SHOP · x${mult} DAYS`.toUpperCase();

    // live x2 status
    const card = $('#x2card');
    const tick = () => {
      const now = Date.now() / 1000, s = x2State(ev, now);
      let title, sub, count = null, on = false;
      if (now < ev.start) { title = 'STARTS SOON'; sub = `The event starts ${when(ev.start)}`; count = `in ${dur(ev.start - now)}`; }
      else if (now >= ev.end) { title = 'EVENT IS OVER'; sub = 'Thanks for playing! See the final top below.'; }
      else if (s.on) { on = true; title = `🎄 x${mult} DAY IS ON`; sub = `x${mult} Elo for wins + double snowflakes! Losses stay normal.`; count = `ends in ${dur(s.at - now)}`; }
      else { title = `x${mult} IS OFF`; sub = s.at ? `Next x${mult} day: ${when(s.at)}` : `No more x${mult} days this event.`; count = s.at ? `starts in ${dur(s.at - now)}` : null; }
      card.classList.toggle('on', on);
      card.replaceChildren(h('span', { class: 'x2-k' }, 'DOUBLE ELO + DOUBLE SNOWFLAKES'), h('span', { class: 'x2-t num' }, title),
        h('span', { class: 'x2-s' }, sub), count ? h('span', { class: 'x2-c' }, count) : null);
    };
    tick();
    setInterval(tick, 1000);

    // stats
    const top = ev.top || [];
    const now0 = Date.now() / 1000;
    const daysLeft = now0 < ev.start ? Math.ceil((ev.end - ev.start) / DAY) : Math.max(0, Math.ceil((ev.end - now0) / DAY));
    const players = ev.players != null ? ev.players : top.length;
    const tickets = ev.tickets != null ? ev.tickets : top.filter((p) => (p.matches || 0) >= need).length;
    const bought = ev.buys != null ? ev.buys : 0;
    $('#ev-stats').replaceChildren(...[[players, 'PLAYERS', ''], [bought, 'ROLES BOUGHT', ''], [daysLeft, 'DAYS LEFT', ' hot']].map(([v, l, c], i) =>
      reveal(h('div', { class: 'stat' + c }, counter(v), h('span', { class: 'label' }, l)), 250 + i * 90)));

    // snowflake shop
    const shop = ev.shop || [];
    const maxPrice = Math.max(0, ...shop.map((i) => i.price));
    $('#shop').replaceChildren(...shop.map((it) => reveal(h('div', { class: `item${it.price === maxPrice ? ' top' : ''}`, style: `--rc:${it.color || '#5BC0EB'}` },
      h('span', { class: 'ico', 'aria-hidden': 'true' }, it.emoji),
      h('span', { class: 'iname' }, it.name),
      h('span', { class: 'price' }, `${fmt(it.price)} ❄️`),
      h('span', { class: 'sold' }, it.sold ? `BOUGHT ${fmt(it.sold)}×` : 'NOBODY HAS IT YET')))));
    if (!shop.length) $('#shop').append(h('div', { class: 'notice' }, 'The shop opens when the event starts.'));
    // recent purchases (Roblox names only)
    const names = Object.fromEntries(shop.map((i) => [i.key, i]));
    const feed = ev.feed || [];
    $('#feed').replaceChildren(...(feed.length ? feed.map((f) => {
      const it = names[f.item] || { emoji: '🛒', name: f.item };
      return reveal(h('div', { class: 'fr' }, h('span', { style: 'font-size:22px' }, it.emoji),
        h('span', {}, h('b', {}, f.name), ` bought ${it.name}`), h('span', { class: 't' }, ago(f.t))));
    }) : [h('div', { class: 'empty' }, 'No purchases yet. Be the first! 🛒')]));

    // x2 calendar
    const cals = $('#cals');
    const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
    const first = new Date(ev.start * 1000), last = new Date((ev.end - 1) * 1000);
    for (let y = first.getUTCFullYear(), mo = first.getUTCMonth(); y < last.getUTCFullYear() || (y === last.getUTCFullYear() && mo <= last.getUTCMonth()); mo === 11 ? (y++, mo = 0) : mo++) {
      const name = new Date(Date.UTC(y, mo, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const grid = h('div', { class: 'cal-grid' }, ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => h('span', { class: 'dow' }, d)));
      const lead = (new Date(Date.UTC(y, mo, 1)).getUTCDay() + 6) % 7;
      for (let i = 0; i < lead; i++) grid.append(h('span', {}));
      const days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      for (let dnum = 1; dnum <= days; dnum++) {
        const t = Date.UTC(y, mo, dnum) / 1000;
        const inEv = t >= ev.start && t < ev.end;
        const cls = ['day', !inEv ? 'out' : '', inEv && isX2(ev, t + 3600) ? 'x2' : '', t < today ? 'past' : '', t === today ? 'today' : ''].filter(Boolean).join(' ');
        grid.append(h('span', { class: cls, title: inEv && isX2(ev, t + 3600) ? `x${mult} Elo for wins` : '' }, dnum));
      }
      cals.append(reveal(h('div', { class: 'cal' }, h('h3', {}, name), grid)));
    }

    // how to earn
    const pts = ev.points || { play: 1, win: 2, daily: 3, streak: 5 };
    $('#earn').replaceChildren(...[
      [`+${pts.play}`, 'PLAY A MATCH', 'Every ranked match counts, win or lose.'],
      [`+${pts.win}`, 'WIN', 'Extra snowflakes on top for winning.'],
      [`+${pts.daily}`, 'FIRST WIN OF THE DAY', 'Your first ranked win each day (UTC).'],
      [`+${pts.streak}`, '3 WINS IN A ROW', 'Every 3rd win in a row: 3rd, 6th, 9th…'],
      [`x${mult}`, 'ON x2 DAYS', 'Weekends + 24 Dec – 1 Jan: every snowflake above is doubled!'],
    ].map(([n, t, s], i) => reveal(h('div', { class: `mini${i === 4 ? ' hl' : ''}` },
      h('span', { class: 'earn-n' }, `${n} ❄️`), h('span', { style: 'font-weight:900;font-size:18px' }, t), h('span', { style: 'font-size:15px' }, s)))));

    // giveaway
    $('#rewards').replaceChildren(...[
      ['🎟️ HOW TO ENTER', `${need} RANKED MATCHES = 1 TICKET`, 'Play ranked during the event. Shop purchases don\'t affect your ticket.'],
      ['🎁 THE DRAW', `${fmt(tickets)} TICKET${tickets === 1 ? '' : 'S'} SO FAR`, 'The owners draw the winner(s) among all tickets when the event ends.'],
    ].map(([k, r, s2], i) => reveal(h('div', { class: `mini${i === 0 ? ' hl' : ''}` },
      h('span', { class: 'num', style: 'font-size:24px' }, k), h('span', { class: 'role-pill' }, r), h('span', { style: 'font-size:15px' }, s2)))));

    // fair play
    $('#fair').replaceChildren(h('ul', {},
      h('li', {}, 'Max 2 ranked matches per day against the same opponent.'),
      h('li', {}, 'Cancelled matches lose their snowflakes.'),
      h('li', {}, 'Cheaters are removed from the event and the giveaway.'),
      h('li', {}, `x${mult} Elo is only for wins. Losses always stay normal.`),
      h('li', {}, 'Snowflakes disappear when the event ends — spend them! Roles you bought stay forever.')));
  }
  /* winter look: icy background, garland, snow caps, Santa hat on #1, gifts, winter logo (styles in winter.css) */
  function decorate() {
    document.documentElement.classList.add('winter-on');
    document.head.append(h('link', { rel: 'stylesheet', href: 'assets/winter.css' }));
    document.querySelectorAll('.logo img').forEach((i) => { i.src = 'assets/winter-logo.gif'; });
    document.querySelectorAll('.foot-card img').forEach((i) => { i.src = 'assets/winter-logo.png'; });
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) icon.href = 'assets/winter-favicon.png';
    const colors = ['#FF4B4B', '#FFD21F', '#3DDC6B', '#3FA9FF', '#FFFFFF'];
    const garland = h('div', { class: 'garland', 'aria-hidden': 'true' });
    for (let i = 0; i < 40; i++) {
      garland.append(h('span', { class: 'bulb', style: `left:${i * 90 + 45}px;--c:${colors[i % colors.length]}` }));
    }
    const head = document.querySelector('#site-header');
    if (head) head.prepend(garland);
    const band = document.querySelector('.water');
    if (band) {
      band.append(h('img', { class: 'gifts hero-gift l', src: 'assets/gifts-left.png', alt: '', 'aria-hidden': 'true' }));
      band.append(h('img', { class: 'gifts hero-gift r', src: 'assets/gifts-right.png', alt: '', 'aria-hidden': 'true' }));
    }
    const foot = document.querySelector('#site-footer');
    if (foot) {
      foot.append(h('img', { class: 'gifts foot-gift l', src: 'assets/gifts-left.png', alt: '', 'aria-hidden': 'true' }));
      foot.append(h('img', { class: 'gifts foot-gift r', src: 'assets/gifts-right.png', alt: '', 'aria-hidden': 'true' }));
    }
  }
  function snow() {
    const c = h('canvas', { class: 'snow', 'aria-hidden': 'true' });
    document.body.append(c);
    const ctx = c.getContext('2d');
    let W, H, flakes;
    const size = () => {
      const r = window.devicePixelRatio || 1;
      W = innerWidth; H = innerHeight; c.width = W * r; c.height = H * r; c.style.width = `${W}px`; c.style.height = `${H}px`;
      ctx.setTransform(r, 0, 0, r, 0, 0);
      flakes = Array.from({ length: Math.round(Math.min(110, W / 12)) }, () => ({
        x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.6, s: 0.4 + Math.random() * 1.1, w: Math.random() * 6.28 }));
    };
    size();
    addEventListener('resize', () => { size(); if (REDUCED) draw(); });
    let frame = 0;
    const draw = () => {
      frame = 0;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const f of flakes) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
        if (REDUCED) continue;
        f.y += f.s; f.w += 0.01; f.x += Math.sin(f.w) * 0.4;
        if (f.y > H + 4) { f.y = -4; f.x = Math.random() * W; }
      }
      if (!REDUCED && !frame) frame = requestAnimationFrame(draw);
    };
    draw();
  }

  /* ---------- boot ---------- */
  bounceTitles();
  document.querySelectorAll('.h2, .formula, .hero-row .lead').forEach((el) => reveal(el));
  fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      // rank thresholds come from the bot (they can change between seasons)
      if (data.ranks) RANKS.forEach((r) => { if (data.ranks[r.key] != null) r.min = data.ranks[r.key]; });
      chrome(data);
      try { winter(data.event); } catch (e) { /* decoration only */ }
      if (page === 'leaderboard') leaderboard(data);
      if (page === 'clans') clans(data);
      if (page === 'event') eventPage(data);
    })
    .catch(() => {
      chrome(null);
      const main = document.querySelector('main');
      if (main) main.prepend(h('div', { class: 'notice' }, 'Could not load the league data right now. Try again in a minute.'));
    });
})();
