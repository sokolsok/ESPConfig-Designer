# HOW_TO_CREATE_SHEMA

Kompletna instrukcja tworzenia schematow dla buildera ESPHome.
Po przeczytaniu tego pliku AGENT lub user powinien byc w stanie przygotowac poprawny schemat dla dowolnego komponentu.

---

## 0. Co to jest schema w tym projekcie

Schema JSON steruje dwiema rzeczami naraz:

1) renderem formularza (UI),
2) emisja do finalnego YAML.

To sa dwa osobne przebiegi. Pole moze byc widoczne w UI, ale nie trafic do YAML (np. `emitYAML: "never"`).

---

## 1. Przeplyw danych (runtime)

1) Loader czyta schema i rozwiazuje `extends`.
2) Formularz renderuje pola po `fields`.
3) Edycja pola zapisuje dane do `config`.
4) Generator YAML bierze `config + schema` i sklada finalny YAML.
5) Dodatkowo auto-wartosci (`slug`, `ssid`, `password` generator) moga byc wyliczane podczas skanowania.

Wnioski praktyczne:

- Nie zakladaj, ze sam `default` w UI jest juz w `config`.
- Dla `id_ref` liczy sie indeks ID z runtime formularza (zwykle `config`, a dla `required id` system uwzglednia tez `default`).

---

## 2. Gdzie tworzyc pliki

- Schematy komponentow: `public/schemas/components/<domain>/<platform>.json`
- Bazy i reuzywalne fragmenty: `public/schemas/components/base_component/*.json`
- Lista komponentow: `public/components_list/components_list.json`
- Indeks akcji do pickera: `public/action_list/base_actions.json`
- Definicje pol akcji: `public/actions/**/*.json`
- Generator definicji akcji: `scripts/action-definition-generator.js`
- Entrypoint generatora akcji: `scripts/generate-action-definitions.js`
- Indeks condition do pickera: `public/condition_list/base_conditions.json`
- Definicje pol condition: `public/conditions/**/*.json`

Przyklad:

- `binary_sensor/gpio` -> `public/schemas/components/binary_sensor/gpio.json`

---

## 3. Drzewo decyzji: jaki wzorzec wybrac

Czytaj docs i wybierz jeden z wzorcow:

1) **Prosty komponent platformy**
   - docs: tylko sekcja `binary_sensor: - platform: ...`
   - schema: pojedynczy plik platformy + ewentualnie `extends: base_binary_sensor.json`

2) **"All other options from Binary Sensor"**
   - schema: dodaj `extends: base_binary_sensor.json`
   - w `fields` trzymaj tylko pola specyficzne dla platformy

3) **Komponent ma osobny hub + binary_sensor child**
   - docs: sekcja `Component/Hub` + osobna sekcja `... Binary Sensor`
   - schema: jedna karta UI z osadzonym hubem (`embedded`) + emisja huba do osobnej domeny YAML

4) **Hub ma kilka transportow (SPI/I2C/UART lub inne warianty)**
   - schema: `bus` + `platformByBus`/`requiresByBus` + osobne obiekty huba per transport (`dependsOn`)

5) **Komponent zwraca kilka sub-binary-sensorow jako klucze**
   - przyklad: `too_cold`, `lens_bad`, `em_sat`
   - schema: pola `type: "object"` z `extends: "base_binary_sensor.json"`

6) **Komponent BLE (broadcast/client)**
   - docs: odniesienia do `esp32_ble_tracker` i/lub `ble_client_id`
   - schema: zwykle dodaj singleton `esp32_ble_tracker` przez `embedded.emitAs: "map"`
   - jesli jest `ble_client_id`: dodaj shared hub `ble_client` (`embedded` list + `dedupeBy: "id"`)

Jesli docs sa bardzo niestandardowe i nie da sie tego oddac bez custom code, oznacz komponent jako "do doprecyzowania" zamiast zgadywac.

---

## 4. Top-level schema: wszystkie obslugiwane klucze

Minimalny szablon:

```json
{
  "id": "binary_sensor.example",
  "domain": "binary_sensor",
  "platform": "example",
  "requires": [],
  "helpUrl": "https://esphome.io/components/binary_sensor/example/",
  "fields": []
}
```

Klucze top-level:

- `id` - unikalny identyfikator schematu (`domain.platform`)
- `domain` - domena YAML (`binary_sensor`, `sensor`, `display`, ...)
- `platform` - domyslna platforma wpisu
- `platformByBus` - mapa platform po wartosci `config.bus`
- `requires` - stale wymagane interfejsy/protokoly (`i2c`, `spi`, `uart`, `mqtt`, `espnow`, ...)
- `requiresByBus` - wymagane interfejsy zalezne od `bus`
- `requiresByType` - wymagane interfejsy zalezne od `type`
- `helpUrl` - link do docs
- `extends` - dziedziczenie calego schematu z `base_component`
- `embedded` - definicje osadzonych obiektow emitowanych do innej domeny YAML
- `fields` - lista pol formularza

