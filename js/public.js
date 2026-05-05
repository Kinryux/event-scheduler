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

  function renderEventCard(ev) {
    const a = document.createElement('a');
    a.className = 'event-card';
    a.href = 'event.html?id=' + encodeURIComponent(ev.event_id);

    const titleRow = document.createElement('div');
    titleRow.className = 'title';

    const titleText = document.createElement('span');
    titleText.textContent = ev.title || '(untitled)';
    titleRow.appendChild(titleText);

    if (ev.final_slots && ev.final_slots.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'badge finalized';
      badge.textContent = '✓ Finalized';
      titleRow.appendChild(badge);
    }
    if (ev.locked) {
      const badge = document.createElement('span');
      badge.className = 'badge locked';
      badge.textContent = '🔒 Locked';
      titleRow.appendChild(badge);
    }

    a.appendChild(titleRow);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const range = formatDatesList(ev.dates || []);
    const count = pluralize(ev.submission_count || 0, 'submission');
    meta.textContent = (range ? range + ' · ' : '') + count;
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
    if (window.Auth) Auth.init();
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
