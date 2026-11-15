# Vercel serverless entry: the same API handler as serve.py, run per request. All /api/* calls are rewritten here (vercel.json).
import os, sys, traceback
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    import serve
    try: serve.M.ensure_indexes(); serve.M.sync_years()  # cheap no-ops once done; never block a request on failure
    except Exception as e: print("startup:", repr(e))
    class handler(serve.Handler): pass
except Exception:
    from http.server import BaseHTTPRequestHandler
    err = (sys.version + "\n" + traceback.format_exc()).encode()  # ponytail: temporary, remove once deploy works
    class handler(BaseHTTPRequestHandler):
        def do_GET(self): self.send_response(500); self.end_headers(); self.wfile.write(err)
        do_POST = do_GET