### 4.1 `platformByBus` i `requiresByBus`

`bus` sluzy jako helper tylko do wyboru wariantu.

- Generator YAML usuwa `bus` z payloadu i wybiera platforme z `platformByBus`.
- System wymagan interfejsow bierze interfejsy z `requiresByBus[bus]`.

Przyklad:

```json
{
  "platform": "bmp280_i2c",
  "platformByBus": {
    "i2c": "bmp280_i2c",
    "spi": "bmp280_spi"
  },
  "requiresByBus": {
    "i2c": ["i2c"],
    "spi": ["spi"]
  }
}
```

### 4.2 `embedded` (hub w tej samej karcie)

`embedded` pozwala miec jedna karte UI, ale emitowac dodatkowe sekcje YAML.

Mechanizm obsluguje teraz dwa tryby emisji:

- `emitAs: "list"` (domyslny) -> `domain:` + wpisy `- ...`
- `emitAs: "map"` -> `domain:` + pojedyncza mapa klucz-wartosc

Element `embedded`:

- `key` - klucz pola `object` w `fields`
- `domain` - docelowa domena YAML (np. `pn532_spi`)
- `dedupeBy` - deduplikacja wpisow po kluczu (pierwszy wygrywa)
- `alwaysEmit` - opcjonalnie wymusza emisje nawet przy pustym obiekcie
- `emitAs` - tryb emisji: `list` (domyslnie, `domain: - ...`) lub `map` (`domain:` + mapa)
- `singleton` - dla `emitAs: map` zachowuje tylko jedna instancje domeny
- `merge` - laczenie wielu wpisow mapy (`first` domyslnie, albo `deep`)
- `defaultPayload` - domyslny payload dla emisji, gdy pole zrodlowe jest puste/nieobecne

Zasady runtime (kolejnosc decyzji):

1) Brane jest pole wskazane przez `embedded.key` i musi byc `type: "object"`.
2) Pole zrodlowe musi byc widoczne (`dependsOn` / `globalDependsOn` sa respektowane).
3) Payload jest wybierany w kolejnosci:
   - wartosc z config (`config[key]`),
   - `defaultPayload` (jesli podany),
   - `{}` gdy `alwaysEmit: true`.
4) Jezeli `alwaysEmit` nie jest ustawione i payload jest pusty -> wpis nie jest emitowany.
5) Dla `emitAs: "list"` dziala `dedupeBy` (pierwszy wpis wygrywa).
6) Dla `emitAs: "map"`:
   - `singleton: true` wymusza jeden wpis domeny,
   - `merge: "first"` zostawia pierwszy wpis,
   - `merge: "deep"` laczy mapy rekurencyjnie.

Wazne ograniczenie projektowe:

- Nie mieszaj `emitAs: "map"` i `emitAs: "list"` dla tej samej `domain`.
- Jedna domena YAML powinna miec jeden model: albo lista, albo mapa.

### 4.3 Shared hub UX (automatyczny flow formularza)

Dla wzorca `embedded` list + `dedupeBy: "id"` Builder stosuje wspolny flow UI:

- Pole wyboru: `Select hub`
- Opcje: `ADD NEW` + dynamiczna lista istniejacych ID huba
- `ADD NEW` -> pokazuje sekcje `Hub settings`
- Istniejace ID -> ukrywa lokalne pola huba i zostawia referencje do wspolnego ID
- Lista istniejacych ID pokazuje tylko huby z innych kart/instancji (lokalny hub tej samej karty nie jest prezentowany jako "existing")
- Przelaczanie miedzy `ADD NEW` i istniejacym ID zachowuje spojnosc: lokalny hub emituje sie tylko w trybie `ADD NEW`

Konsekwencje dla autora schematu:

- Pole huba (`type: "object"`) ustawiaj jako helper (`emitYAML: "never"`), bo emisje robi `embedded`.
- Pole referencji (`*_id`, `type: "id_ref"`) musi miec poprawna `domain` i zwykle `allowSelfReference: true`.
- Duplikat ID jest bledem walidacji (`ID already used`) i nie ma automatycznego nadpisywania wartosci huba.

---

## 5. `extends`: zasady merge i deduplikacji

Aktualne zasady systemowe:

- Najpierw pola lokalne, potem pola z `extends`.
- Deduplikacja po `field.key`.
- Gdy klucz sie powtarza, zostaje pierwszy (czyli lokalny), reszta jest pomijana.
- Dziala tak samo dla:
  - `extends` na top-level,
  - `extends` na polu `object`/`list.item`.

Wniosek: lokalnie mozesz nadpisac pole z bazy, wpisujac ten sam `key`.

---

## 6. Struktura pola (`field`)

Bazowy szablon:

