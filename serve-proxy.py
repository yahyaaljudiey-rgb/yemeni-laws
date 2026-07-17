#!/usr/bin/env python3
"""خادم منفذ واحد: يقدّم التطبيق الثابت (out/) ويُمرّر طلبات الدماغ (/chat, /healthz,
/readyz, /search, /documents) إلى النواة على localhost:8000 — فيصل الهاتفُ كلَّ شيء
عبر :3000 فقط (لا حاجة لفتح :8000 ولا لـCORS، نفس الأصل). يدعم بثّ SSE."""
import http.server
import socketserver
import urllib.request
import urllib.error

OUT = "/home/yahya/المكتبة القنونية/out"
BRAIN = "http://127.0.0.1:8000"
API = ("/chat", "/healthz", "/readyz", "/search", "/documents", "/models", "/index")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=OUT, **k)

    def log_message(self, *a):  # هدوء
        pass

    def _is_api(self):
        return any(self.path.split("?")[0].startswith(p) for p in API)

    def _proxy(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(BRAIN + self.path, data=body, method=self.command)
        for h in ("Content-Type", "X-API-Key", "Accept"):
            if self.headers.get(h):
                req.add_header(h, self.headers[h])
        try:
            r = urllib.request.urlopen(req, timeout=180)
        except urllib.error.HTTPError as e:
            r = e
        except Exception as e:  # noqa: BLE001
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(f'{{"error":"proxy: {e}"}}'.encode())
            return
        self.send_response(r.status)
        self.send_header("Content-Type", r.headers.get("Content-Type", "application/json"))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            while True:
                chunk = r.read(512)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception:  # noqa: BLE001
            pass

    def do_POST(self):
        if self._is_api():
            self._proxy()
        else:
            self.send_error(404)

    def do_GET(self):
        if self._is_api():
            self._proxy()
        else:
            super().do_GET()


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    ThreadingServer(("0.0.0.0", 3000), Handler).serve_forever()
