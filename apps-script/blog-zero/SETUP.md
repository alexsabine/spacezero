# Blog Zero — Google Workspace setup

The submission form on `blog.html` posts to a small Google Apps Script web
app that lives inside a Google Sheet. One Sheet, two Drive folders, one
script — nothing else. Budget about 20 minutes.

## What you are building

```
blog.html form ──POST──▶ Apps Script web app
                              │
                              ├─▶ saves the uploaded draft into
                              │   Drive folder "Blog Zero — Submissions"
                              │
                              └─▶ appends a row to the
                                  "Blog Zero Tracker" Sheet

You set Status = "Approved" on a row
                              │
                              └─▶ the writer automatically receives an
                                  email inviting them to upload their
                                  draft as a Google Doc into
                                  "Blog Zero — Drafts" (shared folder)
```

## Step 1 — Drive folders

In Google Drive (your Space Zero Workspace account):

1. Create a folder **`Blog Zero — Submissions`**.
   Keep it private to the team; raw uploads land here.
   Open it and copy the **folder ID** — the long string in the URL after
   `/folders/`.
2. Create a folder **`Blog Zero — Drafts`**.
   Share it: *Share → General access → "Anyone with the link" → Editor*
   (or, tighter: leave it restricted and add each approved writer's email
   by hand — the email they receive still works either way).
   Copy the **share link**.

## Step 2 — The tracker Sheet

1. Create a Google Sheet named **`Blog Zero Tracker`**.
2. In the Sheet: **Extensions → Apps Script**.
3. Delete the placeholder code and paste in the whole of `Code.gs`
   (next to this file in the repo).
4. At the top of the script, fill in `CONFIG`:
   - `SUBMISSIONS_FOLDER_ID` — the folder ID from Step 1.1
   - `DRAFTS_FOLDER_LINK` — the share link from Step 1.2
   - `TEAM_EMAIL` — already `info@space-zero.org`; change if needed.
5. Save (💾), then in the function dropdown pick **`setupSheet`** and press
   **Run**. Grant the permissions it asks for (Drive, Sheets, Mail — it is
   your own script running as you). This creates the `Submissions` tab
   with headers and the Status dropdown.

## Step 3 — Deploy the web app

Still in the Apps Script editor:

1. **Deploy → New deployment → ⚙ → Web app**
2. Description: `Blog Zero submissions`
3. Execute as: **Me**
4. Who has access: **Anyone** ← this is what lets the website post to it;
   the script itself only ever writes to your Sheet and folder.
5. **Deploy**, then copy the **Web app URL** (ends in `/exec`).

## Step 4 — The approval trigger

Simple `onEdit` handlers cannot send email, so add an installable trigger:

1. In the Apps Script editor, click the **clock icon (Triggers)** →
   **+ Add Trigger**.
2. Function: **`onStatusEdit`** · Event source: **From spreadsheet** ·
   Event type: **On edit** → Save (grant permissions again if asked).

Now, whenever you change a row's **Status** to `Approved`, the writer gets
the invitation email (CC'd to `TEAM_EMAIL`) and the *Approval email sent*
column is stamped so it can never send twice. There is also a manual
**Blog Zero → Send approval email for selected row** menu inside the Sheet
as a fallback.

## Step 5 — Connect the website

In the site repo, open `blog.html`, find near the bottom:

```js
const BLOG_SUBMIT_URL = '';
```

Paste the `/exec` URL between the quotes, commit, and deploy the site.
(Until then the form politely tells people to email their piece to
info@space-zero.org, so nothing is ever lost.)

## Step 6 — Test it

1. Open `blog.html` on the live site, fill in the form with your own
   details, attach any small document, submit.
2. Check: a row appears in the Tracker, the file appears in
   *Blog Zero — Submissions*, and (if `NOTIFY_ON_SUBMISSION` is on)
   info@ receives a heads-up email.
3. Set that row's Status to **Approved** → you should receive the
   invitation email within a few seconds.

## Day-to-day flow

1. Submission arrives → row shows Status **New**.
2. Read the draft (link in the *Draft file* column).
3. Set Status to **Approved** → writer is emailed the drafts-folder
   invitation automatically. Or set **Declined** (nothing is sent —
   decline notes are yours to write personally, as they should be).
4. Writer uploads their Google Doc to *Blog Zero — Drafts*; edit together
   with comments.
5. When ready, the piece is added to the site as a new page under `blog/`
   and a new card on `blog.html`.

## Notes & limits

- Uploads are capped at 10 MB in the form and again in the script.
- A hidden honeypot field quietly swallows most spam bots; submissions
  with it filled are dropped without a trace.
- If you ever **edit `Code.gs` later**, remember: web app changes only go
  live via **Deploy → Manage deployments → ✏ edit → Version: New version →
  Deploy** (the URL stays the same).
- Consent: the form's submit button sits under an explicit tick-box
  agreeing to be added to the mailing list, so the emails you collect
  here are consented for event/news contact.
