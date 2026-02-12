export const loadGpioData = async () => {
  const base = import.meta.env.BASE_URL || "/";
  const response = await fetch(`${base}gpio/gpio-map.json`);
  if (!response.ok) {
    throw new Error(`GPIO map load failed: ${response.status}`);
  }
  return response.json();
};

export const resolveGpioKey = (platform, variant) => {
  if (platform === "esp8266") return "esp8266";
  if (platform !== "esp32") return "";

  const variantMap = {
    esp32: "esp32",
    esp32s2: "esp32-s2",
    esp32s3: "esp32-s3",
    esp32c2: "esp32-c2",
    esp32c3: "esp32-c3",
    esp32c5: "esp32-c5",
    esp32c6: "esp32-c6",
    esp32c61: "esp32-c6",
    esp32h2: "esp32-h2",
    esp32p4: "esp32-p4"
  };

  return variantMap[variant] || "";
};
