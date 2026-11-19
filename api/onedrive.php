<?php
// OneDrive (Microsoft 365 professionnel, via Microsoft Graph) : les scans du shift (work packs, pages ATL,
// photos…) sont rangés dans le OneDrive de la station, sous UN dossier racine choisi dans Paramètres.
// Connexion « application » (client credentials) : l'administrateur crée une inscription d'application dans Entra ID
// (permission Files.ReadWrite.All, consentement administrateur), puis saisit locataire, identifiant et secret ici.
// Le secret et les jetons restent dans ways_kv, jamais renvoyés au navigateur. L'outil n'écrit et ne lit que sous la racine.
//
//   GET  onedrive/status                          { configured, user, root, hint }
//   POST onedrive/config  { tenant, clientId, secret?, user, root }   (administrateurs)
//   POST onedrive/test    {}                      (administrateurs) → { ok, drive }
//   POST onedrive/upload  multipart : file, item (shiftItems id)     → { ok, file: { name, url, id, path, at, by } }
//   POST onedrive/list    { path }                → { items: [{ name, folder, url, size }] } (sous la racine)

const OD_LOGIN = 'https://login.microsoftonline.com/';
const OD_GRAPH = 'https://graph.microsoft.com/v1.0/';
const OD_MAX = 20 * 1048576;

function odk($k) { return (string) (kv_get($k) ?? ''); }
function od_configured() { return odk('od_tenant') !== '' && odk('od_client') !== '' && odk('od_secret') !== '' && odk('od_user') !== '' && odk('od_root') !== ''; }
function od_login_url() { $b = odk('od_base'); return $b !== '' ? rtrim($b, '/') . '/login/' : OD_LOGIN; }   // faux Microsoft des tests
function od_graph_url() { $b = odk('od_base'); return $b !== '' ? rtrim($b, '/') . '/graph/' : OD_GRAPH; }
function od_seg($s) { $s = trim(preg_replace('/[\x00-\x1f"*:<>?\/\\\\|#%]+/u', '-', (string) $s), " .-"); return $s === '' ? '_' : mb_substr($s, 0, 120); }
/* chemin relatif « a/b/c » nettoyé, sans remontée possible au-dessus de la racine */
function od_rel($p) { $out = []; foreach (preg_split('#[/\\\\]+#', (string) $p) as $s) { $s = trim($s); if ($s === '' || $s === '.' || $s === '..') continue; $out[] = od_seg($s); } return implode('/', $out); }
function od_enc($path) { return implode('/', array_map('rawurlencode', explode('/', $path))); }
function od_full($rel) { $root = od_rel(odk('od_root')); return trim($root . '/' . od_rel($rel), '/'); }

function od_http($method, $url, $headers, $body = null) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_TIMEOUT => 60, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_HTTPHEADER => $headers]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) throw new RuntimeException("OneDrive injoignable : $err");
    return [$st, json_decode((string) $res, true)];
}
function od_token() {
    if (odk('od_at') !== '' && (int) odk('od_at_exp') > time() + 60) return odk('od_at');
    [$st, $d] = od_http('POST', od_login_url() . rawurlencode(odk('od_tenant')) . '/oauth2/v2.0/token', ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query(['grant_type' => 'client_credentials', 'client_id' => odk('od_client'), 'client_secret' => odk('od_secret'), 'scope' => 'https://graph.microsoft.com/.default']));
    if ($st >= 400 || empty($d['access_token'])) throw new RuntimeException('OneDrive : connexion refusée par Microsoft (' . (string) ($d['error'] ?? "HTTP $st") . ') : vérifiez le locataire, l\'identifiant et le secret de l\'application.');
    kv_set('od_at', (string) $d['access_token']); kv_set('od_at_exp', (string) (time() + (int) ($d['expires_in'] ?? 3600)));
    return (string) $d['access_token'];
}
function od_graph($method, $path, $body = null, $ctype = 'application/json') {
    $h = ['Authorization: Bearer ' . od_token(), 'Accept: application/json']; if ($body !== null) $h[] = "Content-Type: $ctype";
    [$st, $d] = od_http($method, od_graph_url() . 'users/' . rawurlencode(odk('od_user')) . '/drive/' . $path, $h, $body);
    if ($st === 401) { kv_set('od_at', ''); throw new RuntimeException('OneDrive : accès refusé, reconnectez OneDrive dans Paramètres.'); }
    if ($st === 403) throw new RuntimeException('OneDrive : permission manquante (Files.ReadWrite.All avec consentement administrateur).');
    if ($st === 404) throw new RuntimeException('OneDrive : dossier ou compte introuvable (vérifiez l\'adresse du compte OneDrive et le dossier racine).');
    if ($st >= 400 || !is_array($d)) throw new RuntimeException('OneDrive : ' . (string) ($d['error']['message'] ?? "erreur HTTP $st"));
    return $d;
}
/* dossier d'un avion du shift : <racine>/<AAAA-MM>/<AAAA-MM-JJ> Day|Night/<IMMAT> */
function od_item_folder(array $it) {
    $ho = (string) ($it['ho'] ?? ''); $date = substr($ho, 0, 10); $sh = substr($ho, 11) === 'night' ? 'Night' : 'Day';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = gmdate('Y-m-d');
    return substr($date, 0, 7) . '/' . "$date $sh" . '/' . od_seg(strtoupper((string) ($it['reg'] ?? '')) ?: 'Shift');
}

