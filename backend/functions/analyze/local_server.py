"""
Servidor local para pruebas — Sentio
Corre el Lambda handler directamente sin SAM ni Docker.

Uso:
    cd backend/functions/analyze
    python local_server.py

Luego en frontend/.env.local:
    VITE_API_URL=http://localhost:8787
"""

import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

# Importar el handler de Lambda directamente
import handler as sentio_handler


class SentioHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        print(f"[server] {self.address_string()} — {format % args}")

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST,GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        event = {
            "httpMethod": "GET",
            "path": self.path.split("?")[0],
            "queryStringParameters": self._parse_query(),
            "body": None,
        }
        self._dispatch(event)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw    = self.rfile.read(length) if length else b"{}"
        body   = raw.decode("utf-8", errors="replace")
        event  = {
            "httpMethod": "POST",
            "path": self.path.split("?")[0],
            "queryStringParameters": {},
            "body": body,
        }
        self._dispatch(event)

    def _parse_query(self):
        if "?" not in self.path:
            return {}
        qs = self.path.split("?", 1)[1]
        params = {}
        for part in qs.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                params[k] = v
        return params

    def _dispatch(self, event):
        try:
            response = sentio_handler.lambda_handler(event, None)
            status   = response.get("statusCode", 200)
            body     = response.get("body", "")
            headers  = response.get("headers", {})

            self.send_response(status)
            for k, v in headers.items():
                self.send_header(k, v)
            self._send_cors_headers()
            self.send_header("Content-Length", str(len(body.encode("utf-8"))))
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))

        except Exception as e:
            print(f"[server] ERROR: {e}", file=sys.stderr)
            import traceback; traceback.print_exc()
            error_body = json.dumps({"error": str(e)})
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.send_header("Content-Length", str(len(error_body)))
            self.end_headers()
            self.wfile.write(error_body.encode("utf-8"))


if __name__ == "__main__":
    port   = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    server = HTTPServer(("0.0.0.0", port), SentioHandler)
    print(f"[server] Sentio local corriendo en http://localhost:{port}")
    print(f"[server]   POST http://localhost:{port}/analyze")
    print(f"[server]   POST http://localhost:{port}/analyze/batch")
    print(f"[server]   GET  http://localhost:{port}/history")
    print(f"[server] Ctrl+C para detener")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[server] Detenido.")
