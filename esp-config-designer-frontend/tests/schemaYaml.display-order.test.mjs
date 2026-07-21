import assert from "node:assert/strict";
import test from "node:test";

import { buildComponentsYaml } from "../src/utils/schemaYaml.js";

test("display builder emits YAML lambda layers from bottom to top", () => {
  const componentId = "display/test";
  const lines = buildComponentsYaml(
    [
      {
        id: componentId,
        config: {
          _display_builder: {
            elements: [
              {
                id: "top-text",
                type: "text",
                x: 1,
                y: 2,
                w: 48,
                h: 12,
                text: "Top",
                fontSource: "local",
                fontFile: "font.ttf"
              },
              {
                id: "background-image",
                type: "image",
                x: 0,
                y: 0,
                w: 128,
                h: 64,
                image: "background.png"
              }
            ]
          }
        }
      }
    ],
    {
      [componentId]: {
        domain: "display",
        platform: "test",
        displayType: "monochrome",
        fields: [{ key: "lambda", type: "lambda" }]
      }
    }
  );

  const imageLineIndex = lines.findIndex((line) => line.includes("it.image(0, 0, id(image_1));"));
  const textLineIndex = lines.findIndex((line) => line.includes('it.print(1, 2, id(text_font_1), "Top");'));

  assert.notEqual(imageLineIndex, -1, "background image lambda line should be emitted");
  assert.notEqual(textLineIndex, -1, "top text lambda line should be emitted");
  assert.ok(imageLineIndex < textLineIndex, "background layer must render before top text");
});
