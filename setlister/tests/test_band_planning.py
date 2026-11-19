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
