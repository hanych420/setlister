# Changelog

## 0.3.3

- První indexace Gmailu respektuje limit požadavků a při dočasném omezení automaticky opakuje volání s exponenciální prodlevou.
- Zabráněno souběžné synchronizaci stejného Gmail účtu.
- Nedokončená synchronizace se po restartu add-onu automaticky obnoví.
- OpenAI Responses API nyní dostává `store: false`.

## 0.3.2

- Opraveno ověření Cloudflare Access JWT proti X.509 certifikátům poskytovaným Cloudflare.

## 0.3.1

- Přidána veřejná informační stránka aplikace, zásady ochrany soukromí a podmínky používání pro Google OAuth.
- Chat obsahuje viditelný odkaz na informace o zpracování Gmail dat.

## 0.3.0

- Přidána samostatná stránka **Zeptej se** s chatem nad dvěma kapelními Gmaily.
- Gmail integrace používá výhradně scope `gmail.readonly`; backend neobsahuje žádnou zapisovací Gmail operaci.
- První synchronizace vytvoří lokální fulltextový index na SSD, další synchronizace stahují pouze změny přes Gmail History API.
- Chat umí pracovat s návaznými dotazy a u odpovědí zobrazuje zdrojové e-maily.
- Přidány rychlé dotazy na urgentní zprávy, nezodpovězené požadavky, faktury a chybějící informace ke koncertům.
- Refresh tokeny Gmailu jsou v databázi šifrované a přístup k asistentovi umí backend ověřit pomocí Cloudflare Access JWT.
- Konfigurace Google OAuth, OpenAI a Cloudflare Access je dostupná v nastavení Home Assistant add-onu.

## 0.2.4

- V individuálním tisku se skrývá pouze `K0`; hodnoty `K1` až `K12` jsou vidět u každé příslušné skladby.

## 0.2.3

- Nativní našeptávače byly nahrazeny vlastní přístupnou nabídkou ve vzhledu Setlisteru.
- Vlastní našeptávání je použito pro alba, dříve použité zvuky/presety a nástroje členů.

## 0.2.2

- Tisk automaticky využije dostupnou výšku jedné A4 a zvolí největší bezpečnou velikost písma.
- K0 ani výchozí nástroj se neopakují; nástroj a nenulové kapo se vytisknou jen při skutečné změně.
- Přepočet dvacetisekundových prostojů je vidět i v souhrnu setu.
- Opraveno načítání nové verze frontendu po aktualizaci add-onu a favicon nyní používá přímo logo kapely.

## 0.2.1

- Automatický dvacetisekundový prostoj se nepřičítá přes ručně vloženou pauzu nebo intermezzo.

## 0.2.0

- Rozpracovaný setlist je nově soukromý pro každý prohlížeč a obnoví se po znovunačtení stránky.
- Souběžné změny sdílených dat se slučují po jednotlivých skladbách a členech.
- Přidáno trvalé mazání a úprava skladby přímo z aktuálního setu.
- Cílovou délku lze nechat prázdnou.
- Přidány volitelné dvacetisekundové prostoje a vlastní pauzy/intermezza.
- Tisková sestava má úspornější jednostránkové rozložení a oddělené levé/pravé poznámky.
- Přidána favicon s logem kapely.

## 0.1.0

- První Home Assistant add-on verze.
- Sdílená SQLite databáze v trvalém `/data`.
- Synchronizace mezi zařízeními a historie posledních 200 verzí.
- Repertoár, archivace, alba, XLSX import a tisk individuálních poznámek.
