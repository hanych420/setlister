# Setlister — plánovač setlistů

Veřejný marketing a demo běží na setlister.cz, obecná multi-tenant aplikace
na app.setlister.cz a soukromý prostor Propadleeku na
setlister.cz/propadleek.

Brand pravidla jsou v brand/BRAND_MANUAL.md, architektura účtů a plateb v
APP_ARCHITECTURE.md.

## Spuštění

Pro lokální webový server lze ve složce projektu spustit:

```bash
python3 -m http.server 8080
```

Potom otevřít `http://localhost:8080`.

Tento jednoduchý statický server slouží jen pro lokální prohlížení. Sdílenou databázi spustíš příkazem:

```bash
python3 -m pip install -r requirements.txt
python3 server.py
```

Aplikace potom běží na `http://localhost:8110`, kapelní část na `http://localhost:8110/propadleek/` a data ukládá do `data/setlister.sqlite3`.

## Home Assistant add-on, Docker a Raspberry Pi

Při instalaci jako Home Assistant add-on se databáze automaticky ukládá do trvalého `/data` spravovaného Supervisorem. Add-on ji zahrne do záloh Home Assistantu a kvůli konzistenci SQLite se při záloze krátce zastaví.

Pro samostatný Docker spusť z kořene repozitáře:

```bash
docker compose up -d --build
```

Kontejner zveřejní port `8110` a databázi uloží do persistentního svazku `setlister-data`. V samostatném Dockeru lze místo pojmenovaného svazku připojit konkrétní adresář na SSD k cestě `/data`.

Pokud Home Assistant i Docker už běží ze SSD, výchozí volume se fyzicky uloží právě tam. Pro explicitní umístění zkopíruj `.env.example` jako `.env` a nastav například:

```text
SETLISTER_DATA_PATH=/mnt/ssd/setlister
```

V tomto adresáři vznikne `setlister.sqlite3` a jeho pomocné WAL soubory. Adresář musí existovat a musí do něj mít kontejner právo zapisovat.

Pro existující Cloudflare Tunnel se nepřidává nový token ani další tunnel. Ve stejném tunelu se vytvoří další Published application route:

```text
setlister.cz -> http://IP_RASPBERRY_PI:8110
```

Cloudflare Access chrání pouze cestu setlister.cz/propadleek*. Veřejný marketing na kořeni domény a aplikace na app.setlister.cz zůstávají dostupné bez Access brány. Gmail API a soukromý chat Propadleeku nadále ověřují podepsaný Access JWT.

Ve stejném Cloudflare tunelu přidej druhý hostname app.setlister.cz, který míří na stejný origin http://IP_RASPBERRY_PI:8110. Přihlášení a oddělení kapel tam zajišťuje vlastní session vrstva aplikace.

## Read-only Gmail asistent

V nastavení Home Assistant add-onu vyplň:

- `google_client_id` a `google_client_secret` z OAuth klienta typu Web application,
- `openai_api_key`,
- `cloudflare_access_team`, například `propadleek.cloudflareaccess.com`,
- `cloudflare_access_aud`, tedy Application Audience tag aplikace Setlister v Cloudflare Access.

## Kontaktní formulář

Pro odesílání přes Resend vyplň v nastavení add-onu resend_api_key. Odesílatel
contact_from musí být na doméně ověřené v Resendu. Cíl zpráv určuje
contact_email.

V Google OAuth klientovi musí být jako redirect URI přesně:

```text
https://setlister.cz/propadleek/oauth/google/callback
https://app.setlister.cz/oauth/google/callback
```

OAuth aplikace žádá výhradně scope `https://www.googleapis.com/auth/gmail.readonly`. Setlister neobsahuje Gmail endpoint pro odesílání, koncepty, úpravy štítků, přesouvání ani mazání. Oba účty se připojují samostatně na stránce **PropsBot → Připojené účty**.

Ve veřejné aplikaci připojuje nejvýše dva účty vlastník kapely v sekci **Mailový agent**. Tlačítkem spustí první úplnou synchronizaci; potom server každých pět minut doplňuje pouze změny. Chat nejdřív pochopí záměr dotazu a jeho kontext, lokálně vyhledá relevantní vlákna a do OpenAI pošle jen omezený výběr zdrojů. Výchozí limit je 50 dotazů na kapelu a den; lze jej změnit volbou `public_ai_daily_questions`.

První synchronizace indexuje zprávy za posledních 730 dní do SQLite. Další běhy používají Gmail History API a stahují pouze změněné zprávy. Gmail refresh tokeny jsou v databázi šifrované klíčem uloženým s právy pouze pro uživatele add-onu.

Tlačítkem **Poučit asistenta** pod odpovědí lze uložit kapelní pojmy a opravy. Setlister je uchovává lokálně v SQLite a relevantní poučení použije k rozšíření vyhledávání i jako kontext pro další odpovědi.

PropsBot po dokončení Gmail synchronizace zpracuje koncertní vlákna do interní strukturované evidence. Běžné dotazy na koncerty pak řadí podle uloženého data a e-maily používají jako dohledatelné zdroje. Změna e-mailového vlákna automaticky vyvolá novou extrakci.