```json
{
  "key": "update_interval",
  "type": "duration",
  "required": false,
  "lvl": "normal",
  "default": "60s",
  "emitYAML": "visible"
}
```

### 6.1 Klucze podstawowe

- `key` - nazwa klucza w config/YAML
- `label` - etykieta UI (opcjonalna)
- `type` - typ pola
- `required` - walidacja UI i wplyw na emisje YAML
- `default` - wartosc domyslna
- `placeholder` - podpowiedz w UI
- `lvl` - `simple` | `normal` | `advanced`
- `helpUrl` - link `?` przy polu
- `note` / `warning` / `error` - komunikaty UI
- `templatable` - pole moze przelaczac sie miedzy zwykla wartoscia i `lambda`
- `lambdaPlaceholder` - placeholder pokazywany w trybie `lambda` dla pola `templatable`

### 6.2 Emisja YAML (`emitYAML`)

- `never` - nigdy nie emituj
- `always` - zawsze emituj
- `visible` - emituj tylko gdy pole przechodzi warunki widocznosci
- `dependsOn` - emituj gdy zaleznosci sa spelnione

Domyslnie:

- jesli pole ma `dependsOn` lub `globalDependsOn` -> tryb `dependsOn`
- w innym przypadku -> `visible`

### 6.3 Zaleznosci

Lokalne:

```json
{ "dependsOn": { "key": "mode", "value": "spi" } }
```

```json
{ "dependsOn": { "key": "mode", "values": ["A", "B"] } }
```

```json
{ "dependsOn": { "key": "enabled", "notValue": false } }
```

Globalne:

- pole z `set_global` zapisuje wartosc do globalnego rejestru,
- inne pole moze uzyc `globalDependsOn`.

### 6.4 Klucze techniczne rozszerzone

- `uiHidden` - ukrywa pole w UI, ale nie usuwa logiki
- `suppressQuotes` - bez cudzyslowu dla stringa
- `extends` - dziedziczenie dla `object`/`list.item`
- `fields` - pola dziecka (`object`)
- `item` - definicja elementu (`list`)
- `rawList` - lista prostych wartosci jako `- value`
- `options` - opcje `select`
- `searchable` - `select` jako searchable input
- `optionsBy` + `optionsMap` - dynamiczne opcje zalezne od innego pola
- `optionsFrom` - ladowanie opcji z pliku JSON
- `domain` - domena dla `id_ref`
- `allowSelfReference` - czy `id_ref` moze wskazac ID z tej samej karty
- `idDomain` - domena pod jaka rejestrowac `id` (nadpisanie domyslnej)
- `settings` - konfiguracja typow specjalnych (`password`, `slug`, `ssid`)
- `emitKey` - specjalne sterowanie kluczem YAML dla list; najwazniejsze `emitKey: "inline"` dla condition combinators

---

## 7. Typy pol (pelna lista praktyczna)

### 7.1 Typy podstawowe

- `text`
- `number`
- `boolean`
- `select`
- `duration`
- `id`
- `id_ref`
- `gpio`
- `icon`
- `yaml`
- `raw_yaml`
- `lambda`

### 7.2 Typy specjalne

- `password` (z `settings.format` i `settings.generator`)
- `slug` (auto z innego pola przez `settings.autoPath`)
- `ssid` (auto SSID z fallbackiem)

### 7.3 Typy zagniezdzone

- `object`
- `list`

### 7.4 Typy z `settings` (`password`, `slug`, `ssid`)

#### `password`

Do hasel i kluczy uzywaj zawsze `type: "password"`.

Najwazniejsze ustawienia:

- `settings.format`:
  - `any`
  - `base64_44`
- `settings.generator`:
  - `mode`: `none` | `password` | `base64`
  - `onEmpty`: generuj automatycznie gdy puste
  - `minLength`, `length`, `charset` (dla `password`)
  - `bytes` (dla `base64`)

Przyklad:

```json
{
  "key": "key",
  "type": "password",
  "required": true,
  "settings": {
    "format": "base64_44",
    "generator": {
      "mode": "base64",
      "onEmpty": true,
      "bytes": 32
    }
  }
}
```

#### `slug`

Auto generuje wartosc slug z innego pola (`autoPath`) z fallbackiem.

```json
{
  "key": "name",
  "type": "slug",
  "settings": {
    "autoPath": "esphomeCore.friendly_name",
    "fallbackText": "new-device",
    "maxLength": 24
  }
}
```

#### `ssid`

Auto buduje SSID z wartosci wskazanej przez `autoPath`.

```json
{
  "key": "ssid",
  "type": "ssid",
  "settings": {
    "autoPath": "esphomeCore.friendly_name",
    "fallbackText": "Fallback Hotspot",
    "maxLength": 32
  }
}
```

#### `templatable`

`templatable` to wspolny kontrakt pola dla wartosci, ktore w ESPHome moga byc albo literalem, albo `lambda`.

