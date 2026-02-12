Najważniejsze (priorytet wysoki):
- Network jest dalej składany częściowo ręcznie:
  - specjalna obróbka ap (w tym komentarz),
  - ręczne dokładanie captive_portal,
  - ręczne składanie ota i web_server.
- Platform ma dużo hardcodu:
  - domyślne platform/variant/framework/board w kodzie,
  - duży if/else per platforma (esp32, esp8266, rp2040, itd.),
  - automatyczne wymuszanie framework = esp-idf przy zmianie wariantu.
- Widoczność pól cs_pin i address ma wyjątek po field.key (SPI/I2C) wpisany ręcznie.

Średni priorytet:
- Generator YAML ma jeszcze wyjątki po nazwie klucza:
  - on_boot/on_shutdown/on_loop,
  - includes/includes_c/libraries,
  - filters,
  - wykrywanie listy key/value po strukturze.
- Generator ma fallback „emituj nieznane klucze z config”, nawet jeśli nie ma ich w schemacie.
- Podział zakładek YAML Preview jest częściowo hardcoded (grupy kluczy typu Core/Automation/Display).

Niższy priorytet (ale też warto doczyścić):
- Definicje sekcji general (protocols/busses/system/automation) są wpisane ręcznie jako listy.
- W katalogu filters/actions linki do dokumentacji są hardcoded (nie z helpUrl schematu).
- W kodzie nadal jest stary check suppressDefault (legacy), mimo że model poszedł już w emitYAML.

Co da się spokojnie przenieść do schematów:
1. Logikę bus (cs_pin/address) przez zwykłe zależności (dependsOn/globalDependsOn).
2. Network (ap/captive_portal/ota/web_server) do czystego emitera schemowego.
3. Domyślne wartości platform per wybrana platforma do metadanych schema (zamiast if/else).
4. Grupowanie YAML Preview przez metadane w schemacie (np. previewGroup).
5. Linki filters/actions do schem.