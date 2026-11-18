# Setlister — živá specifikace a prompt pro iOS / Android

> Stav specifikace: 0.11.0 · aktualizováno 18. 11. 2026
>
> Tento soubor je součást produktu. Při každé funkční, vizuální nebo API změně webu musí být aktualizován ve stejném commitu. Je zdrojem pravdy pro budoucí nativní aplikace.

## Prompt pro AI vývojáře

Vytvoř produkční mobilní aplikaci **Setlister** pro iOS a Android. Aplikace nesmí být samostatná lokální kopie webu: používá stejný účet, kapely, předplatné a cloudová data jako web `https://app.setlister.cz`. Uživatel musí po přihlášení vidět stejný repertoár a stejné setlisty na webu, iPhonu i Androidu. Offline režim smí držet lokální cache, ale server je zdroj pravdy a konflikty se řeší pomocí revize kapely.

Dodrž české texty, tmavý vizuál, primární limetkovou barvu `#D9FF43`, velkou typografii, zaoblené plochy a vysokou čitelnost. Nepoužívej emoji jako produktové ikony. UI musí fungovat i na malém telefonu, podporovat Dynamic Type / zvětšené písmo a běžné accessibility popisky.

### Produktový účel

Setlister je pracovní prostor kapely pro:

1. správu repertoáru;
2. skládání a ukládání koncertních setlistů;
3. osobní pokyny každého člena ke každé skladbě;
4. tisk / export čitelných pódiových A4;
5. plánování dne koncertu a historii skutečně odehraných setů;
6. společně vedený live průchod setlistem při zkoušce nebo koncertu;
7. pozdějšího read-only AI agenta nad maximálně dvěma kapelními Gmail účty;
8. budoucí stageplany a technické ridery.

Nejde o hudební přehrávač ani veřejný katalog koncertů.

## Informační architektura

Po přihlášení zobraz spodní navigaci:

- **Setlist** — právě skládaný set, repertoár k přidání, uložené sety, tisk/PDF.
- **Repertoár** — skladby, jejich obecná metadata a osobní pokyny členů.
- **Koncerty** — termíny, časový plán dne, checklist, přiřazený uložený setlist a historie skutečně odehraných setů.
- **Zkouška** — společně vedený live průchod aktuálním nebo uloženým setlistem, osobní pokyny a synchronizovaný metronom.
- **Mailový agent** — popis, stav synchronizace a později chat nad Gmailem.
- **Kapela** — logo, pódioví členové, nástroje, pozvánkový kód, účet a předplatné.

Uživatel může být členem více kapel. Aktivní kapela se přepíná v hlavičce. Data různých kapel se nikdy nesmí smíchat.

## Registrace, kapely a oprávnění

- Registrace: jméno, e-mail, heslo minimálně 10 znaků.
- Po registraci uživatel založí kapelu nebo se připojí osmimístným pozvánkovým kódem.
- Registrované účty a pódioví členové jsou dvě rozdílné věci.
- Pódiového člena lze vytvořit, upravit a používat ve výtiscích bez jeho registrace.
- Pódiový profil může být později propojen s registrovaným účtem pomocí `linkedUserId`.
- Vlastník může obnovit pozvánkový kód.
- Předplatné patří k `bandId`, ne zařízení ani platformě. Platba na webu, App Storu či Google Play musí vytvořit stejné serverové oprávnění kapely.

## Datový model kapely — schemaVersion 2

Server dnes ukládá celý dokument kapely jako verzovaný JSON. Mobilní aplikace musí neznámá pole zachovat.

