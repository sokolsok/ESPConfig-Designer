# HOW_TO_CREATE_SHEMA

Kompletna instrukcja tworzenia schematow dla buildera ESPHome.
Po przeczytaniu tego pliku powinienes byc w stanie dodac nowy schemat dla dowolnego komponentu i przewidziec:
- jak pole zachowa sie w formularzu,
- kiedy i jak trafi do YAML.

## 1. Jak to dziala (krok po kroku)

1) Aplikacja laduje schemat JSON.
2) Formularz renderuje pola na podstawie schematu (`type`, `lvl`, zaleznosci).
3) Uzytkownik edytuje pola -> aktualizowany jest centralny `config`.
4) Generator YAML czyta `config + schema` i sklada YAML.
5) Dodatkowo pola `type: "password"` z generatorem moga byc materializowane podczas skanowania schematu/config (nie trzeba czekac az pole sie wyswietli).

Wazne:
- Render formularza i generacja YAML to dwa osobne przebiegi.
- To, ze pole jest ukryte w UI (np. przez `lvl`) nie oznacza automatycznie, ze nie moze trafic do YAML.

## 2. Gdzie dodawac schematy

- Schematy ogolne: `public/schemas/general/<sekcja>/<nazwa>.json`
- Schematy komponentow: `public/schemas/components/<domain>/<platform>.json`
- Bazy (`extends`): `public/schemas/components/base_component/*.json`

## 3. Top-level schema (klucze glowne)

Minimalny szablon:

```json
{
  "id": "sensor.example",
  "domain": "sensor",
  "platform": "example",
  "requires": ["i2c"],
  "helpUrl": "https://esphome.io/components/sensor/example/",
  "fields": []
}
```

Najwazniejsze klucze:

- `id` - unikalny identyfikator (np. `sensor.dht`).
- `domain` - domena komponentu (`sensor`, `switch`, `display`, itp.).
- `platform` - platforma komponentu.
- `requires` - zaleznosci interfejsow (`i2c`, `spi`, `uart`, ...).
- `helpUrl` - link do dokumentacji; jesli brak, naglowkowe `?` sie nie wyswietli.
- `fields` - lista pol formularza.
- `extends` - dziedziczenie calego schematu (z `components/base_component`).

## 4. Struktura pola (Field)

Podstawowy szablon:

```json
{
  "key": "update_interval",
  "type": "duration",
  "required": false,
  "lvl": "normal",
  "emitYAML": "visible",
  "default": "60s",
  "placeholder": "60s"
}
```

### 4.1 Klucze podstawowe

- `key` - nazwa klucza w config i YAML.
- `label` - opcjonalna etykieta UI (bez niej pokazywany jest `key`).
- `type` - typ pola (lista typow nizej).
- `required` -
  - UI: pokazuje `*`,
  - YAML: moze wymusic emisje pustego klucza/bloku przy braku wartosci.
- `default` - wartosc domyslna.
- `placeholder` - podpowiedz w input.
- `lvl` - poziom widocznosci pola: `simple`, `normal`, `advanced`.
- `helpUrl` - `?` przy etykiecie pola.
- `note` / `warning` / `error` - komunikaty przy polu.

### 4.2 Emisja YAML

Klucz: `emitYAML`

- `never` - nigdy nie emituj pola do YAML.
- `always` - zawsze emituj pole do YAML.
- `visible` - emituj gdy pole przechodzi warunki widocznosci (zaleznosci).
- `dependsOn` - emituj gdy zaleznosci sa spelnione.

Domyslne zachowanie gdy brak `emitYAML`:
- jesli pole ma `dependsOn` lub `globalDependsOn` -> traktowane jak `dependsOn`,
- w przeciwnym razie -> `visible`.

Uwaga praktyczna:
- W obecnej implementacji `visible` i `dependsOn` daja bardzo podobny efekt (oba opieraja sie o zaleznosci), ale warto je trzymac semantycznie osobno.

### 4.3 Zaleznosci

Lokalne zaleznosci (`dependsOn`) dzialaja w ramach tego samego obiektu.

