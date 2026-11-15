# Vercel serverless entry: the same API handler as serve.py, run per request. All /api/* calls are rewritten here (vercel.json).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import serve

try: serve.M.ensure_indexes(); serve.M.sync_years()  # cheap no-ops once done; never block a request on failure
except Exception as e: print("startup:", repr(e))

class handler(serve.Handler): pass
