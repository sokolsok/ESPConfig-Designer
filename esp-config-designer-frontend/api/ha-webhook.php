<?php
// Proxy dla webhooka HA, aby uniknac Mixed Content.
// Przyjmuje JSON: { webhookUrl: "http://...", yaml: "..." }

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

$webhookUrl = $data["webhookUrl"] ?? "";
$yaml = $data["yaml"] ?? "";

if ($webhookUrl === "") {
    http_response_code(400);
    echo "Missing webhookUrl";
    exit;
}

if (!preg_match('#^https?://#i', $webhookUrl)) {
    http_response_code(400);
    echo "Invalid webhookUrl";
    exit;
}

$ch = curl_init($webhookUrl);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $yaml);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_TIMEOUT, 20);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: text/plain; charset=utf-8"]);
$resp = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
$curlErrno = curl_errno($ch);
curl_close($ch);

if ($resp === false) {
    http_response_code(502);
    echo "Webhook failed. cURL error: {$curlErrno} {$curlError}";
    exit;
}

if ($httpCode < 200 || $httpCode >= 300) {
    http_response_code(502);
    echo "Webhook failed. HTTP {$httpCode}. Response: {$resp}";
    exit;
}

header("Content-Type: text/plain; charset=utf-8");
echo "OK";
