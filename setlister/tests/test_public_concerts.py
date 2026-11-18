import tempfile
import unittest
import json
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

from setlister import public_concerts, server


class PublicConcertTests(unittest.TestCase):
    def setUp(self):
        stack = ExitStack()
        self.addCleanup(stack.close)
        directory = stack.enter_context(tempfile.TemporaryDirectory())
        stack.enter_context(patch.object(server, "DATA_DIR", Path(directory)))
        stack.enter_context(patch.object(server, "DB_PATH", Path(directory) / "test.sqlite3"))
        stack.enter_context(patch.dict("os.environ", {"OPENAI_API_KEY": ""}))
        server.initialize_database()
        with server.connect_db() as db:
            db.execute("INSERT INTO public_users VALUES ('owner','test@example.test','Owner','hash','now')")
            for band in ("a", "b"):
                db.execute("INSERT INTO public_bands VALUES (?, ?, ?, 'owner','now')", (band, band, band))
                db.execute("""INSERT INTO public_gmail_connections
                    (id, band_id, email, encrypted_refresh_token, connected_at, sync_state, last_sync_at)
                    VALUES (?, ?, 'band@example.test', '', 'now', 'ready', '2026-11-18T12:00:00Z')""",
                    (band, band))

    def mail(self, account, msg, when, city="Praha", venue="Roxy", status="YES", arrival="16:00"):
        day = "2027-01-28" if city == "Brno" else "2027-01-21"
        with server.connect_db() as db:
            db.execute("""INSERT INTO public_gmail_messages
                (band_id, connection_id, account_email, message_id, thread_id, internal_date,
                 sender_email, subject, body_text, web_url, indexed_at)
                VALUES (?, ?, 'band@example.test', ?, ?, ?, 'robot@culter.cz', ?, ?, ?, 'now')
                ON CONFLICT(band_id, account_email, message_id) DO UPDATE SET body_text=excluded.body_text""",
                (account, account, msg, f"thread-{venue}", when, f"Culter.cz modified term {day} - Test",
                 f"Město: {city}\nKlub: {venue}\nStav: {status}\nArrival: {arrival}\nZvukovka: 18:00",
                 f"https://mail.google.com/mail/u/0/#all/{msg}"))

    def enable(self, band):
        with server.connect_db() as db:
            db.execute("INSERT INTO public_concert_settings VALUES (?,1)", (band,))

    def drain(self):
        with patch.object(server, "json_request", side_effect=AssertionError("Culter should parse locally")):
            for _ in range(20):
                if not server.process_public_concert_thread():
                    return
        self.fail("Queue did not drain")

    def test_city_and_follow_up_use_same_event_set(self):
        self.enable("a")
        self.enable("b")
        self.mail("a", "roxy", 10)
        self.mail("a", "brno", 20, "Brno", "Kabinet Múz")
        self.mail("a", "option", 20, "Praha", "Pouhá opce", "OPTION")
        self.mail("b", "foreign", 20, "Praha", "Jiná kapela")
        self.drain()
        question = "Jaké všechny města budeme objíždět v roce 2027?"
        plan = server.public_mail_query_plan(question)
        first = server.public_concert_summary("a", plan)
        self.assertIn("Města (2)", first["answer"])
        model_plan = {**plan, "concert_operation": "list", "concert_location": "Praha"}
        with patch.dict("os.environ", {"OPENAI_API_KEY": "synthetic"}), patch.object(
            server, "json_request", return_value={"output_text": json.dumps(model_plan)}
        ):
            follow = server.public_mail_query_plan(
                "Tak vyjmenuj všechny města, datum a klub ve kterém to bude",
                [{"role": "user", "content": question}, {"role": "user", "content": "A Praha 21.1. ? ROXY?"}],
            )
        result = server.public_concert_summary("a", follow)
        self.assertIn("Koncerty (2)", result["answer"])
        self.assertIn("Roxy", result["answer"])
        self.assertIn("Kabinet Múz", result["answer"])
        self.assertNotIn("Jiná kapela", result["answer"])
        self.assertNotIn("Pouhá opce", result["answer"])
        self.assertEqual(len(result["sources"]), 2)

    def test_opt_in_updates_cancellation_and_disconnect(self):
        self.mail("a", "original", 10)
        self.assertFalse(server.process_public_concert_thread())
        self.enable("a")
        self.drain()
        self.mail("a", "update", 20, arrival="17:30")
        with server.connect_db() as db:
            self.assertEqual(public_concerts.status(db, "a")["pending"], 1)
        self.drain()
        with server.connect_db() as db:
            event, = public_concerts.read_events(db, "a")
        self.assertEqual(event["arrival"][0]["value"], "17:30")
        self.assertEqual(event["soundcheck"][0]["value"], "18:00")
        self.assertEqual(event["changes"][0]["message_id"], "update")
        self.mail("a", "cancelled", 30, status="CANCELLED")
        self.drain()
        with server.connect_db() as db:
            event, = public_concerts.read_events(db, "a")
            self.assertEqual(event["status"][0]["value"], "cancelled")
            db.execute("DELETE FROM public_gmail_connections WHERE id='a'")
            self.assertEqual(public_concerts.read_events(db, "a"), [])

    def test_unconfirmed_time_conflict_stays_visible(self):
        def fact(field, value, timestamp, change=False):
            return {"field": field, "value": value, "timestamp": timestamp, "message_id": str(timestamp),
                    "explicit_change": change}
        facts = [fact("date", "2027-01-21", 10), fact("arrival", "16:00", 10),
                 fact("arrival", "17:30", 20), fact("soundcheck", "18:00", 10)]
        event, = public_concerts.reconcile([(("a", "t"), facts)])
        self.assertEqual([item["value"] for item in event["arrival"]], ["16:00", "17:30"])
        event, = public_concerts.reconcile([(("a", "t"), facts + [fact("arrival", "17:00", 30, True)])])
        self.assertEqual([item["value"] for item in event["arrival"]], ["17:00"])
        self.assertEqual(event["soundcheck"][0]["value"], "18:00")

    def test_budget_is_separate_and_denial_preserves_queue(self):
        with server.connect_db() as db:
            self.assertTrue(public_concerts.reserve(db, "a", 1, 100))
        with server.connect_db() as db:
            self.assertFalse(public_concerts.reserve(db, "a", 1, 100))
            self.assertEqual(db.execute("SELECT COUNT(*) FROM public_ai_usage").fetchone()[0], 0)

    def test_unsupported_date_and_excerpt_are_rejected(self):
        row = {"message_id": "msg", "internal_date": 100, "web_url": "https://mail.google.com/",
               "subject": "Roxy"}
        def fact(field, value, quote):
            return {"field": field, "value": value, "message_id": "msg", "quote": quote,
                    "explicit_change": False}
        excerpt = "Termín 21. 1. 2027 potvrzujeme. Příjezd 16:00."
        events = [{"facts": [
            fact("date", "2027-01-21", "Termín 21. 1. 2027 potvrzujeme."),
            fact("date", "2027-01-24", "Termín 21. 1. 2027 potvrzujeme."),
            fact("arrival", "17:00", "Příjezd 16:00."),
            fact("venue", "pódium B", "pódium B"),
        ]}]
        result, = public_concerts.validate_events(events, {"msg": excerpt}, [row])
        self.assertEqual([(item["field"], item["value"]) for item in result], [("date", "2027-01-21")])
