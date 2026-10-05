# Changelog

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
