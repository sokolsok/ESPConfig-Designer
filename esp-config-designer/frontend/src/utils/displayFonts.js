export const parseGoogleFontVariant = (variant) => {
  const value = String(variant || "regular").trim().toLowerCase() || "regular";
  const italic = value.includes("italic");
  const weightPart = value.replace("italic", "") || "regular";
  const numericWeight = Number.parseInt(weightPart, 10);
  const weight = Number.isFinite(numericWeight) ? numericWeight : "regular";

  return {
    weight,
    italic,
    style: italic ? "italic" : "normal"
  };
};

export const deriveGoogleFontStyle = (variant) => {
  const parsed = parseGoogleFontVariant(variant);
  return {
    weight: typeof parsed.weight === "number" ? parsed.weight : 400,
    style: parsed.style
  };
};
