# Setlister — release notes

Přehled všech publikovaných verzí aplikace Setlister od prvního veřejného vydání.

## 0.4.1 — Spolehlivé seznamy a čitelné odpovědi

- PropBot rozpoznává koncertní záměr pomocí strukturované AI klasifikace a zachovává téma, rok i místo v navazujících otázkách.
- Výrazy jako „objíždět města“, „turné“, „termíny“ nebo „klub“ fungují i bez slova koncert.
- Požadavky „všechny“, „vyjmenuj“, „seznam“ a „přehled“ sestavuje přímo z databáze, takže model nemůže některý koncert vynechat.
- Úplné seznamy se filtrují podle roku a stavu přímo v databázi a zobrazují počet nalezených položek.
- Markdown odpovědi se zobrazují jako čitelné odstavce, seznamy a tabulky namísto hvězdiček a svislítek.
- Citace zdrojů jsou skutečné odkazy na Gmail a interní značky typu `[M25]` se už uživateli nezobrazují.

## 0.4.0 — PropBot a interní evidence koncertů

- Kapelní asistent dostal jméno **PropBot**.
- Koncertní e-mailová vlákna se jednorázově vytěží do strukturované SQLite evidence a po změně se automaticky přezpracují.
- Dotazy na nejbližší koncert pracují s chronologicky seřazenými potvrzenými termíny a zachovávají odkazy na zdrojové e-maily.
- Dokud není prvotní evidence kompletní, PropBot nesmí tvrdit, že žádný koncert neexistuje.
- Historie konverzací je uložená lokálně a schovaná pod ozubeným kolečkem za konfigurovatelným PINem.

## 0.3.1 — Veřejné informace pro Google OAuth

- Přidány veřejné stránky O aplikaci, Ochrana soukromí a Podmínky používání.
- Zásady transparentně popisují read-only přístup ke Gmailu, lokální ukládání a použití vybraných úryvků v OpenAI API.
- Chat odkazuje na zásady ochrany soukromí přímo v rozhraní.

## 0.3.0 — Read-only kapelní asistent

- Nová stránka **Zeptej se** propojená s maximálně dvěma kapelními Gmaily.
- Chat odpovídá na dotazy o koncertech, časech příjezdu, nevyřízených požadavcích a fakturách.
- Rychlé štítky předvyplní nejčastější kontrolní otázky, ale rozhraní zůstává čistě konverzační.
- Odpovědi obsahují odkazy na konkrétní zdrojové e-maily a podporují návazné otázky.
- Zprávy se jednorázově zaindexují do SQLite na Raspberry Pi; poté se každých pět minut načítají pouze změny.
- Integrace má pouze oprávnění `gmail.readonly`. Nemůže vytvořit koncept, odeslat, upravit, přesunout ani smazat zprávu.
- Gmail refresh tokeny jsou uložené šifrovaně a citlivá API umí ověřovat podepsaný Cloudflare Access token i při přímém přístupu z domácí sítě.

## 0.2.4 — Přehlednější kapodastr v tisku

- `K0` se v individuálním výtisku nezobrazuje.
- Hodnoty `K1` až `K12` se zobrazují u každé příslušné skladby, i když se kapodastr oproti předchozí skladbě nezměnil.
- Automatické pokyny k přeladění mezi skladbami zůstávají zachované.

## 0.2.3 — Vlastní našeptávače

### Novinky

- Nativní nabídky prohlížeče byly nahrazeny vlastními našeptávači ve vzhledu Setlisteru.
- Našeptávání se používá při výběru alba, dříve zadaných zvuků a presetů i při přidávání nástrojů členům kapely.
- Nabídky lze ovládat myší, dotykem a klávesami se šipkami a `Enter`.
- Výsledky se během psaní filtrují a nejrelevantnější návrhy se řadí jako první.

## 0.2.2 — Chytřejší tisk a spolehlivé načítání aktualizací

### Tisk setlistů

