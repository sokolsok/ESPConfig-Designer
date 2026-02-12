<?php
// Minimalny endpoint do pobierania i zapisu YAML.
// Wymaga naglowka: X-API-Key: <sekretny_klucz>

$storeDir = __DIR__ . "/../data";
$keyFile = $storeDir . "/keys.json";

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: X-API-Key, Content-Type");
header("Access-Control-Allow-Methods: GET, POST, HEAD, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

$headerKey = $_SERVER["HTTP_X_API_KEY"] ?? "";
if ($headerKey === "") {
    http_response_code(401);
    echo "Unauthorized";
    exit;
}

if (!file_exists($keyFile)) {
    http_response_code(401);
    echo "Unauthorized";
    exit;
}

$keys = json_decode(file_get_contents($keyFile), true);
if (!is_array($keys)) {
    http_response_code(401);
    echo "Unauthorized";
    exit;
}

$filename = $_GET["file"] ?? "";
if ($filename !== "config.json") {
    http_response_code(400);
    echo "Invalid file";
    exit;
}

if (!isset($keys[$filename]) || !in_array($headerKey, $keys[$filename], true)) {
    http_response_code(401);
    echo "Unauthorized";
    exit;
}

$filePath = $storeDir . "/" . $filename;

if ($_SERVER["REQUEST_METHOD"] === "HEAD") {
    if (!file_exists($filePath)) {
        http_response_code(404);
        exit;
    }

    header("Content-Type: application/json; charset=utf-8");
    http_response_code(200);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    if (!file_exists($filePath)) {
        http_response_code(404);
        echo "Not found";
        exit;
    }

    $peek = isset($_GET["peek"]) && $_GET["peek"] === "1";

    header("Content-Type: application/json; charset=utf-8");
    readfile($filePath);

    if (!$peek) {
        unlink($filePath);

        if (isset($keys[$filename])) {
            unset($keys[$filename]);
            file_put_contents($keyFile, json_encode($keys, JSON_PRETTY_PRINT));
        }
    }

    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $body = file_get_contents("php://input");
    if ($body === false || $body === "") {
        http_response_code(400);
        echo "Empty body";
        exit;
    }

    $decoded = json_decode($body, true);
    if (!is_array($decoded) || !isset($decoded["files"]) || !is_array($decoded["files"])) {
        http_response_code(400);
        echo "Invalid JSON format";
        exit;
    }

    if (!is_dir($storeDir)) {
        mkdir($storeDir, 0755, true);
    }

    file_put_contents($filePath, json_encode($decoded, JSON_PRETTY_PRINT));
    header("Content-Type: text/plain; charset=utf-8");
    echo "OK";
    exit;
}

http_response_code(405);
echo "Method not allowed";