Przyklad:

```json
{
  "key": "timeout",
  "type": "duration",
  "templatable": true,
  "placeholder": "30s",
  "lambdaPlaceholder": "return 30000;"
}
```

Jak to dziala:

- UI pokazuje przelacznik `Value` / `Lambda`.
- W trybie `Value` renderuje zwykle pole zgodne z `type`.
- W trybie `Lambda` renderuje edytor `type: "lambda"`.
- Runtime przechowuje wartosc jako strukture wewnetrzna z markerem `__templatable`, ale autor schematu nie wpisuje tego recznie.
- Generator YAML emituje:
  - zwykla wartosc dla `literal`,
  - `!lambda` dla trybu `lambda`.

Zasady praktyczne:

- Uzywaj tylko tam, gdzie docs ESPHome wyraznie dopuszczaja template/lambda.
- `templatable` jest wspolne dla akcji, conditions i klasycznych komponentow.
- `lambdaPlaceholder` ma sens tylko razem z `templatable: true`.

### 7.5 Typ `list` - praktyczne warianty

`list` moze miec element prymitywny albo `object`.

Przyklad lista obiektow:

```json
{
  "key": "platformio_options",
  "type": "list",
  "item": {
    "type": "object",
    "fields": [
      { "key": "key", "type": "text" },
      { "key": "value", "type": "text" }
    ]
  }
}
```

Katalogi filtrow i akcji:

- `list.item.extends: "base_filters.json"`
- `list.item.extends: "base_actions.json"`
- `list.item.extends: "base_conditions.json"`

Nowy kontrakt akcji (obowiazkowy):

- `base_actions.json` jest tylko indeksem (metadata + `schemaUrl`),
- pola akcji sa ladowane z `public/actions/...` (lazy load),
- gdy plik akcji nie istnieje, UI pokazuje fallback `custom_config` dla tej akcji.

Nowy kontrakt conditions:

- `base_conditions.json` jest indeksem pickera conditions,
- pola condition sa ladowane z `public/conditions/...` (lazy load),
- combinatory logiczne (`and`, `or`, `not`) moga uzywac `emitKey: "inline"`, aby warunki emitowaly sie bez dodatkowego wrappera `conditions:` w YAML.

### 7.5.1 Triggery `on_*` - jeden model

W projekcie obowiazuje jeden model triggerow:

- trigger bez parametrow (np. `on_turn_on`, `on_state`) moze byc trzymany jako **flat action list**:
  - `type: "list"`,
  - `item.extends: "base_actions.json"`,
  - `wrapThen: true` (generator opakuje to jako `- then:`).
- trigger z parametrami (np. `on_value_range`, `on_click`) trzymamy jako lista obiektow triggera:
  - `type: "list"`,
  - `item.type: "object"`,
  - pola triggera (`above`, `below`, ...),
  - `then` jako `list` + `item.extends: "base_actions.json"`.

Wniosek UX:

- dla prostych triggerow user widzi jeden przycisk `Add` (dodaje akcje),
- dla triggerow parametrycznych dochodzi poziom obiektu triggera.

Przyklad prostego triggera:

```json
{
  "key": "on_turn_on",
  "type": "list",
  "item": {
    "type": "object",
    "fields": [],
    "extends": "base_actions.json"
  },
  "wrapThen": true
}
```

Przyklad triggera z parametrami:

```json
{
  "key": "on_value_range",
  "type": "list",
  "item": {
    "type": "object",
    "fields": [
      { "key": "above", "type": "number" },
      { "key": "below", "type": "number" },
      {
        "key": "then",
        "type": "list",
        "item": { "type": "object", "fields": [], "extends": "base_actions.json" }
      }
    ]
  }
}
```

Generator ma dla tych katalogow specjalne renderowanie YAML.

### 7.6 `yaml` vs `raw_yaml`

- `yaml` - emituje klucz i wciecia pod nim.
- `raw_yaml` - emituje surowe linie bez klucza nadrzednego.

Uzywaj `yaml` dla:

- zlozonych map/list, gdy brak dedykowanego modelu pola.

Nie uzywaj `type: "yaml"` dla triggerow `on_*`.
Triggery automatyzacji modelujemy przez `list` + akcje (`base_actions.json`), zgodnie z 7.5.1.

Uzywaj `raw_yaml` tylko tam, gdzie potrzebny jest pelny blok "as-is".

---

## 8. ID i referencje (`id` / `id_ref`) - zasady bezblednej konfiguracji

`id_ref` waliduje po indeksie ID zbudowanym z runtime formularza.

Wazne:

