<?php
// Historique des actions : qui a créé, modifié, supprimé, envoyé… quoi, et quand.
// Alimenté automatiquement par write_doc() (toutes les écritures) et par log_event() (envois, connexions, actions serveur).
//
//  GET log?coll=&id=&by=&action=&from=&to=&q=&before=&limit=   (administrateurs et bureau)
//  GET log/people                                              noms présents dans l'historique
//
// Les écritures des synchronisations (Dropbox, WhatsApp…) ne sont notées que pour les créations,
// suppressions et changements de statut ou de rapprochement, pour ne pas noyer l'historique.

const LOG_SKIP_COLLS = ['userPrefs'];
const LOG_SYSTEM = ['server' => 'Outil', 'dropbox' => 'Dropbox', 'whatsapp' => 'WhatsApp'];
const LOG_SYSTEM_KEYS = ['status', 'paymentStatus', 'paymentState', 'matches', 'match', 'response'];
const LOG_IGNORE_KEYS = ['_rev', 'updatedAt', 'updated_at', 'pdfFileId', 'syncedAt'];
const LOG_KEEP_DAYS = 730;

function log_tables() {
    static $done = false; if ($done) return; $done = true;
    if (kv_get('log_schema') === '2') return;          // table déjà en place : pas de requête DDL à chaque appel
    $pdo = db();
    $pdo->exec('CREATE TABLE IF NOT EXISTS ways_log (id VARCHAR(32) NOT NULL PRIMARY KEY, at BIGINT NOT NULL, by_name VARCHAR(191) NOT NULL, by_kind VARCHAR(16) NOT NULL, coll VARCHAR(64) NOT NULL, doc_id VARCHAR(191) NOT NULL, action VARCHAR(32) NOT NULL, label VARCHAR(255) NULL, details TEXT NULL, parent VARCHAR(191) NULL)');
    if (kv_get('log_idx') !== '1') {
        foreach (['CREATE INDEX idx_log_at ON ways_log (at)', 'CREATE INDEX idx_log_doc ON ways_log (coll, doc_id)', 'CREATE INDEX idx_log_parent ON ways_log (parent)'] as $q) { try { $pdo->exec($q); } catch (Throwable $e) {} }
        kv_set('log_idx', '1');
    }
    kv_set('log_schema', '2');
}

