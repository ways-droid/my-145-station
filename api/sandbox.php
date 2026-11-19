<?php
// Environnement de test, par session : une fois activé, les écritures de CETTE session vont dans une couche à part
// (ways_docs_sbx) posée par-dessus la base principale ; les lectures voient la base principale + la couche de test.
// En quittant, la couche est effacée : la base principale n'a reçu aucun des changements faits pendant le test.
// Les actions qui sortent de l'outil (Falco, Peppol, Odoo, Ponto, Webfleet, utilisateurs, réglages) sont bloquées.
//
//  GET  sandbox          état
//  POST sandbox/start    active le test pour la session courante
//  POST sandbox/stop     quitte le test et efface les changements de test

$GLOBALS['SBX'] = null;

function sbx_tables() {
    db()->exec('CREATE TABLE IF NOT EXISTS ways_docs_sbx (sbx VARCHAR(40) NOT NULL, coll VARCHAR(64) NOT NULL, id VARCHAR(191) NOT NULL, data LONGTEXT NOT NULL, rev BIGINT NOT NULL, updated_at BIGINT NOT NULL, updated_by VARCHAR(191) NULL, deleted TINYINT(1) NOT NULL DEFAULT 0, PRIMARY KEY (sbx, coll, id))');
}
function sbx_key() { $t = bearer_token(); return $t === '' ? null : 'sbx:' . substr(hash('sha256', $t), 0, 40); }
/* au début de chaque requête : la session est-elle en test ? */
function sbx_init() {
    $k = sbx_key(); if (!$k) return;
    $v = kv_get($k); if (!$v) return;
    $s = json_decode($v, true);
    if (!empty($s['id'])) $GLOBALS['SBX'] = $s + ['key' => $k];
}
function sbx_id() { return $GLOBALS['SBX']['id'] ?? null; }

