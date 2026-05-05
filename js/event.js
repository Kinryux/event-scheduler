(function () {
  let currentEvent = null;
  let currentSubmissions = [];

  function $(id) {
    return document.getElementById(id);
  }

  function sortedDates(ev) {
    return ((ev && ev.dates) ? ev.dates.slice() : []).sort();
  }

  function maxDate(dates) {
    if (!dates || dates.length === 0) return '';
    let max = dates[0];
    for (let i = 1; i < dates.length; i++) if (dates[i] > max) max = dates[i];
    return max;
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

  function formatDateLong(iso) {
    return formatDisplayDate(iso);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function isExpired(ev) {
    const max = maxDate(ev.dates || []);
    return !max || max < todayISO();
  }

  function showPageError(msg) {
    const el = $('page-error');
    el.textContent = msg;
  }

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

    const sorted = submissions.slice().sort((a, b) => {
      const an = String(a.user_name || '').toLowerCase();
      const bn = String(b.user_name || '').toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });

    const list = document.createElement('ul');
    list.className = 'submitters';

    for (const s of sorted) {
      const item = document.createElement('li');
      item.className = 'submitter';

      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const name = document.createElement('span');
      name.textContent = s.user_name;
      const count = document.createElement('span');
      count.className = 'meta';
      count.textContent = totalSlots(s) + ' slots';
      summary.appendChild(name);
      summary.appendChild(count);
      details.appendChild(summary);

      const picks = document.createElement('div');
      picks.className = 'picks';
      const dates = sortedDates(ev);
      const lines = [];
      for (const d of dates) {
        const slots = (s.availability && Array.isArray(s.availability[d])) ? s.availability[d] : [];
        if (slots.length > 0) {
          lines.push(formatDateLong(d) + ': ' + slots.join(', '));
        }
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
        label.style.display = 'block';
        label.style.cursor = 'pointer';
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
      if (Array.isArray(slots) && slots.indexOf(b.dataset.slot) !== -1) {
        b.checked = true;
      }
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
    const closed = ev.locked || isExpired(ev);
    const submitSection = $('submit-section');
    const closedSection = $('closed-notice');
    if (closed) {
      submitSection.classList.add('hidden');
      closedSection.classList.remove('hidden');
      $('closed-message').textContent = ev.locked
        ? 'This event is locked — no new submissions accepted.'
        : 'This event has expired.';
    } else {
      submitSection.classList.remove('hidden');
      closedSection.classList.add('hidden');
    }
  }

  function wireNamePrefill() {
    const input = $('user-name');
    const handler = () => {
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
        const res = await API.submitAvailability(currentEvent.event_id, name, availability);
        if (!res || res.ok !== true) {
          throw new Error((res && res.error) || 'Submission failed');
        }
        setStatus('Submitted. Thanks!', 'ok');
        await load();
      } catch (err) {
        setStatus('Could not submit: ' + err.message, 'error');
      } finally {
        button.disabled = false;
      }
    });
  }

  async function load() {
    const id = getEventIdFromUrl();
    if (!id) {
      showPageError('Missing event id in URL.');
      return;
    }
    try {
      const ev = await API.getEvent(id);
      if (ev && ev.ok === false) {
        throw new Error(ev.error || 'Could not load event');
      }
      currentEvent = ev;
      currentSubmissions = ev.submissions || [];
      renderHeader(ev);
      renderSubmitters(ev, currentSubmissions);
      buildGrid(ev);
      showSubmitOrClosed(ev);

      // If a name was already typed, re-apply matching picks after re-render.
      const nameInput = $('user-name');
      if (nameInput && nameInput.value) {
        const match = findSubmissionByName(nameInput.value);
        if (match) applyAvailabilityToGrid(match.availability);
      }
    } catch (err) {
      showPageError('Could not load event: ' + err.message);
    }
  }

  function init() {
    wireNamePrefill();
    wireSubmit();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
