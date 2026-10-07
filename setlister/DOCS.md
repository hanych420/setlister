# Setlister

Setlister je kapelní aplikace pro správu repertoáru, skládání setlistů, tisk samostatných poznámek a read-only dotazy nad kapelními Gmaily.

## Spuštění

Po instalaci zapni **Spustit při startu** a **Watchdog**, potom add-on spusť. Tlačítko **Otevřít webové rozhraní** otevře aplikaci na portu `8110`.

## Data a zálohy

Sdílená SQLite databáze je uložena v `/data/setlister.sqlite3`. Adresář `/data` spravuje Home Assistant Supervisor a je součástí zálohy add-onu. Add-on používá studené zálohy: při zálohování jej Supervisor krátce zastaví, aby byl soubor SQLite konzistentní.

Setlister navíc umožňuje ruční export a import dat ve formátu JSON.

## Cloudflare Tunnel

Ve stávajícím tunelu vytvoř novou veřejnou trasu:

```text
setlister.cz → http://IP_HOME_ASSISTANTU:8110
```

Nový tunnel ani další token nejsou potřeba. Pro `setlister.cz` musí zůstat zapnutý Cloudflare Access.

## Nastavení Gmail asistenta

V konfiguraci add-onu doplň Google OAuth Client ID a Client Secret, OpenAI API klíč, Cloudflare Access team domain a Application Audience tag. Přesměrovací adresa Google OAuth klienta musí být `https://setlister.cz/oauth/google/callback`.

Po restartu otevři **Zeptej se → Připojené účty** a autorizuj postupně oba kapelní Gmaily. Setlister žádá pouze `gmail.readonly` a nemůže do Gmailu zapisovat. První synchronizace může podle velikosti schránky trvat několik minut; další synchronizace už načítají jen změny.

Cloudflare Access team domain a AUD jsou povinné pro produkční provoz. Backend díky nim odmítne Gmail a chat API také při přímém otevření portu `8110` z lokální sítě bez platného Access tokenu.

## Lokální síť

Pokud je port `8110` v nastavení add-onu povolený, aplikace je dostupná také na:

```text
http://IP_HOME_ASSISTANTU:8110
```