```json
{
  "version": 2,
  "bandProfile": { "logoDataUrl": "data:image/webp;base64,..." },
  "members": [
    {
      "id": "member-...",
      "name": "Petr",
      "linkedUserId": "usr_... nebo prázdné",
      "instruments": [
        { "id": "acoustic-guitar", "name": "Akustická kytara", "kind": "guitar" },
        { "id": "electric-guitar", "name": "Elektrická kytara", "kind": "electric-guitar" }
      ],
      "defaultInstrumentId": "acoustic-guitar",
      "vocals": false
    }
  ],
  "songs": [
    {
      "id": "song-...",
      "title": "Název",
      "album": "Album nebo singl",
      "seconds": 210,
      "bpm": 128,
      "energy": 4,
      "role": "standard | opener | encore | closer",
      "printFields": [
        { "id": "field-...", "label": "Kdo začíná", "value": "Hanych a Petr" }
      ],
      "memberDetails": {
        "member-...": {
          "instrumentId": "electric-guitar",
          "customTitle": "Můj vlastní název",
          "capo": 0,
          "preset": "Crunch 04",
          "printFields": [
            { "id": "field-...", "label": "Efekt", "value": "FX 12" }
          ],
          "note": "V druhé sloce stáhnout volume"
        }
      }
    }
  ],
  "draft": {
    "name": "Praha — Roxy",
    "targetMinutes": 45,
    "songIds": ["song-1", "song-2"],
    "lockedSongIds": ["song-1"],
    "viewerMemberId": "clean nebo member-..."
  },
  "savedSetlists": [
    { "id": "set-...", "name": "45 min festival", "targetMinutes": 45, "songIds": ["song-1"] }
  ],
  "events": [
    {
      "id": "event-...",
      "name": "Roxy — Praha",
      "date": "2027-01-21",
      "city": "Praha",
      "venue": "Roxy",
      "address": "Dlouhá 33, Praha",
      "arrival": "16:00",
      "loadIn": "16:30",
      "soundcheck": "17:30",
      "showStart": "20:00",
      "showEnd": "21:00",
      "setlistId": "set-...",
      "contactName": "Pořadatel",
      "contactPhone": "+420...",
      "note": "Vjezd zezadu",
      "checklist": [{ "id": "check-...", "label": "Merch", "done": true }],
      "status": "planned | completed",
      "actualStart": "20:08",
      "actualEnd": "21:04",
      "plannedSongIds": ["song-1"],
      "playedSongIds": ["song-1", "song-3"],
      "rating": 4,
      "performanceNote": "Prohodit prostřední blok."
    }
  ]
}
```

### Nástroje a podmíněná pole

Základní katalog: Bez nástroje, Akustická kytara, Elektrická kytara, Baskytara, Bicí, Klávesy, Housle, Saxofon, Perkuse a vlastní nástroj.

Člen může mít současně zvolený libovolný počet nástrojů. Výběr je vizuální sada nezávislých přepínačů, nikoli radio button. Vlastní nástroj se po Enteru nebo potvrzení vloží jako další zaškrtnutá možnost; lze jej odškrtnout i úplně odstranit. Po odstranění nástroje se osobní pokyny skladeb, které jej používaly, bezpečně přepnou na „Bez nástroje“ a zruší kapo i preset.

Každý člen má explicitní `defaultInstrumentId`. Výchozí nástroj musí být jeden z jeho zvolených nástrojů, případně `none`. V osobních pokynech skladby je první volba „Výchozí — název nástroje“ a ukládá prázdný `instrumentId`; tím skladba vždy zdědí aktuální výchozí nástroj člena. Explicitně zvolený jiný nástroj výchozí hodnotu přepíše jen pro danou skladbu.

- `capo` zobraz pouze pokud vybraný nástroj člena v dané skladbě má `kind` `guitar` nebo `electric-guitar`.
- K0 se ve výtisku nevypisuje. K1–K12 ano.
- `preset` zobraz pouze pro `kind: electric-guitar`.
- Baskytara, bicí, housle, klávesy, zpěv a „Bez nástroje“ kapodastr nemají.
- Pokud se nástroj mezi dvěma skladbami změní, vlož tuto změnu do osobního výtisku člena.
- První skladba nehlásí nástroj, pokud odpovídá výchozímu nástroji člena.

## Repertoár

Každá skladba má název, album, délku, volitelné BPM 1–300, energii 1–5 a roli. Role je běžná, otevírací, přídavková nebo závěrečná. Obecná skladba nemá globální kapodastr ani globální poznámku. Pokyny patří vždy konkrétnímu členovi.

