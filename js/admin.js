(function () {
  let pass = '';
  let slots = [];
  let selectedDates = new Set();
  let viewYear = 0;
  let viewMonth = 0; // 0-11
  let cachedEvents = [];
  let cachedActiveIds = new Set();

  function $(id) { return document.getElementById(id); }

  function getStoredPass() {
    try { return sessionStorage.getItem('adminPass') || ''; }
    catch (e) { return ''; }
  }
  function setStoredPass(p) {
    try { sessionStorage.setItem('adminPass', p); } catch (e) {}
  }
  function clearStoredPass() {
    try { sessionStorage.removeItem('adminPass'); } catch (e) {}
  }

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  function setBanner(el, msg, type) {
    el.textContent = msg || '';
    el.classList.remove('banner-error', 'banner-success', 'banner-warning');
    if (!msg) return;
    if (type === 'error') el.classList.add('banner-error');
    else if (type === 'ok') el.classList.add('banner-success');
    else el.classList.add('banner-warning');
  }

  function showAdminError(msg) { setBanner($('admin-error'), msg, 'error'); }
  function clearAdminError() { setBanner($('admin-error'), '', null); }

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
    return sorted.map(function (d) { return formatDisplayDate(d, opts); }).join(', ');
  }

  function pluralize(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function showLogin() {
    show('login-section');
    hide('create-section');
    hide('manage-section');
  }

  function showAdminSections() {
    hide('login-section');
    show('create-section');
    show('manage-section');
  }

  function renderChips() {
    const container = $('slot-chips');
    container.innerHTML = '';
    slots.forEach((slot, i) => {
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
        slots.splice(i, 1);
        renderChips();
      });
      chip.appendChild(x);
      container.appendChild(chip);
    });
  }

  function addSlot() {
    const input = $('slot-input');
    const v = input.value.trim();
    if (!v) return;
    if (slots.indexOf(v) === -1) slots.push(v);
    input.value = '';
    input.focus();
    renderChips();
  }

  // ---------- calendar ----------
  function todayUTCISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function isoFromYMD(y, m, d) {
    return y + '-' +
      String(m + 1).padStart(2, '0') + '-' +
      String(d).padStart(2, '0');
  }

  function buildCalendar() {
    const grid = $('cal-grid');
    grid.innerHTML = '';
    const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
    const startDayOfWeek = firstOfMonth.getUTCDay(); // 0 = Sun
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    $('cal-title').textContent = firstOfMonth.toLocaleDateString(undefined, {
      month: 'long', year: 'numeric', timeZone: 'UTC'
    });

    const today = todayUTCISO();
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
        const iso = isoFromYMD(viewYear, viewMonth, dayNum);
        cell.dataset.date = iso;
        cell.textContent = String(dayNum);
        if (iso < today) {
          cell.classList.add('disabled');
          cell.disabled = true;
        }
        if (iso === today) cell.classList.add('today');
        if (selectedDates.has(iso)) cell.classList.add('selected');
        cell.addEventListener('click', () => toggleDate(iso));
      }
      grid.appendChild(cell);
    }
  }

  function toggleDate(iso) {
    if (selectedDates.has(iso)) selectedDates.delete(iso);
    else selectedDates.add(iso);
    buildCalendar();
    renderDateChips();
  }

  function renderDateChips() {
    const container = $('date-chips');
    container.innerHTML = '';
    const sorted = Array.from(selectedDates).sort();
    sorted.forEach((iso) => {
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
        selectedDates.delete(iso);
        buildCalendar();
        renderDateChips();
      });
      chip.appendChild(x);
      container.appendChild(chip);
    });
  }

  function gotoMonth(delta) {
    viewMonth += delta;
    while (viewMonth < 0) { viewMonth += 12; viewYear -= 1; }
    while (viewMonth > 11) { viewMonth -= 12; viewYear += 1; }
    buildCalendar();
  }

  function initCalendarView() {
    const now = new Date();
    viewYear = now.getUTCFullYear();
    viewMonth = now.getUTCMonth();
  }

  async function loadEvents() {
    try {
      const data = await API.listEvents();
      if (data && data.ok === false) {
        throw new Error(data.error || 'Failed to load events');
      }
      const active = data.active || [];
      const expired = data.expired || [];
      cachedActiveIds = new Set(active.map(e => e.event_id));
      cachedEvents = active.concat(expired);
      renderManageList();
    } catch (err) {
      showAdminError('Could not load events: ' + err.message);
    }
  }

  function renderManageList() {
    const container = $('manage-list');
    const empty = $('manage-empty');
    container.innerHTML = '';

    if (cachedEvents.length === 0) {
      show('manage-empty');
      return;
    }
    hide('manage-empty');

    const sorted = cachedEvents.slice().sort((a, b) => {
      const aActive = cachedActiveIds.has(a.event_id);
      const bActive = cachedActiveIds.has(b.event_id);
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aMin = (a.dates && a.dates.length) ? a.dates.slice().sort()[0] : '';
      const bMin = (b.dates && b.dates.length) ? b.dates.slice().sort()[0] : '';
      return String(aMin).localeCompare(String(bMin));
    });

    for (const ev of sorted) {
      container.appendChild(buildManageRow(ev, cachedActiveIds.has(ev.event_id)));
    }
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
    meta.textContent =
      (range ? range + ' · ' : '') +
      pluralize(ev.submission_count || 0, 'submission');
    info.appendChild(meta);

    row.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const view = document.createElement('a');
    view.href = 'event.html?id=' + encodeURIComponent(ev.event_id);
    view.textContent = 'View';
    view.target = '_blank';
    view.rel = 'noopener';
    view.className = 'btn ghost';
    actions.appendChild(view);

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
    clearAdminError();
    btn.disabled = true;
    try {
      const res = await API.lockEvent(pass, ev.event_id, !ev.locked);
      if (!res || res.ok !== true) {
        if (res && res.error === 'Unauthorized') return forceLogin();
        throw new Error((res && res.error) || 'Failed to update lock');
      }
      await loadEvents();
    } catch (err) {
      showAdminError(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function onDelete(ev, btn) {
    const ok = confirm('Delete "' + (ev.title || '(untitled)') + '"?\nAll submissions for this event will be removed.');
    if (!ok) return;
    clearAdminError();
    btn.disabled = true;
    try {
      const res = await API.deleteEvent(pass, ev.event_id);
      if (!res || res.ok !== true) {
        if (res && res.error === 'Unauthorized') return forceLogin();
        throw new Error((res && res.error) || 'Failed to delete');
      }
      await loadEvents();
    } catch (err) {
      showAdminError(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function forceLogin() {
    clearStoredPass();
    pass = '';
    showAdminError('Incorrect passphrase. Please log in again.');
    showLogin();
  }

  async function onCreate(e) {
    e.preventDefault();
    const status = $('create-status');
    setBanner(status, '', null);

    const title = $('create-title').value.trim();
    const description = $('create-description').value.trim();
    const dates = Array.from(selectedDates).sort();

    if (!title) return setBanner(status, 'Title is required.', 'error');
    if (dates.length === 0) return setBanner(status, 'Select at least one date.', 'error');
    if (slots.length === 0) return setBanner(status, 'Add at least one time slot.', 'error');

    const payload = {
      title: title,
      description: description,
      dates: dates,
      time_slots: slots.slice()
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    setBanner(status, 'Creating event…', null);

    try {
      const res = await API.createEvent(pass, payload);
      if (!res || res.ok !== true) {
        if (res && res.error === 'Unauthorized') {
          forceLogin();
          return;
        }
        throw new Error((res && res.error) || 'Could not create event');
      }
      $('create-form').reset();
      slots = [];
      selectedDates = new Set();
      renderChips();
      renderDateChips();
      buildCalendar();
      setBanner(status, 'Event created.', 'ok');
      await loadEvents();
    } catch (err) {
      setBanner(status, err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    clearAdminError();
    const candidate = $('admin-pass').value;
    if (!candidate) {
      showAdminError('Enter the passphrase.');
      return;
    }
    // Verify the backend is reachable; the pass itself is checked on first mutation.
    try {
      const res = await API.listEvents();
      if (res && res.ok === false) throw new Error(res.error || 'Backend error');
    } catch (err) {
      showAdminError('Could not reach the backend: ' + err.message);
      return;
    }
    pass = candidate;
    setStoredPass(pass);
    $('admin-pass').value = '';
    showAdminSections();
    await loadEvents();
  }

  function onLogout() {
    clearStoredPass();
    pass = '';
    location.reload();
  }

  function init() {
    $('login-form').addEventListener('submit', onLogin);
    $('create-form').addEventListener('submit', onCreate);
    $('add-slot').addEventListener('click', addSlot);
    $('slot-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSlot();
      }
    });
    $('logout-button').addEventListener('click', onLogout);

    $('cal-prev').addEventListener('click', () => gotoMonth(-1));
    $('cal-next').addEventListener('click', () => gotoMonth(1));
    initCalendarView();
    buildCalendar();
    renderDateChips();

    pass = getStoredPass();
    if (pass) {
      showAdminSections();
      loadEvents();
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