- Dla `type: "id"` + `required: true`, `default` jest brany pod uwage przez walidacje duplikatow i indeks ID.
- Dla pozostalych przypadkow nadal obowiazuje zasada: najpewniejsze jest jawne zapisanie wartosci do `config`.
- Dla stabilnego dzialania ustaw zrodlo ID (w hubie) jako `required: true` i `lvl: "simple"`.
- Gdy hub ma byc referencja z innej domeny logicznej, ustaw `idDomain`.
- Gdy `id_ref` ma widziec ID z tej samej karty komponentu, ustaw `allowSelfReference: true`.

Wzorzec:

```json
{
  "key": "id",
  "type": "id",
  "required": true,
  "lvl": "simple",
  "idDomain": "cap1188"
}
```

```json
{
  "key": "cap1188_id",
  "type": "id_ref",
  "domain": "cap1188",
  "allowSelfReference": true
}
```

---

## 9. Wzorce gotowe do uzycia

### 9.1 Prosty komponent z `extends`

```json
{
  "id": "binary_sensor.tuya",
  "domain": "binary_sensor",
  "platform": "tuya",
  "extends": "base_binary_sensor.json",
  "fields": [
    { "key": "sensor_datapoint", "type": "number", "required": true, "lvl": "simple" }
  ]
}
```

### 9.2 Jedna karta + pojedynczy hub (`embedded`)

Top-level komponentu:

```json
{
  "embedded": [
    { "key": "hub", "domain": "rdm6300", "dedupeBy": "id" }
  ]
}
```

Pole huba:

```json
{
  "key": "hub",
  "type": "object",
  "emitYAML": "never",
  "extends": "hub_rdm6300.json"
}
```

### 9.3 Singleton root section (`emitAs: map`)

Przyklad dla sekcji typu `esp32_ble_tracker:` (mapa, nie lista):

```json
{
  "embedded": [
    {
      "key": "ble_tracker",
      "domain": "esp32_ble_tracker",
      "emitAs": "map",
      "singleton": true,
      "alwaysEmit": true,
      "defaultPayload": {},
      "merge": "first"
    }
  ],
  "fields": [
    {
      "key": "ble_tracker",
      "type": "object",
      "emitYAML": "never",
      "uiHidden": true,
      "extends": "hub_esp32_ble_tracker.json"
    }
  ]
}
```

To emituje:

```yaml
esp32_ble_tracker:
```

Przy `defaultPayload` z kluczami, np.:

```json
"defaultPayload": {
  "scan_parameters": {
    "interval": "320ms",
    "window": "30ms"
  }
}
```

otrzymasz:

```yaml
esp32_ble_tracker:
  scan_parameters:
    interval: 320ms
    window: 30ms
```

### 9.4 Wiele transportow + hub per transport

```json
{
  "platform": "rc522",
  "requiresByBus": {
    "spi": ["spi"],
    "i2c": ["i2c"]
  },
  "embedded": [
    { "key": "hub_spi", "domain": "rc522_spi", "dedupeBy": "id" },
    { "key": "hub_i2c", "domain": "rc522_i2c", "dedupeBy": "id" }
  ],
  "fields": [
    {
      "key": "bus",
      "type": "select",
      "default": "spi",
      "options": ["spi", "i2c"]
    },
    {
      "key": "hub_spi",
      "type": "object",
      "emitYAML": "never",
      "dependsOn": { "key": "bus", "value": "spi" },
      "extends": "hub_rc522_spi.json"
    },
    {
      "key": "hub_i2c",
      "type": "object",
      "emitYAML": "never",
      "dependsOn": { "key": "bus", "value": "i2c" },
      "extends": "hub_rc522_i2c.json"
    }
  ]
}
```

### 9.5 Multi-subentity binary sensors

Przyklad dla docs, gdzie jedno pole jest osobnym binary sensorem:

```json
{
  "key": "too_cold",
  "type": "object",
  "extends": "base_binary_sensor.json",
  "fields": []
}
```

To emituje:

```yaml
too_cold:
  name: ...
  ...
```

### 9.6 Komponent z dwoma embedded (lista + singleton)

Przyklad wzorca BLE (sensor + `ble_client` + `esp32_ble_tracker`):

```json
{
  "embedded": [
    { "key": "hub", "domain": "ble_client", "dedupeBy": "id" },
    {
      "key": "ble_tracker",
      "domain": "esp32_ble_tracker",
      "emitAs": "map",
      "singleton": true,
      "alwaysEmit": true,
      "defaultPayload": {},
      "merge": "first"
    }
  ]
}
```

Efekt YAML:

```yaml
esp32_ble_tracker:

ble_client:
  - id: ble_client_hub
    mac_address: AA:BB:CC:DD:EE:FF
```

### 9.7 BLE - reguly mapowania pol i walidacji

Szybkie reguly praktyczne dla sensorow BLE:

- `ble_client_id` -> `type: "id_ref"`, `domain: "ble_client"`
- `service_uuid` / `characteristic_uuid` / `descriptor_uuid` -> zwykle `type: "text"` (to UUID, nie `id_ref`)
- `mac_address` -> `type: "text"` z placeholderem `AA:BB:CC:DD:EE:FF`
- `bindkey` / `irk` -> `type: "text"` (32 znaki hex)

