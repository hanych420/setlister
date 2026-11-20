import copy
import unittest

from setlister import band_calendar, server


class BandPlanningTests(unittest.TestCase):
    def setUp(self):
        self.state = {
            "version": 2,
            "draft": {"songIds": ["song"]},
            "members": [
                {"id": "a", "name": "Alena", "linkedUserId": "usr-a"},
                {"id": "b", "name": "Bára", "linkedUserId": "usr-b"},
            ],
            "songs": [{"id": "song", "title": "Song", "seconds": 210, "readiness": {"b": "practice"}}],
            "events": [{
                "id": "gig", "name": "Koncert", "date": "2027-01-21", "venue": "Roxy",
                "showStart": "20:00", "showEnd": "01:00", "feeAmount": 12000.50, "feeCurrency": "CZK",
            }],
            "tasks": [{
                "id": "task", "title": "Nakoupit", "category": "Vlastní", "deadline": "2027-01-20",
                "assigneeUserId": "usr-b", "done": False,
            }],
            "calendarEntries": [{
                "id": "leave", "userId": "usr-b", "title": "Dovolená",
                "startDate": "2027-01-25", "endDate": "2027-01-26",
            }],
        }

    def test_calendar_export_has_exclusive_end_and_private_field_exclusions(self):
        feed = band_calendar.calendar_feed("band", "Kapela", self.state, "2026-11-19T12:00:00Z",
                                           {"usr-b": "Bára"}).decode()
        self.assertIn("DTSTART:20270121T190000Z\r\n", feed)
        self.assertIn("DTEND:20270122T000000Z\r\n", feed)
        self.assertIn("DTEND;VALUE=DATE:20270127\r\n", feed)
        self.assertIn("SUMMARY:Dovolená (Bára)\r\n", feed)
        self.assertNotIn("Nakoupit", feed)
        self.assertNotIn("12000.5", feed)
        self.assertNotIn("feeAmount", feed)

    def test_member_can_edit_only_their_own_calendar_and_readiness(self):
        proposed = copy.deepcopy(self.state)
        proposed["songs"][0]["readiness"]["a"] = "ready"
        self.assertTrue(server.can_change_personal_planning(self.state, proposed, "usr-a", "member"))
        proposed["songs"][0]["readiness"]["b"] = "ready"
        self.assertFalse(server.can_change_personal_planning(self.state, proposed, "usr-a", "member"))
        self.assertTrue(server.can_change_personal_planning(self.state, proposed, "usr-a", "owner"))
        proposed["calendarEntries"][0]["userId"] = "usr-a"
        self.assertFalse(server.can_change_personal_planning(self.state, proposed, "usr-a", "owner"))

    def test_planning_state_validates_optional_fields_and_dates(self):
        self.assertTrue(server.valid_public_state(self.state))
        legacy = {key: value for key, value in self.state.items() if key not in ("tasks", "calendarEntries")}
        self.assertTrue(server.valid_public_state(legacy))
        for key, value in (("deadline", "2027-02-29"), ("done", "true")):
            with self.subTest(key=key):
                invalid = copy.deepcopy(self.state)
                invalid["tasks"][0][key] = value
                self.assertFalse(server.valid_public_state(invalid))
        self.state["events"][0]["feeAmount"] = -1
        self.assertFalse(server.valid_public_state(self.state))

    def test_concert_checklist_tasks_use_a_valid_event_link(self):
        task = self.state["tasks"][0]
        self.assertTrue(server.valid_public_state(self.state))
        task["eventId"] = "gig"
        self.assertTrue(server.valid_public_state(self.state))
        task["done"] = True
        self.assertTrue(server.valid_public_state(self.state))
        self.state["events"].clear()
        self.assertFalse(server.valid_public_state(self.state))
        task.pop("eventId")
        self.assertTrue(server.valid_public_state(self.state))

    def test_interludes_in_draft_and_saved_setlists(self):
        interlude = {"id": "break", "title": "Pauza", "seconds": 120, "position": 1}
        self.state["draft"]["interludes"] = [interlude]
        self.state["savedSetlists"] = [{"songIds": ["song"], "interludes": [dict(interlude)]}]
        self.state["songs"][0]["memberDetails"] = {"a": {"manualTuning": True}}
        self.assertTrue(server.valid_public_state(self.state))
        for field, value in (("position", 2), ("seconds", -1), ("seconds", True), ("title", " ")):
            with self.subTest(field=field, value=value):
                invalid = copy.deepcopy(self.state)
                invalid["savedSetlists"][0]["interludes"][0][field] = value
                self.assertFalse(server.valid_public_state(invalid))
        self.state["draft"]["interludes"].append(dict(interlude))
        self.assertFalse(server.valid_public_state(self.state))

    def test_concert_duration_overrides_legacy_end_and_crosses_midnight(self):
        event = self.state["events"][0]
        event.update(showStart="23:45", showEnd="22:00", showDurationMinutes=60)
        self.state["venues"] = [{"name": "Roxy", "city": "Praha", "address": "Dlouhá 33"}]
        self.assertTrue(server.valid_public_state(self.state))
        self.assertEqual(band_calendar.planned_show_end(event), "00:45")
        feed = band_calendar.calendar_feed("band", "Kapela", self.state, "2026-11-19T12:00:00Z", {}).decode()
        self.assertIn("DTSTART:20270121T224500Z", feed)
        self.assertIn("DTEND:20270121T234500Z", feed)
        for duration in (True, 0, 1440, "60"):
            event["showDurationMinutes"] = duration
            self.assertFalse(server.valid_public_state(self.state))
        del event["showDurationMinutes"]
        self.assertEqual(band_calendar.planned_show_end(event), "22:00")
        self.state["venues"][0]["city"] = ""
        self.assertFalse(server.valid_public_state(self.state))
