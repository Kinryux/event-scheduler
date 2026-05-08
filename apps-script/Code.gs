// Event Availability Backend
// Paste this entire file into the bound Apps Script editor (script.google.com -> the project bound to your sheet)
// Set ADMIN_PASS in Script Properties before deploying.

function setup() {
  ensureSheets_();
}

const SHEET_ID = '1U9yhE6_33jnlEcll35d2nIfo6QxmfXnsJ_JTCWops04';

const EVENTS_SHEET = 'Events';
const SUBMISSIONS_SHEET = 'Submissions';

const EVENTS_HEADERS = [
  'event_id',
  'title',
  'description',
  'dates',
  'time_slots',
  'locked',
  'created_at',
  'final_slots',
  'polls'
];

const SUBMISSIONS_HEADERS = [
  'submission_id',
  'event_id',
  'user_name',
  'availability',
  'submitted_at',
  'passcode',
  'poll_votes'
];

function ensureSheets_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheetWithHeaders_(ss, EVENTS_SHEET, EVENTS_HEADERS);
  ensureSheetWithHeaders_(ss, SUBMISSIONS_SHEET, SUBMISSIONS_HEADERS);
}

function ensureSheetWithHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const have = {};
  existing.forEach(function (h) { have[String(h)] = true; });
  const missing = [];
  for (let i = 0; i < headers.length; i++) {
    if (!have[headers[i]]) missing.push(headers[i]);
  }
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function requireAdmin_(pass) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASS');
  if (!expected || pass !== expected) {
    throw new Error('Unauthorized');
  }
}

function todayISO_() {
  return Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
}

function isExpired_(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return true;
  let max = dates[0];
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] > max) max = dates[i];
  }
  return max < todayISO_();
}

function normalizeName_(name) {
  return String(name == null ? '' : name).trim().toLowerCase();
}

function parseTimeSlots_(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function parseAvailability_(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (value == null || value === '') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function parseLocked_(value) {
  if (value === true || value === false) return value;
  const s = String(value).toUpperCase().trim();
  return s === 'TRUE';
}

function normalizeDate_(val) {
  if (!val && val !== 0) return '';
  // Duck-type Date detection — instanceof can fail in Apps Script
  if (typeof val === 'object' && typeof val.getTime === 'function') {
    return Utilities.formatDate(val, 'UTC', 'yyyy-MM-dd');
  }
  const s = String(val);
  // Already an ISO date or timestamp — take YYYY-MM-DD prefix
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Last resort: parse and format
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'UTC', 'yyyy-MM-dd');
  }
  return s;
}

function parsePolls_(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; }
  catch (e) { return []; }
}

function parsePollVotes_(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try { const p = JSON.parse(value); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; }
  catch (e) { return {}; }
}

function validatePolls_(polls) {
  if (!Array.isArray(polls)) throw new Error('polls must be an array');
  const out = [];
  const seenIds = {};
  for (let i = 0; i < polls.length; i++) {
    const p = polls[i];
    if (!p || typeof p !== 'object') throw new Error('Invalid poll entry');
    const question = String(p.question == null ? '' : p.question).trim();
    if (!question) throw new Error('Poll question is required');
    const type = p.type;
    if (type !== 'single' && type !== 'multi') throw new Error('Poll type must be "single" or "multi"');
    if (!Array.isArray(p.options)) throw new Error('Poll options must be an array');
    const seen = {};
    const opts = [];
    for (let j = 0; j < p.options.length; j++) {
      const o = String(p.options[j] == null ? '' : p.options[j]).trim();
      if (!o) throw new Error('Poll options must be non-empty strings');
      if (seen[o]) throw new Error('Poll options must be unique');
      seen[o] = true;
      opts.push(o);
    }
    if (opts.length < 1) throw new Error('Poll must have at least one option');
    let pollId = String(p.poll_id || '').trim();
    if (!pollId || seenIds[pollId]) pollId = Utilities.getUuid();
    seenIds[pollId] = true;
    out.push({ poll_id: pollId, question: question, type: type, options: opts });
  }
  return out;
}

