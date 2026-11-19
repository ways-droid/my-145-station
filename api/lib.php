<?php
// Fonctions communes de l'API my-145-station

function cfg($key = null) {
    static $c = null;
    if ($c === null) {
        $file = getenv('WAYS_CONFIG') ?: __DIR__ . '/config.php';
        if (!is_file($file)) fail(500, 'config.php manquant');
        $c = require $file;
    }
    return $key === null ? $c : ($c[$key] ?? null);
}

function db() {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(cfg('dsn'), cfg('db_user'), cfg('db_pass'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

function out($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail($code, $msg) { out(['error' => $msg], $code); }

function body_json() {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $d = json_decode($raw, true);
    if (!is_array($d)) fail(400, 'JSON invalide');
    return $d;
}

function now_ms() { return (int) round(microtime(true) * 1000); }

// --- Contrôle d'accès : session d'un utilisateur connecté (login par code e-mail, voir auth.php)
//     ou clé d'accès de config.php (installation, tests, migration) ---
function auth_who() {
    $token = bearer_token();
    if ($token !== '') {
        foreach ((array) cfg('api_tokens') as $t) {
            if (strlen($t) >= 32 && hash_equals($t, $token)) return ['kind' => 'key', 'user' => null, 'label' => 'token:' . substr(hash('sha256', $t), 0, 8)];
        }
        if ($u = session_user($token)) return ['kind' => 'session', 'user' => $u, 'label' => 'user:' . $u['name']];
    }
    fail(401, 'Non autorisé');
}
function auth_user() { return auth_who()['label']; }

// Collections de l'outil : la liste de config.php s'ajoute à celle-ci, pour qu'un module
// ajouté plus tard fonctionne sans devoir modifier config.php sur le serveur.
const WAYS_COLLECTIONS = [
    'staff','roster','handovers','shiftItems','clients','products','vehicles','vehEvents','faults','driverLogs','tires','tools','labs',
    'adminDocs','adminFolders','settings','notes','userPrefs','links',
];
function collections() {
    return array_values(array_unique(array_merge(WAYS_COLLECTIONS, (array) cfg('collections'))));
}

/* tous les documents (non supprimés) d'une collection, en tenant compte de l'environnement de test */
function coll_docs($coll) {
    if (function_exists('sbx_id') && sbx_id()) { $out = []; foreach (sbx_rows($coll) as $id => $r) $out[$id] = json_decode($r['data'], true) ?: []; return $out; }
    $out = [];
    $st = db()->prepare('SELECT id, data FROM ways_docs WHERE coll = ? AND deleted = 0');
    $st->execute([$coll]);
    foreach ($st as $r) $out[$r['id']] = json_decode($r['data'], true) ?: [];
    return $out;
}

function check_coll($c) {
    if (!in_array($c, collections(), true)) fail(404, "Collection inconnue : $c");
    return $c;
}

function check_id($id) {
    if (!preg_match('/^[A-Za-z0-9._:@\-]{1,191}$/', $id)) fail(400, 'Identifiant invalide');
    return $id;
}

// Révision globale suivante (appelée dans une transaction)
function next_rev() {
    $pdo = db();
    $pdo->exec("UPDATE ways_meta SET v = v + 1 WHERE k = 'rev'");
    return (int) $pdo->query("SELECT v FROM ways_meta WHERE k = 'rev'")->fetchColumn();
}

function current_rev() {
    return (int) db()->query("SELECT v FROM ways_meta WHERE k = 'rev'")->fetchColumn();
}

// Fusion profonde (pour PATCH) : les objets sont fusionnés, les listes et valeurs remplacées,
// une valeur null supprime le champ.
function deep_merge(array $base, array $patch) {
    foreach ($patch as $k => $v) {
        if ($v === null) { unset($base[$k]); continue; }
        if (is_array($v) && !array_is_list($v) && isset($base[$k]) && is_array($base[$k]) && !array_is_list($base[$k])) {
            $base[$k] = deep_merge($base[$k], $v);
        } else {
            $base[$k] = $v;
        }
    }
    return $base;
}

function get_doc($coll, $id) {
    if (function_exists('sbx_id') && sbx_id() && ($r = sbx_get($coll, $id))) return $r;   // environnement de test
    $st = db()->prepare('SELECT data, rev, updated_at, deleted FROM ways_docs WHERE coll = ? AND id = ?');
    $st->execute([$coll, $id]);
    return $st->fetch() ?: null;
}

// Écrit un document (création ou remplacement). Retourne la révision.
function write_doc($coll, $id, $data, $user, $deleted = 0) {
    if (function_exists('sbx_id') && sbx_id()) return sbx_write($coll, $id, $data, $user, $deleted);   // test : couche à part, base principale intacte
    $pdo = db();
    $old = null;
    if (function_exists('log_doc_write')) {   // historique des actions (api/log.php)
        $s = $pdo->prepare('SELECT data, deleted FROM ways_docs WHERE coll = ? AND id = ?'); $s->execute([$coll, $id]);
        if (($r = $s->fetch()) && !$r['deleted']) $old = json_decode($r['data'], true) ?: [];
    }
    $rev = next_rev();
    $json = json_encode((object) $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $t = now_ms();
    $up = $pdo->prepare('UPDATE ways_docs SET data = ?, rev = ?, updated_at = ?, updated_by = ?, deleted = ? WHERE coll = ? AND id = ?');
    $up->execute([$json, $rev, $t, $user, $deleted, $coll, $id]);
    if ($up->rowCount() === 0) {
        $ins = $pdo->prepare('INSERT INTO ways_docs (coll, id, data, rev, updated_at, updated_by, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $ins->execute([$coll, $id, $json, $rev, $t, $user, $deleted]);
    }
    if (function_exists('log_doc_write')) log_doc_write($coll, $id, $old, $deleted ? [] : (array) $data, $user, $deleted);
    if (!$deleted && function_exists('dbx_on_write')) dbx_on_write($coll, $id, (array) $data);   // documents des véhicules → Dropbox (file d'attente)
    return $rev;
}

function doc_out($coll, $id, $row) {
    $d = json_decode($row['data'], true) ?: [];
    return ['coll' => $coll, 'id' => $id, 'rev' => (int) $row['rev'], 'updatedAt' => (int) $row['updated_at'],
            'deleted' => (bool) $row['deleted'], 'data' => $row['deleted'] ? null : $d];
}