Skladba může mít až osm pojmenovaných globálních `printFields`. Každé pole má stabilní `id`, vlastní název `label` do 32 znaků a hodnotu `value` do 64 znaků. Uživatel do vstupu „Název štítku“ napíše například „Kdo začíná“ a potvrdí Enterem nebo tlačítkem; aplikace vytvoří samostatný box „Kdo začíná“, do kterého zapíše třeba „Hanych a Petr“. Detail konkrétního člena může mít stejným způsobem až osm osobních polí, například `Efekt: FX 12` nebo `Ladění: Drop D`. Pole bez vyplněné hodnoty zůstane uložené pro pozdější použití, ale nevypisuje se v setlistu ani na A4. Globální i osobní pole se zobrazují pouze v osobním pohledu a na osobních výtiscích, nikoli na čistém setlistu.

Starší nepojmenované `printTags` klient při načtení bezeztrátově převede na `printFields` s prázdným `label`; server je dočasně akceptuje pouze kvůli zpětné kompatibilitě. Nové změny vždy ukládej jako `printFields`.

V detailu skladby zobraz sekci pro každého pódiového člena:

- nástroj použitý v této skladbě;
- podmíněný kapodastr;
- podmíněný zvuk/preset elektrické kytary;
- soukromou pódiovou poznámku.
- osobní pojmenovaná pole pro tisk.

Obecná editace skladby a osobní pokyny jsou dvě oddělené akce. Tužka upravuje název, album, délku, BPM, energii, roli a globální pojmenovaná pole. Samostatná akce „Poznámky členů“ nejprve zvolí člena; výchozí je pódiový profil propojený s přihlášeným účtem. Osobní dialog obsahuje vlastní název skladby, zděděný nebo explicitní nástroj, podmíněné kapo/preset, osobní pojmenovaná pole a textovou poznámku.

### Hromadný import repertoáru

Primární cesta hromadného importu je jednoduchý `.xlsx` soubor. Klient stáhne skutečnou XLSX šablonu s prvním listem `Repertoár`, zamknutou hlavičkou, zvýrazněnými názvy sloupců, přednastavenou textovou délkou a validací energie/role. Uživatel ji vyplní v Excelu, Numbers nebo Google Tabulkách a nahraje zpět. Server bez externího cloudu bezpečně rozbalí první list a vrátí řádky klientovi. Soubor smí mít nejvýše 3 MB a import nejvýše 1000 řádků. CSV/TSV/TXT a vložení zkopírovaných buněk zůstávají jako vedlejší kompatibilní možnosti, ne hlavní zákaznická cesta.

Podporované sloupce jsou Název, Album, Délka, BPM, Energie, Role a Štítky; povinné jsou Název a platná Délka. Délka přijímá `m:ss` nebo sekundy, role české i interní názvy a více štítků se odděluje znakem `|` nebo čárkou. Zápis `Kdo začíná: Hanych` se importuje jako pojmenované `printField` s `label` „Kdo začíná“ a `value` „Hanych“. Celý repertoár má nejvýše 3000 skladeb a duplicity podle normalizované dvojice název + album se přeskočí.

Nevytahuj repertoár ze Spotify odkazu pomocí LLM ani scrapingu. Je to nespolehlivé, neposkytne důvěryhodné BPM a neodpovídá současným podmínkám Spotify pro komerční veřejnou aplikaci. Budoucí oficiální katalogový konektor musí být samostatný provider za feature flagem a aktivovat se až po získání písemného oprávnění poskytovatele.

## Skládání setlistu

- Levá / horní část nabídne jen skladby, které ještě nejsou v aktuálním setu.
- Fulltext hledá v názvu, albu a roli; samostatné filtry vybírají album, energii a roli skladby.
- Skladbu lze přidat, odebrat a přetřídit drag-and-drop i tlačítky.
- Každá skladba už vložená do aktuálního setu má přímo v řádku dvě samostatné akce: tužku pro obecnou editaci skladby a ikonu členů pro otevření osobních pokynů/poznámek. Uživatel ji kvůli úpravě nesmí nejprve vracet do repertoáru.
- Zobraz celkovou délku, cílovou délku a progress.
- Uživatel může přepnout pohled „Bez poznámek“ nebo konkrétního člena.
- „Bez poznámek“ nikdy nesmí zobrazit kapodastr, změnu nástroje, preset ani osobní poznámku žádného člena.
- V osobním pohledu i osobním výtisku se použije `customTitle`, pokud jej člen vyplnil. Čistý setlist vždy používá hlavní název skladby.
- Aktuální set lze uložit pod názvem a později znovu načíst.
- Název setlistu je přímo editovatelný a má viditelnou ikonu tužky, aby možnost přejmenování nebyla skrytá jen vzhledem nadpisu.