function aggregatePolls_(polls, submissions) {
  if (!Array.isArray(polls) || polls.length === 0) return [];
  return polls.map(function (poll) {
    const counts = {};
    for (let i = 0; i < poll.options.length; i++) counts[poll.options[i]] = 0;
    let voters = 0;
    for (let i = 0; i < submissions.length; i++) {
      const v = submissions[i].poll_votes || {};
      const sel = v[poll.poll_id];
      if (Array.isArray(sel) && sel.length > 0) {
        let counted = false;
        for (let j = 0; j < sel.length; j++) {
          if (Object.prototype.hasOwnProperty.call(counts, sel[j])) {
            counts[sel[j]]++;
            counted = true;
          }
        }
        if (counted) voters++;
      }
    }
    const optsOut = poll.options.map(function (o) { return { text: o, count: counts[o] || 0 }; });
    return {
      poll_id: poll.poll_id,
      question: poll.question,
      type: poll.type,
      options: optsOut,
      total_voters: voters
    };
  });
}

function validatePollVotes_(pollVotes, polls) {
  if (pollVotes == null) return {};
  if (typeof pollVotes !== 'object' || Array.isArray(pollVotes)) {
    throw new Error('poll_votes must be an object');
  }
  const pollMap = {};
  if (Array.isArray(polls)) {
    for (let i = 0; i < polls.length; i++) pollMap[polls[i].poll_id] = polls[i];
  }
  const out = {};
  for (const pollId in pollVotes) {
    if (!Object.prototype.hasOwnProperty.call(pollVotes, pollId)) continue;
    const poll = pollMap[pollId];
    if (!poll) continue; // silently drop unknown poll
    const sel = pollVotes[pollId];
    if (!Array.isArray(sel)) throw new Error('poll_votes value must be an array');
    const optSet = {};
    for (let i = 0; i < poll.options.length; i++) optSet[poll.options[i]] = true;
    const filtered = [];
    const seen = {};
    for (let i = 0; i < sel.length; i++) {
      const v = String(sel[i]);
      if (!optSet[v]) throw new Error('Invalid option for poll');
      if (seen[v]) continue;
      seen[v] = true;
      filtered.push(v);
    }
    if (poll.type === 'single' && filtered.length > 1) {
      throw new Error('Single-select poll cannot have multiple selections');
    }
    if (filtered.length > 0) out[pollId] = filtered;
  }
  return out;
}

function parseFinalSlots_(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function parseDates_(value) {
  let arr;
  if (Array.isArray(value)) {
    arr = value;
  } else if (value == null || value === '') {
    return [];
  } else {
    try {
      const parsed = JSON.parse(value);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return arr.map(normalizeDate_).filter(function (d) { return d; });
}

function getEventsData_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(EVENTS_SHEET);
  if (!sheet) return { sheet: null, rows: [] };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sheet: sheet, rows: [] };
  const values = sheet.getRange(2, 1, lastRow - 1, EVENTS_HEADERS.length).getValues();
  const rows = values.map((row, i) => ({
    rowIndex: i + 2,
    event_id: String(row[0]),
    title: row[1],
    description: row[2],
    dates: parseDates_(row[3]),
    time_slots: typeof row[4] === 'string' ? JSON.parse(row[4]) : row[4],
    locked: parseLocked_(row[5]),
    created_at: row[6],
    final_slots: parseFinalSlots_(row[7]),
    polls: parsePolls_(row[8])
  }));
  return { sheet: sheet, rows: rows };
}

function findEventById_(eventId) {
  const data = getEventsData_();
  for (let i = 0; i < data.rows.length; i++) {
    if (data.rows[i].event_id === eventId) {
      return { sheet: data.sheet, event: data.rows[i] };
    }
  }
  return { sheet: data.sheet, event: null };
}

function getSubmissionsForEvent_(eventId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, SUBMISSIONS_HEADERS.length).getValues();
  const passcodeIdx = SUBMISSIONS_HEADERS.indexOf('passcode');
  const pollVotesIdx = SUBMISSIONS_HEADERS.indexOf('poll_votes');
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (String(row[1]) === eventId) {
      out.push({
        rowIndex: i + 2,
        submission_id: String(row[0]),
        event_id: String(row[1]),
        user_name: row[2],
        availability: parseAvailability_(row[3]),
        submitted_at: row[4],
        passcode: passcodeIdx >= 0 ? String(row[passcodeIdx] || '') : '',
        poll_votes: pollVotesIdx >= 0 ? parsePollVotes_(row[pollVotesIdx]) : {}
      });
    }
  }
  return out;
}

