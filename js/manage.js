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
    const count = editOriginal.submission_count || 0;
    if (hasRemoval && count > 0) {
      el.textContent = 'Removing dates/slots will discard those entries from ' +
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
    if (editSlots.length === 0) return setBanner(status, 'Add at least one time slot.', 'error');
    const payload = {
      title: title, description: description, dates: dates, time_slots: editSlots.slice()
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
      if (removed > 0) {
        setBanner(status, 'Saved. Cleaned up ' + removed + ' submission' + (removed === 1 ? '' : 's') + '.', 'ok');
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
