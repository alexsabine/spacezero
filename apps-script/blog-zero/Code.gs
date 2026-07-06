/* ═══════════════════════════════════════════════════════════════════════════
 *  SPACE ZERO — Blog Zero submissions
 *
 *  Lives inside the "Blog Zero Tracker" Google Sheet (Extensions → Apps
 *  Script). Receives submissions POSTed from space-zero.org/blog.html,
 *  files the uploaded draft in Drive, logs a row in the tracker, and —
 *  when a row's Status is set to "Approved" — emails the writer an
 *  invitation to upload their draft as a Google Doc to the shared folder.
 *
 *  Full setup walkthrough: SETUP.md alongside this file in the site repo.
 * ═════════════════════════════════════════════════════════════════════════ */

const CONFIG = {
  // Tab the tracker rows live on (created by setupSheet if missing).
  SHEET_NAME: 'Submissions',

  // Drive folder that received uploads are filed into (private to the team).
  // Folder ID = the long string in the folder's URL after /folders/
  SUBMISSIONS_FOLDER_ID: 'PASTE_SUBMISSIONS_FOLDER_ID_HERE',

  // Shareable link to the "Blog Zero — Drafts" folder that approved writers
  // are invited to upload their Google Doc into.
  DRAFTS_FOLDER_LINK: 'PASTE_DRAFTS_FOLDER_SHARE_LINK_HERE',

  // Address CC'd on every approval email, and shown as reply-to.
  TEAM_EMAIL: 'info@space-zero.org',

  // Name emails are sent as.
  FROM_NAME: 'Space Zero',

  // Optional: also notify the team when a new submission arrives.
  NOTIFY_ON_SUBMISSION: true,

  MAX_FILE_BYTES: 10 * 1024 * 1024,
};

const COLUMNS = [
  'Timestamp',
  'Full name',
  'Email',
  'About',
  'Proposed title',
  'Relation to Space Zero',
  'Prior publications',
  'Draft file',
  'Status',            // New / Approved / Declined  (dropdown)
  'Approval email sent',
  'Notes',
];
const STATUS_COL = COLUMNS.indexOf('Status') + 1;            // 9
const SENT_COL   = COLUMNS.indexOf('Approval email sent') + 1; // 10

/* ─────────────────────────────────────────────────────────────────────────
 *  ONE-TIME SETUP — run this once from the Apps Script editor.
 *  Creates the Submissions tab, headers, and the Status dropdown.
 * ───────────────────────────────────────────────────────────────────────── */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_NAME);

  sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS])
       .setFontWeight('bold');
  sheet.setFrozenRows(1);

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['New', 'Approved', 'Declined'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, STATUS_COL, sheet.getMaxRows() - 1, 1).setDataValidation(rule);

  sheet.autoResizeColumns(1, COLUMNS.length);
}

