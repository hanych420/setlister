"""Concert invoice snapshots and printable Czech invoices."""

import io
import json
import re
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from pathlib import Path
from xml.sax.saxutils import escape

ARES_SUBJECT_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/"
PARTY_FIELDS = {"name": 160, "address": 260, "ico": 8, "dic": 32}
SUPPLIER_FIELDS = {"bankAccount": 100, "registration": 180}
CURRENCIES = {"CZK", "EUR", "GBP", "USD", "PLN", "CHF"}
SCHEMA = """
CREATE TABLE IF NOT EXISTS public_concert_invoices (
    band_id TEXT NOT NULL REFERENCES public_bands(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    number TEXT NOT NULL COLLATE NOCASE,
    issued_on TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    PRIMARY KEY (band_id, event_id),
    UNIQUE (band_id, number)
);
"""


def valid_ico(ico):
    if not isinstance(ico, str) or not re.fullmatch(r"[0-9]{8}", ico) or ico == "00000000":
        return False
    checksum = sum(int(digit) * weight for digit, weight in zip(ico, range(8, 1, -1)))
    return (11 - checksum % 11) % 10 == int(ico[-1])


def valid_party(value, supplier=False):
    if not isinstance(value, dict):
        return False
    fields = {**PARTY_FIELDS, **SUPPLIER_FIELDS} if supplier else PARTY_FIELDS
    if any(not isinstance(value.get(key, ""), str) or len(value.get(key, "")) > limit
           for key, limit in fields.items()):
        return False
    ico = value.get("ico", "").strip()
    if ico and not valid_ico(ico):
        return False
    if supplier:
        return type(value.get("vatPayer", False)) is bool
    return value.get("country", "CZ") in ("CZ", "other")


def party_from_ares(data, ico):
    address = data.get("sidlo") or {}
    name = data.get("obchodniJmeno") or ""
    registered_address = address.get("textovaAdresa") or ""
    if not name or not registered_address:
        raise ValueError("ARES u tohoto IČO nevrátil název a sídlo.")
    party = {
        "ico": ico, "name": name, "address": registered_address,
        "dic": data.get("dic") or "",
        "country": "CZ" if address.get("kodStatu", "CZ") == "CZ" else "other",
    }
    if not valid_party(party):
        raise ValueError("Údaje z ARESu se nevejdou do formuláře. Můžeš je zadat ručně.")
    return party


def invoice_rows(database, band_id):
    rows = database.execute("""
        SELECT snapshot_json FROM public_concert_invoices WHERE band_id=?
        ORDER BY issued_on DESC, rowid DESC
    """, (band_id,))
    for row in rows:
        snapshot = json.loads(row["snapshot_json"])
        yield {key: snapshot[key] for key in ("eventId", "number", "issueDate", "customer", "totalMinor", "currency")}


def invoice_snapshot(database, band_id, event_id):
    row = database.execute("SELECT snapshot_json FROM public_concert_invoices WHERE band_id=? AND event_id=?",
                           (band_id, event_id)).fetchone()
    return json.loads(row["snapshot_json"]) if row else None


def required_date(value, error):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError(error)
    try:
        parsed = date.fromisoformat(value)
        if parsed.year < 1900:
            raise ValueError(error)
        return parsed
    except ValueError as invalid:
        raise ValueError(error) from invalid


