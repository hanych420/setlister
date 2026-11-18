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

Nový tunnel ani další token nejsou potřeba. Cloudflare Access musí chránit pouze `setlister.cz/propadleek*`; kořen `setlister.cz` je veřejné MVP.

## Nastavení Gmail asistenta

V konfiguraci add-onu doplň Google OAuth Client ID a Client Secret, OpenAI API klíč, Cloudflare Access team domain a Application Audience tag. Google OAuth klient musí obsahovat obě přesměrovací adresy: `https://setlister.cz/propadleek/oauth/google/callback` a `https://app.setlister.cz/oauth/google/callback`.

Po restartu otevři **PropsBot → Připojené účty** a autorizuj postupně oba kapelní Gmaily. Setlister žádá pouze `gmail.readonly` a nemůže do Gmailu zapisovat. První synchronizace může podle velikosti schránky trvat několik minut; další synchronizace už načítají jen změny.

Pro obecnou aplikaci otevři na `app.setlister.cz` sekci **Mailový agent**. Vlastník kapely může připojit nejvýše dva Gmaily a u každého jednou spustit **Načíst celou schránku**. Nové zprávy se pak kontrolují automaticky každých pět minut. Všichni členové kapely mohou použít chat, ale účty spravuje pouze vlastník. Volba `public_ai_daily_questions` určuje denní limit dotazů jedné kapely; výchozí hodnota je 50.

Po první synchronizaci PropsBot na pozadí vytvoří interní evidenci koncertů. Průběh je vidět v panelu připojených účtů; samostatná obrazovka evidence se nezobrazuje. Historii konverzací otevře ozubené kolečko po zadání `admin_history_pin` z konfigurace add-onu.

Při změně pravidel extrakce se pouze odvozená evidence koncertů jednorázově přestaví z již uloženého lokálního indexu e-mailů. Gmail účty, OAuth tokeny, e-mailový index, poučení ani historie konverzací se tím nemažou.

Cloudflare Access team domain a AUD jsou povinné pro produkční provoz. Backend díky nim odmítne Gmail a chat API také při přímém otevření portu `8110` z lokální sítě bez platného Access tokenu.

Pro Google OAuth Branding použij veřejné adresy `https://setlister.cz/propadleek/about.html`, `https://setlister.cz/propadleek/privacy.html` a `https://setlister.cz/propadleek/terms.html`. Tyto tři cesty musí mít v Cloudflare Access samostatnou politiku **Bypass → Everyone**, zatímco ostatní cesty pod `/propadleek` zůstanou chráněné.

## Lokální síť

Pokud je port `8110` v nastavení add-onu povolený, aplikace je dostupná také na:

```text
http://IP_HOME_ASSISTANTU:8110
```
