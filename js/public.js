(function () {
  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function showError(msg) {
    els.error.textContent = msg;
  }

  function clearError() {
    els.error.textContent = '';
  }

  function formatDisplayDate(iso, opts) {
    const base = opts || { weekday: 'short', month: 'short', day: 'numeric' };
    return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, Object.assign({}, base, { timeZone: 'UTC' }));
  }

  function formatDateRange(startISO, endISO) {
    const opts = { month: 'short', day: 'numeric' };
    const start = formatDisplayDate(startISO, opts);
    if (startISO === endISO) return start;
    const end = formatDisplayDate(endISO, opts);
    return start + ' – ' + end;
  }

  function pluralize(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function renderEventCard(ev) {
    const a = document.createElement('a');
    a.className = 'event-card';
    a.href = 'event.html?id=' + encodeURIComponent(ev.event_id);

    const titleRow = document.createElement('div');
    titleRow.className = 'title';

    const titleText = document.createElement('span');
    titleText.textContent = ev.title || '(untitled)';
    titleRow.appendChild(titleText);

    if (ev.locked) {
      const badge = document.createElement('span');
      badge.className = 'badge locked';
      badge.textContent = '🔒 Locked';
      titleRow.appendChild(badge);
    }

    a.appendChild(titleRow);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const range = formatDateRange(ev.start_date, ev.end_date);
    const count = pluralize(ev.submission_count || 0, 'submission');
    meta.textContent = range + ' · ' + count;
    a.appendChild(meta);

    return a;
  }

  function renderList(container, emptyEl, events) {
    container.innerHTML = '';
    if (!events || events.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    for (const ev of events) {
      container.appendChild(renderEventCard(ev));
    }
  }

  function switchTab(tab) {
    for (const btn of document.querySelectorAll('.tab')) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    const showActive = tab === 'active';
    els.activeList.classList.toggle('hidden', !showActive);
    els.expiredList.classList.toggle('hidden', showActive);
    els.emptyActive.classList.toggle('hidden',
      !showActive || els.activeList.children.length > 0);
    els.emptyExpired.classList.toggle('hidden',
      showActive || els.expiredList.children.length > 0);
  }

  async function load() {
    clearError();
    els.loading.classList.remove('hidden');
    try {
      const data = await API.listEvents();
      if (data && data.ok === false) {
        throw new Error(data.error || 'Failed to load events');
      }
      renderList(els.activeList, els.emptyActive, data.active || []);
      renderList(els.expiredList, els.emptyExpired, data.expired || []);
      switchTab(getCurrentTab());
    } catch (err) {
      showError('Could not load events: ' + err.message);
    } finally {
      els.loading.classList.add('hidden');
    }
  }

  function getCurrentTab() {
    const active = document.querySelector('.tab.active');
    return active ? active.dataset.tab : 'active';
  }

  function init() {
    els.error = $('page-error');
    els.activeList = $('active-events');
    els.expiredList = $('expired-events');
    els.emptyActive = $('empty-active');
    els.emptyExpired = $('empty-expired');
    els.loading = $('loading');

    for (const btn of document.querySelectorAll('.tab')) {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    }

    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