### Chytré pořadí setlistu

Chytré řazení je deterministický návrh, nikoli generativní AI. Nesmí uživateli set tiše přepsat: nejdřív zobrazí náhled, stručné důvody a porovnání počtu změn, teprve samostatné potvrzení použije nové pořadí. Každou skladbu lze v editoru zamknout na současné pozici pomocí `draft.lockedSongIds`; zamčené pozice algoritmus nikdy nepřesune.

Pořadí se skládá podle těchto pravidel a vah:

1. `opener` patří na začátek, `closer` na konec hlavní části a `encore` úplně na konec; porušení role má výrazně vyšší penalizaci než ostatní preference;
2. cílový energetický oblouk je přibližně `4.4 → 3.1 → 4.2 → 3.5 → 5.0` v relativních pozicích `0 % → 24 % → 52 % → 72 % → 100 %` setu;
3. tři skladby s energií 5 za sebou dostávají dodatečnou penalizaci, aby vrchol nebyl monotónní;
4. změna nástroje kteréhokoli člena stojí 5 bodů, změna osobního pole `Ladění`/`Tuning` 4 body, změna kapodastru na stejné kytaře 2,4 bodu a změna elektrického presetu 0,35 bodu; naposledy použitý kapodastr, ladění a preset se pamatují samostatně pro každý nástroj, takže návrat z elektrické na dříve odloženou akustickou kytaru správně započítá nutnou změnu jejího kapa;
5. algoritmus nejprve deterministicky doplňuje volné pozice nejlevnější následující skladbou a při shodě zachová původní pořadí; poté zkouší vzájemné výměny pouze nezamčených pozic, dokud se skóre zlepšuje;
6. pro více než 40 nezamčených skladeb omez počet optimalizačních průchodů na dva, nad 60 použij pouze první rychlý průchod, aby UI nezamrzlo.

Náhled ukáže roli, energii a zamčenou pozici každé skladby a souhrn typu „o 2 méně změn nástroje“. Uživatel může návrh odmítnout bez jakékoli změny dat.

## Koncerty a historie hraní

Koncert je kapelní provozní záznam, ne úložiště smluv. Obsahuje název, datum, město, místo, adresu, arrival, load-in, zvukovku, plánovaný začátek a konec, kontakt, telefon, praktickou poznámku a jednoduchý checklist. Neobsahuje soubory, smlouvy ani potvrzování účasti členů.

- Ke koncertu se vybírá existující uložený setlist pomocí stabilního `setlistId`; jeho karta i zvýrazněný nejbližší koncert musí mít přímou akci, která setlist otevře v editoru.
- Smazání uloženého setlistu bezpečně zruší jeho přiřazení u budoucích koncertů.
- Nadcházející koncerty jsou řazené vzestupně podle data; odehrané sestupně.
- Položky checklistu lze odškrtávat přímo na kartě a stav se synchronizuje s kapelním cloudem.
- Akce „Zapsat jako odehrané“ přepne událost do historie. Uživatel zadá skutečný začátek/konec, hodnocení 1–5, poznámku a skutečné pořadí skladeb; skladby lze přidat, odebrat i přeskládat.
- Při prvním dokončení se do `plannedSongIds` uloží neměnný snímek tehdy přiřazeného setlistu. Pozdější úpravy uloženého setlistu proto nezmění historické porovnání.
- Pokud byl přiřazený set právě veden v live režimu, formulář dokončení předvyplní `playedSongIds` skutečně navštívenými skladbami; jinak použije celý přiřazený setlist.
- Historie ukazuje počet odehraných skladeb, jejich součet délek, skutečný čas koncertu, počet vynechaných/přidaných skladeb, hodnocení a poznámku.

## Tisk a PDF

Export je určen pro papír ležící na pódiu, proto je čitelnost důležitější než dekorace.

