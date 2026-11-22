from contextlib import ExitStack
from datetime import datetime, timezone
from http.client import HTTPConnection
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from setlister import platform_admin, server


class PlatformAdminTests(unittest.TestCase):
    def setUp(self):
        self.contexts = ExitStack()
        self.addCleanup(self.contexts.close)
        self.root = Path(self.contexts.enter_context(tempfile.TemporaryDirectory()))
        self.contexts.enter_context(patch.multiple(server, DATA_DIR=self.root, DB_PATH=self.root / "setlister.sqlite3",
                                         OPTIONS_PATH=self.root / "options.json"))
        self.root.joinpath("options.json").write_text(json.dumps({
            "cloudflare_access_aud": "private-audience",
            "platform_admin_aud": "admin-audience",
            "platform_admin_owners": "owner@example.test",
            "platform_admin_support": "helper@example.test",
        }))
        server.initialize_database()
        self.now = "2026-11-22T00:00:00+00:00"
        with server.connect_db() as db:
            db.executemany("INSERT INTO public_users (id,name,email,password_hash,created_at) VALUES (?, ?, ?, 'hash', ?)", [
                ("owner", "Vlastník", "band-owner@example.test", self.now),
                ("member", "Zpěvák", "singer@example.test", self.now),
                ("foreign", "Jiný účet", "outside@example.test", self.now),
            ])
            db.execute("INSERT INTO public_bands VALUES ('band','Kapela Žár','ABCD1234','owner',?)", (self.now,))
            db.executemany("INSERT INTO public_band_members VALUES ('band',?,?,?)", [
                ("owner", "owner", self.now), ("member", "member", self.now)
            ])
            state = server.public_default_state({"id": "owner", "name": "Vlastník"})
            state["members"].append({"id": "singer-profile", "name": "Zpěvák", "linkedUserId": "member"})
            state["songs"][0]["memberDetails"] = {
                "member-owner": {"note": "Poznámka vlastníka"}, "singer-profile": {"note": "Poznámka zpěváka"}}
            state["tasks"] = [{"id": "task", "assigneeUserId": "member"}]
            state["calendarEntries"] = [{"id": "leave", "userId": "member"}]
            db.execute("INSERT INTO public_band_state VALUES ('band',0,?,?)", (json.dumps(state), self.now))
            db.execute("INSERT INTO public_sessions VALUES ('hash','member',?,?)", (self.now, self.now))
            db.execute("""
                INSERT INTO public_gmail_messages_fts
                    (band_id, account_email, message_id, subject, body_text)
                VALUES ('band','mail@example.test','m1','Zpráva','Obsah zprávy')
            """)

    def test_counts_and_preview_are_scoped(self):
        with server.connect_db() as db:
            self.assertEqual(platform_admin.overview(db),
                             {"users": 3, "bands": 1, "memberships": 2, "stageMembers": 2, "promoBands": 0})
            self.assertEqual(platform_admin.directory(db, "bands", "ŽÁR", 0)["items"][0]["id"], "band")
            view = platform_admin.support_preview(db, "band", "member")
            self.assertEqual(view["songs"][0]["personal"], {"note": "Poznámka zpěváka"})
            self.assertNotIn("Poznámka vlastníka", json.dumps(view, ensure_ascii=False))
            with self.assertRaises(platform_admin.AdminError):
                platform_admin.support_preview(db, "band", "foreign")

    def test_months_extend_the_trial_without_rewriting_subscription(self):
        with server.connect_db() as db:
            db.execute("""
                INSERT INTO public_subscriptions (band_id,status,plan_name,current_period_end,updated_at)
                VALUES ('band','trialing','Early','2027-01-31T14:00:00+00:00',?)
            """, (self.now,))
            with patch.object(platform_admin, "utc_now", return_value=datetime(2026, 11, 22, tzinfo=timezone.utc)):
                promo = platform_admin.grant_promo(db, "band", 1)
                self.assertEqual(promo, {
                    "startsAt": "2027-01-31T14:00:00+00:00", "endsAt": "2027-02-28T14:00:00+00:00"})
                extension = platform_admin.grant_promo(db, "band", 2)
            self.assertEqual(extension["startsAt"], promo["startsAt"])
            self.assertEqual(extension["endsAt"], "2027-04-28T14:00:00+00:00")
            self.assertEqual(db.execute("SELECT status FROM public_subscriptions").fetchone()[0], "trialing")

    def test_delete_account_keeps_stage_profile_and_rejects_owned_band(self):
        with server.connect_db() as db:
            with self.assertRaises(platform_admin.AdminError):
                platform_admin.delete_user(db, "owner", "band-owner@example.test")
            platform_admin.transfer_band(db, "band", "member")
            platform_admin.delete_user(db, "owner", "band-owner@example.test")
            state = json.loads(db.execute("SELECT state_json FROM public_band_state").fetchone()[0])
            self.assertEqual(state["members"][0]["linkedUserId"], "")
            self.assertEqual(state["songs"][0]["memberDetails"]["member-owner"]["note"], "Poznámka vlastníka")
            self.assertEqual(platform_admin.band_detail(db, "band")["ownerId"], "member")

    def test_remove_member_unlinks_sessions_tasks_and_calendar(self):
        with server.connect_db() as db:
            platform_admin.delete_user(db, "member", "singer@example.test")
            state = json.loads(db.execute("SELECT state_json FROM public_band_state").fetchone()[0])
            self.assertEqual(state["members"][1]["linkedUserId"], "")
            self.assertEqual(state["tasks"][0]["assigneeUserId"], "")
            self.assertEqual(state["calendarEntries"], [])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM public_sessions").fetchone()[0], 0)

    def test_delete_band_needs_exact_confirmation_and_removes_search_index(self):
        with server.connect_db() as db:
            with self.assertRaises(platform_admin.AdminError):
                platform_admin.delete_band(db, "band", "náhodná hodnota")
            platform_admin.delete_band(db, "band", "Kapela Žár")
            self.assertFalse(db.execute("SELECT 1 FROM public_gmail_messages_fts").fetchone())
            self.assertFalse(db.execute("SELECT 1 FROM public_band_state").fetchone())
            self.assertEqual(db.execute("SELECT COUNT(*) FROM public_users").fetchone()[0], 3)

    def test_admin_routes_require_separate_audience_allowlist_and_appropriate_role(self):
        self.contexts.enter_context(patch.object(server.SetlisterHandler, "log_message"))
        self.contexts.enter_context(patch.object(server, "cloudflare_identity",
            side_effect=lambda token, options: {
                "owner": "owner@example.test", "helper": "helper@example.test",
                "other": "other@example.test",
            }.get(token) if options["cf_access_aud"] == "admin-audience" else None))
        http = server.ThreadingHTTPServer(("127.0.0.1", 0), server.SetlisterHandler)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(http.server_close)
        self.addCleanup(http.shutdown)

        def request(path, token="", payload=None, origin="https://admin.setlister.cz", host="admin.setlister.cz"):
            conn = HTTPConnection("127.0.0.1", http.server_port, timeout=5)
            headers = {"Host": host, "Origin": origin, "Content-Type": "application/json"}
            if token:
                headers["Cf-Access-Jwt-Assertion"] = token
            with self.subTest(path=path, token=token or "anonymous"):
                try:
                    conn.request("GET" if payload is None else "POST", path,
                                 body=json.dumps(payload) if payload is not None else None, headers=headers)
                    response = conn.getresponse()
                    return response.status, response.read()
                finally:
                    conn.close()

        self.assertEqual(request("/api/admin/overview")[0], 401)
        self.assertEqual(request("/api/admin/overview", "other")[0], 403)
        self.assertEqual(request("/api/admin/overview", "owner", host="app.setlister.cz")[0], 404)
        self.assertEqual(request("/", "owner")[0], 200)
        self.assertEqual(request("/api/admin/overview", "helper")[0], 200)
        action = {"action": "grant_promo", "bandId": "band", "months": 1, "reason": "Test promo období"}
        self.assertEqual(request("/api/admin/action", "helper", action)[0], 403)
        self.assertEqual(request("/api/admin/action", "owner", action, origin="https://app.setlister.cz")[0], 403)
        self.assertEqual(request("/api/admin/action", "owner", action)[0], 200)
        self.assertEqual(request("/api/admin/action", "helper", {
            "action": "preview", "bandId": "band", "userId": "member", "reason": "Kontrola profilu"
        })[0], 200)
        audit = json.loads(request("/api/admin/audit", "owner")[1])["items"]
        self.assertEqual([row["action"] for row in audit], ["preview", "grant_promo"])


if __name__ == "__main__":
    unittest.main()
