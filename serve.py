# Portal server: static files from app/ (caching disabled) + the JSON API over MongoDB (mongo_db.py).
#   POST /api/auth/login | /api/auth/logout      sign-in with email + password -> session token
#   POST /api/db                                  {table, op, filters, order, range, count, head, values, returning}
#   POST /api/rpc/<name>                          register_section, drop_section, swap_section, admin_set_login
#   GET/POST /api/activity                        admin activity log (admins only)
import datetime, http.server, json, os, re, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))
try:
    import mongo_db as M
    M.client.admin.command("ping")
    M.ensure_indexes()
    M.ensure_feedback_form()
    M.sync_years()  # years of study follow the current academic year
    print("MongoDB:", M.MONGO_URI, "database vit_portal")
except Exception as e:
    sys.exit(f"MongoDB is not reachable ({e}). Start the MongoDB service (or set MONGODB_URI) and run serve.py again.")

APP = os.path.join(os.getcwd(), "app")


class Handler(http.server.SimpleHTTPRequestHandler):
    # Only app/ is public ("/" is the portal itself, so the URL stays clean). keys.env, scripts and data stay private.
    def translate_path(self, path):
        rel = super().translate_path(path)[len(os.getcwd()):].lstrip("\\/")
        rel = rel[4:] if rel.replace("\\", "/").startswith("app/") else rel
        p = os.path.normpath(os.path.join(APP, "Portal.dc.html" if rel in ("", "faculty", "admin") else rel))  # "/" = student sign-in, "/faculty" = faculty sign-in
        return p if p.startswith(APP) else os.path.join(APP, "__missing__")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the console quiet for API traffic
        if not self.path.startswith("/api/"): super().log_message(fmt, *args)

    def reply(self, code, body):
        data = json.dumps(body, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def token(self): return (self.headers.get("Authorization") or "").replace("Bearer ", "", 1)

    def body(self, limit=8_000_000):
        size = int(self.headers.get("Content-Length") or 0)
        if size > limit: raise M.DbError("request too large", "413", 413)
        try: return json.loads(self.rfile.read(size) or b"{}")
        except ValueError: raise M.DbError("invalid JSON", "400")

    def do_GET(self):
        if not self.path.startswith("/api/"): return super().do_GET()
        try:
            if self.path.startswith("/api/stats"):  # public: headline counts for the sign-in page
                return self.reply(200, {k: M.db[k].estimated_document_count() for k in ("student", "faculty", "department")})
            if not self.path.startswith("/api/activity"): raise M.DbError("not found", "404", 404)
            ctx = self.admin_ctx()
            limit = min(int((re.search(r"limit=(\d+)", self.path) or [0, 200])[1]), 1000)
            docs = list(M.db.activity_log.find({}, {"_id": 0}).sort("at", -1).limit(limit))
            self.reply(200, {"entries": docs, "total": M.db.activity_log.estimated_document_count()})
        except M.DbError as e: self.reply(e.status, {"error": e.message})

    def admin_ctx(self):
        ctx = M.context(self.token())
        if not ctx or not ctx["admin"]: raise M.DbError("Admins only — sign in as an administrator.", "42501", 401)
        return ctx

    def do_POST(self):
        path = self.path.split("?")[0]
        try:
            M.ensure_feedback_form()  # a new month gets its feedback form on the first request
            if path == "/api/auth/login":
                b = self.body(10_000); return self.reply(200, {"session": M.login(b.get("email"), b.get("password"), b.get("role"))})
            if path == "/api/auth/logout":
                M.logout(self.token()); return self.reply(200, {"ok": True})
            if path == "/api/activity":
                ctx = self.admin_ctx(); b = self.body(20_000)
                M.db.activity_log.insert_one({"at": datetime.datetime.now(datetime.timezone.utc), "actor": ctx["email"],
                                              "action": str(b.get("action", ""))[:60], "table": str(b.get("table", ""))[:60], "detail": b.get("detail")})
                return self.reply(201, {"ok": True})
            ctx = M.context(self.token())
            if path.startswith("/api/rpc/"):
                return self.reply(200, {"data": M.rpc(ctx, path[9:], self.body(10_000))})
            if path == "/api/db":
                b = self.body(); t, op, ret = b.get("table"), b.get("op"), b.get("returning", True)
                if op == "select":
                    rows, count = M.select(ctx, t, b.get("filters"), b.get("order"), b.get("range"), b.get("count"), b.get("head"))
                    return self.reply(200, {"data": None if b.get("head") else rows, "count": count})
                if op == "insert": return self.reply(201, {"data": M.insert(ctx, t, b.get("values"), ret)})
                if op == "upsert": return self.reply(201, {"data": M.upsert(ctx, t, b.get("values"), ret)})
                if op == "update": return self.reply(200, {"data": M.update(ctx, t, b.get("filters"), b.get("values") or {}, ret)})
                if op == "delete": return self.reply(200, {"data": M.delete(ctx, t, b.get("filters"), ret)})
                raise M.DbError(f"unknown op {op}")
            raise M.DbError("not found", "404", 404)
        except M.DbError as e:
            self.reply(e.status, {"error": e.json()})
        except Exception as e:  # never leak a stack trace to the browser
            print("API error:", repr(e)); self.reply(500, {"error": {"message": "internal error", "code": "XX000"}})


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128  # the portal fires ~20 requests at once on sign-in; the default backlog (5) refuses some on Windows
    daemon_threads = True

PORT = int(os.environ.get("PORT", 5500))  # hosts like Render set PORT
print(f"Portal on http://localhost:{PORT}/")
Server(("", PORT), Handler).serve_forever()
