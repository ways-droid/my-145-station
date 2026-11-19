<?php // Faux Meta Graph API (WhatsApp Cloud) pour les tests
$log = getenv('META_MOCK_LOG') ?: sys_get_temp_dir() . '/meta-mock.log';
$u = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$j = function ($x, $st = 200) { http_response_code($st); header('Content-Type: application/json'); echo json_encode($x); exit; };
if ($u === '/media/abc') { header('Content-Type: image/jpeg'); echo "\xFF\xD8\xFF fake jpeg"; exit; }
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer EAAtest') $j(['error' => ['message' => 'Invalid OAuth access token', 'type' => 'OAuthException', 'code' => 190]], 401);
if (preg_match('#^/v[\d.]+/(\d+)/media$#', $u)) { file_put_contents($log, json_encode(['upload' => $_POST['type'] ?? '', 'name' => $_FILES['file']['name'] ?? '', 'size' => $_FILES['file']['size'] ?? 0]) . "\n", FILE_APPEND); $j(['id' => 'up-' . mt_rand()]); }
$b = json_decode(file_get_contents('php://input'), true);
if (preg_match('#^/v[\d.]+/(\d+)/messages$#', $u)) {
    file_put_contents($log, json_encode($b, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);
    if (isset($b['status'])) $j(['success' => true]);
    $j(['messaging_product' => 'whatsapp', 'contacts' => [['input' => $b['to'], 'wa_id' => $b['to']]], 'messages' => [['id' => 'wamid.' . mt_rand()]]]);
}
if (preg_match('#^/v[\d.]+/(\d+)/message_templates$#', $u)) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') { file_put_contents($log, json_encode(['template' => $b], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND); $j(['id' => 'tpl1', 'status' => 'PENDING', 'category' => 'UTILITY']); }
    $j(['data' => [['name' => 'message_equipe', 'status' => 'APPROVED', 'language' => 'fr', 'rejected_reason' => 'NONE']]]);
}
if (preg_match('#^/v[\d.]+/(\d+)/register$#', $u)) { file_put_contents($log, json_encode(['register' => $b]) . "\n", FILE_APPEND); $j(['success' => true]); }
if (preg_match('#^/v[\d.]+/(\d+)/subscribed_apps$#', $u)) $j(['success' => true]);
if (preg_match('#^/v[\d.]+/media-1$#', $u)) $j(['url' => 'http://127.0.0.1:8772/media/abc', 'mime_type' => 'image/jpeg', 'file_size' => 13, 'id' => 'media-1']);
if (preg_match('#^/v[\d.]+/(\d+)$#', $u)) $j(['display_phone_number' => '+32 470 99 88 77', 'verified_name' => 'W.A.Y.S.', 'quality_rating' => 'GREEN', 'code_verification_status' => 'VERIFIED', 'platform_type' => 'CLOUD_API', 'id' => '123']);
$j(['error' => ['message' => "Unknown path $u", 'code' => 100]], 400);
