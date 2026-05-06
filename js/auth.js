(function () {
  const PASS_KEY = 'adminPass';
  const ACTIVITY_KEY = 'lastActivity';
  const IDLE_LIMIT_MS = 15 * 60 * 1000;
  const WARNING_BEFORE_MS = 60 * 1000;
  const ACTIVITY_THROTTLE_MS = 5000;

  let lastActivityWrite = 0;
  let watcherHandle = null;
  let warningModal = null;
  let warningInterval = null;
  let warningShown = false;

  function readSession(key) {
    try { return sessionStorage.getItem(key); }
    catch (e) { return null; }
  }
  function writeSession(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) {}
  }
  function removeSession(key) {
    try { sessionStorage.removeItem(key); } catch (e) {}
  }

  function isAdmin() {
    return !!readSession(PASS_KEY);
  }

  function getPass() {
    return readSession(PASS_KEY) || '';
  }

  function getLastActivity() {
    const v = readSession(ACTIVITY_KEY);
    const n = parseInt(v, 10);
    if (!isFinite(n) || n <= 0) return null;
    return n;
  }

  function ensureActivity() {
    if (!getLastActivity()) {
      writeSession(ACTIVITY_KEY, String(Date.now()));
    }
  }

  function signIn(pass) {
    writeSession(PASS_KEY, pass);
    writeSession(ACTIVITY_KEY, String(Date.now()));
    lastActivityWrite = Date.now();
  }

  function signOut(reason) {
    removeSession(PASS_KEY);
    removeSession(ACTIVITY_KEY);
    if (warningInterval) { clearInterval(warningInterval); warningInterval = null; }
    if (warningModal) { warningModal.remove(); warningModal = null; }
    if (watcherHandle) { clearInterval(watcherHandle); watcherHandle = null; }
    const target = 'admin.html' + (reason ? '?signedOut=' + encodeURIComponent(reason) : '');
    window.location.href = target;
  }

  function recordActivity() {
    if (warningShown) return; // hold the timer until user dismisses
    const now = Date.now();
    if (now - lastActivityWrite < ACTIVITY_THROTTLE_MS) return;
    lastActivityWrite = now;
    writeSession(ACTIVITY_KEY, String(now));
  }

  function attachActivityListeners() {
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    for (const evt of events) {
      document.addEventListener(evt, recordActivity, { passive: true });
    }
  }

  function renderBadge() {
    const nav = document.querySelector('.site-header-inner .site-nav');
    if (!nav) return;
    if (nav.querySelector('.admin-badge')) return;

    const pill = document.createElement('span');
    pill.className = 'admin-badge';
    pill.textContent = 'Admin';

    const out = document.createElement('a');
    out.href = '#';
    out.className = 'signout-btn';
    out.textContent = 'Sign out';
    out.addEventListener('click', (e) => {
      e.preventDefault();
      signOut('manual');
    });

    nav.appendChild(pill);
    nav.appendChild(out);
  }

  function refreshNav() {
    const nav = document.querySelector('.site-header-inner .site-nav');
    if (!nav) return;
    const adminLink = nav.querySelector('a[href="admin.html"]:not(.signout-btn)');
    if (!adminLink) return;
    adminLink.textContent = isAdmin() ? '+ New event' : 'Sign in (admin only)';
  }

  function startWatcher() {
    if (watcherHandle) clearInterval(watcherHandle);
    watcherHandle = setInterval(checkIdle, 10000);
  }

  function checkIdle() {
    if (!isAdmin()) return;
    const last = getLastActivity();
    if (!last) {
      writeSession(ACTIVITY_KEY, String(Date.now()));
      return;
    }
    const elapsed = Date.now() - last;
    if (elapsed >= IDLE_LIMIT_MS) {
      signOut('idle');
      return;
    }
    if (elapsed >= IDLE_LIMIT_MS - WARNING_BEFORE_MS) {
      showWarning();
    }
  }

  function showWarning() {
    if (warningShown) {
      updateCountdown();
      return;
    }
    warningShown = true;

    const overlay = document.createElement('div');
    overlay.className = 'auth-modal-backdrop';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) staySignedIn();
    });

    const card = document.createElement('div');
    card.className = 'auth-modal';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Idle warning');

    const title = document.createElement('h3');
    title.textContent = 'Still there?';

    const msg = document.createElement('p');
    msg.id = 'auth-modal-msg';

    const actions = document.createElement('div');
    actions.className = 'auth-modal-actions';

    const stayBtn = document.createElement('button');
    stayBtn.type = 'button';
    stayBtn.className = 'primary';
    stayBtn.textContent = 'Stay signed in';
    stayBtn.addEventListener('click', staySignedIn);

    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'ghost';
    signOutBtn.textContent = 'Sign out now';
    signOutBtn.addEventListener('click', () => signOut('manual'));

    actions.appendChild(stayBtn);
    actions.appendChild(signOutBtn);

    card.appendChild(title);
    card.appendChild(msg);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    warningModal = overlay;

    function escHandler(e) {
      if (e.key === 'Escape') staySignedIn();
    }
    overlay._escHandler = escHandler;
    document.addEventListener('keydown', escHandler);

    updateCountdown();
    if (warningInterval) clearInterval(warningInterval);
    warningInterval = setInterval(updateCountdown, 1000);
  }

  function updateCountdown() {
    if (!warningModal) return;
    const last = getLastActivity();
    if (!last) return;
    const elapsed = Date.now() - last;
    const remaining = Math.max(0, IDLE_LIMIT_MS - elapsed);
    const secs = Math.ceil(remaining / 1000);
    const msg = warningModal.querySelector('#auth-modal-msg');
    if (msg) {
      msg.textContent = "You'll be signed out in " + secs + ' second' + (secs === 1 ? '' : 's') + ' due to inactivity.';
    }
    if (remaining <= 0) {
      signOut('idle');
    }
  }

  function staySignedIn() {
    warningShown = false;
    const now = Date.now();
    writeSession(ACTIVITY_KEY, String(now));
    lastActivityWrite = now;
    hideWarning();
  }

  function hideWarning() {
    if (warningModal) {
      if (warningModal._escHandler) {
        document.removeEventListener('keydown', warningModal._escHandler);
      }
      warningModal.remove();
      warningModal = null;
    }
    if (warningInterval) {
      clearInterval(warningInterval);
      warningInterval = null;
    }
  }

  function init() {
    refreshNav();
    if (!isAdmin()) return;
    ensureActivity();
    renderBadge();
    attachActivityListeners();
    startWatcher();
  }

  window.Auth = {
    isAdmin: isAdmin,
    getPass: getPass,
    signIn: signIn,
    signOut: signOut,
    init: init,
    refreshNav: refreshNav
  };
})();