function countSubmissionsByEvent_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  const counts = {};
  if (!sheet) return counts;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return counts;
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    const id = String(values[i][0]);
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

function serializeEvent_(ev, submissionCount) {
  return {
    event_id: ev.event_id,
    title: ev.title,
    description: ev.description,
    dates: ev.dates,
    time_slots: ev.time_slots,
    locked: ev.locked,
    created_at: ev.created_at,
    final_slots: ev.final_slots || [],
    polls: ev.polls || [],
    submission_count: submissionCount || 0
  };
}

function doGet(e) {
  try {
    ensureSheets_();
    const action = e && e.parameter ? e.parameter.action : null;
    if (action === 'listEvents') {
      return jsonResponse_(handleListEvents_());
    }
    if (action === 'getEvent') {
      return jsonResponse_(handleGetEvent_(e.parameter.id));
    }
    return jsonResponse_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'Invalid JSON body' });
  }
  ensureSheets_();
  const action = body.action;
  switch (action) {
    case 'createEvent':
      return jsonResponse_(safeAdmin_(function () { return handleCreateEvent_(body); }));
    case 'submitAvailability':
      try {
        return jsonResponse_(handleSubmitAvailability_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: err.message });
      }
    case 'lockEvent':
      return jsonResponse_(safeAdmin_(function () { return handleLockEvent_(body); }));
    case 'deleteEvent':
      return jsonResponse_(safeAdmin_(function () { return handleDeleteEvent_(body); }));
    case 'updateEvent':
      return jsonResponse_(safeAdmin_(function () { return handleUpdateEvent_(body); }));
    case 'updateSubmission':
      return jsonResponse_(safeAdmin_(function () { return handleUpdateSubmission_(body); }));
    case 'deleteSubmission':
      return jsonResponse_(safeAdmin_(function () { return handleDeleteSubmission_(body); }));
    case 'setFinalSlots':
      return jsonResponse_(safeAdmin_(function () { return handleSetFinalSlots_(body); }));
    case 'verifyPasscode':
      try { return jsonResponse_(handleVerifyPasscode_(body)); }
      catch (err) { return jsonResponse_({ ok: false, error: err.message }); }
    case 'editSubmissionAsUser':
      try { return jsonResponse_(handleEditSubmissionAsUser_(body)); }
      catch (err) { return jsonResponse_({ ok: false, error: err.message }); }
    default:
      return jsonResponse_({ ok: false, error: 'Unknown action' });
  }
}

