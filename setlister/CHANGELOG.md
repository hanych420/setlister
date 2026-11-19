# Changelog

## 0.13.0

- Fakturační údaje dodavatele jsou v nastavení kapely a údaje pořadatele u koncertu. České subjekty lze doplnit podle IČO z ARES.
- Z uloženého honoráře lze vystavit fakturu a stáhnout PDF. Vystavené doklady mají vlastní číslo a zůstávají v archivu.
- Podporované jsou faktury neplátců DPH a běžné tuzemské doklady s DPH v Kč.

## 0.12.6

- Datum koncertu, termín úkolu a obě data vlastního zápisu lze zadat ručně nebo vybrat ve stejném vlastním kalendáři. Pole rozsahu vlastního zápisu se už nepřekrývají.
- Krátké štítky se v osobním výtisku rozkládají vedle názvu skladby na obě strany.
- Změna nástroje je před skladbou ve stejném řádku jako ladění. BPM se tiskne jen členovi, který si jej povolí v profilu.
- Při přizpůsobení na jednu A4 se velikost písma stanoví podle skutečně zalomeného obsahu.

## 0.12.5

- Mailový agent tvoří přehled koncertů automaticky s limitem 50 volání OpenAI na kapelu za den a 200 na instalaci.
- Do setlistu lze vložit, přesunout a uložit pojmenovanou pauzu nebo intermezzo. Volitelná délka se přičte k času a položka se zobrazí ve výtisku. Zkouška pracuje pouze se skladbami.
- Osobní pohled, zkouška i osobní výtisk připomenou ladění při změně kapodastru oproti poslednímu hraní na stejný nástroj. Připomenutí lze přidat i ručně v poznámkách člena.
- U vlastních nástrojů lze povolit kapodastr.

## 0.12.4

- Chat v Mailovém agentovi je nahoře, připojené schránky a přehled koncertů jsou ve sbalitelném panelu s vysvětlením využití OpenAI.
- Roletky připravenosti se rozbalují uvnitř řádku. Chytrý plán zkoušky zůstává přehledem přímo ve Zkoušce.
- Z vybraného dne v kalendáři lze založit koncert nebo vlastní zápis s předvyplněným datem.
- Úkoly mají samostatná pole osoby a termínu, stabilní ovládání na mobilu a proklik na související koncert s časem hraní.
- Checklist koncertu má části Organizace a Výbava. Organizace používá stejné položky jako Úkoly. Hotové jsou na konci.

## 0.12.3

- Checklist je přímo na kartě koncertu a přidávání i odškrtávání položek funguje z agendy.
- Koncerty mají vlastní výběr data, honorář s měnou a měsíční kalendář se sdílenými barevnými zápisy členů.
- Kapelní kalendář lze připojit k Apple a Google Kalendáři přes odvolatelný odkaz.
- Zkouška zobrazuje připravenost členů po skladbách a navrhne zkušební set v časovém limitu.
- Kapelní úkoly mají volnou kategorii, termín, odpovědný účet a stav Hotovo.

## 0.12.2

- Mailový agent má volitelnou kapelní evidenci koncertů se zdroji, kterou vlastník zapne po seznámení se zpracováním v OpenAI.
- Server sestavuje přehledy termínů, měst a změn z uložených doložených faktů. Přehled zobrazuje stáří schránek i nedokončené zpracování.
- Historická pošta se zpracovává z lokálního indexu. Nový běh zachytí změněná vlákna a placené zpracování má vlastní denní rozpočet.
- Volné otázky využívají přesné fráze, váhu předmětů a prefixové hledání.

## 0.12.1

- dočasné síťové chyby Gmailu včetně `Connection reset by peer`, timeoutů, rate limitů a chyb 5xx se automaticky opakují s omezeným počtem pokusů;
- dlouhá prvotní synchronizace automaticky obnoví expirovaný Google access token a nemá krátký timeout na celou schránku;
- jeden běh má bezpečnostní limit dvě hodiny, po kterém zachová průběh a nabídne pokračování namísto nekonečného zpracování;
- opakování po chybě naváže na již uložené zprávy, počet zpracovaných zpráv se průběžně aktualizuje;
- restart doplňku uvolní osiřelý stav `syncing` a umožní bezpečné pokračování;
- opravena chybějící hodnota Gmail `historyId`, která mohla shodit dokončení prvního importu;
- Gmail synchronizace nevolá OpenAI a nemůže sama spotřebovávat AI tokeny.

## 0.12.0

- veřejná aplikace na `app.setlister.cz` umí ke každé kapele připojit až dva Gmail účty s výhradně read-only oprávněním;
- vlastník kapely spouští první úplné načtení schránky a může účet synchronizovat nebo odpojit, ostatní členové používají pouze chat;
- po prvním importu server každých pět minut doplňuje změny přes Gmail History API a bezpečně zachytí i zprávy doručené během dlouhé synchronizace;
- zprávy a fulltextový index jsou oddělené podle kapely a odpojení odstraní lokální data příslušného účtu;
- první AI krok pochopí i nepřesný nebo navazující dotaz a rozšíří hledání o kontext a synonyma, druhý odpovídá jen z nalezených e-mailů;
- každé konkrétní tvrzení musí mít proklik na zdrojovou zprávu; bez důkazu agent výslovně přizná, že odpověď nenašel;
- výchozí limit 50 dotazů na kapelu a den, omezený důkazní kontext a vypnuté ukládání OpenAI požadavků chrání provozní náklady;
- responzivní rozhraní ukazuje stav obou schránek, průběh synchronizace, rychlé dotazy a bezpečné citace bez renderování libovolného HTML.

