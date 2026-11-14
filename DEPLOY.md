# Deploy checklist: laptop as server

How it works:

```
Visitor → Netlify (pages) → ngrok (public address) → this laptop: serve.py + MongoDB
```

The site works only while this laptop is on, online, and running `start-server.bat`.

---

## 1. ngrok (one time)
- [ ] Install ngrok: open PowerShell and run `winget install ngrok.ngrok`, then reopen PowerShell
- [ ] Sign up at https://dashboard.ngrok.com (Google login is fine)
- [ ] Copy the authtoken command from **Getting Started → Your Authtoken** and run it:
      `ngrok config add-authtoken <your-token>` (never share the token)
- [ ] **Domains → + New Domain → Create**, then note the free address, e.g. `something.ngrok-free.app`

## 2. Wire the address into the project (one time)
- [ ] In `netlify.toml`, replace `YOUR-NGROK-DOMAIN.ngrok-free.app` with your address
- [ ] In `start-server.bat`, replace `YOUR-NGROK-DOMAIN.ngrok-free.app` with your address
- [ ] Test locally: double-click `start-server.bat`, then open `https://<your-address>/api/stats`
      (should show `{"student": 9072, "faculty": 468, "department": 7}`)
- [ ] Commit and push to GitHub (`main`)

## 3. Netlify (one time)
- [ ] Sign up at https://netlify.com **with GitHub**
- [ ] **Add new site → Import an existing project → GitHub →** `universitymanagementsystem`
- [ ] Leave the settings as they are (`netlify.toml` sets the publish folder to `app`), then click **Deploy**
- [ ] Optional: **Site configuration → Change site name**, e.g. `vit-academic-portal`
- [ ] Check all three logins open on the Netlify link:
  - [ ] `/` Student login
  - [ ] `/faculty` Faculty login
  - [ ] `/admin` Admin login
- [ ] Sign in once with each role to confirm data loads

## 4. Every time you want the site online
- [ ] Laptop is plugged in and connected to the internet
- [ ] Turn off sleep: **Settings → System → Power → Screen and sleep → Never** (while hosting)
- [ ] Double-click `start-server.bat`, and keep its window open
- [ ] Open the Netlify link to confirm it works
- [ ] To take the site offline, close the `start-server.bat` window

## 5. Before sharing the link
- [ ] Change the admin password (Admin → Faculty Control → Set password, or Database Console)
- [ ] Remember: the live site uses this laptop's real database, so online changes are real data
- [ ] Keep `keys.env` private (it is never uploaded: `.gitignore` excludes it)

## Troubleshooting
| Problem | Fix |
|---|---|
| Netlify pages load but login fails | `start-server.bat` isn't running, or the ngrok address in `netlify.toml` is wrong |
| "MongoDB is not reachable" | Start MongoDB: **Win + R → services.msc → MongoDB Server → Start** |
| ngrok says "domain not found" | The address in `start-server.bat` doesn't match the one in your ngrok dashboard |
| Port 5500 already in use | An old server is still running; close it or restart the laptop |
| Changes in code don't show online | `git push`, then Netlify redeploys automatically (about 1 min) |
