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
    submitAvailability: function (eventId, userName, availability, passcode) {
      return post('submitAvailability', {
        event_id: eventId,
        user_name: userName,
        availability: availability,
        passcode: passcode == null ? '' : passcode
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
    },
    updateEvent: function (adminPass, eventId, payload) {
      return post('updateEvent', Object.assign({
        adminPass: adminPass,
        event_id: eventId
      }, payload || {}));
    },
    updateSubmission: function (adminPass, submissionId, userName, availability, passcode) {
      const body = {
        adminPass: adminPass,
        submission_id: submissionId,
        user_name: userName,
        availability: availability
      };
      if (passcode !== undefined) body.passcode = passcode;
      return post('updateSubmission', body);
    },
    editSubmissionAsUser: function (eventId, submissionId, passcode, userName, availability) {
      return post('editSubmissionAsUser', {
        event_id: eventId,
        submission_id: submissionId,
        passcode: passcode == null ? '' : passcode,
        user_name: userName,
        availability: availability
      });
    },
    verifyPasscode: function (submissionId, passcode) {
      return post('verifyPasscode', {
        submission_id: submissionId,
        passcode: passcode == null ? '' : passcode
      });
    },
    deleteSubmission: function (adminPass, submissionId) {
      return post('deleteSubmission', {
        adminPass: adminPass,
        submission_id: submissionId
      });
    },
    setFinalSlots: function (adminPass, eventId, finalSlots) {
      return post('setFinalSlots', {
        adminPass: adminPass,
        event_id: eventId,
        final_slots: finalSlots
      });
    }
  };
})();
