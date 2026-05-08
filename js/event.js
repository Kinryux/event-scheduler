(function () {
  let currentEvent = null;
  let currentSubmissions = [];
  let adminPass = '';
  let editingSubmissionId = null;
  let editingMode = null; // null | 'admin' | 'self'
  let verifiedPasscode = ''; // captured after a successful self-edit unlock
  let pendingPasscodeFor = null; // submission being unlocked
  let finalSelections = [];

  function $(id) { return document.getElementById(id); }

  function isAdmin() { return !!adminPass; }
  function isFinalized(ev) { return Array.isArray(ev && ev.final_slots) && ev.final_slots.length > 0; }

  function getStoredAdminPass() {
    try { return sessionStorage.getItem('adminPass') || ''; }
    catch (e) { return ''; }
  }

  function sortedDates(ev) {
    return ((ev && ev.dates) ? ev.dates.slice() : []).sort();
  }

  function maxDate(dates) {
    if (!dates || dates.length === 0) return '';
    let m = dates[0];
    for (let i = 1; i < dates.length; i++) if (dates[i] > m) m = dates[i];
    return m;
  }

  function formatDatesList(isoDates) {
    const sorted = isoDates.slice().sort();
    if (sorted.length === 0) return '';
    const isContiguous = sorted.every((d, i) => {
      if (i === 0) return true;
      const prev = new Date(sorted[i - 1] + 'T00:00:00Z');
      const curr = new Date(d + 'T00:00:00Z');
      return (curr - prev) === 86400000;
    });
    const opts = { month: 'short', day: 'numeric' };
    if (isContiguous && sorted.length > 1) {
      return formatDisplayDate(sorted[0], opts) + ' – ' +
        formatDisplayDate(sorted[sorted.length - 1], opts);
    }
    return sorted.map(function (d) { return formatDisplayDate(d, opts); }).join(', ');
  }

  function formatDisplayDate(iso, opts) {
    const base = opts || { weekday: 'short', month: 'short', day: 'numeric' };
    return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, Object.assign({}, base, { timeZone: 'UTC' }));
  }

  function formatDateLong(iso) { return formatDisplayDate(iso); }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function isExpired(ev) {
    const max = maxDate(ev.dates || []);
    return !max || max < todayISO();
  }

  function showPageError(msg) { $('page-error').textContent = msg || ''; }

  function setStatus(msg, type) {
    const el = $('submit-status');
    el.classList.remove('banner-error', 'banner-success', 'banner-warning');
    el.textContent = msg || '';
    if (!msg) return;
    if (type === 'error') el.classList.add('banner-error');
    else if (type === 'ok') el.classList.add('banner-success');
    else el.classList.add('banner-warning');
  }

  function getEventIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  function renderHeader(ev) {
    $('event-header').classList.remove('hidden');
    $('event-title').textContent = ev.title || '(untitled)';
    $('event-dates').textContent = formatDatesList(ev.dates || []);
    $('event-description').textContent = ev.description || '';

    const badges = $('event-badges');
    badges.innerHTML = '';
    if (isFinalized(ev)) {
      const b = document.createElement('span');
      b.className = 'badge finalized';
      b.textContent = '✓ Finalized';
      badges.appendChild(b);
    }
    if (ev.locked) {
      const b = document.createElement('span');
      b.className = 'badge locked';
      b.textContent = '🔒 Locked';
      badges.appendChild(b);
    }
    if (isExpired(ev)) {
      const b = document.createElement('span');
      b.className = 'badge expired';
      b.textContent = 'Expired';
      badges.appendChild(b);
    }
  }

  function renderFinalBanner(ev) {
    const banner = $('final-banner');
    if (!isFinalized(ev)) {
      banner.classList.add('hidden');
      return;
    }
    banner.classList.remove('hidden');
    const grouped = {};
    for (const fs of ev.final_slots) {
      if (!grouped[fs.date]) grouped[fs.date] = [];
      grouped[fs.date].push(fs.slot);
    }
    const sortedDateKeys = Object.keys(grouped).sort();
    const lines = sortedDateKeys.map(d => formatDateLong(d) + ' — ' + grouped[d].join(', '));
    $('final-banner-content').textContent = lines.join('  ·  ');
  }

  function totalSlots(submission) {
    let total = 0;
    const a = submission.availability || {};
    for (const date in a) {
      if (Array.isArray(a[date])) total += a[date].length;
    }
    return total;
  }

  function renderSubmitters(ev, submissions) {
    const container = $('submitters');
    container.innerHTML = '';
    const empty = $('submitter-empty');

    if (!submissions || submissions.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    const sorted = submissions.slice().sort((a, b) =>
      String(a.user_name || '').toLowerCase().localeCompare(String(b.user_name || '').toLowerCase())
    );

    const list = document.createElement('ul');
    list.className = 'submitters';

    for (const s of sorted) {
      const item = document.createElement('li');
      item.className = 'submitter';

      const details = document.createElement('details');
      const summary = document.createElement('summary');

      const name = document.createElement('span');
      name.className = 'submitter-name';
      name.textContent = s.user_name;

      const right = document.createElement('span');
      right.className = 'submitter-right';
      const count = document.createElement('span');
      count.className = 'meta';
      count.textContent = totalSlots(s) + ' slots';
      right.appendChild(count);

      // User-facing Edit (visible to everyone). Skips passcode prompt
      // when the row has no stored passcode.
      const userEditBtn = document.createElement('button');
      userEditBtn.type = 'button';
      userEditBtn.className = 'submitter-action ghost';
      userEditBtn.textContent = s.has_passcode ? 'Edit' : 'Edit (no passcode)';
      userEditBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onUserEditClick(s);
      });
      right.appendChild(userEditBtn);

      if (isAdmin()) {
        const adminEditBtn = document.createElement('button');
        adminEditBtn.type = 'button';
        adminEditBtn.className = 'submitter-action';
        adminEditBtn.textContent = 'Admin edit';
        adminEditBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onAdminEditSubmission(s);
        });
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'submitter-action danger';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onDeleteSubmission(s);
        });
        right.appendChild(adminEditBtn);
        right.appendChild(delBtn);
        if (s.has_passcode) {
          const clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'submitter-action ghost';
          clearBtn.textContent = 'Clear passcode';
          clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onAdminClearPasscode(s);
          });
          right.appendChild(clearBtn);
        }
      }

      summary.appendChild(name);
      summary.appendChild(right);
      details.appendChild(summary);

      const picks = document.createElement('div');
      picks.className = 'picks';
      const dates = sortedDates(ev);
      const lines = [];
      for (const d of dates) {
        const slots = (s.availability && Array.isArray(s.availability[d])) ? s.availability[d] : [];
        if (slots.length > 0) lines.push(formatDateLong(d) + ': ' + slots.join(', '));
      }
      const pollLines = [];
      const polls = Array.isArray(ev.polls) ? ev.polls : [];
      const subVotes = (s.poll_votes && typeof s.poll_votes === 'object') ? s.poll_votes : {};
      for (const poll of polls) {
        const sel = subVotes[poll.poll_id];
        if (Array.isArray(sel) && sel.length > 0) {
          pollLines.push(poll.question + ': ' + sel.join(', '));
        }
      }
      const allLines = lines.concat(pollLines);
      picks.textContent = allLines.length > 0 ? allLines.join(' · ') : 'No slots or votes selected.';
      details.appendChild(picks);

      item.appendChild(details);
      list.appendChild(item);
    }
    container.appendChild(list);
  }

  function buildGrid(ev) {
    const table = $('availability-grid');
    table.innerHTML = '';
    const slots = ev.time_slots || [];
    const dates = sortedDates(ev);
    const totalSubs = currentSubmissions.length;

    // Pre-compute group count per (date, slot)
    const groupCount = {};
    for (const d of dates) {
      groupCount[d] = {};
      for (const s of slots) {
        groupCount[d][s] = currentSubmissions.filter(function (sub) {
          return sub.availability && Array.isArray(sub.availability[d]) &&
            sub.availability[d].indexOf(s) !== -1;
        }).length;
      }
    }

    // Header row: corner + one column per date
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'slot-col';
    headRow.appendChild(corner);
    for (const d of dates) {
      const th = document.createElement('th');
      th.className = 'day-col';
      const dt = new Date(d + 'T00:00:00Z');
      const dayNumTxt = dt.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' });
      const weekday = dt.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
      const month = dt.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
      const big = document.createElement('span');
      big.className = 'head-day';
      big.textContent = dayNumTxt;
      const sub = document.createElement('span');
      sub.className = 'head-month';
      sub.textContent = weekday + ' · ' + month;
      th.appendChild(big);
      th.appendChild(sub);
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Body: one row per slot, one cell per date
    const tbody = document.createElement('tbody');
    for (const slot of slots) {
      const row = document.createElement('tr');
      const slotCell = document.createElement('td');
      slotCell.className = 'slot-col';
      const labelDiv = document.createElement('div');
      labelDiv.className = 'matrix-slot-label';
      const slotSpan = document.createElement('span');
      slotSpan.className = 'matrix-slot';
      slotSpan.textContent = slot;
      labelDiv.appendChild(slotSpan);
      slotCell.appendChild(labelDiv);
      row.appendChild(slotCell);

      for (const d of dates) {
        const td = document.createElement('td');
        const label = document.createElement('label');

        // Heat background from group availability
        if (totalSubs > 0) {
          const n = groupCount[d][slot];
          const intensity = n / totalSubs;
          const heatPct = Math.round(6 + intensity * 50);
          label.style.background =
            'color-mix(in oklab, var(--accent) ' + heatPct + '%, var(--surface-alt))';
        }

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.date = d;
        cb.dataset.slot = slot;
        label.appendChild(cb);

        // Count badge showing group availability
        if (totalSubs > 0) {
          const n = groupCount[d][slot];
          const badge = document.createElement('span');
          badge.className = 'heat-badge';
          badge.textContent = n + '/' + totalSubs;
          label.appendChild(badge);
        }

        td.appendChild(label);
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
  }

  // ---------- polls (submit tab) ----------

  function renderPollsForSubmit(ev) {
    const section = $('polls-section');
    section.innerHTML = '';
    const polls = Array.isArray(ev.polls) ? ev.polls : [];
    if (polls.length === 0) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    for (const poll of polls) {
      section.appendChild(buildPollCard(poll, { interactive: true }));
    }
  }

  function buildPollCard(poll, opts) {
    const interactive = opts && opts.interactive;
    const card = document.createElement('div');
    card.className = 'poll-card';
    card.dataset.pollId = poll.poll_id;
    card.dataset.pollType = poll.type;

    const q = document.createElement('div');
    q.className = 'poll-question';
    q.textContent = poll.question;
    card.appendChild(q);

    const meta = document.createElement('div');
    meta.className = 'poll-meta';
    const totalVoters = poll.total_voters || 0;
    const pickWord = poll.type === 'single' ? 'one' : 'any';
    meta.textContent = totalVoters + (totalVoters === 1 ? ' vote' : ' votes') + ' · pick ' + pickWord;
    card.appendChild(meta);

    const optsWrap = document.createElement('div');
    optsWrap.className = 'poll-options';

    let maxCount = 0;
    for (const o of poll.options) {
      const c = (typeof o === 'object') ? (o.count || 0) : 0;
      if (c > maxCount) maxCount = c;
    }

    for (const o of poll.options) {
      const text = typeof o === 'string' ? o : o.text;
      const count = typeof o === 'object' ? (o.count || 0) : 0;
      const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;

      const wrap = interactive ? document.createElement('label') : document.createElement('div');
      wrap.className = 'poll-option';
      wrap.dataset.optionText = text;

      if (interactive) {
        const input = document.createElement('input');
        input.type = poll.type === 'single' ? 'radio' : 'checkbox';
        input.name = 'poll-' + poll.poll_id;
        input.value = text;
        wrap.appendChild(input);
      }

      const fill = document.createElement('span');
      fill.className = 'poll-option-fill';
      fill.style.width = pct + '%';
      wrap.appendChild(fill);

      const txt = document.createElement('span');
      txt.className = 'poll-option-text';
      txt.textContent = text;
      wrap.appendChild(txt);

      const cnt = document.createElement('span');
      cnt.className = 'poll-option-count';
      cnt.textContent = String(count);
      wrap.appendChild(cnt);

      optsWrap.appendChild(wrap);
    }

    card.appendChild(optsWrap);
    return card;
  }

  function collectPollVotes() {
    const out = {};
    const cards = $('polls-section').querySelectorAll('.poll-card');
    for (const card of cards) {
      const pollId = card.dataset.pollId;
      const checked = card.querySelectorAll('input:checked');
      const sel = [];
      for (const c of checked) sel.push(c.value);
      out[pollId] = sel;
    }
    return out;
  }

  function applyPollVotesToForm(votes) {
    clearPollVotes();
    if (!votes) return;
    const cards = $('polls-section').querySelectorAll('.poll-card');
    for (const card of cards) {
      const pollId = card.dataset.pollId;
      const sel = votes[pollId];
      if (!Array.isArray(sel)) continue;
      const inputs = card.querySelectorAll('input');
      for (const input of inputs) {
        if (sel.indexOf(input.value) !== -1) input.checked = true;
      }
    }
  }

  function clearPollVotes() {
    const inputs = $('polls-section').querySelectorAll('input');
    for (const i of inputs) i.checked = false;
  }

  function renderAdminPollResults(ev) {
    const wrap = $('admin-poll-results');
    const body = $('admin-poll-results-body');
    if (!wrap || !body) return;
    const polls = Array.isArray(ev.polls) ? ev.polls : [];
    if (polls.length === 0) {
      wrap.classList.add('hidden');
      body.innerHTML = '';
      return;
    }
    wrap.classList.remove('hidden');
    body.innerHTML = '';
    for (const poll of polls) {
      body.appendChild(buildPollCard(poll, { interactive: false }));
    }
  }

  function clearGridChecks() {
    const boxes = $('availability-grid').querySelectorAll('input[type="checkbox"]');
    for (const b of boxes) b.checked = false;
  }

  function applyAvailabilityToGrid(availability) {
    clearGridChecks();
    if (!availability) return;
    const boxes = $('availability-grid').querySelectorAll('input[type="checkbox"]');
    for (const b of boxes) {
      const slots = availability[b.dataset.date];
      if (Array.isArray(slots) && slots.indexOf(b.dataset.slot) !== -1) b.checked = true;
    }
  }

  function collectAvailability(ev) {
    const out = {};
    const dates = sortedDates(ev);
    for (const d of dates) out[d] = [];
    const boxes = $('availability-grid').querySelectorAll('input[type="checkbox"]:checked');
    for (const b of boxes) {
      if (!out[b.dataset.date]) out[b.dataset.date] = [];
      out[b.dataset.date].push(b.dataset.slot);
    }
    return out;
  }

  function showSubmitOrClosed(ev) {
    const finalized = isFinalized(ev);
    const closed = ev.locked || isExpired(ev);
    const submitSection = $('submit-section');
    const closedSection = $('closed-notice');

    let closedMsg = '';
    if (finalized) closedMsg = 'This event has been finalized.';
    else if (ev.locked) closedMsg = 'This event is locked — no new submissions accepted.';
    else if (isExpired(ev)) closedMsg = 'This event has expired.';

    const isInert = finalized || closed;
    const showForm = !isInert || (isAdmin() && editingSubmissionId);

    submitSection.classList.toggle('hidden', !showForm);
    if (closedMsg) {
      closedSection.classList.remove('hidden');
      $('closed-message').textContent = closedMsg;
    } else {
      closedSection.classList.add('hidden');
    }
  }

  // ---------- tabs ----------

  const TABS = ['submit', 'submitters', 'admin'];

  function isInert(ev) {
    return isFinalized(ev) || ev.locked || isExpired(ev);
  }

  function defaultTab() {
    if (currentEvent && isInert(currentEvent)) return 'submitters';
    return 'submit';
  }

  function activateTab(name, opts) {
    if (!TABS.includes(name)) name = defaultTab();
    if (name === 'admin' && !isAdmin()) name = defaultTab();
    document.querySelectorAll('.event-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.event-panel').forEach(p => {
      const isActive = p.id === 'panel-' + name;
      p.classList.toggle('hidden', !isActive);
      if (isActive) {
        // restart entrance animation
        p.style.animation = 'none';
        void p.offsetWidth;
        p.style.animation = '';
      }
    });
    const newHash = '#' + name;
    if ((!opts || !opts.fromHash) && window.location.hash !== newHash) {
      history.replaceState(null, '', newHash);
    }
  }

  function syncTabsForAdmin() {
    const adminBtn = document.querySelector('.event-tab[data-tab="admin"]');
    if (adminBtn) adminBtn.classList.toggle('hidden', !isAdmin());
    const activeBtn = document.querySelector('.event-tab.active');
    if (activeBtn && activeBtn.dataset.tab === 'admin' && !isAdmin()) {
      activateTab(defaultTab());
    }
  }

  function readHashTab() {
    const h = (window.location.hash || '').replace('#', '').trim();
    return TABS.includes(h) ? h : null;
  }

  function wireTabs() {
    document.querySelectorAll('.event-tab').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
    window.addEventListener('hashchange', () => {
      const h = readHashTab();
      if (h) activateTab(h, { fromHash: true });
    });
  }

  // ---------- admin tools ----------

  function renderAdminTools(ev) {
    const tools = $('admin-tools');
    if (!isAdmin()) {
      tools.classList.add('hidden');
      return;
    }
    tools.classList.remove('hidden');

    const wrap = $('matrix-wrap');
    const empty = $('matrix-empty');
    if (currentSubmissions.length === 0) {
      wrap.classList.add('hidden');
      empty.classList.remove('hidden');
    } else {
      wrap.classList.remove('hidden');
      empty.classList.add('hidden');
      buildMatrix(ev, currentSubmissions);
    }

    $('clear-final').classList.toggle('hidden', !isFinalized(ev));
    $('save-final').disabled = finalSelections.length === 0;
  }

  function isInFinalSelections(combo) {
    return finalSelections.some(f => f.date === combo.date && f.slot === combo.slot);
  }

  function buildMatrix(ev, submissions) {
    const table = $('comparison-matrix');
    table.innerHTML = '';

    const sortedSubs = submissions.slice().sort((a, b) =>
      String(a.user_name).toLowerCase().localeCompare(String(b.user_name).toLowerCase())
    );

    const dates = sortedDates(ev);
    const slots = ev.time_slots || [];
    const totalSubs = sortedSubs.length;

    const cellCount = (d, s) => {
      let n = 0;
      for (const sub of sortedSubs) {
        if (sub.availability && Array.isArray(sub.availability[d]) &&
            sub.availability[d].indexOf(s) !== -1) n++;
      }
      return n;
    };
    let bestN = 0;
    for (const d of dates) for (const s of slots) {
      const n = cellCount(d, s);
      if (n > bestN) bestN = n;
    }

    renderConsensusBanner(ev, dates, slots, sortedSubs, cellCount, bestN);

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'slot-col';
    corner.innerHTML = '<span class="muted small">Slot</span>';
    headRow.appendChild(corner);
    for (const d of dates) {
      const th = document.createElement('th');
      th.className = 'day-col';
      const dt = new Date(d + 'T00:00:00Z');
      const dayNum = dt.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' });
      const weekday = dt.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
      const month = dt.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
      const big = document.createElement('span');
      big.className = 'head-day';
      big.textContent = dayNum;
      const sub = document.createElement('span');
      sub.className = 'head-month';
      sub.textContent = weekday + ' · ' + month;
      th.appendChild(big);
      th.appendChild(sub);
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const slot of slots) {
      const tr = document.createElement('tr');

      const slotCell = document.createElement('td');
      slotCell.className = 'slot-col';
      const labelDiv = document.createElement('div');
      labelDiv.className = 'matrix-slot-label';
      const slotSpan = document.createElement('span');
      slotSpan.className = 'matrix-slot';
      slotSpan.textContent = slot;
      labelDiv.appendChild(slotSpan);
      slotCell.appendChild(labelDiv);
      tr.appendChild(slotCell);

      for (const d of dates) {
        const combo = { date: d, slot: slot };
        const n = cellCount(d, slot);
        const isFinal = isInFinalSelections(combo);
        const td = document.createElement('td');
        td.className = 'heat-cell';
        if (isFinal) td.classList.add('is-best');

        if (totalSubs > 0) {
          const intensity = n / totalSubs;
          const accentMix = Math.round(8 + intensity * 78);
          td.style.backgroundColor =
            'color-mix(in oklab, var(--accent) ' + accentMix + '%, var(--surface))';
          if (intensity > 0.5) td.style.color = 'var(--on-accent)';
          else td.style.color = 'var(--text)';
        }

        const wrap = document.createElement('div');
        const num = document.createElement('span');
        num.className = 'heat-num';
        num.textContent = String(n);
        const of = document.createElement('span');
        of.className = 'heat-of';
        of.textContent = 'of ' + totalSubs;
        wrap.appendChild(num);
        wrap.appendChild(of);
        td.appendChild(wrap);

        if (n === bestN && bestN > 0 && !isFinalized(ev) && !isFinal) {
          const star = document.createElement('span');
          star.className = 'heat-best-star';
          star.textContent = '★';
          td.appendChild(star);
        }

        const picks = sortedSubs.filter(sub =>
          sub.availability && Array.isArray(sub.availability[d]) &&
          sub.availability[d].indexOf(slot) !== -1
        ).map(sub => sub.user_name);
        td.title = (picks.length ? picks.join(', ') : 'No one picked this') +
          (isFinal ? '  (final)' : '');

        td.style.cursor = 'pointer';
        td.addEventListener('click', () => onToggleFinal(combo));

        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    $('save-final').disabled = finalSelections.length === 0;
  }

  function renderConsensusBanner(ev, dates, slots, sortedSubs, cellCount, bestN) {
    const wrap = $('matrix-wrap');
    let banner = document.getElementById('consensus-banner');
    if (banner) banner.remove();
    if (isFinalized(ev) || bestN === 0 || sortedSubs.length === 0) return;

    const leaders = [];
    for (const d of dates) for (const s of slots) {
      if (cellCount(d, s) === bestN) leaders.push({ date: d, slot: s });
    }
    if (leaders.length === 0) return;

    banner = document.createElement('div');
    banner.id = 'consensus-banner';
    banner.className = 'consensus-banner';

    const icon = document.createElement('span');
    icon.className = 'consensus-icon';
    icon.textContent = '★';
    banner.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'consensus-banner-body';

    const label = document.createElement('div');
    label.className = 'consensus-label';
    label.textContent = leaders.length === 1 ? 'Top consensus' : 'Top consensus (tied)';
    body.appendChild(label);

    const title = document.createElement('div');
    title.className = 'consensus-title';
    if (leaders.length === 1) {
      title.textContent = formatDateLong(leaders[0].date) + ' · ' + leaders[0].slot;
    } else {
      title.textContent = leaders.length + ' time slots tied at ' + bestN + '/' + sortedSubs.length;
    }
    body.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'consensus-meta';
    const pct = Math.round((bestN / sortedSubs.length) * 100);
    meta.textContent = bestN + ' of ' + sortedSubs.length + ' people available · ' + pct + '%';
    body.appendChild(meta);

    banner.appendChild(body);

    if (leaders.length === 1) {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'consensus-cta';
      cta.textContent = 'Mark as final →';
      cta.addEventListener('click', () => {
        finalSelections = [{ date: leaders[0].date, slot: leaders[0].slot }];
        buildMatrix(currentEvent, currentSubmissions);
        $('save-final').disabled = false;
      });
      banner.appendChild(cta);
    }

    wrap.insertBefore(banner, wrap.firstChild);
  }

  function onToggleFinal(combo) {
    const idx = finalSelections.findIndex(f => f.date === combo.date && f.slot === combo.slot);
    if (idx >= 0) finalSelections.splice(idx, 1);
    else finalSelections.push({ date: combo.date, slot: combo.slot });
    buildMatrix(currentEvent, currentSubmissions);
  }

  async function onSaveFinal() {
    const btn = $('save-final');
    btn.disabled = true;
    showPageError('');
    try {
      const res = await API.setFinalSlots(adminPass, currentEvent.event_id, finalSelections.slice());
      if (!res || res.ok !== true) {
        throw new Error((res && res.error) || 'Failed to save final');
      }
      await load();
    } catch (err) {
      showPageError(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function onClearFinal() {
    if (!confirm('Clear the final time selection for this event?')) return;
    const btn = $('clear-final');
    btn.disabled = true;
    showPageError('');
    try {
      const res = await API.setFinalSlots(adminPass, currentEvent.event_id, []);
      if (!res || res.ok !== true) {
        throw new Error((res && res.error) || 'Failed to clear final');
      }
      finalSelections = [];
      await load();
    } catch (err) {
      showPageError(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function onDeleteSubmission(sub) {
    if (!confirm('Delete submission from ' + sub.user_name + '?')) return;
    showPageError('');
    try {
      const res = await API.deleteSubmission(adminPass, sub.submission_id);
      if (!res || res.ok !== true) {
        throw new Error((res && res.error) || 'Failed to delete submission');
      }
      if (editingSubmissionId === sub.submission_id) cancelEdit();
      await load();
    } catch (err) {
      showPageError(err.message);
    }
  }

  function enterEditMode(sub, mode, passcode) {
    editingSubmissionId = sub.submission_id;
    editingMode = mode;
    verifiedPasscode = mode === 'self' ? (passcode || '') : '';
    $('user-name').value = sub.user_name;
    $('editing-name').textContent = sub.user_name;
    $('editing-banner').classList.remove('hidden');
    $('submit-section').classList.remove('hidden');
    applyAvailabilityToGrid(sub.availability);
    applyPollVotesToForm(sub.poll_votes || {});
    setStatus('', null);
    refreshFormMode();
    activateTab('submit');
    $('panel-submit').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onAdminEditSubmission(sub) {
    enterEditMode(sub, 'admin');
  }

  function onUserEditClick(sub) {
    if (!sub.has_passcode) {
      enterEditMode(sub, 'self', '');
      return;
    }
    pendingPasscodeFor = sub;
    $('passcode-modal-prompt').textContent = "Enter the passcode for " + sub.user_name + "'s submission.";
    $('passcode-modal-input').value = '';
    setBannerEl($('passcode-modal-error'), '', null);
    $('passcode-modal-backdrop').classList.remove('hidden');
    document.body.classList.add('modal-open');
    setTimeout(() => $('passcode-modal-input').focus(), 30);
  }

  function closePasscodeModal() {
    $('passcode-modal-backdrop').classList.add('hidden');
    document.body.classList.remove('modal-open');
    pendingPasscodeFor = null;
  }

  async function onPasscodeSubmit(e) {
    e.preventDefault();
    if (!pendingPasscodeFor) return;
    const code = $('passcode-modal-input').value.trim();
    setBannerEl($('passcode-modal-error'), '', null);
    if (!/^\d{4}$/.test(code)) {
      setBannerEl($('passcode-modal-error'), 'Passcode must be 4 digits.', 'error');
      return;
    }
    try {
      const res = await API.verifyPasscode(pendingPasscodeFor.submission_id, code);
      if (!res || res.ok !== true) {
        setBannerEl($('passcode-modal-error'), (res && res.error) || 'Incorrect passcode', 'error');
        return;
      }
      const sub = pendingPasscodeFor;
      closePasscodeModal();
      enterEditMode(sub, 'self', code);
    } catch (err) {
      setBannerEl($('passcode-modal-error'), err.message, 'error');
    }
  }

  async function onAdminClearPasscode(sub) {
    if (!confirm('Clear passcode for ' + sub.user_name + "? They'll be able to edit their submission without one.")) return;
    showPageError('');
    try {
      const res = await API.updateSubmission(adminPass, sub.submission_id, sub.user_name, sub.availability || {}, '');
      if (!res || res.ok !== true) {
        throw new Error((res && res.error) || 'Failed to clear passcode');
      }
      await load();
    } catch (err) {
      showPageError(err.message);
    }
  }

  function setBannerEl(el, msg, type) {
    el.classList.remove('banner-error', 'banner-success', 'banner-warning', 'hidden');
    el.textContent = msg || '';
    if (!msg) { el.classList.add('hidden'); return; }
    if (type === 'error') el.classList.add('banner-error');
    else if (type === 'ok') el.classList.add('banner-success');
    else el.classList.add('banner-warning');
  }

  function cancelEdit() {
    editingSubmissionId = null;
    editingMode = null;
    verifiedPasscode = '';
    $('editing-banner').classList.add('hidden');
    $('user-name').value = '';
    $('user-passcode').value = '';
    $('admin-passcode-set').value = '';
    clearGridChecks();
    clearPollVotes();
    setStatus('', null);
    refreshFormMode();
    if (currentEvent) showSubmitOrClosed(currentEvent);
  }

  function refreshFormMode() {
    const passField = $('passcode-field');
    const adminPassField = $('admin-passcode-field');
    const submitBtn = $('submit-button');
    if (editingMode === 'admin') {
      passField.classList.add('hidden');
      adminPassField.classList.remove('hidden');
      submitBtn.textContent = 'Save changes';
    } else if (editingMode === 'self') {
      passField.classList.add('hidden');
      adminPassField.classList.add('hidden');
      submitBtn.textContent = 'Save changes';
    } else {
      passField.classList.remove('hidden');
      adminPassField.classList.add('hidden');
      submitBtn.textContent = 'Submit availability';
    }
    refreshSubmitEnabled();
  }

  function refreshSubmitEnabled() {
    const name = $('user-name').value.trim();
    const submitBtn = $('submit-button');
    if (editingMode === 'admin') {
      const adminCode = $('admin-passcode-set').value;
      const codeOk = adminCode === '' || /^\d{4}$/.test(adminCode);
      submitBtn.disabled = !name || !codeOk;
    } else if (editingMode === 'self') {
      submitBtn.disabled = !name;
    } else {
      const code = $('user-passcode').value;
      submitBtn.disabled = !name || !/^\d{4}$/.test(code);
    }
  }

  function exportCSV() {
    if (!currentEvent) return;
    const ev = currentEvent;
    const submissions = currentSubmissions;
    const slotPairs = sortedDates(ev).flatMap(d =>
      (ev.time_slots || []).map(s => ({ date: d, slot: s }))
    );
    const polls = Array.isArray(ev.polls) ? ev.polls : [];
    const pollPairs = [];
    for (const poll of polls) {
      for (const o of poll.options) {
        const text = typeof o === 'string' ? o : o.text;
        pollPairs.push({ poll_id: poll.poll_id, question: poll.question, option: text });
      }
    }
    const header = ['Name']
      .concat(slotPairs.map(s => s.date + ' ' + s.slot))
      .concat(pollPairs.map(p => p.question + ' — ' + p.option));
    const rows = submissions.map(sub => {
      const row = [sub.user_name];
      for (const sp of slotPairs) {
        const dayPicks = (sub.availability && sub.availability[sp.date]) || [];
        row.push(dayPicks.indexOf(sp.slot) !== -1 ? 'Y' : '');
      }
      for (const pp of pollPairs) {
        const votes = (sub.poll_votes && sub.poll_votes[pp.poll_id]) || [];
        row.push(votes.indexOf(pp.option) !== -1 ? 'Y' : '');
      }
      return row;
    });
    const csv = [header].concat(rows).map(r =>
      r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = String(ev.title || 'event').replace(/[^a-z0-9]/gi, '-').replace(/^-+|-+$/g, '') || 'event';
    a.download = safeTitle + '-submissions.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- form wiring ----------

  function wireFormInputs() {
    ['user-name', 'user-passcode', 'admin-passcode-set'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', refreshSubmitEnabled);
    });
  }

  function wirePasscodeModal() {
    $('passcode-form').addEventListener('submit', onPasscodeSubmit);
    $('passcode-modal-close').addEventListener('click', closePasscodeModal);
    $('passcode-modal-cancel').addEventListener('click', closePasscodeModal);
    $('passcode-modal-backdrop').addEventListener('click', (e) => {
      if (e.target === $('passcode-modal-backdrop')) closePasscodeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('passcode-modal-backdrop').classList.contains('hidden')) {
        closePasscodeModal();
      }
    });
  }

  function wireSubmit() {
    const form = $('submit-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentEvent) return;
      const name = $('user-name').value.trim();
      if (!name) {
        setStatus('Please enter your name.', 'error');
        return;
      }
      const availability = collectAvailability(currentEvent);
      const pollVotes = collectPollVotes();
      const button = $('submit-button');
      button.disabled = true;
      setStatus('Submitting…', null);
      try {
        let res;
        if (editingMode === 'admin') {
          const newCode = $('admin-passcode-set').value.trim();
          const passcodeArg = newCode === '' ? undefined : newCode;
          res = await API.updateSubmission(adminPass, editingSubmissionId, name, availability, passcodeArg, pollVotes);
        } else if (editingMode === 'self') {
          res = await API.editSubmissionAsUser(currentEvent.event_id, editingSubmissionId, verifiedPasscode, name, availability, pollVotes);
        } else {
          const code = $('user-passcode').value.trim();
          if (!/^\d{4}$/.test(code)) {
            setStatus('Passcode must be exactly 4 digits.', 'error');
            button.disabled = false;
            return;
          }
          res = await API.submitAvailability(currentEvent.event_id, name, availability, code, pollVotes);
        }
        if (!res || res.ok !== true) {
          throw new Error((res && res.error) || 'Submission failed');
        }
        setStatus(editingMode ? 'Saved.' : 'Submitted. Thanks!', 'ok');
        editingSubmissionId = null;
        editingMode = null;
        verifiedPasscode = '';
        $('editing-banner').classList.add('hidden');
        $('user-passcode').value = '';
        $('admin-passcode-set').value = '';
        await load();
      } catch (err) {
        setStatus('Could not submit: ' + err.message, 'error');
        button.disabled = false;
        return;
      }
      refreshFormMode();
    });
  }

  // ---------- load ----------

  async function load() {
    const id = getEventIdFromUrl();
    if (!id) { showPageError('Missing event id in URL.'); return; }
    try {
      const ev = await API.getEvent(id);
      if (ev && ev.ok === false) throw new Error(ev.error || 'Could not load event');
      currentEvent = ev;
      currentSubmissions = ev.submissions || [];
      finalSelections = (ev.final_slots || []).slice();

      renderHeader(ev);
      renderFinalBanner(ev);
      renderSubmitters(ev, currentSubmissions);
      renderAdminTools(ev);
      renderAdminPollResults(ev);
      buildGrid(ev);
      renderPollsForSubmit(ev);
      showSubmitOrClosed(ev);
      syncTabsForAdmin();
      // Pick initial tab from hash, or fall back to default for the event state
      const initialTab = readHashTab() || defaultTab();
      activateTab(initialTab, { fromHash: !!readHashTab() });

      if (editingSubmissionId) {
        const match = currentSubmissions.find(s => s.submission_id === editingSubmissionId);
        if (match) {
          applyAvailabilityToGrid(match.availability);
          applyPollVotesToForm(match.poll_votes || {});
        }
        else cancelEdit();
      }
      refreshFormMode();
    } catch (err) {
      showPageError('Could not load event: ' + err.message);
    }
  }

  function init() {
    if (window.Auth) Auth.init();
    adminPass = getStoredAdminPass();

    wireFormInputs();
    wirePasscodeModal();
    wireSubmit();
    wireTabs();
    refreshFormMode();

    $('cancel-edit').addEventListener('click', cancelEdit);
    $('save-final').addEventListener('click', onSaveFinal);
    $('clear-final').addEventListener('click', onClearFinal);
    $('export-csv').addEventListener('click', exportCSV);

    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