- Formát A4 portrait.
- Uživatel zvolí, zda chce osobní setlisty členů, počet kopií pro každého člena, čisté setlisty a jejich libovolný počet.
- Výchozí hodnoty: 1 kopie pro každého člena + 6 čistých kopií.
- Čistý setlist obsahuje pouze názvy skladeb a malou hlavičku; žádné osobní údaje.
- Osobní setlist má uprostřed tučný název skladby, vlevo štítky kapodastru, BPM, globálních i osobních krátkých pokynů a vpravo změny nástroje, preset a delší poznámku.
- Změna nástroje se uvede jen při skutečné změně oproti naposledy použitému nástroji.
- Výchozí režim automaticky volí největší písmo, při kterém se obsah vejde na jednu A4. Uživatel může vynucení jedné stránky vypnout.
- U malého počtu skladeb seznam vertikálně vystřeď.
- Výtisk může obsahovat malé logo kapely a název setlistu, ale hlavička nesmí zabírat podstatnou část stránky.

## Live zkouška

Uživatel může jako vedoucí spustit právě skládaný set nebo libovolný uložený setlist. Server uloží společnou aktivní skladbu pro `bandId` a všechny připojené klienty ji během nejvýše jedné sekundy převezmou. Live obrazovka má velký název aktuální skladby, pozici v setu, délku, BPM, energii a všechny společné i osobní pokyny pódiového profilu propojeného s přihlášeným účtem. Každý tedy sleduje stejnou skladbu, ale vidí svoje vlastní pokyny. Pokud účet nemá propojený profil, použije se první pódiový člen a UI to zřetelně uvede.

- Mezi skladbami lze přecházet tlačítky, klávesami i vodorovným swipe gestem, ale společnou pozici smí měnit pouze vedoucí setu.
- Ostatní zařízení jsou sledující: šipky mají neaktivní a při swipe dostanou informaci, kdo set vede.
- Člen může explicitně převzít vedení spuštěním vybraného setlistu. Vedoucí může společný set ukončit; vlastník kapely jej může ukončit také.
- `liveSet.playedSongIds` uchovává unikátní skladby, které vedoucí během relace skutečně otevřel, v pořadí prvního navštívení. Po ukončení zůstane záznam v poslední relaci pro předvyplnění historie koncertu.
- Po změně skladby se BPM metronomu předvyplní z dané skladby, pokud je uvedeno.
- Názvy a pokyny používají stejné dědění nástroje, `customTitle`, kapodastr, preset, `printFields` a poznámku jako osobní výtisk.
- Live karta zobrazuje globální i osobní `printFields` jako dvojici jejich skutečného `label` a `value`; nesmí používat matoucí obecné hlavičky „Kapela“ nebo „Moje“. Starší migrované pole bez názvu označí jako „Společný pokyn“, respektive „Můj pokyn“.
- Live obrazovka musí zabránit uspání displeje, pokud platforma nabízí Wake Lock / idle timer API; webový fallback může být omezen prohlížečem.

### Synchronizovaný metronom

Metronom je kapelní relace uložená pro `bandId`. Startující klient odešle BPM serveru; server vytvoří autoritativní `startedAtMs` dvě sekundy v budoucnosti. Všechna zařízení opakovaně změří rozdíl svého času vůči `serverTimeMs` metodou midpoint/RTT a plánují jednotlivé beaty lokálním audio enginem podle stejné absolutní časové osy. Web používá Web Audio s krátkým look-ahead schedulerem, iOS má použít `AVAudioEngine`/host time a Android `AudioTrack` nebo Oboe s monotónním časem. Síť neposílá každý klik — přenáší pouze stav, BPM a společný čas začátku.

Každé zařízení musí před prvním během uživatelským gestem povolit audio. Uživatel může uložit lokální kalibraci výstupní latence v rozsahu −250 až +250 ms; tato hodnota nepatří do kapelních dat. Při změně BPM se vytvoří nový společný start a revize relace. Klient průběžně koriguje odhad serverového offsetu, ale nesmí skokově přesouvat již naplánovaný beat.

Nelze slibovat 100% sample-perfect shodu zvuku z nezávislých reproduktorů: zařízení mají rozdílné audio buffery, OS latenci a akustickou vzdálenost. Cílem je praktická synchronizace pro zkoušku. Pro kritický koncertní klik má produkt doporučit jeden zvukový master nebo centrální audio distribuci; ostatní zařízení mohou používat vizuální/haptickou indikaci.