Gdy pole zalezy od trybu:

- uzyj `dependsOn` (np. `type: characteristic`)
- dla triggerow typu `on_notify` dodatkowo uzaleznij UI od `notify: true`

W komponentach wymagajacych skanera BLE:

- dodaj singleton `esp32_ble_tracker` przez `embedded` (`emitAs: "map"`, `singleton: true`, `alwaysEmit: true`)
- zrodlowe pole `ble_tracker` jako `type: "object"`, `emitYAML: "never"`, zwykle `uiHidden: true`

---

## 10. Jak mapowac docs ESPHome -> schema (procedura)

1) Otworz docs komponentu i zapisz wszystkie sekcje "Configuration variables".
2) Sprawdz, czy jest tekst "All other options from Binary Sensor".
   - jesli tak: dodaj `extends: base_binary_sensor.json`.
3) Sprawdz, czy jest osobna sekcja "Component/Hub".
   - jesli tak: tworz reuzywalny `hub_*.json` w `base_component`.
4) Sprawdz transporty (SPI/I2C/UART).
   - jesli wiele: `bus` + `requiresByBus` + osobne hub objecty z `dependsOn`.
5) Dla BLE sprawdz wymagania huba:
   - jesli docs wymagaja skanowania BLE -> dodaj singleton `esp32_ble_tracker`.
   - jesli docs wymagaja `ble_client_id` -> dodaj shared hub `ble_client`.
   - dla `ble_rssi` odwzoruj identyfikatory (`mac_address`/`irk`/`service_uuid`/`ibeacon_uuid`) i pamietaj, ze ma byc ustawiony dokladnie jeden.
6) Dla kazdego pola docs wybierz typ:
   - `Pin Schema` -> `gpio`
   - `Time` -> `duration`
   - enum -> `select`
   - listy bajtow / niestandardowe mapy -> najbezpieczniej `yaml`
   - triggery `on_*` -> patrz 7.5.1 (nigdy surowe `yaml`)
7) Dodaj `helpUrl` top-level i (opcjonalnie) na trudniejszych polach.
8) Ustaw `lvl`:
   - `simple`: wymagane i najczesciej uzywane,
   - `normal`: standardowe,
   - `advanced`: niszowe, debug, tuning.
9) Jesli jest pole referencji do innego komponentu, uzyj `id_ref` + poprawny `domain`.
10) Przy hub + child w jednej karcie: `embedded` + pole huba z `emitYAML: "never"`.
11) Dla singleton sekcji root (np. `esp32_ble_tracker`) uzyj `emitAs: "map"` + `singleton: true`.
12) Sprawdz finalny YAML na 2-3 scenariuszach (minimum i pelna konfiguracja).
13) Sprawdz bledy formularza (walidacje semantyczne), nie tylko podglad YAML.
14) Dla akcji nie edytuj recznie wygenerowanych plikow w `public/actions/`, jesli ten sam efekt da sie zapisac jako regula w `scripts/action-definition-generator.js`.

---

## 11. Co generator YAML robi automatycznie

- Dla komponentu z `platformByBus`:
  - bierze `config.bus`,
  - wybiera platforme,
  - usuwa `bus` z emitowanego wpisu.
- Dla `embedded`:
  - czyta obiekt z `key` (tylko pola `type: object`),
  - respektuje widocznosc pola zrodlowego (`dependsOn`/`globalDependsOn`),
  - potrafi emitowac jako lista (`emitAs: list`) albo mapa (`emitAs: map`),
  - dla `list` deduplikuje po `dedupeBy` (pierwszy wygrywa),
  - dla shared hub UX (`dedupeBy: id`) formularz udostepnia `Select hub` (`ADD NEW` + istniejace ID),
  - dla `map` obsluguje `singleton` i `merge` (`first`/`deep`),
  - moze emitowac nawet bez danych usera przez `alwaysEmit` + `defaultPayload`.
- Nie ma automatycznego merge konfliktow dla duplikatu ID huba; duplikat ID to blad walidacji (`ID already used`).
- Dla `required` + brak wartosci:
  - moze emitowac pusty klucz/blok.
- Dla bool/select rownych default:
  - moze pominac pole (zaleznie od trybu emisji).
- Dla `yaml`:
  - emituje `key:` i zawartosc z poprawnymi wcieciami.
- Dla `raw_yaml`:
  - emituje linie 1:1 bez klucza nadrzednego.
- Dla prostych triggerow `on_*` z `wrapThen: true`:
  - UI przechowuje flat liste akcji,
  - generator emituje `on_*: - then: ...`.
- Istnieje fallback emitter dla danych spoza schematu.
  - Nie trzymaj przypadkowych kluczy w `config`, bo moga trafic do YAML.

