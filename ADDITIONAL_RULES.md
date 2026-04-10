# ADDITIONAL_RULES

Dodatkowe zasady pracy nad schematami w tym repozytorium.

Ten plik jest uzupełnieniem dla:
- `esp-config-designer-frontend/HOW_TO_CREATE_SCHEMA.md`

Zakres:
- dotyczy wyłącznie frontendowych schematów
- dotyczy weryfikacji schematów względem dokumentacji ESPHome
- ma odzwierciedlać ustalenia robocze z tej sesji

## Podstawowa zasada

- Najpierw porównuj schema z dokumentacją ESPHome dla konkretnego komponentu.
- Rób tylko zmiany, których jesteś pewny.
- Jeśli coś jest nietypowe, niejednoznaczne albo dokumentacja jest myląca, nie zgaduj.
- W takich przypadkach najpierw zatrzymaj się i opisz problem użytkownikowi.

## Źródło prawdy

- Domyślnie opieraj się na publicznej stronie dokumentacji ESPHome dla danego komponentu.
- Każdy schema ma `helpUrl` i to jest pierwszy punkt odniesienia.
- Nie zakładaj automatycznie pól dziedziczonych z implementacji upstream, jeśli nie są jasno widoczne w docs, chyba że użytkownik wyraźnie zgodzi się na korzystanie również z implementacji ESPHome jako źródła prawdy.
- Jeśli dokumentacja strony zawiera błąd, ale użytkownik wyraźnie wskaże poprawne zachowanie, można to uwzględnić w schemacie.

## Kolejność pól

- Proste pola konfiguracyjne mają być przed zagnieżdżonymi polami typu `object`, które używają `extends: "base_sensor.json"` lub innych bazowych komponentów.
- `custom_config` ma być traktowane jako proste pole.
- `custom_config` ma być ostatnim z prostych pól.
- `custom_config` ma być umieszczone bezpośrednio przed pierwszym top-level polem zagnieżdżonym, które używa bazowego komponentu.
- Nie wrzucaj prostych pól za grupy sensorów tylko dlatego, że tak było wcześniej.

## custom_config

- Jeśli schema ma globalne `extends` na poziomie całego pliku, nie dodawaj osobnego top-level `custom_config`.
- Jeśli schema nie ma globalnego `extends`, ale ma top-level zagnieżdżone pola bazowe, dodaj top-level:

```json
{
  "key": "custom_config",
  "type": "raw_yaml",
  "required": false,
  "lvl": "advanced"
}
```

- Nie dodawaj `custom_config` przypadkowo do helperów albo root-mapów, jeśli nie ma ku temu potrzeby.

## address

- Jeśli dokumentacja podaje rzeczywistą domyślną wartość pola `address`, schema ma mieć:

```json
"default": "...",
"emitYAML": "always"
```

- Jeśli pole `address` jest liczbowe z dokumentacji urządzenia Modbus lub podobnego, może być modelowane jako `number`, niekoniecznie jako `address`.
- Jeśli dokumentacja nie podaje jednoznacznie domyślnego adresu, nie dodawaj `default` ani `emitYAML: "always"` tylko na podstawie domysłu.
- Jeśli dokumentacja podaje zamknięty zestaw możliwych adresów i to ma sens UX-owo, pole może być `select` zamiast `address`.
- Jeśli pole `address` ma `default`, musi mieć też `emitYAML: "always"`.

## update_interval

- Dla `update_interval` nie używaj `default`, nawet jeśli dokumentacja podaje wartość domyślną.
- Używaj tylko `placeholder`.
- To jest reguła projektowa przyjęta dla tego repo.

## Poziomy lvl w obiektach

- Jeśli pole typu `object` ma własne `fields`, to przynajmniej jedno dziecko ma mieć taki sam `lvl` jak parent.
- Nie twórz obiektu z `lvl: "simple"`, w którym wszystkie dzieci mają tylko `lvl: "normal"` albo `lvl: "advanced"`.

## Wspólne schematy dla wielu urządzeń

- Jeśli kilka urządzeń używa jednego wspólnego schema, nie duplikuj schema bez potrzeby.
- W katalogu komponentów mogą istnieć osobne wpisy aliasowe wskazujące na ten sam `schemaPath`.
- Aliasowe wpisy katalogowe muszą mieć unikalny `catalogKey`.
- Runtime/schema identity pozostaje w `id`.
- UI/display identity aliasu pozostaje w `catalogKey`.
- Jeśli kilka pozycji katalogu ma ten sam `id` i ten sam `path`, ale różne nazwy, to są aliasy i każda z nich musi mieć własny `catalogKey`.
- Exact duplicates 1:1 w katalogu nie powinny istnieć i należy je usuwać.

## Shared hub pattern

