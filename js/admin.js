(function () {
  let pass = '';
  let slots = [];
  let selectedDates = new Set();
  let viewYear = 0;
  let viewMonth = 0; // 0-11

  // Wizard
  let wizardStep = 1;
  const WIZARD_TOTAL = 3;

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
    initCalendarView();
    buildCalendar();
    renderDateChips();

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
