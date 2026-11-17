# Changelog

## 0.8.1

- obecná úprava skladby a osobní pokyny členů mají oddělená tlačítka i dialogy;
- úprava skladby a poznámek je dostupná přímo u repertoáru vlevo, nikoli v rozestavěném setu vpravo;
- osobní pokyny se otevírají na přihlášeném členovi a obsahují vlastní název skladby, nástroj, podmíněný kapodastr/preset a poznámku;
- vlastní název člena se propisuje do jeho pohledu i osobního A4 výtisku;
- repertoár při skládání lze filtrovat fulltextem, albem, energií a rolí skladby;
- název setlistu je nově viditelně označené editovatelné pole;
- systémové selecty nahradily vlastní přístupné roletky ve vizuálním stylu Setlisteru;
- přepracovaná tlačítka pro načtení setlistu a poznámky členů.

## 0.8.0

- veřejná aplikace nově obsahuje plnohodnotný repertoár s albem, délkou, energií a rolí skladby;
- pódiové členy lze vytvářet a upravovat i bez jejich registrace;
- členům lze nastavit nástroje, zpěv a osobní pokyny pro každou skladbu;
- kapodastr se zobrazuje pouze u kytarových nástrojů, preset pouze u elektrické kytary;
- setlist lze pojmenovat, uložit, znovu načíst, přetřídit a prohlížet bez poznámek nebo jako konkrétní člen;
- přidán tisk/PDF s osobními a čistými kopiemi, automatickou velikostí písma a A4 pódiovým layoutem;
- kapela může nahrát vlastní logo;
- Mailový agent nyní přesně popisuje read-only indexaci, inkrementální synchronizaci a odpovědi se zdroji;
- přidána živá specifikace `MOBILE_APP_BUILD_SPEC.md` pro budoucí iOS a Android klienty.

## 0.7.0

- Veřejná registrace a přihlášení na app.setlister.cz.
- Založení kapely nebo připojení osmimístným kódem.
- Striktně oddělená data repertoáru a setu podle kapely.
- Kapelní entitlement připravený pro Stripe, App Store a Google Play.
- Nový brand Setlisteru s limetkovou #D9FF43 a vlastním logem.
- Kapodastr a poznámky v marketingovém demu.
- Kontaktní formulář připravený na Resend.
- Marketing bez interního označení MVP a bez exportu pro ladiče.
- Read-only mailový agent zachovaný jako připravovaná kapelní funkce.

## 0.6.0

- Soukromý Setlister Propadleeku se přesunul pod `/propadleek/` včetně PropsBota, API, OAuth callbacku a PWA.
- Kořen `setlister.cz` obsahuje nové veřejné MVP pro ostatní kapely s produktovou prezentací a funkčním lokálním demem skládání setu.
- Veřejná a soukromá část mají oddělené manifesty, service workery a vizuální identitu.

## 0.5.1

- Jednu skladbu teď může otevírat více členů kapely.
- Volba „Bez osobních poznámek“ skryje také změny kapa, nástrojů a další přechodové pokyny.

## 0.5.0

- Písně mají energii 1–5, role otevírací / na závěr / přídavek a určeného člena, který je otevírá.
- Nová funkce **Navrhnout kostru** seřadí aktuální set podle energetického oblouku a omezuje změny kapa a nástrojů.
- Setlister si v prohlížeči pamatuje naposledy zvoleného člena a hlavní seznam umí zobrazit pouze jeho poznámky.
- Každý člen si může uložit vlastní název písničky a u skladby zvolit **Bez nástroje**.
- Přidán samostatný export pro ladiče, který ukazuje volné kytary a okamžik jejich přípravy na další skladbu.
- Doplněn service worker a PWA metadata pro spolehlivou instalaci z Chromu na Androidu.

## 0.4.4

- Kapelní asistent se v celém rozhraní nově jmenuje PropsBot.
- Přidána instalační PWA ikona s logem Propadleeku pro plochu Androidu, iOS a podporovaných počítačů.
- Opraveno mobilní rozložení chatu a jeho vstupního pole.

## 0.4.3

- PropsBot při chybějící nebo nedostatečné evidenci nehádá a odpoví „Tak to netuším, zeptej se Bruna.“
- U částečně doložené odpovědi odkazuje na Bruna jen u chybějících údajů.

## 0.4.2

- Budoucí přehledy vyžadují známé datum od dneška dál a nepřipouštějí nedatované záznamy.
- Extraktor rozlišuje historické a administrativní doklady od budoucích koncertů a zpřísňuje status confirmed.
- Venue obsahuje pouze skutečné místo konání a město Prague se normalizuje na Praha.
- Nová verze extrakčního indexu při prvním startu bezpečně přestaví odvozenou evidenci koncertů z lokálních e-mailů.
- Odstraněny duplicitní karty zdrojových e-mailů pod odpovědí.

## 0.4.1

- Přidána strukturovaná AI klasifikace záměru dotazu s lokální bezpečnostní zálohou.
- Koncertní kontext se zachovává i pro přirozené formulace a navazující otázky bez slova koncert.
- Úplné seznamy koncertů a měst se generují deterministicky z SQLite podle roku a stavu.
- Odpovědi bezpečně vykreslují základní Markdown jako odstavce, odrážky a tabulky.
- Inline citace i karty zdrojů odkazují přímo na Gmail a nezobrazují interní označení `M…`.

## 0.4.0

- Kapelní asistent se nově jmenuje **PropsBot**.
- Po dokončení Gmail synchronizace se koncertní vlákna jednorázově vytěží do strukturované lokální evidence; změněná vlákna se přezpracují automaticky.
- Evidence rozlišuje poptávku, opci, potvrzený a zrušený koncert a ukládá datum, místo, arrival, zvukovou zkoušku, čas hraní, kontakt, jistotu a zdrojové e-maily.
- Koncertní dotazy používají chronologicky seřazenou evidenci; dokud není prvotní index hotový, PropsBot nesmí tvrdit, že žádný koncert neexistuje.
- Nedokončená prvotní Gmail synchronizace po restartu přeskakuje již uložené zprávy.
- Konverzace se ukládají lokálně bez kopírování obsahu e-mailů a lze je zobrazit pod nenápadným ozubeným kolečkem.
- Historie je chráněna konfigurovatelným PINem, pěti pokusy za deset minut a 30minutovou HttpOnly administrační relací.

## 0.3.5

- První indexace Gmailu už nedrží SQLite zamčenou během síťových požadavků, takže neblokuje ukládání setlistů ani poučení asistenta.
- Tlačítko pro uložení poučení nyní zobrazuje průběh a případnou chybu lze zopakovat.

## 0.3.4

- Ke každé odpovědi přibylo tlačítko **Poučit asistenta** pro uložení opravy nebo kapelního pojmu.
- Poučení se ukládají lokálně do SQLite a používají se při hledání relevantních e-mailů i při tvorbě odpovědi.
- Ukládá se pouze původní otázka a napsaná oprava; funkce nijak nezapisuje do Gmailu.

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
