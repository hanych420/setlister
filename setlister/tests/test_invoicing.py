import sqlite3
import unittest

from setlister import invoicing, server


class InvoicingTests(unittest.TestCase):
    def setUp(self):
        self.database = sqlite3.connect(":memory:")
        self.addCleanup(self.database.close)
        self.database.row_factory = sqlite3.Row
        self.database.executescript(
            "PRAGMA foreign_keys=ON; CREATE TABLE public_bands (id TEXT PRIMARY KEY);"
            "INSERT INTO public_bands VALUES ('kapela'), ('jina');" + invoicing.SCHEMA,
        )
        self.state = server.public_default_state()
        self.state["bandProfile"]["invoiceSupplier"] = {
            "name": "Kapela & synové", "address": "Hlavní 1, Praha", "ico": "00006947",
            "dic": "CZ00006947", "bankAccount": "123456789/0100", "vatPayer": True,
        }
        self.event = {
            "id": "event-1", "date": "2026-11-03", "feeAmount": 12100, "feeCurrency": "CZK",
            "invoiceCustomer": {"name": "Klub <Zkouška>", "address": "Dlouhá 2, Brno", "country": "CZ"},
        }
        self.form = {
            "issueDate": "2026-11-19", "dueDate": "2026-12-03", "taxDate": "2026-11-03",
            "description": "Hudební vystoupení", "vatRate": 21,
        }

    def issue(self, band="kapela", **form):
        with self.database:
            return invoicing.create_invoice(self.database, band, self.state, self.event, {**self.form, **form})

    def test_vat_snapshot_uses_stored_fee_and_cannot_be_modified_by_event_edit(self):
        invoice = self.issue()
        self.assertEqual(invoice["number"], "20260001")
        self.assertEqual(invoice["variableSymbol"], "20260001")
        self.assertEqual((invoice["netMinor"], invoice["vatMinor"], invoice["totalMinor"]), (1000000, 210000, 1210000))
        self.event["feeAmount"] = 15000
        self.event["invoiceCustomer"]["name"] = "Nový odběratel"
        self.assertEqual(invoicing.invoice_snapshot(self.database, "kapela", "event-1")["customer"]["name"], "Klub <Zkouška>")
        self.assertIsNone(invoicing.invoice_snapshot(self.database, "jina", "event-1"))

    def test_numbering_validation_and_non_vat_currency(self):
        self.state["bandProfile"]["invoiceSupplier"]["vatPayer"] = False
        self.event["feeCurrency"] = "EUR"
        self.event["feeAmount"] = 489.99
        first = self.issue(number="20260003", variableSymbol="303")
        self.assertEqual(first["totalMinor"], 48999)
        self.assertEqual(first["vatMinor"], 0)
        self.event["id"] = "event-2"
        with self.assertRaisesRegex(ValueError, "už v kapele existuje"):
            self.issue(number=first["number"])
        self.assertEqual(self.issue()["number"], "20260004")
        self.assertEqual(self.issue(band="jina")["number"], "20260001")

    def test_checks_invoice_dates_and_ares_fields(self):
        with self.assertRaisesRegex(ValueError, "Splatnost"):
            self.issue(dueDate="2026-11-18")
        with self.assertRaisesRegex(ValueError, "datum vystavení"):
            self.issue(issueDate="0001-01-01")
        self.event["invoiceCustomer"]["country"] = "other"
        with self.assertRaisesRegex(ValueError, "tuzemské"):
            self.issue()
        self.assertTrue(invoicing.valid_ico("00006947"))
        self.assertFalse(invoicing.valid_ico("00006948"))
        info = invoicing.party_from_ares({
            "obchodniJmeno": "Ministerstvo financí", "dic": "CZ00006947",
            "sidlo": {"textovaAdresa": "Letenská 525/15, Praha", "kodStatu": "CZ"},
        }, "00006947")
        self.assertEqual(info["address"], "Letenská 525/15, Praha")
        self.assertEqual(info["dic"], "CZ00006947")