function log_label($coll, $d) {
    if (!is_array($d)) return '';
    if ($coll === 'notes') return empty($d['team']) ? 'Note personnelle' : trim('Note d\'équipe ' . mb_substr((string) ($d['title'] ?? ''), 0, 80));
    if ($coll === 'roster') { $n = ''; foreach (coll_docs('staff') as $id => $s) if ((string) $id === (string) ($d['staffId'] ?? '')) $n = (string) ($s['name'] ?? ''); return trim('Roster ' . ($d['month'] ?? '') . ' ' . $n); }
    if ($coll === 'handovers') return trim('Shift ' . ($d['date'] ?? '') . ' ' . (($d['shift'] ?? '') === 'night' ? 'nuit' : 'jour'));
    if ($coll === 'shiftItems') return trim(['visit' => 'Avion', 'todo' => 'Travail non terminé', 'equip' => 'Matériel'][$d['kind'] ?? ''] ?? 'Shift') . ' ' . ($d['reg'] ?? '') . ' · ' . ($d['ho'] ?? '');
    if ($coll === 'chargeLines') return trim('Charge Sheet ' . ($d['rotation'] ?? '') . ' ' . ($d['workType'] ?? ''));
    if ($coll === 'vehicles') return trim('Véhicule ' . ($d['fleetNo'] ?? '') . ' ' . ($d['plate'] ?? ''));
    foreach (['number', 'name', 'title', 'label', 'plate', 'serial', 'ref', 'type'] as $k) if (!empty($d[$k]) && is_scalar($d[$k])) return mb_substr((string) $d[$k], 0, 120);
    return '';
}
function log_short($v) {
    if ($v === null || $v === '') return '—';
    if (is_bool($v)) return $v ? 'oui' : 'non';
    if (is_array($v)) return array_is_list($v) ? count($v) . ' élément' . (count($v) > 1 ? 's' : '') : '…';
    $s = (string) $v; return mb_strlen($s) > 60 ? mb_substr($s, 0, 57) . '…' : $s;
}
function log_diff($old, $new) {
    $ch = [];
    foreach (array_unique(array_merge(array_keys($old), array_keys($new))) as $k) {
        if (in_array($k, LOG_IGNORE_KEYS, true)) continue;
        $a = $old[$k] ?? null; $b = $new[$k] ?? null;
        if ($a == $b) continue;
        $ch[] = [$k, log_short($a), log_short($b)];
        if (count($ch) >= 15) { $ch[] = ['…', '', '']; break; }
    }
    return $ch;
}
function log_name($by) { $by = (string) $by; return str_starts_with($by, 'user:') ? substr($by, 5) : (str_starts_with($by, 'token:') ? 'Clé d\'accès' : $by); }
/* fiche « parente » (véhicule d'une intervention…) pour l'historique d'une fiche */
function log_parent($d) { foreach (['vehicleId', 'clientId', 'toolId', 'bottleId'] as $k) if (!empty($d[$k]) && is_scalar($d[$k])) return (string) $d[$k]; return null; }
function log_write($by, $kind, $coll, $id, $action, $label, $details = null, $parent = null) {
    $by = log_name($by);
    try {
        log_tables();
        db()->prepare('INSERT INTO ways_log (id, at, by_name, by_kind, coll, doc_id, action, label, details, parent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([bin2hex(random_bytes(12)), now_ms(), mb_substr((string) $by, 0, 190), $kind, $coll, mb_substr((string) $id, 0, 190), $action, mb_substr((string) $label, 0, 250),
                $details === null ? null : mb_substr(json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 0, 6000), $parent]);
        if (random_int(1, 500) === 1) db()->prepare('DELETE FROM ways_log WHERE at < ?')->execute([now_ms() - LOG_KEEP_DAYS * 86400000]);
    } catch (Throwable $e) { error_log('WAYS log: ' . $e->getMessage()); }
}
/* appelé par write_doc() : $old = ancien document (null s'il n'existait pas) */
function log_doc_write($coll, $id, $old, $new, $user, $deleted) {
    if (in_array($coll, LOG_SKIP_COLLS, true) || $user === null) return;
    $sys = isset(LOG_SYSTEM[$user]); $by = $sys ? LOG_SYSTEM[$user] : $user;
    if ($deleted) { if ($old === null) return; $action = 'delete'; $details = null; $label = log_label($coll, $old); }
    elseif ($old === null) { $action = 'create'; $details = null; $label = log_label($coll, $new); }
    else {
        $ch = log_diff($old, $new);
        if (!$ch) return;
        if ($sys && !array_filter($ch, fn($c) => in_array($c[0], LOG_SYSTEM_KEYS, true))) return;
        $action = 'update'; $details = ['changes' => $ch]; $label = log_label($coll, $new);
        if ($coll === 'notes' && (empty($new['team']) || empty($old['team']))) $details = null;   // contenu d'une note personnelle : jamais dans l'historique
        if (array_filter($ch, fn($c) => $c[0] === 'response')) $action = 'reply';
        if (array_filter($ch, fn($c) => $c[0] === 'archived')) $action = !empty($new['archived']) ? 'archive' : 'unarchive';
    }
    log_write($by, $sys ? 'system' : 'user', $coll, $id, $action, $label, $details, log_parent($deleted ? $old : $new));
}
/* événement explicite (envoi, transmission, réponse, connexion…) */
function log_event($coll, $id, $action, $label, $details = null, $by = null) {
    global $LOG_WHO;
    $name = $by ?? ($LOG_WHO ?? 'ERP');
    log_write($name, isset(LOG_SYSTEM[$name]) || $name === 'ERP' ? 'system' : 'user', $coll, $id, $action, $label, $details);
}