Formy:

```json
{ "dependsOn": { "key": "enabled", "value": true } }
```

```json
{ "dependsOn": { "key": "mode", "values": ["A", "B"] } }
```

```json
{ "dependsOn": { "key": "mode", "notValue": "off" } }
```

Globalne zaleznosci:

- Pole z `set_global` zapisuje wartosc do globalnego rejestru.
- Inne pola moga uzyc `globalDependsOn`.

Przyklad:

```json
{
  "key": "platform",
  "type": "select",
  "set_global": "platform"
}
```

```json
{
  "key": "cpu_frequency",
  "type": "select",
  "globalDependsOn": { "key": "platform", "value": "esp32" }
}
```

### 4.4 Dodatkowe klucze techniczne

- `uiHidden` - ukrywa pole w UI, ale pole nadal jest czescia logiki config/YAML.
- `suppressQuotes` - wymusza brak cudzyslowu dla stringa (uzywac ostroznie).
- `extends` - dziedziczenie pola typu `object`/`list.item` z base schema.
- `fields` - pola dzieci dla `type: "object"`.
- `item` - definicja elementu dla `type: "list"`.
- `rawList` - dla list prostych: kazdy wpis jako `- value`.
- `options` - opcje dla `select`.
- `searchable` - `select` renderowany jako input z filtrowaniem.
- `optionsBy` + `optionsMap` - dynamiczne opcje `select` zalezne od innego pola.
- `optionsFrom` - ladowanie opcji z innego pliku JSON.

## 5. Typy pol i ich zachowanie

## 5.1 Typy podstawowe

- `text` - zwykly input tekstowy; w YAML string zwykle w cudzyslowie.
- `number` - input number; w YAML liczba.
- `boolean` - dropdown TRUE/FALSE.
- `select` - dropdown z `options`.
- `duration` - input tekstowy (np. `15min`), emitowany jako wartosc YAML.
- `id` - techniczny identyfikator (sanityzowany w UI).
- `id_ref` - referencja do istniejacego `id` (walidacja dostepnych ID).
- `lambda` - textarea, multiline emitowane jako `|-`.
- `yaml` - blok YAML pod kluczem.
- `raw_yaml` - surowe linie YAML (bez emitowania klucza nadrzednego).
- `icon` - picker MDI + input (`mdi:name`).
- `gpio` - input + picker pinow.

## 5.2 Typy z `settings`

### `slug`

Cel: nazwa techniczna (np. `esphome.name`).

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

Zachowanie:
- slugify (male litery, bez polskich znakow, separator `-`),
- auto uzupelnianie z `autoPath`, fallback do `fallbackText`.

### `ssid`

Cel: auto SSID AP.

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

Zachowanie:
- gdy `autoPath` ma wartosc -> buduje SSID,
- gdy puste -> `fallbackText`,
- przyciecie do `maxLength`.

### `password`

Cel: spojna obsluga hasel i kluczy.

```json
{
  "key": "password",
  "type": "password",
  "settings": {
    "format": "any",
    "generator": {
      "mode": "password",
      "onEmpty": true,
      "minLength": 32,
      "length": 32,
      "charset": "0123456789abcdef"
    }
  }
}
```

`settings.format`:
- `any` - dowolny tekst,
- `base64_44` - walidacja: surowy base64 44 znaki, konczy sie `=`.

`settings.generator`:
- `mode`: `none` | `password` | `base64`
- `onEmpty`: generuj automatycznie gdy pole puste
- `minLength`: jesli wartosc istnieje, ale krotsza -> dogeneruj
- `length`, `charset` dla `password`
- `bytes` dla `base64`

Generator hasel uruchamia sie:
- z przycisku Generate w polu,
- automatycznie podczas skanowania schema/config (jesli `onEmpty: true` i warunki sa spelnione).

## 5.3 Typy zagniezdzone

### `object`

Jedna sekcja z polami dziecmi:

```json
{
  "key": "manual_ip",
  "type": "object",
  "fields": [ ... ]
}
```

### `list`

