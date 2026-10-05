# Setlister — plánovač setlistů

Kapelní aplikace pro skládání a tisk setlistů. Při otevření přímo ze souboru funguje lokálně. Při spuštění přes přiložený server používá sdílenou SQLite databázi.

## Spuštění

Nejjednodušší je otevřít `index.html` dvojklikem. Pro lokální webový server lze ve složce projektu spustit:

```bash
python3 -m http.server 8080
```

Potom otevřít `http://localhost:8080`.

Tento jednoduchý statický server slouží jen pro lokální prohlížení. Sdílenou databázi spustíš příkazem:

```bash
python3 server.py
```

Aplikace potom běží na `http://localhost:8110` a data ukládá do `data/setlister.sqlite3`.

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

Před veřejným spuštěním je nutné chránit hostname pomocí Cloudflare Access, protože aplikace zatím nemá vlastní přihlašování.

## Ukládání dat

Písně, rozpracovaný set i uložené setlisty se ukládají do `localStorage` aktuálního prohlížeče. Tlačítkem **Exportovat data** lze stáhnout kompletní JSON zálohu a později ji znovu importovat.

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