- Jeśli komponent jest helperem root-level, a child encje odwołują się do niego przez `id`, preferuj shared-hub pattern.
- Dla wyboru `ADD NEW` / istniejący hub używaj wzorca opartego o:
  - `embedded`
  - `dedupeBy: "id"` dla listowych helperów
  - albo `emitAs: "map"` + `singleton: true` dla helperów singleton-map
  - helper schema z wymaganym `id`
- Jeśli po wybraniu `ADD NEW` hub nie materializuje się od razu, sprawdź najpierw czy helper schema ma pole `id` ustawione jako `required: true`.
- Nie wciskaj child `sensor:` albo `binary_sensor:` do root helpera, jeśli to są osobne platformy. Zrób osobny helper i osobne child schemas.

## Helper + child schemas

- Jeśli komponent z docs składa się z root helpera i osobnych child platform, modeluj to jawnie:
  - helper w `base_component/hub_*.json`
  - child schema w odpowiedniej domenie, np. `sensor/`, `binary_sensor/`, `button/`, `select/`, `text_sensor/`
- Nie mieszaj konfiguracji helpera z child encjami w jednym root-map schema, jeśli docs rozdzielają te poziomy.

## platformByBus i wybór transportu

- Jeśli komponent ma różne platformy zależnie od transportu, używaj `platformByBus`.
- Jeśli komponent ma jeden logiczny schema/helper, ale różne root klucze YAML zależnie od transportu, używaj `domainBy` + `domainMap`.
- Jeśli użytkownik wybiera `i2c` albo `spi`, schema ma prowadzić do właściwej platformy albo właściwego root key bez hacków.
- Pola zależne od transportu modeluj przez `dependsOn` albo `globalDependsOn`.
- Dla transportowych helperów preferuj jeden logiczny helper schema zamiast dwóch ukrytych helper branchy (`hub_spi`, `hub_i2c`) w jednym komponencie.

## Dla list i zagnieżdżonych itemów

- Jeśli pole wewnątrz elementu listy zależy od top-level pola komponentu, zwykłe `dependsOn` może nie działać.
- W takim przypadku używaj:
  - `set_global` na polu źródłowym
  - `globalDependsOn` na polu zależnym
- Nie zakładaj, że `dependsOn` w itemie listy widzi top-level pola.

## Kiedy używać listy zamiast object

- Jeśli docs opisują wiele wpisów tego samego typu, używaj `list`.
- Jeśli docs opisują grupę nazwanych child pól pod jednym kluczem, używaj `object`.
- Nie modeluj powtarzalnych struktur jako pojedynczego `object`, jeśli w docs to lista elementów.

## Typy pól

- Nie zostawiaj `text`, jeśli docs jasno opisują enum, liczbę, czas albo referencję do innego komponentu.
- Typ `select` stosuj dla wszystkich pewnych enumów z dokumentacji.
- Typ `id_ref` stosuj tam, gdzie docs wskazują odniesienie do innej encji lub huba.
- Domena `id_ref` ma odzwierciedlać realny typ komponentu, np. `i2c`, `uart`, `spi`, `sensor`, `binary_sensor`, `microphone`, `display`, `modbus`.

## Root-level helper w pickerze

- Jeśli root helper sam w sobie nie daje użytkownikowi sensownej encji i ma być używany tylko przez child komponenty, nie pokazuj go jako osobnej pozycji do ręcznego dodawania.
- W takim przypadku helper powinien istnieć tylko wewnętrznie, a picker ma pokazywać wyłącznie child komponenty korzystające z shared-hub pattern.

## Checklist i workflow

- Po zakończeniu pracy nad komponentem aktualizuj `components_checklist.md`.
- Jeśli pracujesz hurtowo nad całą kategorią, po zakończeniu zrób audit końcowy dla całej kategorii, nie tylko dla plików, które były edytowane.

## Końcowa weryfikacja po zmianach

- Po każdej partii zmian sprawdź JSON parsing zmodyfikowanych plików.
- Po większych partiach zrób audit reguł dla danej kategorii:
  - `address` + `emitYAML`
  - brak `default` w `update_interval`
  - kolejność prostych pól
  - poprawne użycie `custom_config`
  - zgodność `lvl` w obiektach

## Czego nie robić

- Nie zgaduj pól tylko dlatego, że podobny komponent je ma.
- Nie dorabiaj workaroundów w schema, jeśli problem wynika z błędnego modelu helper/child i da się go zrobić poprawnie istniejącymi mechanizmami.
- Nie zostawiaj różnych stylów zapisu w ramach tego samego schema, jeśli można je ujednolicić.
- Nie mieszaj root helpera z child encjami w jednym miejscu tylko po to, żeby "zadziałało".

## Szybka zasada decyzyjna

- Jeśli coś jest jasno w docs: wdrażaj.
- Jeśli coś wynika tylko z implementacji upstream, ale nie z docs: najpierw sprawdź, czy użytkownik chce taką politykę.
- Jeśli coś jest nietypowe: zatrzymaj się i opisz problem zamiast improwizować.
