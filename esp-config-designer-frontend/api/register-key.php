<?php
// Rejestruje nowy API key dla config.json przeslanego w JSON: { "apiKey": "...", "filename": "config.json" }

$storeDir = __DIR__ . "/../data";
$keyFile = $storeDir . "/keys.json";

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo "Method not allowed";
    exit;
}

$raw = file_get_contents("php://input");
$data = json_decode($raw, true);
$apiKey = $data["apiKey"] ?? "";
$filename = $data["filename"] ?? "";

if ($apiKey === "" || $filename === "") {
    http_response_code(400);
    echo "Missing apiKey or filename";
    exit;
}

if (preg_match('/[^a-zA-Z0-9_.-]/', $filename)) {
    http_response_code(400);
    echo "Invalid filename";
    exit;
}

if (!is_dir($storeDir)) {
    mkdir($storeDir, 0755, true);
}

$keys = [];
if (file_exists($keyFile)) {
    $existing = json_decode(file_get_contents($keyFile), true);
    if (is_array($existing)) {
        $keys = $existing;
    }
}

if (!isset($keys[$filename]) || !is_array($keys[$filename])) {
    $keys[$filename] = [];
}

if (!in_array($apiKey, $keys[$filename], true)) {
    $keys[$filename][] = $apiKey;
    file_put_contents($keyFile, json_encode($keys, JSON_PRETTY_PRINT));
}

header("Content-Type: application/json; charset=utf-8");
echo json_encode(["status" => "ok"]);