### 11.1 Jak to trafia do zakladek YAML preview

- Podglad najpierw dzieli finalny YAML po top-level kluczach.
- Potem Builder grupuje je do zakladek:
  - `Core`, `Automation`, `Busses`, `Hubs`, `Display`, `Custom`, a na koncu fallback per klucz.
- Wpisy emitowane przez `embedded` (poza display) trafiaja do zakladki `Hubs`.
- Dla display jest osobna zasada: `display` + `font/image/animation/graph` ida razem do zakladki `Display`.
- W zakladkach domenowych (`sensor`, `switch`, ...) moze pojawic sie komentarz z linkiem do `Hubs`, gdy komponenty tej domeny wymagaja wspoldzielonych hubow.

---

## 12. Najczestsze bledy i szybkie naprawy

1) **`No matching identifiers available` przy `id_ref`**
   - sprawdz: `id` zrodla ma `required: true` i jest widoczne (`lvl`).
   - sprawdz: `idDomain` i `id_ref.domain` sa zgodne.
   - jesli to ta sama karta: dodaj `allowSelfReference: true`.

2) **Hub pojawia sie w zlej sekcji YAML**
   - pole huba musi miec `emitYAML: "never"`.
   - emisje robi `embedded`.

3) **Niewlasciwy transport aktywny**
   - dodaj `dependsOn` na obiektach huba.
   - dodaj `requiresByBus`, aby wymagania interfejsow byly zgodne z `bus`.

4) **Duble pola po `extends`**
   - uzyj tego samego `key`, lokalny wpis wygra (pierwszy).

5) **Field istnieje w docs, ale UI go nie pokazuje**
   - sprawdz `lvl`, `dependsOn`, `globalDependsOn`, `uiHidden`.

6) **Sekcja singleton (`emitAs: map`) nie pojawia sie w YAML**
   - sprawdz czy zrodlowe pole `object` jest widoczne,
   - dla pustej sekcji ustaw `alwaysEmit: true` i najlepiej `defaultPayload: {}`,
   - upewnij sie, ze ta sama `domain` nie jest rownoczesnie emitowana jako lista.

7) **Przy `ADD NEW` dla huba pojawia sie `ID already used`**
   - to poprawne zachowanie: ID huba musi byc unikalne globalnie.
   - wpisz nowe ID albo wybierz istniejace przez `Select hub`.

8) **`ble_rssi` nie przechodzi walidacji**
   - ustaw dokladnie jeden identyfikator: `mac_address` albo `irk` albo `service_uuid` albo `ibeacon_uuid`.
   - popraw format (MAC/UUID/IRK).

9) **`ble_client` ma `on_notify`, ale formularz zgasza blad**
   - ustaw `notify: true`.
   - dla `type: characteristic` uzupelnij `service_uuid` i `characteristic_uuid`.

10) **`xiaomi_ble` nie przechodzi walidacji bindkey**
   - `bindkey` musi miec 32 znaki hex (bez separatorow).

---

## 13. Pelna lista kontrolna (Definition of Done)

Przed uznaniem schematu za gotowy potwierdz wszystkie punkty:

1) `id/domain/platform` poprawne i unikalne.
2) `helpUrl` wskazuje dokladny URL docs.
3) Wszystkie pola z docs sa odwzorowane.
4) Dla "All other options from Binary Sensor" jest `extends: base_binary_sensor.json`.
5) Typy pol sa dobrane poprawnie (`gpio`, `duration`, `select`, `yaml`, ...).
6) Wymagane pola maja `required: true`.
7) `lvl` odzwierciedla UX (simple/normal/advanced).
8) Zaleznosci (`dependsOn`/`globalDependsOn`) sa poprawne.
9) `emitYAML` jest swiadomie ustawione (szczegolnie helpery i huby).
10) Dla transportow jest `requiresByBus` (i `platformByBus`, jesli potrzebne).
11) Dla hubow osadzonych jest `embedded` + `emitYAML: "never"`.
12) Dla ID/ref:
    - `idDomain`/`domain` spojne,
    - `allowSelfReference` ustawione jesli potrzebne.
13) Dla shared hub (`embedded` + `dedupeBy: "id"`):
    - `Select hub` pokazuje `ADD NEW` i istniejace ID,
    - `ADD NEW` pokazuje `Hub settings`,
    - duplikat ID daje blad `ID already used`.
14) Brak niechcianych duplikatow `field.key`.
15) `npm run build` przechodzi.
16) Jesli uzywasz `embedded.emitAs`, potwierdz zgodnosc typu domeny (`list` vs `map`).
17) Dla `emitAs: map` sprawdz `singleton/merge/defaultPayload` na kolizjach.
18) Test manualny: min. 2 konfiguracje i kontrola finalnego YAML.
19) Dla BLE: test scenariusza z blednym formatem (MAC/UUID/IRK/bindkey) i potwierdzenie komunikatu walidacji.
20) Dla akcji/conditions po zmianie generatora uruchom `npm run generate:actions`, a nie poprawiaj recznie wygenerowanych JSON-ow.
21) Dla pol `templatable` sprawdz oba tryby: literal i `lambda`, lacznie z finalnym YAML `!lambda`.