/* ─────────────────────────────────────────────────────────────────────────
 *  WEB APP ENDPOINT — receives the form POST from blog.html.
 *  Deploy → New deployment → Web app → execute as Me, access: Anyone.
 * ───────────────────────────────────────────────────────────────────────── */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Honeypot: the hidden "website" field is only ever filled by bots.
    if (data.website) return jsonOut({ ok: true });

    const required = ['fullName', 'email', 'about', 'title', 'relation', 'fileBase64', 'fileName'];
    for (const key of required) {
      if (!data[key] || !String(data[key]).trim()) {
        return jsonOut({ ok: false, error: 'Missing field: ' + key });
      }
    }

    const bytes = Utilities.base64Decode(data.fileBase64);
    if (bytes.length > CONFIG.MAX_FILE_BYTES) {
      return jsonOut({ ok: false, error: 'File too large' });
    }

    // File the draft: "Proposed title — Full name — originalname.ext"
    const folder = DriveApp.getFolderById(CONFIG.SUBMISSIONS_FOLDER_ID);
    const safe = s => String(s).replace(/[\\/:*?"<>|]/g, ' ').trim();
    const blob = Utilities.newBlob(bytes, data.fileType || 'application/octet-stream',
      safe(data.title) + ' — ' + safe(data.fullName) + ' — ' + safe(data.fileName));
    const file = folder.createFile(blob);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    sheet.appendRow([
      new Date(),
      data.fullName,
      data.email,
      data.about,
      data.title,
      data.relation,
      data.publications || '',
      file.getUrl(),
      'New',
      '',
      '',
    ]);

    if (CONFIG.NOTIFY_ON_SUBMISSION) {
      MailApp.sendEmail({
        to: CONFIG.TEAM_EMAIL,
        subject: 'Blog Zero — new submission: ' + data.title,
        name: CONFIG.FROM_NAME,
        body: 'A new Blog Zero submission has arrived.\n\n' +
              'From:  ' + data.fullName + ' <' + data.email + '>\n' +
              'Title: ' + data.title + '\n\n' +
              'Open the tracker to read it and set Status to Approved when ready.',
      });
    }

    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─────────────────────────────────────────────────────────────────────────
 *  APPROVAL EMAIL — fires when Status is edited to "Approved".
 *  Needs an INSTALLABLE trigger (simple onEdit cannot send mail):
 *  Apps Script editor → Triggers (clock icon) → Add Trigger →
 *  function onStatusEdit, event source "From spreadsheet", type "On edit".
 * ───────────────────────────────────────────────────────────────────────── */
function onStatusEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== CONFIG.SHEET_NAME) return;
  if (range.getColumn() !== STATUS_COL || range.getRow() < 2) return;
  if (range.getValue() !== 'Approved') return;

  sendApprovalEmail(sheet, range.getRow());
}

/* Manual fallback, available from the "Blog Zero" menu in the Sheet. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Blog Zero')
    .addItem('Send approval email for selected row', 'sendApprovalForSelectedRow')
    .addToUi();
}

function sendApprovalForSelectedRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const row = sheet.getActiveCell().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('Select a cell in a submission row first.');
    return;
  }
  sendApprovalEmail(sheet, row);
}

function sendApprovalEmail(sheet, row) {
  // Only send once per row.
  const sentCell = sheet.getRange(row, SENT_COL);
  if (sentCell.getValue()) return;

  const values = sheet.getRange(row, 1, 1, COLUMNS.length).getValues()[0];
  const name  = values[COLUMNS.indexOf('Full name')];
  const email = values[COLUMNS.indexOf('Email')];
  const title = values[COLUMNS.indexOf('Proposed title')];
  if (!email) return;

  const firstName = String(name).trim().split(/\s+/)[0] || name;

  const body =
'Dear ' + firstName + ',\n\n' +
'Thank you for offering "' + title + '" to Blog Zero — we would be delighted to publish it as part of Emergent Stories.\n\n' +
'The next step is simple:\n\n' +
'1. Open our shared drafts folder:\n   ' + CONFIG.DRAFTS_FOLDER_LINK + '\n' +
'2. Upload your draft there as a Google Doc (in Drive: New → Google Docs, or upload your file and open it with Google Docs).\n' +
'3. Name the document "' + title + ' — ' + name + '".\n' +
'4. If you have images, add them into the Doc where you would like them to appear, or upload them alongside it.\n\n' +
'A member of the team will then read alongside you, leave any comments in the Doc itself, and let you know when your piece is ready to go live on space-zero.org.\n\n' +
'There is no hurry — we are in no rush here, and neither should you be.\n\n' +
'With warmth and gratitude,\n' +
CONFIG.FROM_NAME + '\n' +
CONFIG.TEAM_EMAIL;

  MailApp.sendEmail({
    to: email,
    cc: CONFIG.TEAM_EMAIL,
    replyTo: CONFIG.TEAM_EMAIL,
    name: CONFIG.FROM_NAME,
    subject: 'Blog Zero — your story "' + title + '" is approved',
    body: body,
  });

  sentCell.setValue(new Date());
}