def create_invoice(database, band_id, state, event, payload):
    supplier = state.get("bandProfile", {}).get("invoiceSupplier", {})
    customer = event.get("invoiceCustomer", {})
    if (not valid_party(supplier, supplier=True)
            or not all(supplier.get(key, "").strip() for key in ("name", "address", "ico", "bankAccount"))):
        raise ValueError("Vyplň název, sídlo, IČO a bankovní účet ve fakturačních údajích dodavatele.")
    if not valid_party(customer) or not all(customer.get(key, "").strip() for key in ("name", "address")):
        raise ValueError("U koncertu doplň název a adresu odběratele.")
    fee = event.get("feeAmount")
    currency = event.get("feeCurrency", "CZK")
    if type(fee) not in (int, float) or not 0 < fee <= 1_000_000_000 or currency not in CURRENCIES:
        raise ValueError("U koncertu zadej kladný honorář a měnu.")
    description = payload.get("description")
    if not isinstance(description, str) or not 1 <= len(description.strip()) <= 200:
        raise ValueError("Doplň popis fakturované služby do 200 znaků.")

    issued = required_date(payload.get("issueDate"), "Zadej datum vystavení.")
    due = required_date(payload.get("dueDate"), "Zadej datum splatnosti.")
    if due < issued:
        raise ValueError("Splatnost musí být nejdříve v den vystavení.")
    total = int(Decimal(str(fee)) * 100)
    rate = 0
    vat = 0
    tax_date = None
    if supplier.get("vatPayer"):
        if currency != "CZK" or customer.get("country", "CZ") != "CZ":
            raise ValueError("Faktury s DPH jsou dostupné pro tuzemské plnění v Kč.")
        if not supplier.get("dic", "").strip():
            raise ValueError("U dodavatele doplň DIČ.")
        rate = payload.get("vatRate")
        if type(rate) is not int or rate not in (12, 21):
            raise ValueError("Vyber sazbu DPH.")
        tax_date = required_date(payload.get("taxDate"), "Zadej datum uskutečnění zdanitelného plnění.")
        if tax_date > issued:
            raise ValueError("Datum uskutečnění plnění nemůže být pozdější než datum vystavení.")
        vat = int((Decimal(total) * rate / (100 + rate)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

    existing = database.execute("SELECT number FROM public_concert_invoices WHERE band_id=?", (band_id,))
    numbers = {row["number"].lower() for row in existing}
    number = str(payload.get("number") or "").strip()
    if number:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/_-]{0,31}", number):
            raise ValueError("Číslo faktury smí mít nejvýše 32 znaků. Použij písmena, číslice, lomítko, podtržítko nebo pomlčku.")
        if number.lower() in numbers:
            raise ValueError("Toto číslo faktury už v kapele existuje.")
    else:
        prefix = str(issued.year)
        used_sequences = [int(item[4:]) for item in numbers if re.fullmatch(prefix + r"[0-9]{4}", item)]
        sequence = max(used_sequences, default=0) + 1
        if sequence > 9999:
            raise ValueError("Automatická číselná řada pro tento rok je plná. Zadej vlastní číslo dokladu.")
        number = f"{prefix}{sequence:04d}"
    reference = str(payload.get("variableSymbol") or "").strip()
    if reference and not re.fullmatch(r"[0-9]{1,10}", reference):
        raise ValueError("Variabilní symbol smí mít nejvýše 10 číslic.")
    if not reference:
        suggested = re.sub(r"[^0-9]", "", number)
        reference = suggested if len(suggested) <= 10 else ""
    event_date = required_date(event.get("date"), "U koncertu doplň platné datum.")
    snapshot = {
        "eventId": event["id"], "number": number, "variableSymbol": reference,
        "supplier": {key: supplier.get(key, "") for key in (*PARTY_FIELDS, *SUPPLIER_FIELDS)},
        "customer": {key: customer.get(key, "") for key in PARTY_FIELDS}, "description": description.strip(),
        "eventDate": event_date.isoformat(), "issueDate": issued.isoformat(), "dueDate": due.isoformat(),
        "taxDate": tax_date.isoformat() if tax_date else None, "currency": currency,
        "totalMinor": total, "netMinor": total - vat, "vatMinor": vat, "vatRate": rate,
    }
    database.execute("INSERT INTO public_concert_invoices VALUES (?, ?, ?, ?, ?)",
                     (band_id, event["id"], number, issued.isoformat(), json.dumps(snapshot, ensure_ascii=False)))
    return snapshot


@lru_cache(maxsize=1)
def invoice_fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    for directory, normal, bold in (
        ("/usr/share/fonts/ttf-dejavu", "DejaVuSans.ttf", "DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/dejavu", "DejaVuSans.ttf", "DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/dejavu", "DejaVuSans.ttf", "DejaVuSans-Bold.ttf"),
        ("/System/Library/Fonts/Supplemental", "Arial.ttf", "Arial Bold.ttf"),
    ):
        normal_path, bold_path = Path(directory, normal), Path(directory, bold)
        if normal_path.is_file() and bold_path.is_file():
            pdfmetrics.registerFont(TTFont("Invoice", str(normal_path)))
            pdfmetrics.registerFont(TTFont("InvoiceBold", str(bold_path)))
            return
    raise RuntimeError("Chybí font pro sestavení faktury.")


def invoice_pdf(invoice):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    invoice_fonts()
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, leftMargin=44, rightMargin=44, topMargin=48, bottomMargin=48,
                            title=f"Faktura {invoice['number']}", author=invoice["supplier"]["name"])
    ink = colors.HexColor("#181b1c")
    muted = colors.HexColor("#505759")
    line = colors.HexColor("#dce0e0")
    subtle = colors.HexColor("#f2f4f2")
    text = ParagraphStyle("Text", fontName="Invoice", fontSize=10, leading=15, textColor=ink)
    label = ParagraphStyle("Label", parent=text, fontSize=9, leading=13, textColor=muted)
    strong = ParagraphStyle("Strong", parent=text, fontName="InvoiceBold")
    heading = ParagraphStyle("Heading", parent=strong, fontSize=26, leading=32)
    total = ParagraphStyle("Total", parent=strong, fontSize=19, leading=24, alignment=2)
    right = ParagraphStyle("Right", parent=text, alignment=2)
    big = 16

    def p(value, style=text):
        lines = [escape(part.strip()) for part in str(value).splitlines() if part.strip()]
        return Paragraph("<br/>".join(lines[:4] + ([" ".join(lines[4:])] if len(lines) > 4 else [])), style)

    def timestamp(value):
        value = date.fromisoformat(value)
        return f"{value.day}. {value.month}. {value.year}"

    def money(amount):
        return f"{Decimal(amount) / 100:,.2f}".replace(",", " ").replace(".", ",") + " " + invoice["currency"]

    def party(title, info):
        items = [p(title, label), p(info["name"], strong), p(info["address"])]
        for key, prefix in (("ico", "IČO"), ("dic", "DIČ")):
            if info.get(key):
                items.append(p(prefix + "  " + info[key]))
        return items

    def table(rows, widths, commands=()):
        t = Table(rows, colWidths=widths)
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), *commands]))
        return t

    width = doc.width
    seller = invoice["supplier"]
    bill_to = invoice["customer"]
    story = [
        p("Faktura · daňový doklad" if invoice["vatRate"] else "Faktura", heading),
        p("Číslo dokladu  " + invoice["number"], strong),
        Spacer(1, 24),
        table([[party("DODAVATEL", seller), party("ODBĚRATEL", bill_to)]], [width / 2, width / 2],
              [("LINEABOVE", (0, 0), (-1, 0), .6, line), ("TOPPADDING", (0, 0), (-1, -1), 12),
               ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 0),
               ("RIGHTPADDING", (0, 0), (-1, -1), 15)]),
        Spacer(1, big),
    ]
    details = [
        [p("Vystaveno", label), p(timestamp(invoice["issueDate"])), p("Splatnost", label), p(timestamp(invoice["dueDate"]))],
        [p("Úhrada", label), p("Bankovním převodem"), p("Bankovní účet", label), p(seller["bankAccount"], strong)],
    ]
    if invoice["variableSymbol"]:
        details.append([p("Variabilní symbol", label), p(invoice["variableSymbol"], strong), "", ""])
    if invoice["taxDate"]:
        details.append([p("Datum uskutečnění plnění", label), p(timestamp(invoice["taxDate"])), "", ""])
    story += [table(details, [width * fraction for fraction in (.20, .29, .20, .31)],
                    [("BACKGROUND", (0, 0), (-1, -1), subtle), ("TOPPADDING", (0, 0), (-1, -1), 7),
                     ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]), Spacer(1, 26)]
    service = [p(invoice["description"], strong)]
    if invoice.get("eventDate"):
        service.append(p("1 vystoupení · " + timestamp(invoice["eventDate"]), label))
    amount_heading = ParagraphStyle("AmountHeading", parent=label, alignment=2)
    story.append(table([[p("FAKTUROVANÁ SLUŽBA", label),
                         p("ČÁSTKA BEZ DPH" if invoice["vatRate"] else "ČÁSTKA", amount_heading)],
                        [service, p(money(invoice["netMinor"]), right)]],
                       [width * .72, width * .28],
                       [("LINEBELOW", (0, 0), (-1, 0), .6, line),
                        ("TOPPADDING", (0, 1), (-1, -1), 10)]))
    amounts = []
    if invoice["vatRate"]:
        amounts += [[p("Základ DPH"), p(money(invoice["netMinor"]), right)],
                    [p(f"DPH {invoice['vatRate']} %"), p(money(invoice["vatMinor"]), right)]]
    amounts.append([p("CELKEM K ÚHRADĚ", strong), p(money(invoice["totalMinor"]), total)])
    footer = []
    if not invoice["vatRate"]:
        footer.append(p("Dodavatel není plátcem DPH.", label))
    if seller.get("registration"):
        footer.append(p(seller["registration"], label))
    story.append(KeepTogether([Spacer(1, 21),
                              table(amounts, [width * .55, width * .45],
                                    [("BACKGROUND", (0, -1), (-1, -1), subtle),
                                     ("VALIGN", (0, -1), (-1, -1), "MIDDLE"),
                                     ("TOPPADDING", (0, -1), (-1, -1), 9),
                                     ("BOTTOMPADDING", (0, -1), (-1, -1), 9)]),
                              Spacer(1, 13), *footer]))
    doc.build(story)
    return output.getvalue()
