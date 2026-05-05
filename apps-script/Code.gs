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
  'final_slots'
];

const SUBMISSIONS_HEADERS = [
  'submission_id',
  'event_id',
  'user_name',
  'availability',
  'submitted_at'
];

function ensureSheets_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheetWithHeaders_(ss, EVENTS_SHEET, EVENTS_HEADERS);
  ensureSheetWithHeaders_(ss, SUBMISSIONS_SHEET, SUBMISSIONS_HEADERS);
}

function ensureSheetWithHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaders = headers.some((h, i) => firstRow[i] !== h);
  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
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
    final_slots: parseFinalSlots_(row[7])
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
        submitted_at: row[4]
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
  const submissions = getSubmissionsForEvent_(eventId).map(function (s) {
    return {
      submission_id: s.submission_id,
      event_id: s.event_id,
      user_name: s.user_name,
      availability: s.availability,
      submitted_at: s.submitted_at
    };
  });
  const serialized = serializeEvent_(found.event, submissions.length);
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
    '[]'
  ]);
  return { ok: true, event_id: eventId };
}

function handleSubmitAvailability_(body) {
  const eventId = body.event_id;
  const userName = body.user_name;
  const availability = body.availability;
  if (!eventId || !userName || availability == null || typeof availability !== 'object') {
    return { ok: false, error: 'Missing required fields' };
  }
  const found = findEventById_(eventId);
  if (!found.event) {
    return { ok: false, error: 'Event not found' };
  }
  if (found.event.final_slots && found.event.final_slots.length > 0) {
    return { ok: false, error: 'Event is finalized — no further submissions' };
  }
  if (found.event.locked) {
    return { ok: false, error: 'Event is locked' };
  }
  if (isExpired_(found.event.dates)) {
    return { ok: false, error: 'Event has expired' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    const lastRow = sheet.getLastRow();
    const targetName = normalizeName_(userName);
    let updateRow = -1;
    let existingId = null;
    if (lastRow >= 2) {
      const values = sheet.getRange(2, 1, lastRow - 1, SUBMISSIONS_HEADERS.length).getValues();
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][1]) === eventId && normalizeName_(values[i][2]) === targetName) {
          updateRow = i + 2;
          existingId = String(values[i][0]);
          break;
        }
      }
    }
    const submittedAt = new Date().toISOString();
    if (updateRow > 0) {
      sheet.getRange(updateRow, 1, 1, SUBMISSIONS_HEADERS.length).setValues([[
        existingId,
        eventId,
        String(userName).trim(),
        JSON.stringify(availability),
        submittedAt
      ]]);
    } else {
      sheet.appendRow([
        Utilities.getUuid(),
        eventId,
        String(userName).trim(),
        JSON.stringify(availability),
        submittedAt
      ]);
    }
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

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let removedCount = 0;
  try {
    const found = findEventById_(eventId);
    if (!found.event) throw new Error('Event not found');
    const sheet = found.sheet;
    const titleCol = EVENTS_HEADERS.indexOf('title') + 1;
    const descCol = EVENTS_HEADERS.indexOf('description') + 1;
    const datesCol = EVENTS_HEADERS.indexOf('dates') + 1;
    const slotsCol = EVENTS_HEADERS.indexOf('time_slots') + 1;
    sheet.getRange(found.event.rowIndex, titleCol).setValue(title);
    sheet.getRange(found.event.rowIndex, descCol).setValue(description);
    sheet.getRange(found.event.rowIndex, datesCol).setValue(JSON.stringify(uniqueDates));
    sheet.getRange(found.event.rowIndex, slotsCol).setValue(JSON.stringify(timeSlots));

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const subs = ss.getSheetByName(SUBMISSIONS_SHEET);
    if (subs) {
      const lastRow = subs.getLastRow();
      if (lastRow >= 2) {
        const values = subs.getRange(2, 1, lastRow - 1, SUBMISSIONS_HEADERS.length).getValues();
        const availCol = SUBMISSIONS_HEADERS.indexOf('availability') + 1;
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
        }
      }
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true, removed_count: removedCount };
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
  const availability = body.availability;
  if (!submissionId || availability == null || typeof availability !== 'object') {
    throw new Error('Missing required fields');
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
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === submissionId) { rowIndex = i + 2; break; }
    }
    if (rowIndex < 0) throw new Error('Submission not found');
    const availCol = SUBMISSIONS_HEADERS.indexOf('availability') + 1;
    const submittedCol = SUBMISSIONS_HEADERS.indexOf('submitted_at') + 1;
    sheet.getRange(rowIndex, availCol).setValue(JSON.stringify(availability));
    sheet.getRange(rowIndex, submittedCol).setValue(new Date().toISOString());
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