- Velikost názvů skladeb a rozestupy se automaticky přizpůsobují obsahu tak, aby setlist využil jednu A4.
- `K0` se již zbytečně netiskne.
- Výchozí nástroj člena se neopakuje u každé skladby.
- Nástroj a nenulové kapo se zobrazují pouze tehdy, když dochází ke změně.
- Automatické pokyny k přeladění zůstávají mezi příslušnými skladbami.

### Ostatní změny

- Počet dvacetisekundových prostojů je vidět přímo v souhrnu aktuálního setu.
- Opravena ikona záložky — nyní používá samostatné logo Propadleeku.
- Statické soubory jsou verzované a server nepoužívá zastaralou kopii frontendu po aktualizaci add-onu.

## 0.2.1 — Oprava prostojů

### Opravy

- Automatický dvacetisekundový prostoj se již nepřičítá před ani za ručně vloženou pauzu nebo intermezzo.

## 0.2.0 — Soukromé rozpracované sety a rozšířené skládání

### Práce více uživatelů

- Rozpracovaný aktuální setlist se ukládá samostatně v každém prohlížeči.
- Obnovení stránky zachová rozpracovaný set, ale skládání jednoho uživatele neovlivňuje repertoár druhého.
- Sdílený repertoár, uložené setlisty, členové a poznámky zůstávají v databázi na Raspberry Pi.
- Souběžné úpravy sdílených dat se slučují po jednotlivých skladbách, údajích a členech.

### Skládání setlistu

- Písničku lze trvale smazat.
- Název, album a délku písničky lze upravit přímo z aktuálního setu.
- Cílovou délku setu lze nechat prázdnou.
- Přidána volba započítat dvacetisekundové prostoje mezi sousedními skladbami.
- Do setu lze vložit vlastní pojmenovanou pauzu nebo intermezzo s nastavitelnou délkou.

### Tisk a vzhled

- Tisková sestava byla zhuštěna pro delší setlisty.
- Kapo a nástroj jsou vlevo, zvuk, preset a vlastní poznámka vpravo.
- Přechody a přeladění zůstávají vložené mezi skladbami.
- Přidána první favicon s logem kapely.

## 0.1.0 — První veřejná verze

### Repertoár

- Knihovna písní s názvem, albem a délkou.
- Vyhledávání a filtrování repertoáru podle alba.
- Archivace starších skladeb a možnost archivované skladby znovu zobrazit.
- Přidávání jednotlivých písní i hromadné vložení textu.
- Import repertoáru ze strukturované XLSX šablony a možnost šablonu stáhnout.

### Setlisty

- Skládání aktuálního setu přetažením nebo pomocí tlačítek na telefonu.
- Automatický součet délky a porovnání s cílovým časem.
- Ukládání více pojmenovaných setlistů, jejich načítání, duplikování a mazání.
- Skladby použité v aktuálním setu se dočasně skryjí z nabídky repertoáru.

### Kapela a individuální poznámky

- Správa členů kapely a jejich výchozích i dalších nástrojů.
- Individuální poznámky ke každé skladbě pro každého člena.
- Kapo pouze pro podporované kytary a zvuk/preset pouze pro elektrickou kytaru.
- Automatické rozpoznání změny nástroje a kapodastra; poslední kapo se pamatuje zvlášť pro každý nástroj.
- Podpora volných pokynů, například náklepu, podání kytary nebo jiné akce na pódiu.

### Tisk a export

- Čistý společný setlist bez poznámek.
- Samostatná stránka pro každého vybraného člena pouze s jeho vlastními pokyny.
- Nastavitelný počet čistých kopií; výchozí počet je šest, pokud se netisknou individuální stránky.
- Tisk do PDF i stažení samostatné tiskové HTML sestavy.
- Export a import kompletní datové zálohy.

### Provoz a data

- Home Assistant add-on a Docker varianta pro Raspberry Pi.
- Sdílená SQLite databáze v trvalém adresáři `/data`.
- Synchronizace mezi zařízeními a historie posledních 200 verzí databáze.
- Připraveno pro zveřejnění přes existující Cloudflare Tunnel a ochranu pomocí Cloudflare Access.
