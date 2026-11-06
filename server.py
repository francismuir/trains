#!/usr/bin/env python3
"""
Local HTTP Server & traintimes.org.uk Scraper Proxy for UK Rail Trip Planner
Run: python3 server.py [port]
Default port: 8080
"""

import http.server
import json
import socketserver
import ssl
import subprocess
import sys
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

PORT = 8080
OPEN_BROWSER = True
for arg in sys.argv[1:]:
    if arg == "--no-browser":
        OPEN_BROWSER = False
    elif arg.isdigit():
        PORT = int(arg)

DIRECTORY = Path(__file__).resolve().parent


def fetch_traintimes_page(target_url: str) -> bytes:
    """Fetch traintimes.org.uk HTML using curl or urllib with macOS SSL compatibility."""
    user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    try:
        res = subprocess.run(
            ["curl", "-sL", "--max-time", "15", "-A", user_agent, target_url],
            capture_output=True,
            check=True
        )
        if res.stdout and b"<ul class=\"results\">" in res.stdout:
            return res.stdout
    except Exception:
        pass

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(
        target_url,
        headers={
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-GB,en;q=0.9"
        }
    )
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        return resp.read()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def end_headers(self):
        # Allow CORS so even opening index.html directly via file:// can query localhost:8080/api/traintimes
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/traintimes":
            qs = urllib.parse.parse_qs(parsed.query)
            target_url = qs.get("url", [""])[0]
            if not target_url.startswith("https://traintimes.org.uk/"):
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Invalid traintimes.org.uk URL"}).encode("utf-8"))
                return

            try:
                html_bytes = fetch_traintimes_page(target_url)
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(html_bytes)
            except Exception as exc:
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(exc)}).encode("utf-8"))
            return

        super().do_GET()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"UK Rail Trip Planner running at {url}", flush=True)
        if OPEN_BROWSER:
            try:
                webbrowser.open(url)
            except Exception:
                pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
