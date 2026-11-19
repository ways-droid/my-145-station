<?php
// Faux Notion (API 2022-06-28) pour les tests : jeton « secret_notion_good_token_123 », une page de test
// « TLV - ACTIVITY TEST (Do not Delete) » (id aaaa…) et une vraie page (id bbbb…) que l'outil ne doit jamais toucher.
// État gardé dans NOTION_MOCK_DIR/state.json ; chaque appel d'écriture est noté dans « log ».
header('Content-Type: application/json');
$dir = getenv('NOTION_MOCK_DIR') ?: sys_get_temp_dir(); $f = "$dir/state.json";
$S = is_file($f) ? json_decode(file_get_contents($f), true) : ['n' => 0, 'obj' => [
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' => ['object' => 'page', 'parent' => ['type' => 'workspace'], 'title' => 'TLV - ACTIVITY TEST (Do not Delete)', 'children' => []],
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' => ['object' => 'page', 'parent' => ['type' => 'page_id', 'page_id' => 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'], 'title' => 'TLV REAL HANDOVER', 'children' => []]], 'log' => []];
function done($S, $f, $d, $code = 200) { file_put_contents($f, json_encode($S)); http_response_code($code); echo json_encode($d); exit; }
function nid($s) { return str_replace('-', '', strtolower((string) $s)); }
function dash($id) { return substr($id, 0, 8) . '-' . substr($id, 8, 4) . '-' . substr($id, 12, 4) . '-' . substr($id, 16, 4) . '-' . substr($id, 20); }
function plain($rt) { return implode('', array_map(fn($x) => $x['text']['content'] ?? '', (array) $rt)); }
function newid(&$S) { $S['n']++; return str_pad(dechex($S['n']), 32, 'c', STR_PAD_LEFT); }
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer secret_notion_good_token_123') done($S, $f, ['object' => 'error', 'code' => 'unauthorized', 'message' => 'API token is invalid.'], 401);
if (($_SERVER['HTTP_NOTION_VERSION'] ?? '') !== '2022-06-28') done($S, $f, ['object' => 'error', 'message' => 'Notion-Version header required'], 400);
$m = $_SERVER['REQUEST_METHOD']; $p = trim(preg_replace('#^.*?/v1/#', '', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)), '/');
$b = json_decode(file_get_contents('php://input'), true) ?: [];
$seg = explode('/', $p);
$pageOut = fn($id, $o) => ['object' => 'page', 'id' => dash($id), 'url' => "https://www.notion.so/" . $id, 'archived' => !empty($o['archived']), 'parent' => $o['parent'],
    'properties' => ['title' => ['type' => 'title', 'title' => [['plain_text' => $o['title'] ?? '']]]]];
if ($seg[0] === 'pages' && isset($seg[1])) {
    $id = nid($seg[1]); $o = $S['obj'][$id] ?? null;
    if (!$o || $o['object'] !== 'page') done($S, $f, ['object' => 'error', 'code' => 'object_not_found', 'message' => 'Could not find page'], 404);
    if ($m === 'GET') done($S, $f, $pageOut($id, $o));
    if ($m === 'PATCH') { if (isset($b['archived'])) $S['obj'][$id]['archived'] = (bool) $b['archived']; $S['log'][] = "archive $id"; done($S, $f, $pageOut($id, $S['obj'][$id])); }
}
if ($seg[0] === 'pages' && $m === 'POST') {
    $par = $b['parent'] ?? []; $id = newid($S);
    if (isset($par['page_id'])) {
        $pp = nid($par['page_id']); if (!isset($S['obj'][$pp])) done($S, $f, ['object' => 'error', 'message' => 'parent not found'], 404);
        $o = ['object' => 'page', 'parent' => ['type' => 'page_id', 'page_id' => dash($pp)], 'title' => plain($b['properties']['title']['title'] ?? []), 'children' => []];
        foreach ((array) ($b['children'] ?? []) as $c) $o['children'][] = ['type' => $c['type'], 'text' => plain($c[$c['type']]['rich_text'] ?? [])];
        $S['obj'][$id] = $o; $S['log'][] = "page $id under $pp"; done($S, $f, $pageOut($id, $o));
    }
    if (isset($par['database_id'])) {
        $db = nid($par['database_id']); if (($S['obj'][$db]['object'] ?? '') !== 'database') done($S, $f, ['object' => 'error', 'message' => 'database not found'], 404);
        $row = [];
        foreach ((array) ($b['properties'] ?? []) as $k => $v) {
            if (!isset($S['obj'][$db]['props'][$k])) done($S, $f, ['object' => 'error', 'code' => 'validation_error', 'message' => "$k is not a property that exists."], 400);
            $t = array_key_first($v); $row[$k] = in_array($t, ['title', 'rich_text']) ? plain($v[$t]) : ($t === 'multi_select' ? implode('|', array_column($v[$t], 'name')) : ($t === 'date' ? ($v[$t]['start'] ?? '') : $v[$t]));
        }
        $S['obj'][$db]['rows'][] = $row; $S['obj'][$id] = ['object' => 'page', 'parent' => ['type' => 'database_id', 'database_id' => dash($db)], 'title' => '', 'row' => true];
        done($S, $f, $pageOut($id, $S['obj'][$id]));
    }
}
if ($seg[0] === 'databases' && $m === 'POST') {
    $pp = nid($b['parent']['page_id'] ?? ''); if (($S['obj'][$pp]['object'] ?? '') !== 'page') done($S, $f, ['object' => 'error', 'message' => 'parent not found'], 404);
    $id = newid($S); $S['obj'][$id] = ['object' => 'database', 'inline' => !empty($b['is_inline']), 'title' => plain($b['title'] ?? []), 'props' => $b['properties'] ?? [], 'rows' => [], 'parent' => $pp];
    $S['obj'][$pp]['children'][] = ['type' => 'child_database', 'text' => $S['obj'][$id]['title'], 'db' => $id];
    done($S, $f, ['object' => 'database', 'id' => dash($id)]);
}
if ($seg[0] === 'blocks' && ($seg[2] ?? '') === 'children' && $m === 'PATCH') {
    $pp = nid($seg[1]); if (!isset($S['obj'][$pp])) done($S, $f, ['object' => 'error', 'message' => 'block not found'], 404);
    foreach ((array) ($b['children'] ?? []) as $c) $S['obj'][$pp]['children'][] = ['type' => $c['type'], 'text' => plain($c[$c['type']]['rich_text'] ?? [])];
    done($S, $f, ['object' => 'list', 'results' => []]);
}
if ($seg[0] === '_dump') done($S, $f, $S);   // pour les tests : tout l'état
done($S, $f, ['object' => 'error', 'message' => "unknown $m $p"], 404);
