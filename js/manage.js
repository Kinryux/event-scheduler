(function () {
  let pass = '';
  let cachedEvents = [];
  let cachedActiveIds = new Set();

  // Edit modal state
  let editingEventId = null;
  let editSelectedDates = new Set();
  let editSlots = [];
  let editViewYear = 0;
  let editViewMonth = 0;
  let editOriginal = null;
  let editPolls = [];
  let editOriginalPolls = [];

  function $(id) { return document.getElementById(id); }

  function setBanner(el, msg, type) {
    el.textContent = msg || '';
    el.classList.remove('banner-error', 'banner-success', 'banner-warning');
    if (!msg) return;
    if (type === 'error') el.classList.add('banner-error');
    else if (type === 'ok') el.classList.add('banner-success');
    else el.classList.add('banner-warning');
  }

  function showError(msg) { setBanner($('page-error'), msg || '', 'error'); }
  function clearError() { setBanner($('page-error'), '', null); }

  function formatDisplayDate(iso, opts) {
    const base = opts || { weekday: 'short', month: 'short', day: 'numeric' };
    return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, Object.assign({}, base, { timeZone: 'UTC' }));
  }

  function formatDatesList(isoDates) {
    const sorted = (isoDates || []).slice().sort();
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
    return sorted.map(d => formatDisplayDate(d, opts)).join(', ');
  }

  function pluralize(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function isoFromYMD(y, m, d) {
    return y + '-' +
      String(m + 1).padStart(2, '0') + '-' +
      String(d).padStart(2, '0');
  }

  // ---------- polls editor ----------

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function addEditPoll() {
    editPolls.push({ poll_id: uuid(), question: '', type: 'single', options: [] });
    renderEditPolls();
    refreshRemovalWarning();
  }

  function renderEditPolls() {
    const container = $('edit-polls-editor');
    if (!container) return;
    container.innerHTML = '';
    editPolls.forEach((poll, idx) => {
      container.appendChild(buildEditPollCard(poll, idx));
    });
  }

  function buildEditPollCard(poll, idx) {
    const card = document.createElement('div');
    card.className = 'poll-edit-card';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'poll-edit-remove';
    remove.setAttribute('aria-label', 'Remove poll');
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      editPolls.splice(idx, 1);
      renderEditPolls();
      refreshRemovalWarning();
    });
    card.appendChild(remove);

    const qLabel = document.createElement('label');
    const qSpan = document.createElement('span');
    qSpan.className = 'label-text';
    qSpan.textContent = 'Question';
    qLabel.appendChild(qSpan);
    const qInput = document.createElement('input');
    qInput.type = 'text';
    qInput.placeholder = 'e.g. What food should we get?';
    qInput.value = poll.question || '';
    qInput.addEventListener('input', () => { poll.question = qInput.value; });
    qLabel.appendChild(qInput);
    card.appendChild(qLabel);

    const typeWrap = document.createElement('div');
    typeWrap.className = 'poll-type-toggle';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'label-text';
    typeLabel.textContent = 'Type';
    typeWrap.appendChild(typeLabel);
    const seg = document.createElement('div');
    seg.className = 'poll-type-segmented';
    [['single', 'Pick one'], ['multi', 'Pick multiple']].forEach(([v, label]) => {
      const opt = document.createElement('label');
      opt.className = 'poll-type-opt';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'edit-poll-type-' + poll.poll_id;
      radio.value = v;
      radio.checked = poll.type === v;
      radio.addEventListener('change', () => { if (radio.checked) poll.type = v; });
      const txt = document.createElement('span');
      txt.textContent = label;
      opt.appendChild(radio);
      opt.appendChild(txt);
      seg.appendChild(opt);
    });
    typeWrap.appendChild(seg);
    card.appendChild(typeWrap);

    const optsWrap = document.createElement('div');
    optsWrap.className = 'poll-opts-wrap';
    const optsLabel = document.createElement('span');
    optsLabel.className = 'label-text';
    optsLabel.textContent = 'Options';
    optsWrap.appendChild(optsLabel);

    const inputRow = document.createElement('div');
    inputRow.className = 'row slot-input-row';
    const optInput = document.createElement('input');
    optInput.type = 'text';
    optInput.placeholder = 'e.g. Pizza';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Add';
    function addOption() {
      const v = optInput.value.trim();
      if (!v) return;
      if (poll.options.indexOf(v) === -1) poll.options.push(v);
      optInput.value = '';
      optInput.focus();
      renderOptionChips();
      refreshRemovalWarning();
    }
    addBtn.addEventListener('click', addOption);
    optInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addOption(); }
    });
    inputRow.appendChild(optInput);
    inputRow.appendChild(addBtn);
    optsWrap.appendChild(inputRow);

    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'chips';
    optsWrap.appendChild(chipsWrap);

    function renderOptionChips() {
      chipsWrap.innerHTML = '';
      poll.options.forEach((o, oi) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        const lbl = document.createElement('span');
        lbl.textContent = o;
        chip.appendChild(lbl);
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'chip-x';
        x.setAttribute('aria-label', 'Remove ' + o);
        x.textContent = '×';
        x.addEventListener('click', () => {
          poll.options.splice(oi, 1);
          renderOptionChips();
          refreshRemovalWarning();
        });
        chip.appendChild(x);
        chipsWrap.appendChild(chip);
      });
    }
    renderOptionChips();

    card.appendChild(optsWrap);
    return card;
  }

  function validateEditPolls(list) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const q = String(p.question || '').trim();
      const isEmpty = !q && (!p.options || p.options.length === 0);
      if (isEmpty) return 'Remove unfilled polls or add a question and at least 2 options.';
      if (!q) return 'Each poll needs a question.';
      if (p.type !== 'single' && p.type !== 'multi') return 'Each poll needs a type.';
      if (!Array.isArray(p.options) || p.options.length < 2) return 'Each poll needs at least 2 options.';
    }
    return '';
  }

  // ---------- list ----------

  async function loadEvents() {
    try {
      const data = await API.listEvents();
      if (data && data.ok === false) throw new Error(data.error || 'Failed to load events');
      const active = data.active || [];
      const expired = data.expired || [];
      cachedActiveIds = new Set(active.map(e => e.event_id));
      cachedEvents = active.concat(expired);
      renderManageList();
    } catch (err) {
      showError('Could not load events: ' + err.message);
    }
  }

  function renderManageList() {
    const container = $('manage-list');
    const empty = $('manage-empty');
    container.innerHTML = '';
    if (cachedEvents.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    const sorted = cachedEvents.slice().sort((a, b) => {
      const aActive = cachedActiveIds.has(a.event_id);
      const bActive = cachedActiveIds.has(b.event_id);
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aMin = (a.dates && a.dates.length) ? a.dates.slice().sort()[0] : '';
      const bMin = (b.dates && b.dates.length) ? b.dates.slice().sort()[0] : '';
      return String(aMin).localeCompare(String(bMin));
    });
    sorted.forEach((ev, i) => {
      const row = buildManageRow(ev, cachedActiveIds.has(ev.event_id));
      row.style.setProperty('--row-i', Math.min(i, 7));
      container.appendChild(row);
    });
  }

  function buildManageRow(ev, isActive) {
    const row = document.createElement('div');
    row.className = 'manage-row';

    const info = document.createElement('div');
    info.className = 'info';

    const titleLine = document.createElement('div');
    titleLine.className = 'manage-title';
    const t = document.createElement('span');
    t.className = 'name';
    t.textContent = ev.title || '(untitled)';
    titleLine.appendChild(t);
    if (ev.locked) {
      const b = document.createElement('span');
      b.className = 'badge locked';
      b.textContent = '🔒 Locked';
      titleLine.appendChild(b);
    }
    if (!isActive) {
      const b = document.createElement('span');
      b.className = 'badge expired';
      b.textContent = 'Expired';
      titleLine.appendChild(b);
    }
    info.appendChild(titleLine);

    const meta = document.createElement('div');
    meta.className = 'muted small';
    const range = formatDatesList(ev.dates || []);
    meta.textContent = (range ? range + ' · ' : '') + pluralize(ev.submission_count || 0, 'submission');
    info.appendChild(meta);
    row.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const view = document.createElement('a');
    view.href = 'event.html?id=' + encodeURIComponent(ev.event_id);
    view.textContent = 'View';
    view.className = 'btn ghost';
    actions.appendChild(view);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn ghost';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditModal(ev));
    actions.appendChild(editBtn);

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'btn ghost';
    lockBtn.textContent = ev.locked ? 'Unlock' : 'Lock';
    lockBtn.addEventListener('click', () => onToggleLock(ev, lockBtn));
    actions.appendChild(lockBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => onDelete(ev, delBtn));
    actions.appendChild(delBtn);

    row.appendChild(actions);
    return row;
  }

  async function onToggleLock(ev, btn) {
    clearError();
    btn.disabled = true;
    try {
      const res = await API.lockEvent(pass, ev.event_id, !ev.locked);
      if (!res || res.ok !== true) {
        if (res && res.error === 'Unauthorized') return forceLogin();
        throw new Error((res && res.error) || 'Failed to update lock');
      }
      await loadEvents();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function onDelete(ev, btn) {
    if (!confirm('Delete "' + (ev.title || '(untitled)') + '"?\nAll submissions for this event will be removed.')) return;
    clearError();
    btn.disabled = true;
    try {
      const res = await API.deleteEvent(pass, ev.event_id);
      if (!res || res.ok !== true) {
        if (res && res.error === 'Unauthorized') return forceLogin();
        throw new Error((res && res.error) || 'Failed to delete');
      }
      await loadEvents();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function forceLogin() {
    if (window.Auth) Auth.signOut('manual');
    else window.location.href = 'admin.html';
  }

  // ---------- edit modal ----------

  function buildEditCalendar() {
    const grid = $('edit-cal-grid');
    grid.innerHTML = '';
    const firstOfMonth = new Date(Date.UTC(editViewYear, editViewMonth, 1));
    const startDayOfWeek = firstOfMonth.getUTCDay();
    const daysInMonth = new Date(Date.UTC(editViewYear, editViewMonth + 1, 0)).getUTCDate();
    $('edit-cal-title').textContent = firstOfMonth.toLocaleDateString(undefined, {
      month: 'long', year: 'numeric', timeZone: 'UTC'
    });
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < 42; i++) {
      const dayNum = i - startDayOfWeek + 1;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-day';
      if (dayNum < 1 || dayNum > daysInMonth) {
        cell.classList.add('cal-day-empty');
        cell.disabled = true;
        cell.tabIndex = -1;
      } else {
        const iso = isoFromYMD(editViewYear, editViewMonth, dayNum);
        cell.dataset.date = iso;
        cell.textContent = String(dayNum);
        if (iso === today) cell.classList.add('today');
        if (editSelectedDates.has(iso)) cell.classList.add('selected');
        cell.addEventListener('click', () => toggleEditDate(iso));
      }
      grid.appendChild(cell);
    }
  }

  function toggleEditDate(iso) {
    if (editSelectedDates.has(iso)) editSelectedDates.delete(iso);
    else editSelectedDates.add(iso);
    buildEditCalendar();
    renderEditDateChips();
    refreshRemovalWarning();
  }

  function renderEditDateChips() {
    const container = $('edit-date-chips');
    container.innerHTML = '';
    Array.from(editSelectedDates).sort().forEach((iso) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const label = document.createElement('span');
      label.textContent = formatDisplayDate(iso);
      chip.appendChild(label);
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip-x';
      x.setAttribute('aria-label', 'Remove ' + iso);
      x.textContent = '×';
      x.addEventListener('click', () => {
        editSelectedDates.delete(iso);
        buildEditCalendar();
        renderEditDateChips();
        refreshRemovalWarning();
      });
      chip.appendChild(x);
      container.appendChild(chip);
    });
  }

  function gotoEditMonth(delta) {
    editViewMonth += delta;
    while (editViewMonth < 0) { editViewMonth += 12; editViewYear -= 1; }
    while (editViewMonth > 11) { editViewMonth -= 12; editViewYear += 1; }
    buildEditCalendar();
  }

  function renderEditSlotChips() {
    const container = $('edit-slot-chips');
    container.innerHTML = '';
    editSlots.forEach((slot, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const label = document.createElement('span');
      label.textContent = slot;
      chip.appendChild(label);
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip-x';
      x.setAttribute('aria-label', 'Remove ' + slot);
      x.textContent = '×';
      x.addEventListener('click', () => {
        editSlots.splice(i, 1);
        renderEditSlotChips();
        refreshRemovalWarning();
      });
      chip.appendChild(x);
      container.appendChild(chip);
    });
  }

  function addEditSlot() {
    const input = $('edit-slot-input');
    const v = input.value.trim();
    if (!v) return;
    if (editSlots.indexOf(v) === -1) editSlots.push(v);
    input.value = '';
    input.focus();
    renderEditSlotChips();
    refreshRemovalWarning();
  }

  function refreshRemovalWarning() {
    const el = $('edit-removal-warning');
    if (!editOriginal) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    let hasRemoval = false;
    for (const d of editOriginal.dates) if (!editSelectedDates.has(d)) { hasRemoval = true; break; }
    if (!hasRemoval) {
      for (const s of editOriginal.slots) if (editSlots.indexOf(s) === -1) { hasRemoval = true; break; }
    }
    let pollRemoval = false;
    if (editOriginalPolls && editOriginalPolls.length > 0) {
      const currentById = {};
      for (const cp of editPolls) currentById[cp.poll_id] = cp;
      for (const op of editOriginalPolls) {
        const cur = currentById[op.poll_id];
        if (!cur) { pollRemoval = true; break; }
        const curOpts = {};
        for (const o of cur.options) curOpts[o] = true;
        for (const o of op.options) {
          if (!curOpts[o]) { pollRemoval = true; break; }
        }
        if (pollRemoval) break;
      }
    }
    const allSlotsRemoved = editOriginal.slots.size > 0 && editSlots.length === 0;
    const count = editOriginal.submission_count || 0;
    if (count > 0 && allSlotsRemoved) {
      el.textContent = "Removing all time slots will discard everyone's availability picks.";
      el.classList.remove('hidden');
    } else if ((hasRemoval || pollRemoval) && count > 0) {
      el.textContent = 'Removing dates/slots/poll options will discard those entries from ' +
        count + ' existing submission' + (count === 1 ? '' : 's') + '.';
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
      el.textContent = '';
    }
  }

  function openEditModal(ev) {
    editingEventId = ev.event_id;
    $('edit-title').value = ev.title || '';
    $('edit-description').value = ev.description || '';
    setBanner($('edit-status'), '', null);
    editSelectedDates = new Set(ev.dates || []);
    editSlots = (ev.time_slots || []).slice();
    const evPolls = Array.isArray(ev.polls) ? ev.polls : [];
    editPolls = evPolls.map(function (p) {
      // ev.polls may be the aggregated form (options as objects) — normalize
      const opts = Array.isArray(p.options)
        ? p.options.map(function (o) { return typeof o === 'string' ? o : o.text; })
        : [];
      return { poll_id: p.poll_id, question: p.question, type: p.type, options: opts };
    });
    editOriginalPolls = editPolls.map(function (p) {
      return { poll_id: p.poll_id, question: p.question, type: p.type, options: p.options.slice() };
    });
    editOriginal = {
      dates: new Set(ev.dates || []),
      slots: new Set(ev.time_slots || []),
      submission_count: ev.submission_count || 0
    };
    const sorted = Array.from(editSelectedDates).sort();
    const anchor = sorted[0] ? new Date(sorted[0] + 'T00:00:00Z') : new Date();
    editViewYear = anchor.getUTCFullYear();
    editViewMonth = anchor.getUTCMonth();
    buildEditCalendar();
    renderEditDateChips();
    renderEditSlotChips();
    renderEditPolls();
    refreshRemovalWarning();
    $('edit-modal-backdrop').classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  function closeEditModal() {
    editingEventId = null;
    editOriginal = null;
    $('edit-modal-backdrop').classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  async function onEditSave(e) {
    e.preventDefault();
    const status = $('edit-status');
    setBanner(status, '', null);
    const title = $('edit-title').value.trim();
    const description = $('edit-description').value.trim();
    const dates = Array.from(editSelectedDates).sort();
    if (!title) return setBanner(status, 'Title is required.', 'error');
    if (dates.length === 0) return setBanner(status, 'Select at least one date.', 'error');
    const pollErr = validateEditPolls(editPolls);
    if (pollErr) return setBanner(status, pollErr, 'error');
    if (editSlots.length === 0 && editPolls.length === 0) {
      return setBanner(status, 'Add at least one time slot or one poll.', 'error');
    }
    const payload = {
      title: title, description: description, dates: dates, time_slots: editSlots.slice(),
      polls: editPolls.map(function (p) {
        return { poll_id: p.poll_id, question: p.question, type: p.type, options: p.options.slice() };
      })
    };
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    setBanner(status, 'Saving…', null);
    try {
      const res = await API.updateEvent(pass, editingEventId, payload);
      if (!res || res.ok !== true) {
        if (res && res.error === 'Unauthorized') { forceLogin(); return; }
        throw new Error((res && res.error) || 'Could not save changes');
      }
      const removed = res.removed_count || 0;
      const removedVotes = res.removed_vote_count || 0;
      if (removed > 0 || removedVotes > 0) {
        const parts = [];
        if (removed > 0) parts.push(removed + ' availability submission' + (removed === 1 ? '' : 's'));
        if (removedVotes > 0) parts.push(removedVotes + ' vote' + (removedVotes === 1 ? '' : 's'));
        setBanner(status, 'Saved. Cleaned up ' + parts.join(' and ') + '.', 'ok');
      } else {
        setBanner(status, 'Saved.', 'ok');
      }
      await loadEvents();
      setTimeout(closeEditModal, 600);
    } catch (err) {
      setBanner(status, err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  }

  function wireEditModal() {
    $('edit-modal-close').addEventListener('click', closeEditModal);
    $('edit-cancel').addEventListener('click', closeEditModal);
    $('edit-modal-backdrop').addEventListener('click', (e) => {
      if (e.target === $('edit-modal-backdrop')) closeEditModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('edit-modal-backdrop').classList.contains('hidden')) {
        closeEditModal();
      }
    });
    $('edit-form').addEventListener('submit', onEditSave);
    $('edit-cal-prev').addEventListener('click', () => gotoEditMonth(-1));
    $('edit-cal-next').addEventListener('click', () => gotoEditMonth(1));
    $('edit-add-slot').addEventListener('click', addEditSlot);
    $('edit-slot-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addEditSlot(); }
    });
    $('edit-add-poll').addEventListener('click', addEditPoll);
  }

  function init() {
    if (!window.Auth || !Auth.isAdmin()) {
      window.location.href = 'admin.html?signedOut=manage';
      return;
    }
    Auth.init();
    pass = Auth.getPass();
    wireEditModal();
    loadEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