/* lecture d'un document : la couche de test d'abord */
function sbx_get($coll, $id) {
    $st = db()->prepare('SELECT data, rev, updated_at, deleted FROM ways_docs_sbx WHERE sbx = ? AND coll = ? AND id = ?');
    $st->execute([sbx_id(), $coll, $id]);
    return $st->fetch() ?: null;
}
function sbx_write($coll, $id, $data, $user, $deleted) {
    $pdo = db(); $rev = next_rev(); $t = now_ms();
    $json = json_encode((object) $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $up = $pdo->prepare('UPDATE ways_docs_sbx SET data = ?, rev = ?, updated_at = ?, updated_by = ?, deleted = ? WHERE sbx = ? AND coll = ? AND id = ?');
    $up->execute([$json, $rev, $t, $user, $deleted, sbx_id(), $coll, $id]);
    if ($up->rowCount() === 0) $pdo->prepare('INSERT INTO ways_docs_sbx (sbx, coll, id, data, rev, updated_at, updated_by, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([sbx_id(), $coll, $id, $json, $rev, $t, $user, $deleted]);
    return $rev;
}
/* toutes les lignes d'une collection, couche de test comprise : [id => row] (lignes supprimées exclues) */
function sbx_rows($coll) {
    $rows = [];
    $st = db()->prepare('SELECT id, data, rev, updated_at, deleted FROM ways_docs WHERE coll = ? AND deleted = 0'); $st->execute([$coll]);
    foreach ($st as $r) $rows[$r['id']] = $r;
    if (sbx_id()) {
        $st = db()->prepare('SELECT id, data, rev, updated_at, deleted FROM ways_docs_sbx WHERE sbx = ? AND coll = ?'); $st->execute([sbx_id(), $coll]);
        foreach ($st as $r) { if ($r['deleted']) unset($rows[$r['id']]); else $rows[$r['id']] = $r; }
    }
    return $rows;
}
/* flux de changements : ceux de la base principale (hors documents surchargés par le test) + ceux du test */
function sbx_changes($since, $colls, $rows) {
    if (!sbx_id()) return $rows;
    $keys = [];
    $st = db()->prepare('SELECT coll, id FROM ways_docs_sbx WHERE sbx = ?'); $st->execute([sbx_id()]);
    foreach ($st as $r) $keys[$r['coll'] . "\0" . $r['id']] = 1;
    $rows = array_values(array_filter($rows, fn($r) => !isset($keys[$r['coll'] . "\0" . $r['id']])));
    $sql = 'SELECT coll, id, data, rev, updated_at, deleted FROM ways_docs_sbx WHERE sbx = ? AND rev > ?'; $a = [sbx_id(), $since];
    if ($colls) { $sql .= ' AND coll IN (' . implode(',', array_fill(0, count($colls), '?')) . ')'; $a = array_merge($a, $colls); }
    $st = db()->prepare($sql); $st->execute($a);
    foreach ($st as $r) $rows[] = $r;
    usort($rows, fn($x, $y) => (int) $x['rev'] <=> (int) $y['rev']);
    return $rows;
}

/* actions bloquées pendant un test : tout ce qui sort de l'outil ou change sa configuration */
function sbx_guard($route, $parts, $method) {
    if (!sbx_id() || $method === 'GET') return;
    $act = $parts[1] ?? '';
    $msg = "Environnement de test : cette action est désactivée (elle agirait en dehors de l'outil ou sur sa configuration). Quittez le test pour la faire.";
    if ($route === 'assistant' && in_array($act, ['config', 'test'], true)) fail(409, $msg);
    if ($route === 'whatsapp' && $act !== 'status') fail(409, $msg);
    if ($route === 'fr24' && $act === 'config') fail(409, $msg);
    if ($route === 'notion') fail(409, $msg);
    if ($route === 'onedrive' && $act !== 'list') fail(409, $msg);   // écrirait dans Notion
    if ($route === 'dropbox') { if ($act === 'tick') out(['ok' => true, 'skipped' => true, 'sandbox' => true]); if (!in_array($act, ['list', 'search', 'link', 'new', 'new-ack'], true)) fail(409, $msg); }
    if ($route === 'auth' && ($act === 'users' || $act === 'smtp' || $act === 'test-mail')) fail(409, $msg);
    if ($route === 'import') fail(409, $msg);
    if ($route === 'log' && $act === 'event') out(['ok' => true, 'sandbox' => true]);
}

function sandbox_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'sandbox') return;
    $act = $parts[1] ?? '';
    if ($method === 'GET' && $act === '') out(['active' => (bool) sbx_id(), 'since' => $GLOBALS['SBX']['since'] ?? null, 'changes' => sbx_id() ? sbx_count() : 0]);
    if ($method !== 'POST') fail(405, 'Méthode non permise');
    if (!is_office($role)) fail(403, 'Réservé au bureau et aux administrateurs');
    $k = sbx_key(); if (!$k) fail(401, 'Session requise');
    sbx_tables();
    if ($act === 'start') {
        if (sbx_id()) out(['ok' => true, 'active' => true]);
        $s = ['id' => bin2hex(random_bytes(12)), 'since' => now_ms(), 'by' => preg_replace('/^(user|token):/', '', (string) $who['label'])];
        kv_set($k, json_encode($s));
        sbx_purge_old();
        out(['ok' => true, 'active' => true]);
    }
    if ($act === 'stop') {
        if ($id = sbx_id()) db()->prepare('DELETE FROM ways_docs_sbx WHERE sbx = ?')->execute([$id]);
        kv_set($k, '');
        out(['ok' => true, 'active' => false]);
    }
    fail(404, 'Route inconnue');
}
function sbx_count() { $st = db()->prepare('SELECT COUNT(*) FROM ways_docs_sbx WHERE sbx = ?'); $st->execute([sbx_id()]); return (int) $st->fetchColumn(); }
/* couches de test abandonnées (session expirée sans quitter le test) : effacées après 2 jours */
function sbx_purge_old() {
    try {
        $live = [];
        foreach (db()->query("SELECT k, v FROM ways_kv WHERE k LIKE 'sbx:%'") as $r) { $s = json_decode($r['v'], true); if (!empty($s['id']) && now_ms() - (int) $s['since'] < 2 * 86400000) $live[$s['id']] = 1; elseif ($r['v'] !== '') kv_set($r['k'], ''); }
        foreach (db()->query('SELECT DISTINCT sbx FROM ways_docs_sbx')->fetchAll(PDO::FETCH_COLUMN) as $id) if (!isset($live[$id])) db()->prepare('DELETE FROM ways_docs_sbx WHERE sbx = ?')->execute([$id]);
    } catch (Throwable $e) { error_log('WAYS sandbox purge: ' . $e->getMessage()); }
}