Záměr dotazu se vyhodnocuje strukturovaně a přenáší se i do navazujících otázek. Požadavky na všechny koncerty, města nebo termíny se sestavují přímo z databáze, nikoliv volným opisem modelu. Díky tomu odpověď obsahuje každý odpovídající záznam.

Přehled budoucích koncertů obsahuje pouze potvrzené záznamy se známým datem od dnešního dne dál. Historické faktury, lístky nebo komunikace po akci se za budoucí koncert nepovažují. Při změně pravidel extrakce se odvozená koncertní evidence jednorázově přestaví; e-mailový index a Gmail tokeny zůstávají zachované.

Historie úspěšných konverzací se ukládá lokálně bez textů zdrojových e-mailů. Je dostupná pod ozubeným kolečkem po zadání hodnoty `admin_history_pin`; odemčení trvá 30 minut.

## Ukládání dat

Veřejné demo ukládá zkušební set pouze do `localStorage` aktuálního prohlížeče. Soukromá část Propadleeku synchronizuje repertoár a setlisty přes SQLite; tlačítkem **Exportovat data** lze stáhnout také kompletní JSON zálohu.

Při spuštění přes `server.py` nebo Docker se data synchronizují mezi zařízeními přes SQLite. Aplikace uchovává posledních 200 serverových verzí pro případ obnovy. Při otevření samotného `index.html` zůstává v lokálním režimu bez synchronizace.

## Funkce

- knihovna písní s délkami,
- přiřazení písní k albům a filtrování podle alba,
- archivace starých písní s volitelným zobrazením,
- přidávání jednotlivě, hromadným vložením textu nebo importem XLSX šablony,
- stažení připravené XLSX šablony se sloupci pro název písničky, album a délku,
- hledání v repertoáru,
- automatické skrytí skladeb, které už jsou v aktuálním setu,
- skládání setu drag & drop,
- alternativní ovládání tlačítky pro telefon,
- celkový čas a porovnání s cílovou délkou,
- více pojmenovaných uložených setlistů,
- duplikování a mazání uložených setů,
- šest výchozích členů kapely, možnost přidat další a u každého spravovat výchozí i další nástroje,
- individuální poznámky ke každé skladbě: kapo jen pro kytary, zvuk/preset jen pro elektrickou kytaru, volba nástroje a volný pokyn,
- profily členů s jejich nástroji: Hanych a Petr (akustická/elektrická kytara), Koby (akustická kytara/klávesy), Jáchym (bicí), Bruno (baskytara) a Viky (housle),
- automatické vložení změny kapa a nástroje; poslední kapo se pamatuje zvlášť pro každý nástroj,
- tisk společného setlistu nebo samostatné, z dálky čitelné A4/PDF sestavy pro každého člena bez zbytečných délek a popisků; skladby jsou na stránce vodorovně i svisle vystředěné,
- volba individuálních stránek po jednotlivých členech a samostatný počet čistých kopií; bez individuálních stránek se automaticky navrhne 6 kusů,
- stažení samostatné tiskové HTML sestavy jako záloha pro prohlížeče, které neotevřou systémový tisk,
- export a import lokální zálohy.
- sdílená SQLite databáze s detekcí souběžných změn a historií posledních 200 verzí.
- chat nad dvěma kapelními Gmaily s rychlými dotazy a odkazy na zdrojové zprávy,
- průběžná lokální indexace Gmailu pouze pro čtení.


## Administrace platformy

Administrace je určena pro hostname `admin.setlister.cz` a používá stejnou databázi jako webová aplikace. Nejdřív v Cloudflare vytvoř samostatnou self-hosted aplikaci Access pro tento hostname s MFA a výslovně povolenými e-maily správců. Poté přidej published application route do existujícího tunelu na stejný HTTP origin Setlisteru. Aplikace i na originu ověřuje podepsaný Access JWT pro vlastní AUD. Soukromý PropsBot používá jiné AUD a jiné nastavení správy.

V nastavení add-onu vyplň `platform_admin_aud`, `platform_admin_owners` a případně `platform_admin_support`. Seznamy přijímají e-maily oddělené čárkou. Doménu nastavuje `platform_admin_host`, tým Cloudflare používá už existující `cloudflare_access_team`. Docker přijímá stejné hodnoty přes proměnné `SETLISTER_PLATFORM_ADMIN_HOST`, `SETLISTER_PLATFORM_ADMIN_AUD`, `SETLISTER_PLATFORM_ADMIN_OWNERS` a `SETLISTER_PLATFORM_ADMIN_SUPPORT`, tým přes `CF_ACCESS_TEAM_DOMAIN`.

Podpora má přehled, diagnostiku a pohled na data vybraného člena pouze ke čtení. Hlavní správce může přidělit kapelám promo období, převádět vlastnictví, mazat a číst audit. Smazání účtu ukončí jeho relace a odstraní účet z kapel. Pódiové profily a jejich hudební pokyny zůstanou. Pokud účet kapelu vlastní, musí se vlastnictví nejdřív převést nebo kapela zvlášť smazat. Při smazání kapely se odstraní její živá data včetně lokálního indexu Gmailu. Zálohy se řídí samostatnou dobou uchování.
