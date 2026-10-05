#!/usr/bin/env python3
"""Setlister static server and shared SQLite state API."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("SETLISTER_DATA_DIR", APP_DIR / "data")).resolve()
DB_PATH = DATA_DIR / "setlister.sqlite3"
HOST = os.environ.get("SETLISTER_HOST", "0.0.0.0")
PORT = int(os.environ.get("SETLISTER_PORT", "8110"))
MAX_BODY_BYTES = 5 * 1024 * 1024
HISTORY_LIMIT = 200


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    return connection


def initialize_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect_db() as database:
        database.executescript(
            """
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                revision INTEGER NOT NULL,
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS state_history (
                revision INTEGER PRIMARY KEY,
                state_json TEXT NOT NULL,
                saved_at TEXT NOT NULL
            );
            """
        )


def valid_state(value: object) -> bool:
    if not isinstance(value, dict) or value.get("version") != 1:
        return False
    return (
        isinstance(value.get("songs"), list)
        and isinstance(value.get("members"), list)
        and isinstance(value.get("savedSetlists"), list)
        and isinstance(value.get("draft"), dict)
        and isinstance(value["draft"].get("songIds"), list)
    )


class SetlisterHandler(SimpleHTTPRequestHandler):
    server_version = "Setlister/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.log_date_time_string()} {self.address_string()} {format % args}", flush=True)

    def end_headers(self) -> None:
        if not urlparse(self.path).path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
            "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        )
        super().end_headers()

    def send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == "/api/health":
            with connect_db() as database:
                row = database.execute("SELECT revision, updated_at FROM app_state WHERE id = 1").fetchone()
            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "initialized": row is not None,
                    "revision": row["revision"] if row else 0,
                    "updatedAt": row["updated_at"] if row else None,
                },
            )
            return
        if path == "/api/state":
            with connect_db() as database:
                row = database.execute("SELECT revision, state_json, updated_at FROM app_state WHERE id = 1").fetchone()
            if row is None:
                self.send_json(HTTPStatus.OK, {"state": None, "revision": 0, "updatedAt": None})
            else:
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "state": json.loads(row["state_json"]),
                        "revision": row["revision"],
                        "updatedAt": row["updated_at"],
                    },
                )
            return
        if path.startswith("/api/"):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Nenalezeno"})
            return
        if not self.public_path(path):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        path = unquote(urlparse(self.path).path)
        if not self.public_path(path):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        super().do_HEAD()

    def do_PUT(self) -> None:
        if unquote(urlparse(self.path).path) != "/api/state":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Nenalezeno"})
            return
        if not self.same_origin_request():
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Neplatný původ požadavku"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "Neplatná velikost dat"})
            return
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Neplatný JSON"})
            return
        state = payload.get("state") if isinstance(payload, dict) else None
        base_revision = payload.get("baseRevision") if isinstance(payload, dict) else None
        if not isinstance(base_revision, int) or base_revision < 0 or not valid_state(state):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Neplatná data Setlisteru"})
            return

        serialized = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        timestamp = utc_now()
        with connect_db() as database:
            database.execute("BEGIN IMMEDIATE")
            current = database.execute("SELECT revision, state_json FROM app_state WHERE id = 1").fetchone()
            current_revision = current["revision"] if current else 0
            if base_revision != current_revision:
                database.rollback()
                self.send_json(HTTPStatus.CONFLICT, {"error": "Konflikt verzí", "revision": current_revision})
                return
            next_revision = current_revision + 1
            if current:
                database.execute(
                    "INSERT OR REPLACE INTO state_history (revision, state_json, saved_at) VALUES (?, ?, ?)",
                    (current_revision, current["state_json"], timestamp),
                )
                database.execute(
                    "UPDATE app_state SET revision = ?, state_json = ?, updated_at = ? WHERE id = 1",
                    (next_revision, serialized, timestamp),
                )
            else:
                database.execute(
                    "INSERT INTO app_state (id, revision, state_json, updated_at) VALUES (1, ?, ?, ?)",
                    (next_revision, serialized, timestamp),
                )
            database.execute(
                "DELETE FROM state_history WHERE revision NOT IN "
                "(SELECT revision FROM state_history ORDER BY revision DESC LIMIT ?)",
                (HISTORY_LIMIT,),
            )
            database.commit()
        self.send_json(HTTPStatus.OK, {"ok": True, "revision": next_revision, "updatedAt": timestamp})

    def same_origin_request(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        origin_host = urlparse(origin).netloc.lower()
        request_host = (self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or "").split(",")[0].strip().lower()
        return bool(origin_host and request_host and origin_host == request_host)

    @staticmethod
    def public_path(path: str) -> bool:
        if ".." in Path(path).parts:
            return False
        return path in {"/", "/index.html", "/styles.css", "/app.js"} or path.startswith("/assets/")


def main() -> None:
    initialize_database()
    server = ThreadingHTTPServer((HOST, PORT), SetlisterHandler)
    print(f"Setlister běží na http://{HOST}:{PORT} a ukládá do {DB_PATH}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
