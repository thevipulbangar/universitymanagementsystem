# TODO — fake / not working

## Buttons that don't do anything
- [x] **Academic year dropdown** (removed) (top bar) — picking a past year only shows a toast; data never changes. `app/Portal.dc.html:530`
- [x] **Settings** (profile menu) — now a real page: account details, change password, text size. "Academic Details" removed from the menu. `app/Portal.dc.html:546`
- [x] **Help / Contact Support** (login page) — now opens an email to admissions@vit.edu. `app/Portal.dc.html:97`
- [ ] **Pay fee** — marks the fee paid in the database, but there is no real payment step (test payment).

## Hardcoded / made-up data
- [ ] **Invigilation duties** — every exam paper a faculty member doesn't teach is labelled "Invigilation"; needs a real `invigilation` table. `app/Faculty.dc.html:875`
- [ ] **"Examination fee due 20 September 2026"** — typed in; should use the fee's real due date. `app/ModuleHome.dc.html:140`
- [x] **Hostel office hours + maintenance email** — hostel page now shows "Coming soon…". `app/Records.dc.html:490-491`

## Leftover code
- [x] **Admin console** — back with its own sign-in page at /admin, plus a Faculty Control page. `app/Portal.dc.html` (lines 280, 355, 440–488), `app/Admin.dc.html`

## Done
- [x] **Marksheets** — class teacher generates them (faculty Examinations page) once every faculty has entered marks; students see them in Certificates

- [x] **Marks → grades** — CVV 12.5 / MSE 25 / ESE 50 / Assignments 12.5; faculty submit final marks; HoD schedules grade sheet release; students see grade + SGPA

## Older open items
- [ ] No forgot-password flow
- [ ] Sample constants still in `app/portal-data.js` (shown briefly if the server is down)
- [ ] Registration window closed (27 Jul – 7 Aug) — open it from a Head of Department account
- [ ] Check every page in a browser
- [ ] Commit the changes
