/* ARQ website — renders every page from data.json (written by the ARQ Discord bot). */
(function () {
  'use strict';

  const RANKS = [
    { key: 'RUSTY', name: 'Rusty', min: 0, color: '#C27A3A' },
    { key: 'IRON', name: 'Iron', min: 200, color: '#8C98A6' },
    { key: 'STEEL', name: 'Steel', min: 400, color: '#9FB3C8' },
    { key: 'DAMASCUS', name: 'Damascus', min: 600, color: '#4FA3FF' },
    { key: 'OBSIDIAN', name: 'Obsidian', min: 800, color: '#8D72E6' },
    { key: 'BLADELORD', name: 'Bladelord', min: 1000, color: '#E8473C' },
  ];
  const rankOf = (elo) => RANKS.slice().reverse().find((r) => elo >= r.min) || RANKS[0];
  const page = document.body.dataset.page;
  const $ = (sel) => document.querySelector(sel);

  /* ---------- tiny DOM helper (text is always set as text, never as HTML) ---------- */
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
  const fmt = (n) => Number(n).toLocaleString('en-US');
  function ago(ts) {
    const s = Math.max(0, Date.now() / 1000 - ts);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    const d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  const playerUrl = (p) => (p && p.id ? `player.html?id=${encodeURIComponent(p.id)}` : null);

  function avatar(p, size) {
    const rank = rankOf(p ? p.elo : 0);
    const box = h('span', { class: 'avatar', style: `width:${size}px;height:${size}px;border-color:${rank.color};font-size:${Math.round(size / 3)}px` });
    if (p && p.avatar) {
      const img = h('img', { src: p.avatar, alt: '', loading: 'lazy', width: size, height: size });
      img.addEventListener('error', () => { img.remove(); box.textContent = initials(p); });
      box.append(img);
    } else box.textContent = initials(p);
    return box;
  }
  const initials = (p) => (p && p.name ? p.name.slice(0, 2).toUpperCase() : '?');
  const rankTag = (elo) => { const r = rankOf(elo); return h('span', { class: 'rank' }, h('span', { class: 'dot', style: `background:${r.color}` }), r.name); };
  const nameLink = (p, cls) => { const url = playerUrl(p); return url ? h('a', { href: url, class: cls }, p.name) : h('span', { class: cls }, p ? p.name : 'Unknown'); };

  /* ---------- shared header / footer ---------- */
  const LOGO = `<svg width="108" height="36" viewBox="0 0 1200 400" aria-hidden="true">
    <text x="600" y="275" text-anchor="middle" fill="#ECECEA" style="font-family:'Archivo','Arial Black',sans-serif;font-weight:900;font-stretch:125%;font-size:240px;letter-spacing:-6px">ARQ</text>
    <polygon points="40,188 600,180 1160,188 600,196" fill="#0E0F12"></polygon>
    <polygon points="600,120 608,180 668,188 608,196 600,256 592,196 532,188 592,180" fill="#0E0F12"></polygon>
    <polygon points="600,150 604,184 638,188 604,192 600,226 596,192 562,188 596,184" fill="#E8473C"></polygon></svg>`;

  function chrome(data) {
    const links = [['leaderboard', 'Leaderboard', 'leaderboard.html'], ['matches', 'Matches', 'matches.html'],
      ['hall', 'Hall of Fame', 'hall.html'], ['how', 'How to play', 'how.html']];
    const header = $('#site-header');
    if (header) {
      header.className = 'site-header';
      const logo = h('a', { href: 'index.html', class: 'logo', 'aria-label': 'ARQ home' });
      logo.innerHTML = LOGO; // static markup written above, no data inside
      header.append(h('div', { class: 'wrap' }, logo,
        h('nav', { class: 'nav', 'aria-label': 'Main' },
          links.map(([key, label, href]) => h('a', { href, 'aria-current': key === page ? 'page' : null }, label))),
        joinButton(data, 'btn btn-primary')));
    }
    const footer = $('#site-footer');
    if (footer) {
      footer.className = 'site-footer';
      footer.append(h('div', { class: 'wrap' },
        h('span', {}, 'ARQ is a fan-made community league. Not affiliated with Roblox or Nosniy Games.'),
        h('span', { class: 'mono' }, data && data.updated ? `Data updated ${ago(data.updated)}` : 'KNIFE DAMAGE ONLY · ARENA')));
    }
  }
  function joinButton(data, cls, label) {
    const invite = data && data.invite;
    return h('a', { href: invite || 'how.html', class: cls, target: invite ? '_blank' : null, rel: invite ? 'noopener' : null }, label || 'Join Discord');
  }

  /* ---------- reusable blocks ---------- */
  function leaderList(players, limit) {
    const box = h('div', { class: 'boxed' });
    const ranked = players.filter((p) => p.place).sort((a, b) => a.place - b.place).slice(0, limit);
    if (!ranked.length) box.append(h('div', { class: 'empty' }, 'No ranked players yet. Play 5 ranked matches to appear here.'));
    ranked.forEach((p) => box.append(h('div', { class: 'list-row' },
      h('span', { class: `mono place-${p.place}` }, p.place),
      h('span', { class: 'who' }, avatar(p, 32), h('b', {}, nameLink(p))),
      rankTag(p.elo),
      h('span', { class: 'mono', style: 'font-weight:600;min-width:52px;text-align:right' }, fmt(p.elo)))));
    return box;
  }
  function matchCard(m, byId) {
    const w = byId[m.w], l = byId[m.l];
    return h('div', { class: 'match' },
      h('div', { class: 'meta' }, h('span', {}, `RANKED #${m.id} · ARENA`), h('span', {}, ago(m.t))),
      h('div', { class: 'rule' }),
      h('div', { class: 'side' }, h('span', { style: 'font-weight:700' }, 'WINNER · ', nameLink(w || { name: m.wn })),
        h('span', { class: 'mono' }, `${m.wf} → ${m.wt} `, h('span', { class: 'up' }, `+${m.wt - m.wf}`))),
      h('div', { class: 'side muted' }, h('span', {}, 'LOSER · ', nameLink(l || { name: m.ln })),
        h('span', { class: 'mono' }, `${m.lf} → ${m.lt} `, h('span', { class: 'down' }, `−${m.lf - m.lt}`))),
      h('div', { class: 'rule' }));
  }
  const byIdOf = (data) => Object.fromEntries(data.players.filter((p) => p.id).map((p) => [p.id, p]));

  /* ---------- pages ---------- */
  const pages = {
    home(data) {
      const ranked = data.players.filter((p) => p.place).sort((a, b) => a.place - b.place);
      const top3 = $('#top3');
      if (!ranked.length) top3.append(h('div', { class: 'muted' }, 'The season just started. Be the first on the board!'));
      ranked.slice(0, 3).forEach((p) => top3.append(h('div', { class: 'list-row', style: 'grid-template-columns:30px minmax(0,1fr) auto;border-top:1px solid var(--line);border-bottom:0;padding:14px 0' },
        h('span', { class: `mono place-${p.place}`, style: 'font-size:22px;font-weight:600' }, p.place),
        h('span', { class: 'who' }, avatar(p, 52), h('span', { class: 'stack', style: 'gap:4px' }, h('b', { style: 'font-size:17px' }, nameLink(p)), rankTag(p.elo))),
        h('span', { class: 'mono', style: 'font-size:22px;font-weight:600' }, fmt(p.elo)))));
      $('#season-label').textContent = `SEASON ${data.season} · TOP 3`;
      $('#eyebrow').textContent = `ROBLOX RIVALS · RANKED 1V1 · SEASON ${data.season}`;
      const s = data.stats || {};
      $('#stats').append(...[[fmt(s.players || 0), 'PLAYERS'], [fmt(s.ranked_matches || 0), 'RANKED MATCHES'],
        [fmt(s.live || 0), 'LIVE NOW'], [`S${data.season}`, 'CURRENT SEASON']].map(([v, l]) =>
        h('div', {}, h('div', { class: 'stat-value' }, v), h('div', { class: 'stat-label' }, l))));
      $('#top5').append(leaderList(data.players, 5));
      const byId = byIdOf(data);
      const recent = $('#recent');
      if (!data.matches.length) recent.append(h('div', { class: 'notice' }, 'No ranked matches yet this season.'));
      data.matches.slice(0, 3).forEach((m) => recent.append(matchCard(m, byId)));
      document.querySelectorAll('[data-join]').forEach((a) => a.replaceWith(joinButton(data, a.className, a.textContent)));
      const last = (data.seasons || [])[0];
      const champ = $('#champion');
      if (last && last.top && last.top.length) {
        const c = last.top[0];
        champ.hidden = false;
        $('#champ-label').textContent = `HALL OF FAME · SEASON ${last.season} CHAMPION`;
        $('#champ-name').textContent = c.name;
        $('#champ-meta').textContent = `Finished Season ${last.season} at ${fmt(c.rating)} Elo · ${c.w} wins`;
      }
    },

    leaderboard(data) {
      $('#lb-season').textContent = `SEASON ${data.season}`;
      $('#lb-meta').textContent = `${fmt(data.players.length)} players · 5+ ranked matches to appear · updated ${ago(data.updated)}`;
      let rank = 'ALL', q = '';
      const chips = $('#chips'), body = $('#rows'), empty = $('#empty');
      const keys = ['ALL', ...RANKS.map((r) => r.key).reverse()];
      keys.forEach((k) => {
        const r = RANKS.find((x) => x.key === k);
        chips.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': k === rank ? 'true' : 'false', 'data-key': k,
          onclick: () => { rank = k; chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.key === k ? 'true' : 'false')); draw(); } },
          h('span', { class: 'dot', style: `background:${r ? r.color : '#ECECEA'}` }), r ? r.name : 'All ranks'));
      });
      $('#search').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
      const ranked = data.players.filter((p) => p.place).sort((a, b) => a.place - b.place);
      function draw() {
        body.replaceChildren();
        const rows = ranked.filter((p) => (rank === 'ALL' || rankOf(p.elo).key === rank) && (!q || p.name.toLowerCase().includes(q)));
        rows.forEach((p) => {
          const games = p.w + p.l;
          body.append(h('tr', { class: p.place <= 3 ? 'top' : '' },
            h('td', { class: `mono place-${p.place}`, style: 'font-weight:600;width:56px' }, p.place),
            h('td', {}, h('span', { class: 'who' }, avatar(p, 36), h('b', {}, nameLink(p)))),
            h('td', {}, rankTag(p.elo)),
            h('td', { class: 'num', style: 'font-weight:600;font-size:16px' }, fmt(p.elo)),
            h('td', { class: 'num' }, p.w),
            h('td', { class: 'num muted' }, p.l),
            h('td', { class: 'num' }, games ? `${Math.round(p.w / games * 100)}%` : '—'),
            h('td', {}, h('span', { class: 'form', 'aria-label': `Last results: ${p.form || 'none'}` },
              (p.form || '').split('').map((t) => h('span', { class: `wl ${t}` }, t))))));
        });
        empty.hidden = rows.length > 0;
        empty.textContent = ranked.length ? 'No players match this search.' : 'No ranked players yet. Play 5 ranked matches to appear here.';
      }
      draw();
    },

    player(data) {
      const id = new URLSearchParams(location.search).get('id');
      const p = data.players.find((x) => String(x.id) === id);
      const root = $('#profile');
      if (!p) {
        root.append(h('div', { class: 'notice' }, 'Player not found. They may not be verified yet, or the link is old. ',
          h('a', { href: 'leaderboard.html', style: 'color:var(--accent);font-weight:700' }, 'Open the leaderboard')));
        return;
      }
      document.title = `${p.name} — ARQ`;
      const r = rankOf(p.elo), games = p.w + p.l;
      root.append(h('div', { class: 'profile-head' }, avatar(p, 120),
        h('div', { class: 'stack', style: 'gap:10px;flex:1 1 320px' },
          h('div', { class: 'eyebrow' }, p.place ? `#${p.place} · SEASON ${data.season}` : `SEASON ${data.season}`),
          h('h1', { class: 'h1 sm', style: 'overflow-wrap:anywhere' }, p.name),
          h('div', { class: 'row' }, h('span', { class: 'badge', style: `border-color:${r.color}` }, h('span', { class: 'dot', style: `background:${r.color}` }), r.name.toUpperCase()),
            h('span', { class: 'muted', style: 'font-size:14px' }, 'Verified Roblox account')))));
      const best = Math.max(p.elo, ...(p.history || [p.elo]));
      const streak = (() => { const f = (p.form || ''); if (!f) return '—'; const last = f[f.length - 1]; let n = 0; for (let i = f.length - 1; i >= 0 && f[i] === last; i--) n++; return `${last}${n}`; })();
      root.append(h('div', { class: 'pstats' }, [['ELO', fmt(p.elo)], ['RANKED MATCHES', games], ['WINS / LOSSES', `${p.w} / ${p.l}`],
        ['WIN RATE', games ? `${Math.round(p.w / games * 100)}%` : '—'], ['BEST ELO', fmt(best)], ['STREAK', streak]]
        .map(([l, v]) => h('div', {}, h('span', { class: 'label' }, l), h('span', { class: 'value' }, v)))));
      root.append(h('div', { class: 'section', style: 'padding-bottom:0' }, chart(p.history || [])));
      const byId = byIdOf(data);
      const mine = data.matches.filter((m) => m.w === p.id || m.l === p.id).slice(0, 10);
      const list = h('div', { class: 'boxed' });
      if (!mine.length) list.append(h('div', { class: 'empty' }, 'No ranked matches this season yet.'));
      mine.forEach((m) => {
        const won = m.w === p.id, opp = byId[won ? m.l : m.w] || { name: won ? m.ln : m.wn };
        const delta = won ? m.wt - m.wf : m.lt - m.lf;
        list.append(h('div', { class: 'list-row', style: 'grid-template-columns:34px minmax(0,1fr) auto auto' },
          h('span', { class: `wl ${won ? 'W' : 'L'}`, style: 'width:26px;height:26px;font-size:12px' }, won ? 'W' : 'L'),
          h('span', { class: 'who' }, h('span', {}, 'vs ', h('b', {}, nameLink(opp)), h('span', { class: 'muted', style: 'font-size:13px' }, ` · ${ago(m.t)}`))),
          h('span', { class: `mono ${won ? 'up' : 'down'}` }, won ? `+${delta}` : `−${Math.abs(delta)}`),
          h('span', { class: 'mono muted', style: 'min-width:44px;text-align:right' }, won ? m.wt : m.lt)));
      });
      const seasons = h('div', { class: 'stack', style: 'gap:12px' });
      (p.seasons || []).forEach((s) => seasons.append(h('div', { class: s.place === 1 ? 'gold-box' : 'boxed', style: 'padding:20px;display:flex;justify-content:space-between;align-items:center;gap:16px' },
        h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'gold-eyebrow' }, `SEASON ${s.season}${s.place === 1 ? ' · CHAMPION' : ''}`),
          h('b', { style: 'font-size:18px' }, `#${s.place} · ${fmt(s.rating)} Elo`)),
        h('span', { class: 'mono muted', style: 'font-size:13px' }, `${s.w}W / ${s.l}L`))));
      seasons.append(h('div', { class: 'boxed', style: 'padding:20px;display:flex;justify-content:space-between;align-items:center;gap:16px' },
        h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'eyebrow', style: 'font-size:12px;letter-spacing:.16em' }, `SEASON ${data.season} · NOW`),
          h('b', { style: 'font-size:18px' }, p.place ? `#${p.place} · ${fmt(p.elo)} Elo` : `${fmt(p.elo)} Elo · not in the top yet`)),
        h('span', { class: 'mono muted', style: 'font-size:13px' }, `${p.w}W / ${p.l}L`)));
      root.append(h('div', { class: 'split section' },
        h('div', { class: 'stack' }, h('h2', { class: 'h2' }, 'RECENT MATCHES'), list),
        h('div', { class: 'stack' }, h('h2', { class: 'h2' }, 'SEASONS'), seasons)));
    },

    matches(data) {
      const byId = byIdOf(data);
      const box = $('#match-list');
      let q = '';
      function draw() {
        box.replaceChildren();
        const rows = data.matches.filter((m) => !q || [m.wn, m.ln].some((n) => (n || '').toLowerCase().includes(q)));
        if (!rows.length) box.append(h('div', { class: 'notice' }, data.matches.length ? 'No matches for this player.' : 'No ranked matches yet this season.'));
        rows.forEach((m) => box.append(matchCard(m, byId)));
      }
      $('#match-search').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
      $('#m-season').textContent = `SEASON ${data.season} · LAST ${data.matches.length} RANKED MATCHES`;
      draw();
    },

    hall(data) {
      const box = $('#seasons');
      if (!(data.seasons || []).length) {
        box.append(h('div', { class: 'notice' }, `Season ${data.season} is the first season. When it ends, its top 20 will be saved here forever.`));
        return;
      }
      data.seasons.forEach((s) => {
        const champ = s.top[0];
        box.append(h('section', { class: 'stack section', style: 'padding-top:24px' },
          h('div', { class: 'gold-box' },
            h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'gold-eyebrow' }, `SEASON ${s.season} · CHAMPION`),
              h('span', { style: 'font-weight:900;font-stretch:125%;font-size:34px' }, champ ? nameLink(champ) : '—'),
              h('span', { class: 'muted' }, champ ? `${fmt(champ.rating)} Elo · ${champ.w}W / ${champ.l}L` : '')),
            h('span', { class: 'mono muted' }, s.ended ? `Ended ${new Date(s.ended * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : '')),
          h('div', { class: 'boxed' }, s.top.map((p) => h('div', { class: 'list-row' },
            h('span', { class: `mono place-${p.place}` }, p.place),
            h('span', { class: 'who' }, h('b', {}, nameLink(p))),
            rankTag(p.rating),
            h('span', { class: 'mono', style: 'font-weight:600;min-width:52px;text-align:right' }, fmt(p.rating)))))));
      });
    },

    how(data) {
      document.querySelectorAll('[data-join]').forEach((a) => a.replaceWith(joinButton(data, a.className, a.textContent)));
    },
  };

  function chart(vals) {
    const box = h('div', { class: 'chart' });
    box.append(h('div', { class: 'head-row' }, h('h2', { class: 'h2', style: 'font-size:24px' }, `ELO · LAST ${Math.max(0, vals.length - 1)} MATCHES`),
      vals.length > 1 ? h('span', { class: 'mono muted', style: 'font-size:13px' }, `${vals[0]} → ${vals[vals.length - 1]}`) : null));
    if (vals.length < 2) { box.append(h('div', { class: 'muted' }, 'The chart appears after the first ranked match this season.')); return box; }
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 40) / 100) * 100);
    const hi = Math.ceil((Math.max(...vals) + 40) / 100) * 100;
    const W = 1000, H = 270, L = 48, R = 980, T = 20, B = 240;
    const X = (i) => L + i * ((R - L) / (vals.length - 1));
    const Y = (v) => T + (hi - v) / (hi - lo) * (B - T);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Elo went from ${vals[0]} to ${vals[vals.length - 1]}`);
    const add = (tag, attrs, text) => { const el = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); if (text !== undefined) el.textContent = text; svg.append(el); return el; };
    for (let v = lo; v <= hi; v += 100) {
      const tier = RANKS.find((r) => r.min === v && v > 0);
      add('line', { x1: L, x2: R, y1: Y(v), y2: Y(v), stroke: tier ? tier.color : '#22262D', 'stroke-width': 1, 'stroke-dasharray': tier ? '4 6' : '' });
      add('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', fill: '#A3A9B1', style: 'font-family:IBM Plex Mono,monospace;font-size:12px' }, v);
      if (tier) add('text', { x: R - 4, y: Y(v) - 7, 'text-anchor': 'end', fill: tier.color, style: 'font-family:IBM Plex Mono,monospace;font-size:11px' }, `${tier.name.toUpperCase()} ${v}`);
    }
    const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
    add('path', { d: `M ${X(0)},${B} L ${pts.join(' L ')} L ${X(vals.length - 1)},${B} Z`, fill: '#E8473C', 'fill-opacity': 0.12 });
    add('polyline', { points: pts.join(' '), fill: 'none', stroke: '#E8473C', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    add('circle', { cx: X(vals.length - 1), cy: Y(vals[vals.length - 1]), r: 6, fill: '#E8473C', stroke: '#0E0F12', 'stroke-width': 3 });
    add('text', { x: L, y: 262, fill: '#7D848D', style: 'font-family:IBM Plex Mono,monospace;font-size:11px' }, 'season start');
    add('text', { x: R, y: 262, 'text-anchor': 'end', fill: '#7D848D', style: 'font-family:IBM Plex Mono,monospace;font-size:11px' }, 'now');
    box.append(svg);
    return box;
  }

  /* ---------- boot ---------- */
  fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      data.players = data.players || []; data.matches = data.matches || []; data.seasons = data.seasons || [];
      chrome(data);
      if (pages[page]) pages[page](data);
    })
    .catch(() => {
      chrome(null);
      const main = document.querySelector('main');
      if (main) main.prepend(h('div', { class: 'wrap section' }, h('div', { class: 'notice' }, 'Could not load the league data right now. Try refreshing in a minute.')));
    });
})();
