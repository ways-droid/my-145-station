<?php // Faux Dropbox (API v2) pour les tests : arborescence dans un dossier temporaire
$root = getenv('DBX_MOCK_DIR') ?: sys_get_temp_dir() . '/dbx-mock'; @mkdir($root, 0777, true);
$u = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$json = fn($x, $st = 200) => (http_response_code($st) || true) && print(json_encode($x));
$err = fn($sum, $st = 409) => $json(['error_summary' => $sum, 'error' => ['.tag' => explode('/', $sum)[0]]], $st);
if ($u === '/oauth2/token') {
    if (($_POST['client_secret'] ?? '') !== 'sec123456') { $json(['error' => 'invalid_client', 'error_description' => 'Invalid client_id or client_secret'], 400); exit; }
    if (($_POST['grant_type'] ?? '') === 'authorization_code' && ($_POST['code'] ?? '') !== 'good') { $json(['error' => 'invalid_grant', 'error_description' => 'code doesn\'t exist or has expired'], 400); exit; }
    $json(['access_token' => 'at-' . mt_rand(), 'expires_in' => 14400, 'refresh_token' => 'rt-1', 'token_type' => 'bearer']); exit;
}
if (!str_starts_with($_SERVER['HTTP_AUTHORIZATION'] ?? '', 'Bearer at-')) { $json(['error_summary' => 'invalid_access_token/'], 401); exit; }
file_put_contents($root . '/../dbx-mock-headers.log', ($_SERVER['HTTP_DROPBOX_API_PATH_ROOT'] ?? '-') . "\n", FILE_APPEND);
$fs = fn($p) => $root . $p;
$meta = function ($p) use ($fs) { $f = $fs($p); return is_dir($f) ? ['.tag' => 'folder', 'name' => basename($p), 'path_display' => $p, 'id' => 'id:' . md5($p)]
    : ['.tag' => 'file', 'name' => basename($p), 'path_display' => $p, 'id' => 'id:' . md5($p), 'size' => filesize($f), 'server_modified' => gmdate('Y-m-d\TH:i:s\Z', filemtime($f))]; };
$arg = json_decode($_SERVER['HTTP_DROPBOX_API_ARG'] ?? 'null', true);
$b = json_decode(file_get_contents('php://input'), true);
switch ($u) {
    case '/api/users/get_current_account':
        $json(['name' => ['display_name' => 'W.A.Y.S. Bureau'], 'email' => 'bureau@ways.test', 'team' => ['name' => 'W.A.Y.S.'], 'root_info' => ['.tag' => 'team', 'root_namespace_id' => '111', 'home_namespace_id' => '222']]); break;
    case '/api/files/list_folder':
        $f = $fs($b['path'] ?? ''); if (!is_dir($f)) { $err('path/not_found/'); break; }
        $e = []; foreach (scandir($f) as $n) if ($n[0] !== '.') $e[] = $meta(rtrim($b['path'], '/') . '/' . $n);
        $json(['entries' => $e, 'has_more' => false, 'cursor' => 'c']); break;
    case '/api/files/search_v2':
        $out = []; $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
        foreach ($it as $p) if (stripos($p->getFilename(), $b['query']) !== false) $out[] = ['metadata' => ['.tag' => 'metadata', 'metadata' => $meta(substr($p->getPathname(), strlen($root)))]];
        $json(['matches' => $out, 'has_more' => false]); break;
    case '/api/files/get_temporary_link':
        if (!is_file($fs($b['path']))) { $err('path/not_found/'); break; }
        $json(['metadata' => $meta($b['path']), 'link' => 'https://dl.dropboxusercontent.test/' . rawurlencode(basename($b['path']))]); break;
    case '/api/files/create_folder_v2':
        if (is_dir($fs($b['path']))) { $err('path/conflict/folder/'); break; }
        mkdir($fs($b['path']), 0777, true); $json(['metadata' => $meta($b['path'])]); break;
    case '/api/files/move_v2':
        @mkdir(dirname($fs($b['to_path'])), 0777, true);
        if (!file_exists($fs($b['from_path']))) { $err('from_lookup/not_found/'); break; }
        rename($fs($b['from_path']), $fs($b['to_path'])); $json(['metadata' => $meta($b['to_path'])]); break;
    case '/api/auth/token/revoke': $json(null); break;
    case '/api/files/list_folder/get_latest_cursor':
        $f = $fs($b['path']); if (!is_dir($f)) { $err('path/not_found/'); break; }
        $json(['cursor' => base64_encode(json_encode(['p' => $b['path'], 'n' => array_values(array_diff(scandir($f), ['.', '..']))]))]); break;
    case '/api/files/list_folder/continue':
        $c = json_decode(base64_decode($b['cursor']), true); if (!$c) { $err('reset/'); break; }
        $now = array_values(array_diff(scandir($fs($c['p'])), ['.', '..'])); $e = [];
        foreach (array_diff($now, $c['n']) as $n) $e[] = $meta(rtrim($c['p'], '/') . '/' . $n);
        $json(['entries' => $e, 'has_more' => false, 'cursor' => base64_encode(json_encode(['p' => $c['p'], 'n' => $now]))]); break;
    case '/api/files/get_metadata':
        if (!file_exists($fs($b['path']))) { $err('path/not_found/'); break; }
        $json($meta($b['path'])); break;
    case '/content/files/upload':
        if ($arg === null) { $err('bad Dropbox-API-Arg', 400); break; }
        $p = $arg['path']; @mkdir(dirname($fs($p)), 0777, true);
        $i = 1; while (file_exists($fs($p))) { $p = preg_replace('/( \(\d+\))?(\.[^.]*)$/', " (" . $i++ . ")$2", $arg['path']); }
        file_put_contents($fs($p), file_get_contents('php://input')); $json($meta($p)); break;
    case '/content/files/download':
        if (!is_file($fs($arg['path']))) { $err('path/not_found/'); break; }
        header('Dropbox-API-Result: ' . json_encode($meta($arg['path']))); header('Content-Type: application/octet-stream'); readfile($fs($arg['path'])); break;
    default: $err('unknown endpoint ' . $u, 404);
}