## Logo kapely

Kapela může nahrát vlastní PNG, JPEG, WebP nebo SVG libovolného poměru stran. Po výběru souboru klient otevře editor čtvercového výřezu: uživatel obrázek posouvá tažením nebo šipkami, mění přiblížení v rozsahu 1× až 4× a může jej znovu vycentrovat. Potvrzený výřez se vyrenderuje přesně na 512 × 512 px a uloží jako kompaktní WebP; zrušení editoru zachová předchozí logo beze změny. Logo se zobrazuje vedle názvu aktivní kapely a na výtisku. Maximální uložená data URL je 700 000 znaků. Stejné chování a výsledný formát musí zachovat web, iOS i Android.

## Mailový agent — cílová funkce

Připojení je striktně Gmail read-only a maximálně dva účty na kapelu. Agent **nikdy** nevytváří koncepty, neposílá, neupravuje ani nemaže e-maily.

Správný návrh:

1. první synchronizace stáhne zprávy a vytvoří tenantově oddělený index pro `bandId`;
2. další synchronizace používají Gmail History API a doplní jen změny;
3. z e-mailů se vedle fulltextu extrahují strukturovaná fakta (koncerty, termíny, arrival, faktury, čekající odpovědi) se zdrojovým message ID;
4. dotaz nejdřív provede levné deterministické / FTS vyhledání a vybere omezený počet relevantních vláken;
5. LLM dostane pouze dotaz, nalezené pasáže, strukturovaná fakta a naučená pravidla kapely;
6. odpověď musí připojit proklik na zdrojový Gmail; bez důkazu má přiznat nejistotu, ne domýšlet;
7. souhrnné dotazy jako „všechny koncerty“ musí čerpat z úplné strukturované evidence, ne z top-N náhodných e-mailů;
8. tokeny a refresh tokeny jsou šifrované na serveru; nikdy se neposílají mobilnímu klientovi.

Veřejný multi-tenant Gmail agent zatím není aktivní. Nezobrazuj falešně funkční připojení. Soukromý `/propadleek` PropsBot je referenční prototyp, ne endpoint veřejných klientů.

## Aktuální cloud a API

Základní URL produkčního klienta: `https://app.setlister.cz/api/app`

Webové API dnes používá zabezpečenou HttpOnly cookie `setlister_session`, `SameSite=Lax`. Nativní klient má používat systémový cookie storage, dokud backend nedostane mobilní bearer tokeny. Token ani heslo neukládej do běžných preferences; použij iOS Keychain / Android Keystore. Vše pouze přes HTTPS.

### Existující endpointy

| Metoda | Endpoint | Tělo / význam |
|---|---|---|
| `POST` | `/register` | `{name,email,password}`; vytvoří účet a session cookie |
| `POST` | `/login` | `{email,password}`; vytvoří session cookie |
| `POST` | `/logout` | `{}`; zruší session |
| `GET` | `/session` | vrátí `user` a seznam `bands` |
| `POST` | `/bands` | `{name}`; založí kapelu, trial a výchozí state v2 |
| `POST` | `/bands/join` | `{code}`; připojí účet ke kapele |
| `POST` | `/bands/rotate-code` | `{bandId}`; pouze vlastník, obnoví pozvánkový kód |
| `GET` | `/workspace?bandId=...` | vrátí kapelu, roli, účty členů, subscription, `state`, `revision` |
| `PUT` | `/band-state` | `{bandId,revision,state}`; atomicky uloží JSON a zvýší revizi |
| `GET` | `/repertoire-template.xlsx?bandId=...` | stáhne XLSX šablonu repertoáru; vyžaduje členství |
| `POST` | `/import-xlsx` | `{bandId,contentBase64}`; bezpečně přečte první list a vrátí `rows` |
| `GET` | `/live-session?bandId=...` | vrátí `serverTimeMs`, revizi, stav metronomu a `liveSet` společného průchodu |
| `POST` | `/live-session` | `{bandId,action:"start|stop",bpm}` pro metronom; `{bandId,action:"start_set",setlistRef:"draft|saved:<id>"}` pro vedení setu; `{bandId,action:"set_song",songIndex}` pro posun vedoucím; `{bandId,action:"stop_set"}` pro ukončení |