function onedrive_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'onedrive') return;
    $act = $parts[1] ?? '';
    if ($act === 'status' && $method === 'GET') out(['configured' => od_configured(), 'user' => $role === 'admin' ? odk('od_user') : '', 'root' => odk('od_root'),
        'tenant' => $role === 'admin' ? odk('od_tenant') : '', 'clientId' => $role === 'admin' ? odk('od_client') : '', 'secret' => odk('od_secret') !== '']);
    if ($act === 'config' && $method === 'POST') {
        if ($role !== 'admin') fail(403, 'Réservé aux administrateurs');
        $b = body_json();
        foreach (['tenant' => 'od_tenant', 'clientId' => 'od_client', 'user' => 'od_user'] as $f => $k) if (array_key_exists($f, $b)) {
            $v = trim((string) $b[$f]); if ($v !== '' && !preg_match('/^[A-Za-z0-9@._\-]{3,200}$/', $v)) fail(400, "Valeur invalide : $f"); kv_set($k, $v); }
        if (array_key_exists('root', $b)) { $r = od_rel($b['root']); kv_set('od_root', $r); }
        if (array_key_exists('secret', $b)) { $s = trim((string) $b['secret']); if ($s !== '' && (strlen($s) < 8 || strlen($s) > 200)) fail(400, 'Secret invalide'); kv_set('od_secret', $s); }
        kv_set('od_at', ''); log_event('settings', 'onedrive', 'update', 'Réglages OneDrive enregistrés');
        out(['ok' => true, 'configured' => od_configured(), 'root' => odk('od_root')]);
    }
    if (!od_configured()) fail(400, "OneDrive n'est pas configuré : un administrateur doit le relier dans Paramètres.");
    try {
        if ($act === 'test' && $method === 'POST') {
            if ($role !== 'admin') fail(403, 'Réservé aux administrateurs');
            $d = od_graph('GET', ''); out(['ok' => true, 'drive' => (string) ($d['owner']['user']['displayName'] ?? $d['name'] ?? 'OneDrive')]);
        }
        if ($act === 'upload' && $method === 'POST') {
            $f = $_FILES['file'] ?? null;
            if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) fail(400, 'Aucun fichier reçu');
            if ($f['size'] > OD_MAX) fail(413, 'Fichier trop lourd (20 Mo maximum).');
            $iid = (string) ($_POST['item'] ?? ''); $r = $iid !== '' ? get_doc('shiftItems', check_id($iid)) : null;
            if (!$r || $r['deleted']) fail(404, 'Avion du shift introuvable');
            $it = json_decode($r['data'], true) ?: [];
            if (($it['kind'] ?? '') !== 'visit') fail(400, 'Les scans se rangent par avion du shift.');
            $name = od_seg(pathinfo((string) $f['name'], PATHINFO_FILENAME)) . (($e = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION))) !== '' ? '.' . od_seg($e) : '');
            $rel = od_item_folder($it) . '/' . gmdate('His') . ' ' . $name;
            $d = od_graph('PUT', 'root:/' . od_enc(od_full($rel)) . ':/content?@microsoft.graph.conflictBehavior=rename', file_get_contents($f['tmp_name']), 'application/octet-stream');
            $file = ['name' => (string) ($d['name'] ?? $name), 'url' => (string) ($d['webUrl'] ?? ''), 'id' => (string) ($d['id'] ?? ''), 'path' => $rel, 'at' => gmdate('c'), 'by' => (string) ($GLOBALS['ME_NAME'] ?: $who['label'])];
            $it['scans'] = array_slice(array_merge((array) ($it['scans'] ?? []), [$file]), -100);
            write_doc('shiftItems', $iid, $it, $who['label']);
            out(['ok' => true, 'file' => $file]);
        }
        if ($act === 'list' && $method === 'POST') {
            $b = body_json(); $p = od_full((string) ($b['path'] ?? ''));
            $d = od_graph('GET', 'root:/' . od_enc($p) . ':/children?$top=200&$select=name,folder,file,webUrl,size,lastModifiedDateTime');
            $items = []; foreach ((array) ($d['value'] ?? []) as $x) $items[] = ['name' => (string) ($x['name'] ?? ''), 'folder' => isset($x['folder']), 'url' => (string) ($x['webUrl'] ?? ''), 'size' => (int) ($x['size'] ?? 0), 'at' => (string) ($x['lastModifiedDateTime'] ?? '')];
            out(['path' => od_rel((string) ($b['path'] ?? '')), 'items' => $items]);
        }
    } catch (RuntimeException $e) { fail(502, $e->getMessage()); }
    fail(404, 'Route inconnue');
}
