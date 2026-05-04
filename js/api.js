(function () {
  function url() {
    return window.APP_CONFIG.WEB_APP_URL;
  }

  async function get(params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(url() + '?' + qs, { method: 'GET' });
    return res.json();
  }

  async function post(action, body) {
    const res = await fetch(url(), {
      method: 'POST',
      // Intentionally no Content-Type header — keeps the request "simple" so no CORS preflight
      body: JSON.stringify(Object.assign({ action: action }, body || {}))
    });
    return res.json();
  }

  window.API = {
    listEvents: function () {
      return get({ action: 'listEvents' });
    },
    getEvent: function (id) {
      return get({ action: 'getEvent', id: id });
    },
    createEvent: function (adminPass, payload) {
      return post('createEvent', Object.assign({ adminPass: adminPass }, payload || {}));
    },
    submitAvailability: function (eventId, userName, availability) {
      return post('submitAvailability', {
        event_id: eventId,
        user_name: userName,
        availability: availability
      });
    },
    lockEvent: function (adminPass, eventId, locked) {
      return post('lockEvent', {
        adminPass: adminPass,
        event_id: eventId,
        locked: locked
      });
    },
    deleteEvent: function (adminPass, eventId) {
      return post('deleteEvent', {
        adminPass: adminPass,
        event_id: eventId
      });
    }
  };
})();
