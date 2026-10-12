# Static server for the portal with caching disabled, so edits show up on a normal refresh.
import http.server, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

os.chdir(os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(("", 5500), NoCache).serve_forever()