function safeAdmin_(fn) {
  try {
    return fn();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function handleListEvents_() {
  const data = getEventsData_();
  const counts = countSubmissionsByEvent_();
  const active = [];
  const expired = [];
  for (let i = 0; i < data.rows.length; i++) {
    const ev = data.rows[i];
    const serialized = serializeEvent_(ev, counts[ev.event_id] || 0);
    if (isExpired_(ev.dates)) {
      expired.push(serialized);
    } else {
      active.push(serialized);
    }
  }
  return { active: active, expired: expired };
}

function handleGetEvent_(eventId) {
  if (!eventId) {
    return { ok: false, error: 'Missing id' };
  }
  const found = findEventById_(eventId);
  if (!found.event) {
    return { ok: false, error: 'Event not found' };
  }
  const rawSubs = getSubmissionsForEvent_(eventId);
  const submissions = rawSubs.map(function (s) {
    return {
      submission_id: s.submission_id,
      event_id: s.event_id,
      user_name: s.user_name,
      availability: s.availability,
      submitted_at: s.submitted_at,
      has_passcode: !!s.passcode,
      poll_votes: s.poll_votes || {}
    };
  });
  const serialized = serializeEvent_(found.event, submissions.length);
  serialized.polls = aggregatePolls_(found.event.polls || [], rawSubs);
  serialized.submissions = submissions;
  return serialized;
}

function handleCreateEvent_(body) {
  requireAdmin_(body.adminPass);
  const title = body.title;
  const description = body.description == null ? '' : body.description;
  const dates = body.dates;
  const timeSlots = body.time_slots;
  if (!title || !Array.isArray(dates) || dates.length === 0 ||
      !Array.isArray(timeSlots) || timeSlots.length === 0) {
    throw new Error('Missing required fields');
  }
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  for (let i = 0; i < dates.length; i++) {
    if (typeof dates[i] !== 'string' || !ISO_RE.test(dates[i])) {
      throw new Error('Invalid date in dates array: ' + dates[i]);
    }
  }
  const uniqueDates = Array.from(new Set(dates)).sort();
  const polls = validatePolls_(body.polls == null ? [] : body.polls);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(EVENTS_SHEET);
  const eventId = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  sheet.appendRow([
    eventId,
    title,
    description,
    JSON.stringify(uniqueDates),
    JSON.stringify(timeSlots),
    'FALSE',
    createdAt,
    '[]',
    JSON.stringify(polls)
  ]);
  return { ok: true, event_id: eventId };
}

function handleSubmitAvailability_(body) {
  const eventId = body.event_id;
  const userName = body.user_name;
  const availability = body.availability;
  const passcode = body.passcode == null ? '' : String(body.passcode);
  if (!eventId || !userName || availability == null || typeof availability !== 'object') {
    return { ok: false, error: 'Missing required fields' };
  }
  const found = findEventById_(eventId);
  if (!found.event) return { ok: false, error: 'Event not found' };
  if (found.event.final_slots && found.event.final_slots.length > 0) {
    return { ok: false, error: 'Event is finalized — no further submissions' };
  }
  if (found.event.locked) return { ok: false, error: 'Event is locked' };
  if (isExpired_(found.event.dates)) return { ok: false, error: 'Event has expired' };

  let pollVotes;
  try {
    pollVotes = validatePollVotes_(body.poll_votes == null ? {} : body.poll_votes, found.event.polls || []);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    const lastRow = sheet.getLastRow();
    const targetName = normalizeName_(userName);
    if (lastRow >= 2) {
      const values = sheet.getRange(2, 1, lastRow - 1, SUBMISSIONS_HEADERS.length).getValues();
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][1]) === eventId && normalizeName_(values[i][2]) === targetName) {
          return { ok: false, error: 'A submission with that name already exists. To edit it, go to the Submitters tab.' };
        }
      }
    }
    sheet.appendRow([
      Utilities.getUuid(),
      eventId,
      String(userName).trim(),
      JSON.stringify(availability),
      new Date().toISOString(),
      passcode,
      JSON.stringify(pollVotes)
    ]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function handleUpdateEvent_(body) {
  requireAdmin_(body.adminPass);
  const eventId = body.event_id;
  const title = body.title;
  const description = body.description == null ? '' : body.description;
  const dates = body.dates;
  const timeSlots = body.time_slots;
  if (!eventId || !title ||
      !Array.isArray(dates) || dates.length === 0 ||
      !Array.isArray(timeSlots) || timeSlots.length === 0) {
    throw new Error('Missing required fields');
  }
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  for (let i = 0; i < dates.length; i++) {
    if (typeof dates[i] !== 'string' || !ISO_RE.test(dates[i])) {
      throw new Error('Invalid date in dates array: ' + dates[i]);
    }
  }
  const uniqueDates = Array.from(new Set(dates)).sort();
  const dateSet = {};
  for (let i = 0; i < uniqueDates.length; i++) dateSet[uniqueDates[i]] = true;
  const slotSet = {};
  for (let i = 0; i < timeSlots.length; i++) slotSet[timeSlots[i]] = true;
  const polls = validatePolls_(body.polls == null ? [] : body.polls);
  const pollMap = {};
  for (let i = 0; i < polls.length; i++) {
    const optSet = {};
    for (let j = 0; j < polls[i].options.length; j++) optSet[polls[i].options[j]] = true;
    pollMap[polls[i].poll_id] = { type: polls[i].type, options: optSet };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let removedCount = 0;
  let removedVoteCount = 0;
  try {
    const found = findEventById_(eventId);
    if (!found.event) throw new Error('Event not found');
    const sheet = found.sheet;
    const titleCol = EVENTS_HEADERS.indexOf('title') + 1;
    const descCol = EVENTS_HEADERS.indexOf('description') + 1;
    const datesCol = EVENTS_HEADERS.indexOf('dates') + 1;
    const slotsCol = EVENTS_HEADERS.indexOf('time_slots') + 1;
    const pollsCol = EVENTS_HEADERS.indexOf('polls') + 1;
    sheet.getRange(found.event.rowIndex, titleCol).setValue(title);
    sheet.getRange(found.event.rowIndex, descCol).setValue(description);
    sheet.getRange(found.event.rowIndex, datesCol).setValue(JSON.stringify(uniqueDates));
    sheet.getRange(found.event.rowIndex, slotsCol).setValue(JSON.stringify(timeSlots));
    if (pollsCol > 0) {
      sheet.getRange(found.event.rowIndex, pollsCol).setValue(JSON.stringify(polls));
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const subs = ss.getSheetByName(SUBMISSIONS_SHEET);
    if (subs) {
      const lastRow = subs.getLastRow();
      if (lastRow >= 2) {
        const values = subs.getRange(2, 1, lastRow - 1, SUBMISSIONS_HEADERS.length).getValues();
        const availCol = SUBMISSIONS_HEADERS.indexOf('availability') + 1;
        const votesColIdx = SUBMISSIONS_HEADERS.indexOf('poll_votes');
        const votesCol = votesColIdx + 1;
        for (let i = 0; i < values.length; i++) {
          if (String(values[i][1]) !== eventId) continue;
          const orig = parseAvailability_(values[i][3]);
          const cleaned = {};
          let modified = false;
          for (const date in orig) {
            if (!dateSet[date]) { modified = true; continue; }
            const slots = Array.isArray(orig[date]) ? orig[date] : [];
            const filtered = [];
            for (let j = 0; j < slots.length; j++) {
              if (slotSet[slots[j]]) filtered.push(slots[j]);
            }
            if (filtered.length !== slots.length) modified = true;
            cleaned[date] = filtered;
          }
          if (modified) {
            removedCount++;
            subs.getRange(i + 2, availCol).setValue(JSON.stringify(cleaned));
          }

          if (votesColIdx >= 0) {
            const origVotes = parsePollVotes_(values[i][votesColIdx]);
            const cleanedVotes = {};
            let votesModified = false;
            for (const pollId in origVotes) {
              if (!pollMap[pollId]) { votesModified = true; continue; }
              const sel = Array.isArray(origVotes[pollId]) ? origVotes[pollId] : [];
              let kept = [];
              for (let j = 0; j < sel.length; j++) {
                if (pollMap[pollId].options[sel[j]]) kept.push(sel[j]);
              }
              if (pollMap[pollId].type === 'single' && kept.length > 1) {
                kept = [kept[0]];
              }
              if (kept.length !== sel.length) votesModified = true;
              if (kept.length > 0) cleanedVotes[pollId] = kept;
            }
            if (votesModified) {
              removedVoteCount++;
              subs.getRange(i + 2, votesCol).setValue(JSON.stringify(cleanedVotes));
            }
          }
        }
      }
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true, removed_count: removedCount, removed_vote_count: removedVoteCount };
}

function handleLockEvent_(body) {
  requireAdmin_(body.adminPass);
  const eventId = body.event_id;
  if (!eventId) throw new Error('Missing event_id');
  const locked = body.locked === true;
  const found = findEventById_(eventId);
  if (!found.event) throw new Error('Event not found');
  const lockedColIndex = EVENTS_HEADERS.indexOf('locked') + 1;
  found.sheet.getRange(found.event.rowIndex, lockedColIndex).setValue(locked ? 'TRUE' : 'FALSE');
  return { ok: true };
}

function handleUpdateSubmission_(body) {
  requireAdmin_(body.adminPass);
  const submissionId = body.submission_id;
  const userName = body.user_name;
  const availability = body.availability;
  const passcodeProvided = Object.prototype.hasOwnProperty.call(body, 'passcode');
  const newPasscode = passcodeProvided ? String(body.passcode == null ? '' : body.passcode) : null;
  const pollVotesProvided = Object.prototype.hasOwnProperty.call(body, 'poll_votes');

  if (!submissionId) throw new Error('Missing submission_id');
  if (availability == null || typeof availability !== 'object') {
    throw new Error('Missing availability');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('Submission not found');
    const values = sheet.getRange(2, 1, lastRow - 1, SUBMISSIONS_HEADERS.length).getValues();
    let rowIndex = -1;
    let eventId = '';
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === submissionId) {
        rowIndex = i + 2;
        eventId = String(values[i][1]);
        break;
      }
    }
    if (rowIndex < 0) throw new Error('Submission not found');

    let pollVotes = null;
    if (pollVotesProvided) {
      const found = findEventById_(eventId);
      pollVotes = validatePollVotes_(body.poll_votes == null ? {} : body.poll_votes,
        (found.event && found.event.polls) || []);
    }

    const nameCol = SUBMISSIONS_HEADERS.indexOf('user_name') + 1;
    const availCol = SUBMISSIONS_HEADERS.indexOf('availability') + 1;
    const submittedCol = SUBMISSIONS_HEADERS.indexOf('submitted_at') + 1;
    const passcodeCol = SUBMISSIONS_HEADERS.indexOf('passcode') + 1;
    const votesCol = SUBMISSIONS_HEADERS.indexOf('poll_votes') + 1;

    if (userName != null && String(userName).trim() !== '') {
      sheet.getRange(rowIndex, nameCol).setValue(String(userName).trim());
    }
    sheet.getRange(rowIndex, availCol).setValue(JSON.stringify(availability));
    sheet.getRange(rowIndex, submittedCol).setValue(new Date().toISOString());
    if (passcodeProvided && passcodeCol > 0) {
      sheet.getRange(rowIndex, passcodeCol).setValue(newPasscode);
    }
    if (pollVotesProvided && votesCol > 0) {
      sheet.getRange(rowIndex, votesCol).setValue(JSON.stringify(pollVotes || {}));
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function handleDeleteSubmission_(body) {
  requireAdmin_(body.adminPass);
  const submissionId = body.submission_id;
  if (!submissionId) throw new Error('Missing submission_id');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('Submission not found');
    const values = sheet.getRange(2, 1, lastRow - 1, SUBMISSIONS_HEADERS.length).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === submissionId) {
        sheet.deleteRow(i + 2);
        return { ok: true };
      }
    }
    throw new Error('Submission not found');
  } finally {
    lock.releaseLock();
  }
}

function handleSetFinalSlots_(body) {
  requireAdmin_(body.adminPass);
  const eventId = body.event_id;
  const finalSlots = body.final_slots;
  if (!eventId) throw new Error('Missing event_id');
  if (!Array.isArray(finalSlots)) throw new Error('final_slots must be an array');
  for (let i = 0; i < finalSlots.length; i++) {
    const fs = finalSlots[i];
    if (!fs || typeof fs !== 'object' ||
        typeof fs.date !== 'string' || typeof fs.slot !== 'string') {
      throw new Error('Invalid final_slots entry');
    }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findEventById_(eventId);
    if (!found.event) throw new Error('Event not found');
    const colIndex = EVENTS_HEADERS.indexOf('final_slots') + 1;
    found.sheet.getRange(found.event.rowIndex, colIndex).setValue(JSON.stringify(finalSlots));
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function handleVerifyPasscode_(body) {
  const submissionId = body.submission_id;
  const passcode = body.passcode == null ? '' : String(body.passcode);
  if (!submissionId) return { ok: false, error: 'Missing submission_id' };
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  if (!sheet) return { ok: false, error: 'Submission not found' };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'Submission not found' };
  const values = sheet.getRange(2, 1, lastRow - 1, SUBMISSIONS_HEADERS.length).getValues();
  const passcodeIdx = SUBMISSIONS_HEADERS.indexOf('passcode');
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === submissionId) {
      const stored = passcodeIdx >= 0 ? String(values[i][passcodeIdx] || '') : '';
      if (stored === '' || stored === passcode) return { ok: true };
      return { ok: false, error: 'Incorrect passcode' };
    }
  }
  return { ok: false, error: 'Submission not found' };
}

function handleEditSubmissionAsUser_(body) {
  const eventId = body.event_id;
  const submissionId = body.submission_id;
  const passcode = body.passcode == null ? '' : String(body.passcode);
  const userName = body.user_name;
  const availability = body.availability;
  const pollVotesProvided = Object.prototype.hasOwnProperty.call(body, 'poll_votes');
  if (!submissionId || !userName || availability == null || typeof availability !== 'object') {
    return { ok: false, error: 'Missing required fields' };
  }
  let eventPolls = [];
  if (eventId) {
    const found = findEventById_(eventId);
    if (!found.event) return { ok: false, error: 'Event not found' };
    if (found.event.final_slots && found.event.final_slots.length > 0) {
      return { ok: false, error: 'Event is finalized — no further submissions' };
    }
    if (found.event.locked) return { ok: false, error: 'Event is locked' };
    if (isExpired_(found.event.dates)) return { ok: false, error: 'Event has expired' };
    eventPolls = found.event.polls || [];
  }
  let pollVotes = null;
  if (pollVotesProvided) {
    try {
      pollVotes = validatePollVotes_(body.poll_votes == null ? {} : body.poll_votes, eventPolls);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Submission not found' };
    const values = sheet.getRange(2, 1, lastRow - 1, SUBMISSIONS_HEADERS.length).getValues();
    const passcodeIdx = SUBMISSIONS_HEADERS.indexOf('passcode');
    let rowIndex = -1;
    let stored = '';
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === submissionId) {
        rowIndex = i + 2;
        stored = passcodeIdx >= 0 ? String(values[i][passcodeIdx] || '') : '';
        break;
      }
    }
    if (rowIndex < 0) return { ok: false, error: 'Submission not found' };
    if (stored !== '' && stored !== passcode) {
      return { ok: false, error: 'Incorrect passcode' };
    }
    const nameCol = SUBMISSIONS_HEADERS.indexOf('user_name') + 1;
    const availCol = SUBMISSIONS_HEADERS.indexOf('availability') + 1;
    const submittedCol = SUBMISSIONS_HEADERS.indexOf('submitted_at') + 1;
    const votesCol = SUBMISSIONS_HEADERS.indexOf('poll_votes') + 1;
    sheet.getRange(rowIndex, nameCol).setValue(String(userName).trim());
    sheet.getRange(rowIndex, availCol).setValue(JSON.stringify(availability));
    sheet.getRange(rowIndex, submittedCol).setValue(new Date().toISOString());
    if (pollVotesProvided && votesCol > 0) {
      sheet.getRange(rowIndex, votesCol).setValue(JSON.stringify(pollVotes || {}));
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function handleDeleteEvent_(body) {
  requireAdmin_(body.adminPass);
  const eventId = body.event_id;
  if (!eventId) throw new Error('Missing event_id');
  const found = findEventById_(eventId);
  if (!found.event) throw new Error('Event not found');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const subsSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    if (subsSheet) {
      const lastRow = subsSheet.getLastRow();
      if (lastRow >= 2) {
        const values = subsSheet.getRange(2, 1, lastRow - 1, SUBMISSIONS_HEADERS.length).getValues();
        for (let i = values.length - 1; i >= 0; i--) {
          if (String(values[i][1]) === eventId) {
            subsSheet.deleteRow(i + 2);
          }
        }
      }
    }
    found.sheet.deleteRow(found.event.rowIndex);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}
