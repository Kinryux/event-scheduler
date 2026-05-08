(function () {
  let pass = '';
  let slots = [];
  let selectedDates = new Set();
  let viewYear = 0;
  let viewMonth = 0; // 0-11
  let polls = [];

  // Wizard
  let wizardStep = 1;
  const WIZARD_TOTAL = 4;

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

  function setBannerWithLink(el, text, linkText, linkHref, type) {
    el.textContent = '';
    el.classList.remove('banner-error', 'banner-success', 'banner-warning');
    if (type === 'error') el.classList.add('banner-error');
    else if (type === 'ok') el.classList.add('banner-success');
    else el.classList.add('banner-warning');
    el.appendChild(document.createTextNode(text));
    const a = document.createElement('a');
    a.href = linkHref;
    a.textContent = linkText;
    el.appendChild(a);
  }

  function formatDisplayDate(iso, opts) {
    const base = opts || { weekday: 'short', month: 'short', day: 'numeric' };
    return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, Object.assign({}, base, { timeZone: 'UTC' }));
  }

  function showLogin() {
    show('login-section');
    hide('create-section');
  }

  function showAdminSections() {
    hide('login-section');
    show('create-section');
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

  // ---------- polls editor ----------

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function addPoll() {
    polls.push({ poll_id: uuid(), question: '', type: 'single', options: [] });
    renderPolls('polls-editor', polls);
  }

  function removePoll(idx) {
    polls.splice(idx, 1);
    renderPolls('polls-editor', polls);
  }

  function renderPolls(containerId, list) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = '';
    list.forEach((poll, idx) => {
      container.appendChild(buildPollCard(poll, idx, list, containerId));
    });
  }

  function buildPollCard(poll, idx, list, containerId) {
    const card = document.createElement('div');
    card.className = 'poll-edit-card';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'poll-edit-remove';
    remove.setAttribute('aria-label', 'Remove poll');
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      list.splice(idx, 1);
      renderPolls(containerId, list);
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
      radio.name = 'poll-type-' + poll.poll_id;
      radio.value = v;
      radio.checked = poll.type === v;
      radio.addEventListener('change', () => {
        if (radio.checked) poll.type = v;
      });
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
        });
        chip.appendChild(x);
        chipsWrap.appendChild(chip);
      });
    }
    renderOptionChips();

    card.appendChild(optsWrap);
    return card;
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
    const pollErr = validatePolls(polls);
    if (pollErr) return setBanner(status, pollErr, 'error');

    const payload = {
      title: title,
      description: description,
      dates: dates,
      time_slots: slots.slice(),
      polls: polls.map(function (p) {
        return { poll_id: p.poll_id, question: p.question, type: p.type, options: p.options.slice() };
      })
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
      polls = [];
      renderChips();
      renderDateChips();
      renderPolls('polls-editor', polls);
      buildCalendar();
      resetWizard();
      setBannerWithLink(status, 'Event created. ', 'View in Manage →', 'manage.html', 'ok');
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
    if (window.Auth) Auth.signIn(candidate);
    else setStoredPass(candidate);
    $('admin-pass').value = '';
    window.location.href = 'index.html';
  }

  function onLogout() {
    if (window.Auth) Auth.signOut('manual');
    else { clearStoredPass(); pass = ''; location.reload(); }
  }

  // ---------- create wizard ----------

  function validateStep(n) {
    if (n === 1) {
      const title = $('create-title').value.trim();
      if (!title) return 'Title is required.';
    } else if (n === 2) {
      if (selectedDates.size === 0) return 'Select at least one date.';
    } else if (n === 3) {
      if (slots.length === 0) return 'Add at least one time slot.';
    } else if (n === 4) {
      return validatePolls(polls);
    }
    return '';
  }

  function validatePolls(list) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const q = String(p.question || '').trim();
      const isEmpty = !q && (!p.options || p.options.length === 0);
      if (isEmpty) {
        return 'Remove unfilled polls or add a question and at least 2 options.';
      }
      if (!q) return 'Each poll needs a question.';
      if (p.type !== 'single' && p.type !== 'multi') return 'Each poll needs a type.';
      if (!Array.isArray(p.options) || p.options.length < 2) {
        return 'Each poll needs at least 2 options.';
      }
    }
    return '';
  }

  function updateStepper() {
    document.querySelectorAll('#wizard-stepper .step').forEach(el => {
      const s = parseInt(el.dataset.step, 10);
      el.classList.remove('active', 'completed', 'future');
      if (s < wizardStep) el.classList.add('completed');
      else if (s === wizardStep) el.classList.add('active');
      else el.classList.add('future');
    });
  }

  function goToStep(n) {
    if (n < 1 || n > WIZARD_TOTAL) return;
    wizardStep = n;
    document.querySelectorAll('.wiz-step').forEach(el => {
      const s = parseInt(el.dataset.step, 10);
      el.classList.toggle('hidden', s !== n);
    });
    updateStepper();
    // Clear inline errors when moving steps
    setBanner($('create-status'), '', null);
  }

  function onWizNext(targetStep) {
    const err = validateStep(wizardStep);
    if (err) { setBanner($('create-status'), err, 'error'); return; }
    goToStep(targetStep);
  }

  function onStepperClick(e) {
    const li = e.target.closest('.step');
    if (!li) return;
    const s = parseInt(li.dataset.step, 10);
    if (s < wizardStep) goToStep(s); // back-only via stepper
  }

  function resetWizard() {
    wizardStep = 1;
    goToStep(1);
  }

  function wireWizard() {
    document.querySelectorAll('.wiz-next').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = parseInt(btn.dataset.next, 10);
        onWizNext(target);
      });
    });
    document.querySelectorAll('.wiz-back').forEach(btn => {
      btn.addEventListener('click', () => goToStep(wizardStep - 1));
    });
    $('wizard-stepper').addEventListener('click', onStepperClick);
    updateStepper();
  }


  // ---------- signed-out banner ----------

  function showSignedOutBanner() {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('signedOut');
    if (reason === 'idle') {
      const el = $('signed-out-banner');
      el.textContent = 'Signed out due to inactivity. Sign in to continue.';
      el.classList.remove('hidden');
    }
    if (reason) {
      window.history.replaceState({}, '', 'admin.html');
    }
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
    $('add-poll').addEventListener('click', addPoll);
    initCalendarView();
    buildCalendar();
    renderDateChips();
    renderPolls('polls-editor', polls);

    wireWizard();
    showSignedOutBanner();

    pass = (window.Auth && Auth.getPass()) || getStoredPass();
    if (pass) {
      showAdminSections();
    } else {
      showLogin();
    }

    if (window.Auth) Auth.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