## 0.11.1

- pódiového člena lze v nastavení propojit s registrovaným účtem kapely podle e-mailu;
- výběr nabízí pouze účty aktivní kapely, které nejsou přiřazené jinému členovi, a server dvojí nebo cizí propojení odmítne;
- nově připojený účet už automaticky nevytváří duplicitní pódiový profil;
- seznam členů ukazuje propojený e-mail místo obecného textu „má účet“;
- nepojmenovaný globální údaj v live režimu se nyní srozumitelně označuje jako „Pokyn pro všechny“.

## 0.11.0

- přibyla sekce Koncerty s termínem, městem, místem, kompletní časovou osou dne, kontaktem, praktickou poznámkou a odškrtávacím checklistem;
- ke koncertu lze přiřadit kterýkoli uložený setlist a jedním kliknutím jej otevřít v editoru;
- odehraný koncert se ukládá do historie se skutečným pořadím skladeb, časy, hodnocením, poznámkou a porovnáním proti neměnnému snímku původního plánu;
- live průchod setlistem má kapelního vedoucího: změna skladby se synchronizuje všem zařízením, zatímco každý člen dál vidí svoje osobní pokyny;
- skutečně navštívené skladby z live režimu lze převzít do historie přiřazeného koncertu;
- editor nabízí deterministický návrh pořadí podle rolí, energetického oblouku a změn nástrojů, ladění, kapodastrů a presetů;
- jednotlivé pozice lze před chytrým řazením zamknout a nové pořadí se použije až po zobrazení a potvrzení náhledu.

## 0.10.1

- live karta už vlastní pole neoznačuje matoucím obecným názvem „Kapela“ nebo „Moje“;
- pojmenované pole zobrazuje přímo svůj název a hodnotu, například `Kdo začíná — Hanych`;
- starší nepojmenované hodnoty jsou jasně označené jako společný nebo osobní pokyn.

## 0.10.0

- hlavní šablona repertoáru je skutečný XLSX soubor, který lze otevřít v Excelu, Numbers i Google Tabulkách;
- hromadný import umí přímo načíst jednoduché XLSX bez převodu do CSV; vložení tabulky a CSV/TSV zůstává podporované;
- přibyla sekce Zkouška pro spuštění aktuálního nebo uloženého setlistu a listování skladbami tlačítky, klávesami i swipe gestem;
- live karta zobrazuje osobní název, nástroj, kapodastr, preset, pojmenovaná pole a poznámku přihlášeného člena;
- přibyl kapelní synchronizovaný metronom se serverovým časem, společným startem s předstihem, Web Audio schedulerem a lokální kalibrací zařízení;
- mobilní specifikace popisuje stejné XLSX a live/metronome endpointy i limity synchronizace samostatných reproduktorů.

## 0.9.1

- vlastní štítek se nyní zakládá jako pojmenované pole: po zadání názvu a potvrzení Enterem vznikne samostatný box pro jeho hodnotu;
- pojmenovaná pole lze vytvořit společně pro skladbu i osobně pro konkrétního člena;
- starší volné štítky se při načtení automaticky převedou bez ztráty dat;
- skladbu v aktuálním setlistu lze přímo upravit nebo otevřít její poznámky členů, aniž by se musela ze setu odebrat.

## 0.9.0

- člen kapely má explicitně volitelný výchozí nástroj, který se automaticky použije u skladeb bez vlastní volby;
- skladby podporují volitelné BPM a globální krátké štítky pro tisk;
- každý člen může mít u skladby vlastní krátké štítky, například efekt, ladění nebo jiný pódiový pokyn;
- osobní A4 zobrazuje kapodastr, BPM i vlastní štítky jako kompaktní odznaky vlevo; čisté výtisky zůstávají bez pokynů;
- repertoár lze hromadně importovat vložením tabulky nebo nahráním CSV/TSV/TXT a stáhnout si hotovou šablonu;
- import validuje délku a BPM, rozpozná české role a přeskočí duplicity.

## 0.8.3

- po nahrání loga se otevře vlastní editor čtvercového výřezu;
- obrázek lze posouvat tažením nebo klávesami a plynule přibližovat;
- výsledné logo se ukládá jako čtverec 512 × 512 px, původní logo se při zrušení editoru nezmění.

## 0.8.2

- člen může mít libovolný počet současně vybraných nástrojů a všechny jsou zřetelně označené;
- vlastní nástroje se přidávají Enterem nebo tlačítkem přímo mezi ostatní možnosti;
- vlastní nástroj lze odškrtnout i úplně odstranit a odebraný nástroj se bezpečně vyčistí z osobních pokynů skladeb;
- zákaznický popis Mailového agenta vysvětluje přínos bez technických detailů o indexaci a kreditech;
- k názvu aktuálního setlistu přibyla viditelná tužka pro přejmenování.

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
