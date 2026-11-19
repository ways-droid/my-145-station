<?php
// Faux Microsoft (jeton + Graph OneDrive) pour les tests : locataire « tenant-ok », secret « od-secret-good »,
// compte « station@example.test ». Les fichiers sont écrits sous OD_MOCK_DIR.
header('Content-Type: application/json');
$dir = getenv('OD_MOCK_DIR') ?: sys_get_temp_dir() . '/odmock';
$p = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('#/login/([^/]+)/oauth2/v2\.0/token$#', $p, $m)) {
    if ($m[1] !== 'tenant-ok' || ($_POST['client_secret'] ?? '') !== 'od-secret-good' || ($_POST['grant_type'] ?? '') !== 'client_credentials') { http_response_code(401); echo json_encode(['error' => 'invalid_client']); exit; }
    echo json_encode(['access_token' => 'od-token', 'expires_in' => 3600]); exit;
}
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer od-token') { http_response_code(401); echo json_encode(['error' => ['message' => 'InvalidAuthenticationToken']]); exit; }
if (!preg_match('#/graph/users/([^/]+)/drive/?(.*)$#', $p, $m) || $m[1] !== 'station@example.test') { http_response_code(404); echo json_encode(['error' => ['message' => 'itemNotFound']]); exit; }
$rest = $m[2];
if ($rest === '') { echo json_encode(['name' => 'OneDrive', 'owner' => ['user' => ['displayName' => 'Station TLV']]]); exit; }
if (preg_match('#^root:/(.+):/content$#', $rest, $x) && $_SERVER['REQUEST_METHOD'] === 'PUT') {
    $f = "$dir/" . $x[1]; @mkdir(dirname($f), 0777, true); file_put_contents($f, file_get_contents('php://input'));
    echo json_encode(['id' => md5($x[1]), 'name' => basename($x[1]), 'webUrl' => 'https://example.sharepoint.com/' . $x[1]]); exit;
}
if (preg_match('#^root:/(.+):/children$#', $rest, $x)) {
    $d = "$dir/" . $x[1]; if (!is_dir($d)) { http_response_code(404); echo json_encode(['error' => ['message' => 'itemNotFound']]); exit; }
    $v = []; foreach (scandir($d) as $n) if ($n[0] !== '.') $v[] = is_dir("$d/$n") ? ['name' => $n, 'folder' => ['childCount' => 1], 'webUrl' => "https://example.sharepoint.com/$x[1]/$n"] : ['name' => $n, 'file' => [], 'size' => filesize("$d/$n"), 'webUrl' => "https://example.sharepoint.com/$x[1]/$n"];
    echo json_encode(['value' => $v]); exit;
}
http_response_code(404); echo json_encode(['error' => ['message' => "unknown $rest"]]);
