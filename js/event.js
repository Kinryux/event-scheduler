(function () {
  let currentEvent = null;
  let currentSubmissions = [];
  let adminPass = '';
  let editingSubmissionId = null;
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

      if (isAdmin()) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'submitter-action';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onEditSubmission(s);
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
        right.appendChild(editBtn);
        right.appendChild(delBtn);
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
      picks.textContent = lines.length > 0 ? lines.join(' · ') : 'No slots selected.';
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

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.textContent = 'Date';
    headRow.appendChild(corner);
    for (const slot of slots) {
      const th = document.createElement('th');
      th.textContent = slot;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const d of dates) {
      const row = document.createElement('tr');
      const dateCell = document.createElement('td');
      dateCell.textContent = formatDateLong(d);
      row.appendChild(dateCell);
      for (const slot of slots) {
        const td = document.createElement('td');
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.date = d;
        cb.dataset.slot = slot;
        label.appendChild(cb);
        td.appendChild(label);
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
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

  function findSubmissionByName(name) {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return null;
    for (const s of currentSubmissions) {
      if (String(s.user_name || '').trim().toLowerCase() === target) return s;
    }
    return null;
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
    const combos = [];
    for (const d of dates) {
      for (const s of slots) {
        let total = 0;
        const picks = sortedSubs.map(sub => {
          const has = sub.availability && Array.isArray(sub.availability[d]) &&
            sub.availability[d].indexOf(s) !== -1;
          if (has) total++;
          return !!has;
        });
        combos.push({ date: d, slot: s, picks: picks, total: total });
      }
    }
    combos.sort((a, b) => b.total - a.total);

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const slotHeader = document.createElement('th');
    slotHeader.textContent = 'Slot';
    slotHeader.className = 'slot-col';
    headRow.appendChild(slotHeader);
    for (const sub of sortedSubs) {
      const th = document.createElement('th');
      th.textContent = sub.user_name;
      headRow.appendChild(th);
    }
    const totalHeader = document.createElement('th');
    totalHeader.textContent = 'Total';
    totalHeader.className = 'total-col';
    headRow.appendChild(totalHeader);
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const totalSubs = sortedSubs.length;
    for (const combo of combos) {
      const tr = document.createElement('tr');
      const isFinal = isInFinalSelections(combo);
      if (isFinal) tr.classList.add('final');

      const slotCell = document.createElement('td');
      slotCell.className = 'slot-col';

      const labelDiv = document.createElement('div');
      labelDiv.className = 'matrix-slot-label';
      const dateSpan = document.createElement('span');
      dateSpan.className = 'matrix-date';
      dateSpan.textContent = formatDateLong(combo.date);
      const slotSpan = document.createElement('span');
      slotSpan.className = 'matrix-slot';
      slotSpan.textContent = combo.slot;
      labelDiv.appendChild(dateSpan);
      labelDiv.appendChild(slotSpan);
      slotCell.appendChild(labelDiv);

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'matrix-toggle';
      toggle.setAttribute('aria-pressed', isFinal ? 'true' : 'false');
      toggle.textContent = isFinal ? '★ Final' : 'Mark final';
      toggle.addEventListener('click', () => onToggleFinal(combo));
      slotCell.appendChild(toggle);

      tr.appendChild(slotCell);

      for (let i = 0; i < combo.picks.length; i++) {
        const td = document.createElement('td');
        td.className = combo.picks[i] ? 'check' : 'no-check';
        td.textContent = combo.picks[i] ? '✓' : '';
        tr.appendChild(td);
      }

      const totalCell = document.createElement('td');
      totalCell.className = 'total';
      totalCell.textContent = String(combo.total);
      if (totalSubs > 0) {
        const intensity = combo.total / totalSubs;
        const alpha = (0.08 + intensity * 0.55).toFixed(3);
        totalCell.style.backgroundColor = 'rgba(79, 70, 229, ' + alpha + ')';
        if (intensity > 0.55) totalCell.style.color = '#fff';
      }
      tr.appendChild(totalCell);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
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

  function onEditSubmission(sub) {
    editingSubmissionId = sub.submission_id;
    $('user-name').value = sub.user_name;
    $('editing-name').textContent = sub.user_name;
    $('editing-banner').classList.remove('hidden');
    $('submit-section').classList.remove('hidden');
    applyAvailabilityToGrid(sub.availability);
    setStatus('', null);
    $('submit-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    editingSubmissionId = null;
    $('editing-banner').classList.add('hidden');
    $('user-name').value = '';
    clearGridChecks();
    setStatus('', null);
    if (currentEvent) showSubmitOrClosed(currentEvent);
  }

  function exportCSV() {
    if (!currentEvent) return;
    const ev = currentEvent;
    const submissions = currentSubmissions;
    const slotPairs = sortedDates(ev).flatMap(d =>
      (ev.time_slots || []).map(s => ({ date: d, slot: s }))
    );
    const header = ['Name'].concat(slotPairs.map(s => s.date + ' ' + s.slot));
    const rows = submissions.map(sub => {
      const row = [sub.user_name];
      for (const sp of slotPairs) {
        const dayPicks = (sub.availability && sub.availability[sp.date]) || [];
        row.push(dayPicks.indexOf(sp.slot) !== -1 ? 'Y' : '');
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

  function wireNamePrefill() {
    const input = $('user-name');
    const handler = () => {
      if (editingSubmissionId) return; // don't override admin edit state
      const match = findSubmissionByName(input.value);
      if (match) {
        applyAvailabilityToGrid(match.availability);
        setStatus('Loaded existing picks for "' + match.user_name + '". Submitting will update them.', 'ok');
      } else {
        setStatus('', null);
      }
    };
    input.addEventListener('blur', handler);
    input.addEventListener('change', handler);
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
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      setStatus('Submitting…', null);
      try {
        let res;
        if (editingSubmissionId && isAdmin()) {
          res = await API.updateSubmission(adminPass, editingSubmissionId, availability);
        } else {
          res = await API.submitAvailability(currentEvent.event_id, name, availability);
        }
        if (!res || res.ok !== true) {
          throw new Error((res && res.error) || 'Submission failed');
        }
        setStatus('Submitted. Thanks!', 'ok');
        editingSubmissionId = null;
        $('editing-banner').classList.add('hidden');
        await load();
      } catch (err) {
        setStatus('Could not submit: ' + err.message, 'error');
      } finally {
        button.disabled = false;
      }
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
      buildGrid(ev);
      showSubmitOrClosed(ev);

      const nameInput = $('user-name');
      if (editingSubmissionId) {
        const match = currentSubmissions.find(s => s.submission_id === editingSubmissionId);
        if (match) applyAvailabilityToGrid(match.availability);
        else cancelEdit();
      } else if (nameInput && nameInput.value) {
        const match = findSubmissionByName(nameInput.value);
        if (match) applyAvailabilityToGrid(match.availability);
      }
    } catch (err) {
      showPageError('Could not load event: ' + err.message);
    }
  }

  function init() {
    adminPass = getStoredAdminPass();

    wireNamePrefill();
    wireSubmit();

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