function log_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'log') return;
    log_tables();
    if (($parts[1] ?? '') === 'event' && $method === 'POST') {   // actions faites dans le navigateur (e-mail préparé, PDF…)
        $b = body_json(); $act = (string) ($b['action'] ?? ''); $coll = (string) ($b['coll'] ?? ''); $id = (string) ($b['id'] ?? '');
        if (!in_array($act, ['mail', 'pdf', 'print'], true) || !in_array($coll, collections(), true) || $id === '') fail(400, 'Événement invalide');
        $r = get_doc($coll, $id); $d = $r && !$r['deleted'] ? json_decode($r['data'], true) : null;
        if (!$d || perm_view($role, $coll, $d) === null) fail(404, 'Introuvable');
        log_write($who['label'], 'user', $coll, $id, $act, log_label($coll, $d), ($t = trim((string) ($b['to'] ?? ''))) !== '' ? ['to' => mb_substr($t, 0, 200)] : null);
        out(['ok' => true]);
    }
    if (!is_office($role)) fail(403, 'Historique réservé au bureau et aux administrateurs');
    if (($parts[1] ?? '') === 'people') {
        $names = db()->query('SELECT DISTINCT by_name FROM ways_log ORDER BY by_name')->fetchAll(PDO::FETCH_COLUMN);
        out(['people' => $names]);
    }
    $w = []; $a = [];
    if (!empty($_GET['related']) && ($rid = trim((string) ($_GET['id'] ?? ''))) !== '') {   // la fiche + ce qui s'y rattache
        $w[] = '((coll = ? AND doc_id = ?) OR parent = ?)'; array_push($a, (string) ($_GET['coll'] ?? ''), $rid, $rid);
        unset($_GET['coll'], $_GET['id']);
    }
    foreach (['coll' => 'coll', 'id' => 'doc_id', 'by' => 'by_name', 'action' => 'action'] as $p => $col) {
        $v = trim((string) ($_GET[$p] ?? '')); if ($v === '') continue;
        if ($p === 'action' && $v === 'system') { $w[] = 'by_kind = ?'; $a[] = 'system'; continue; }
        if ($p === 'action' && $v === 'user') { $w[] = 'by_kind = ?'; $a[] = 'user'; continue; }
        $w[] = "$col = ?"; $a[] = $v;
    }
    if (($v = (int) ($_GET['from'] ?? 0)) > 0) { $w[] = 'at >= ?'; $a[] = $v; }
    if (($v = (int) ($_GET['to'] ?? 0)) > 0) { $w[] = 'at <= ?'; $a[] = $v; }
    if (($v = (int) ($_GET['before'] ?? 0)) > 0) { $w[] = 'at < ?'; $a[] = $v; }
    if (($q = trim((string) ($_GET['q'] ?? ''))) !== '') { $w[] = '(LOWER(label) LIKE ? OR LOWER(by_name) LIKE ? OR LOWER(details) LIKE ?)'; $l = '%' . mb_strtolower($q) . '%'; array_push($a, $l, $l, $l); }
    if (empty($_GET['id']) && empty($_GET['coll']) && empty($_GET['related'])) {   // vue générale : collections que le rôle peut voir
        $hidden = array_values(array_filter(collections(), fn($c) => perm_view($role, $c, []) === null));
        if ($hidden) { $w[] = 'coll NOT IN (' . implode(',', array_fill(0, count($hidden), '?')) . ')'; array_push($a, ...$hidden); }
    }
    $lim = max(1, min(300, (int) ($_GET['limit'] ?? 100)));
    $sql = 'SELECT at, by_name, by_kind, coll, doc_id, action, label, details, parent FROM ways_log' . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . " ORDER BY at DESC LIMIT $lim";
    $st = db()->prepare($sql); $st->execute($a);
    $items = array_map(fn($r) => ['at' => (int) $r['at'], 'by' => $r['by_name'], 'kind' => $r['by_kind'], 'coll' => $r['coll'], 'id' => $r['doc_id'],
        'action' => $r['action'], 'label' => $r['label'], 'details' => $r['details'] ? json_decode($r['details'], true) : null], $st->fetchAll());
    out(['items' => $items, 'more' => count($items) === $lim]);
}
