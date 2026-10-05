# Setlister

Setlister je kapelní aplikace pro správu repertoáru, skládání setlistů a tisk samostatných poznámek pro jednotlivé členy.

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

Nový tunnel ani další token nejsou potřeba. Před zveřejněním nastav pro `setlister.cz` Cloudflare Access, protože aplikace zatím nemá vlastní přihlášení.

## Lokální síť

Pokud je port `8110` v nastavení add-onu povolený, aplikace je dostupná také na:

```text
http://IP_HOME_ASSISTANTU:8110
```