Všechny POST/PUT požadavky posílej s `Content-Type: application/json`. Server kontroluje přihlášení, členství kapely a same-origin u webových mutací. Při uložení může vrátit `409 Konflikt změn`; klient pak znovu načte workspace a nesmí tiše přepsat novější serverová data.

### Doplnit před prvním veřejným nativním releasem

- mobilní OAuth/token exchange a rotace refresh tokenu;
- samostatné CRUD/delta endpointy místo ukládání celého dokumentu kapely;
- upload loga jako objektový soubor namísto data URL;
- audit log změn a bezpečné slučování konfliktů;
- reset hesla a ověření e-mailu;
- subscription entitlement endpoint a webhooky Apple/Google/web;
- veřejné tenantové Gmail OAuth, stav synchronizace, odpojení a chat endpointy;
- push notifikace jen po výslovném opt-in.

## Vizuální systém

- Pozadí `#0C0D0E`, povrch `#141618`, zvýšený povrch `#1A1D20`.
- Primární `#D9FF43`, text na primární `#141803`.
- Hlavní text `#F5F1E9`, sekundární `#969A9E`, linka `#2B2F33`, chyba `#FF6B6B`.
- Výrazné nadpisy s těsným prokladem; provozní obsah kompaktní a velmi čitelný.
- Karty a formuláře mají jemné linky, ne výrazné stíny.
- Tlačítka mají kapslový tvar; primární akce limetková, sekundární průhledná s linkou.
- Výběry nepoužívají výchozí systémový vzhled prohlížeče. Použij vlastní přístupnou roletku se zvýrazněnou aktivní volbou, klávesou Escape a odpovídajícím limetkovým focus stavem.
- Pódiové PDF je černé na bílém, bez tmavého brandového pozadí.

## Akceptační scénáře

1. Vlastník založí kapelu, nahraje logo a bez registrace přidá Petra a Viky.
2. Petrovi nastaví akustickou a elektrickou kytaru, Viky housle.
3. U skladby nastaví Petr akustickou K3 a poznámku; u další elektrickou s presetem. Viky nikdy nevidí kapodastr.
4. V pohledu „Bez poznámek“ se nezobrazí Petrovo K3 ani změna nástroje.
5. Export vytvoří jednu osobní A4 pro Petra, jednu pro Viky a šest čistých A4; co největším čitelným písmem.
6. Stejná kapela a změny jsou po přihlášení vidět na webu, iOS i Androidu.
7. Současná změna z jiného zařízení vyvolá konflikt revize a klient ji nesmí ztratit.
8. Odhlášený uživatel ani člen jiné kapely se k datům nedostane.
9. Uživatel stáhne XLSX šablonu, vyplní dvě skladby a bez převodu do CSV je naimportuje.
10. Dva členové otevřou stejnou kapelu, povolí zvuk a po společném startu počítají beaty ze stejného serverového `startedAtMs`; lokální kalibrace jednoho zařízení neovlivní druhé.
11. Petr spustí set jako vedoucí a přejde na druhou skladbu; Viky do jedné sekundy uvidí tutéž skladbu, ale svoje vlastní pokyny, a sama nemůže společnou pozici změnit.
12. Uživatel zamkne první skladbu, otevře chytré řazení, uvidí náhled energetického oblouku a snížení počtu změn; první skladba zůstane na místě i po potvrzení.
13. Ke koncertu přiřadí uložený setlist, otevře jej jedním kliknutím, po koncertě upraví skutečné pořadí a v historii uvidí rozdíl oproti neměnnému původnímu plánu.

## Aktuální omezení

- Veřejný Gmail agent je zatím pouze produktově a architektonicky popsaný, není aktivní.
- Ukládání je nyní dokumentové a konflikt načte novější serverovou verzi; jemné slučování změn ještě chybí.
- PDF na webu používá tiskový dialog prohlížeče; nativní aplikace má vytvořit skutečný PDF soubor se shodným layoutem.
- Webový metronom je limitovaný audio latencí a pravidly prohlížeče na pozadí; nativní aplikace má přesnější audio scheduler. Nezávislé reproduktory nelze garantovat jako sample-perfect.