Wiele elementow (Add/Remove):

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

Warianty elementu listy:
- prymityw (`text`, `number`, `boolean`, `select`, `gpio`),
- `object` (lista blokow).

## 6. Zasady YAML, ktore czesto myla

1) `required` nadal ma efekt w YAML (nie tylko gwiazdka): moze wymusic pusty klucz/blok.
2) Dla `boolean` i `select`: gdy wartosc == default, pole jest pomijane w YAML (z wyjatkami `required`/`always`).
3) `!secret ...` nie jest ujmowane w cudzyslow.
4) Niektore sekcje maja specjalne renderowanie:
   - listy katalogowe filtr/actions,
   - `on_boot`/`on_shutdown`/`on_loop`,
   - `includes`/`includes_c`/`libraries`,
   - listy `key/value` jako mapa.
5) Istnieje fallback emitera dla kluczy nieopisanych w schemacie (dlatego nie trzymaj przypadkowych danych w config).

## 7. Wzorce praktyczne

## 7.1 Przelacznik helper bez emisji do YAML

```json
{
  "key": "enabled",
  "type": "boolean",
  "default": true,
  "emitYAML": "never"
}
```

Pole steruje zaleznosciami dzieci, ale samo nie trafia do YAML.

## 7.2 Pole emitowane tylko gdy helper wlaczony

```json
{
  "key": "password",
  "type": "password",
  "emitYAML": "dependsOn",
  "dependsOn": { "key": "enabled", "value": true },
  "settings": {
    "format": "any",
    "generator": { "mode": "password", "onEmpty": true, "length": 12 }
  }
}
```

## 7.3 Klucz API base64

```json
{
  "key": "key",
  "type": "password",
  "required": true,
  "settings": {
    "format": "base64_44",
    "generator": { "mode": "base64", "onEmpty": true, "bytes": 32 }
  }
}
```

## 8. Lista kontrolna przed dodaniem nowego schematu

1) Czy `id/domain/platform` sa poprawne i unikalne?
2) Czy top-level `helpUrl` jest ustawione?
3) Czy wszystkie pola maja poprawny `type`?
4) Czy zaleznosci (`dependsOn`/`globalDependsOn`) sa poprawne?
5) Czy `emitYAML` jest ustawione swiadomie (`never/always/visible/dependsOn`)?
6) Czy pola `password` maja `settings.format` i `settings.generator`?
7) Czy `required` jest uzasadnione (pamietaj: wplywa tez na YAML)?
8) Czy `lvl` (`simple/normal/advanced`) odpowiada UX?
9) Czy dla `select` opcje i default sa poprawne?
10) Czy `list.item` jest poprawnie opisane (typ, fields/options)?

## 9. Najczestsze bledy

- Brak `helpUrl` na top-level (brak `?` w naglowku karty).
- `dependsOn` wskazuje zly `key` (pole nigdy nie pojawia sie/nie emituje).
- Uzycie `emitYAML: "never"` na polu, ktore ma byc w YAML.
- `password.format: "base64_44"` + wpis niebedacy surowym base64.
- Trzymanie wartosci poza schematem (moga zostac wyemitowane fallbackiem).

## 10. Szybki starter: nowy komponent

1) Utworz plik `public/schemas/components/<domain>/<platform>.json`.
2) Dodaj top-level (`id`, `domain`, `platform`, `requires`, `helpUrl`, `fields`).
3) Zacznij od 2-3 pol (`id`, `name`, `update_interval`).
4) Dodaj zaleznosci i `emitYAML` dopiero gdy podstawy dzialaja.
5) Dla hasel uzywaj tylko `type: "password" + settings`.
6) Przetestuj 3 rzeczy:
   - widocznosc pola (Simple/Normal/Advanced + dependsOn),
   - zapis do config,
   - finalny YAML.

---

Jesli tworzysz nowy schemat i nie jestes pewien jak ustawic emisje, najbezpieczniejszy punkt startowy to:
- `emitYAML`: pominiety,
- `required`: `false`,
- bez zaleznosci,
