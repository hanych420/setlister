# Veřejná aplikace Setlister

## Domény

- setlister.cz — veřejný marketing a demo;
- app.setlister.cz — registrace a kapelní pracovní prostor;
- setlister.cz/propadleek — původní soukromý prostor Propadleeku za Cloudflare Access.

## Účty a kapely

Uživatel má jeden účet a může být členem více kapel. Každá kapela má vlastní band_id, pozvánkový kód, členství, stav repertoáru a předplatné. API ověřuje členství na serveru při každém čtení i zápisu.

Vedle přihlášených účtů má kapela samostatné pódiové profily členů. Ty lze vytvářet bez registrace, obsahují nástroje a osobní pokyny pro skladby a mohou být později propojeny s účtem pomocí linkedUserId. Stav v2 obsahuje repertoár, osobní nastavení, aktuální set, uložené setlisty a logo kapely. Úplný aktuální kontrakt je v kořenovém souboru `MOBILE_APP_BUILD_SPEC.md`.

Pozvánkový kód může zobrazit každý člen. Pouze vlastník kapely jej může zneplatnit a vytvořit nový.

## Předplatné napříč platformami

Entitlement je uložený v public_subscriptions podle band_id, ne podle zařízení nebo konkrétního uživatele. Budoucí webhooky Stripe, App Store Server API a Google Play Developer API budou aktualizovat tentýž záznam:

- provider — stripe, apple nebo google;
- external_customer_id;
- external_subscription_id;
- entitlement_source;
- status a current_period_end.

Klientské aplikace pouze čtou stav kapely ze serveru. Nákup z jedné platformy proto odemkne stejnou kapelu na webu, Androidu i iPhonu. Při publikaci mobilních aplikací je nutné respektovat aktuální pravidla App Storu a Google Play pro externí platby.

## Mailový agent

Datový model počítá nejvýše se dvěma Gmail účty na kapelu. Připojení musí zůstat pouze v rozsahu gmail.readonly. Tokeny se ukládají šifrovaně a nikdy se neposílají do prohlížeče. Ve verzi 0.8.0 je v obecné aplikaci přesně popsané cílové chování, ale veřejný tenantový OAuth ještě není aktivní; oddělené indexy jednotlivých kapel a jejich bezpečnostní kontrola budou samostatná další etapa.

## Kontakt

Marketingový formulář volá /api/contact. Server zprávu předá přes Resend, pokud jsou v add-onu nastavené resend_api_key, contact_email a contact_from. Odesílání má honeypot a limit pěti zpráv za hodinu z jedné IP adresy.