---

## 14. Gotowe szablony startowe

### 14.1 Minimalny binary sensor

```json
{
  "id": "binary_sensor.example",
  "domain": "binary_sensor",
  "platform": "example",
  "requires": [],
  "helpUrl": "https://esphome.io/components/binary_sensor/example/",
  "extends": "base_binary_sensor.json",
  "fields": []
}
```

### 14.2 Hub base file

```json
{
  "id": "hub.example",
  "domain": "example",
  "platform": "",
  "requires": [],
  "type": "object",
  "fields": [
    {
      "key": "id",
      "type": "id",
      "required": true,
      "lvl": "simple",
      "default": "example_component",
      "idDomain": "example"
    }
  ]
}
```

### 14.3 Child z osadzonym hubem

```json
{
  "id": "binary_sensor.example_child",
  "domain": "binary_sensor",
  "platform": "example_child",
  "extends": "base_binary_sensor.json",
  "embedded": [
    { "key": "hub", "domain": "example", "dedupeBy": "id" }
  ],
  "fields": [
    {
      "key": "hub",
      "type": "object",
      "emitYAML": "never",
      "extends": "hub_example.json"
    }
  ]
}
```

---

## 15. Reguly tworzenia schematow hurtowo (mass generation)

Przy seryjnym dodawaniu komponentow (np. cala domena `binary_sensor`):

1) Z listy komponentow zbierz wszystkie `binary_sensor/<name>`.
2) Porownaj z istniejacymi `public/schemas/components/binary_sensor/*.json`.
3) Dla kazdego brakujacego:
   - pobierz docs,
   - sklasyfikuj wzorzec (sekcja 3),
   - utworz schema.
4) Komponenty bardzo niestandardowe oznacz jako "skip + powod".
5) Na koncu uruchom build i raport brakow/problemow.

---

## 16. Krotkie podsumowanie zasad, ktore najczesciej decyduja o poprawnosci

1) `extends` + lokalne pola (lokalne wygrywaja).
2) `embedded` do sekcji huba w tej samej karcie UI.
3) `platformByBus`/`requiresByBus` dla wielu transportow.
4) `idDomain` + `allowSelfReference` dla stabilnych `id_ref`.
5) Zawsze test finalnego YAML, nie tylko sam wyglad formularza.

---

## 17. Sciaga: `embedded` w 10 krokach

1) Gdy domena ma byc lista (`domain: - ...`) -> uzyj `emitAs: "list"` (albo pomin `emitAs`).
2) Gdy domena ma byc pojedyncza mapa (`domain:`) -> uzyj `emitAs: "map"`.
3) Dla root singleton (np. `esp32_ble_tracker`) ustaw `singleton: true`.
4) Dla mapy, gdy pierwszy wpis ma wygrywac, zostaw `merge: "first"`.
5) Dla mapy, gdy wpisy maja sie laczyc, ustaw `merge: "deep"`.
6) Gdy chcesz wymusic emisje nawet bez danych usera, ustaw `alwaysEmit: true`.
7) Gdy wymuszasz emisje i potrzebujesz konkretnych wartosci startowych, dodaj `defaultPayload`.
8) Pole zrodlowe `embedded.key` musi byc `type: "object"` i zwykle `emitYAML: "never"`.
9) Dla `id_ref` do huba z tej samej karty ustaw `allowSelfReference: true`.
10) Nie mieszaj `emitAs: "list"` i `emitAs: "map"` dla tej samej domeny.

---

## 18. Walidacje semantyczne w BuilderView

Oprocz walidacji wynikajacej z samego schematu (`required`, `id_ref`, duplikaty ID), frontend ma tez walidacje semantyczne w `src/views/BuilderView.vue` (`buildValidationErrors`).

Kiedy warto dodac regule semantyczna:

- gdy docs wymagaja relacji miedzy kilkoma polami (np. "dokladnie jedno z...")
- gdy format pola jest krytyczny i latwo o literowke (MAC, UUID, bindkey, IRK)
- gdy schema umozliwia wpis, ale runtime komponentu i tak go odrzuci

Aktualny przyklad (BLE):

- `sensor/ble_rssi`: dokladnie jedno pole tozsamosci + formaty
- `sensor/ble_client`: wymagane UUID dla `type: characteristic`, plus `on_notify` wymaga `notify: true`
- `sensor/xiaomi_ble`: walidacja formatu `mac_address` i `bindkey`

Zasada: jesli dodajesz niestandardowa walidacje dla nowej klasy komponentow, dopisz ja tez do tej dokumentacji i do checklisty DoD.
