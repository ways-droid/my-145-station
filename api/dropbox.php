<?php
/* ======================= Liaison Dropbox =======================
   Un compte Dropbox de l'entreprise relié à l'ERP (OAuth 2, jeton de rafraîchissement « offline »).
   - App créée par l'administrateur dans la console Dropbox (clé + secret saisis dans Paramètres, gardés dans ways_kv).
   - Espace d'équipe : les chemins sont ceux de l'adresse web (dropbox.com/home/<chemin>), via Dropbox-API-Path-Root.
   - Consultation (Administration → dossier Dropbox), recherche, ouverture par lien temporaire (4 h).
   - Documents des véhicules : chaque fichier ajouté dans une fiche est copié dans le dossier Dropbox du véhicule ;
     un document passé dans « Anciens documents » est déplacé dans <dossier>/Expired. File d'attente traitée par dropbox/tick.
   - Axel peut chercher, lister et lire (lecture seule). */

const DBX_API = 'https://api.dropboxapi.com/2/';
const DBX_CONTENT = 'https://content.dropboxapi.com/2/';
const DBX_OLD_DIR = 'Expired';
const DBX_READ_MAX = 10 * 1048576;
const DBX_COLORS = ['green', 'orange', 'red', 'violet', 'teal', 'pink', 'grey'];   // pas jaune (dossiers manuels) ni bleu (dossiers système)

function dbk($k, $d = '') { $v = kv_get($k); return $v === null || $v === '' ? (string) $d : (string) $v; }
function dbx_app_set() { return dbk('dbx_key') !== '' && dbk('dbx_secret') !== ''; }
function dbx_connected() { return dbx_app_set() && dbk('dbx_refresh') !== ''; }
function dbx_base() { return rtrim(dbk('dbx_base_url', 'https://api.dropboxapi.com'), '/'); }   // remplaçable pour les tests
function dbx_url($kind, $ep) {
    $b = dbk('dbx_base_url');
    if ($b !== '') return rtrim($b, '/') . '/' . $kind . '/' . $ep;   // faux Dropbox des tests
    if ($kind === 'oauth2') return 'https://api.dropboxapi.com/oauth2/' . $ep;   // pas sous /2/ comme le reste de l'API
    return ($kind === 'content' ? DBX_CONTENT : DBX_API) . $ep;
}

/* adresse de retour OAuth : à déclarer telle quelle dans la console Dropbox */
function dbx_redirect_uri() {
    $host = $_SERVER['HTTP_HOST'] ?? 'ways.support';
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/api/', PHP_URL_PATH);
    $base = preg_match('#^(.*?/api)/#', $uri, $m) ? $m[1] : '/api';
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' || !preg_match('/^(127\.|localhost)/', $host);
    return ($https ? 'https://' : 'http://') . $host . $base . '/dropbox/callback';
}

function dbx_http($url, $headers, $body, $timeout = 40) {
    $ch = curl_init($url); $hdr = [];
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$hdr) { $p = explode(':', $h, 2); if (count($p) === 2) $hdr[strtolower(trim($p[0]))] = trim($p[1]); return strlen($h); }]);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) throw new RuntimeException("Dropbox injoignable : $err");
    return [$st, $res, $hdr];
}
function dbx_fail($st, $res) {
    $d = json_decode((string) $res, true);
    $s = is_array($d) ? (string) ($d['error_summary'] ?? ($d['error_description'] ?? ($d['error']['.tag'] ?? ''))) : trim(mb_substr((string) $res, 0, 160));
    $hint = '';
    if ($st === 401) $hint = ' — reconnectez Dropbox dans Paramètres.';
    elseif (str_contains($s, 'missing_scope')) $hint = " — dans la console Dropbox, onglet Permissions, cochez files.metadata.read, files.content.read, files.content.write et account_info.read, puis reconnectez.";
    elseif (str_starts_with($s, 'path/not_found') || str_contains($s, 'not_found')) $hint = ' — dossier ou fichier introuvable dans Dropbox.';
    throw new RuntimeException('Dropbox : ' . ($s ?: "erreur HTTP $st") . $hint, $st);
}
function dbx_token() {
    if (dbk('dbx_at') !== '' && (int) dbk('dbx_at_exp', '0') > time() + 60) return dbk('dbx_at');
    [$st, $res] = dbx_http(dbx_url('oauth2', 'token'), ['Content-Type: application/x-www-form-urlencoded'], http_build_query([
        'grant_type' => 'refresh_token', 'refresh_token' => dbk('dbx_refresh'), 'client_id' => dbk('dbx_key'), 'client_secret' => dbk('dbx_secret')]));
    $d = json_decode($res, true);
    if ($st >= 400 || empty($d['access_token'])) { kv_set('dbx_error', 'Jeton refusé (' . ($d['error_description'] ?? $d['error'] ?? $st) . ') : reconnectez Dropbox.'); dbx_fail(401, $res); }
    kv_set('dbx_at', $d['access_token']); kv_set('dbx_at_exp', (string) (time() + (int) ($d['expires_in'] ?? 14400)));
    return $d['access_token'];
}
function dbx_headers($extra = []) {
    $h = array_merge(['Authorization: Bearer ' . dbx_token()], $extra);
    if (($r = dbk('dbx_root')) !== '') $h[] = 'Dropbox-API-Path-Root: ' . json_encode(['.tag' => 'root', 'root' => $r]);
    return $h;
}
function dbx_rpc($ep, $args = null) {
    [$st, $res] = dbx_http(dbx_url('api', $ep), dbx_headers(['Content-Type: application/json']), $args === null ? 'null' : json_encode($args));
    if ($st >= 400) dbx_fail($st, $res);
    return json_decode($res, true) ?: [];
}
/* Dropbox-API-Arg : JSON en ASCII (json_encode échappe les accents en \uXXXX) */
function dbx_upload($path, $bytes) {
    [$st, $res] = dbx_http(dbx_url('content', 'files/upload'), dbx_headers(['Content-Type: application/octet-stream',
        'Dropbox-API-Arg: ' . json_encode(['path' => $path, 'mode' => 'add', 'autorename' => true, 'mute' => true])]), $bytes, 120);
    if ($st >= 400) dbx_fail($st, $res);
    return json_decode($res, true) ?: [];
}
function dbx_download($path) {
    [$st, $res, $hdr] = dbx_http(dbx_url('content', 'files/download'), dbx_headers(['Dropbox-API-Arg: ' . json_encode(['path' => $path])]), '', 90);
    if ($st >= 400) dbx_fail($st, $res);
    return [$res, json_decode($hdr['dropbox-api-result'] ?? '{}', true) ?: []];
}
function dbx_norm_path($p) {
    $p = '/' . trim(str_replace('\\', '/', (string) $p), '/');
    return $p === '/' ? '' : $p;                 // racine = chaîne vide pour l'API
}
function dbx_entry($e) {
    return ['name' => $e['name'] ?? '', 'path' => $e['path_display'] ?? '', 'folder' => ($e['.tag'] ?? '') === 'folder',
        'size' => isset($e['size']) ? (int) $e['size'] : null, 'modified' => $e['server_modified'] ?? null, 'id' => $e['id'] ?? ''];
}
function dbx_list($path, $max = 2000) {
    $r = dbx_rpc('files/list_folder', ['path' => dbx_norm_path($path), 'limit' => 500, 'include_non_downloadable_files' => false]);
    $out = array_map('dbx_entry', $r['entries'] ?? []);
    while (!empty($r['has_more']) && count($out) < $max) { $r = dbx_rpc('files/list_folder/continue', ['cursor' => $r['cursor']]); foreach ($r['entries'] ?? [] as $e) $out[] = dbx_entry($e); }
    usort($out, fn($a, $b) => ($b['folder'] <=> $a['folder']) ?: strnatcasecmp($a['name'], $b['name']));
    return $out;
}
function dbx_search($q, $path = '', $max = 50) {
    $opt = ['max_results' => max(1, min(100, (int) $max)), 'file_status' => 'active'];
    if (dbx_norm_path($path) !== '') $opt['path'] = dbx_norm_path($path);
    $r = dbx_rpc('files/search_v2', ['query' => mb_substr($q, 0, 200), 'options' => $opt]);
    return array_values(array_filter(array_map(fn($m) => isset($m['metadata']['metadata']) ? dbx_entry($m['metadata']['metadata']) : null, $r['matches'] ?? [])));
}
function dbx_mkdir($path) {
    try { dbx_rpc('files/create_folder_v2', ['path' => $path, 'autorename' => false]); }
    catch (RuntimeException $e) { if (!str_contains($e->getMessage(), 'conflict')) throw $e; }   // existe déjà
}

/* ---------- dossiers autorisés (choisis par l'administrateur avec le code maître) ----------
   Seuls ces dossiers (et leurs sous-dossiers) sont visibles dans l'ERP, consultables par Axel et utilisés pour la copie
   des documents des véhicules. Aucun dossier choisi = rien de visible. */
function dbx_scope() { return array_values(array_filter((array) (json_decode(dbk('dbx_folders', '[]'), true) ?: []), 'is_string')); }
function dbx_in_scope($p) {
    $p = mb_strtolower(dbx_norm_path($p)); if ($p === '') return false;
    foreach (dbx_scope() as $f) { $f = mb_strtolower($f); if ($p === $f || str_starts_with($p, $f . '/')) return true; }
    return false;
}
function dbx_guard($p) {
    if (!dbx_in_scope($p)) throw new RuntimeException("Dossier Dropbox non autorisé : seuls les dossiers choisis par l'administrateur sont accessibles (Paramètres → Liaison Dropbox).", 403);
}
/* versions limitées aux dossiers autorisés (ERP, Axel) */
function dbx_list_scoped($path, $max = 2000) {
    if (dbx_norm_path($path) === '') return array_map(fn($f) => ['name' => basename($f) ?: $f, 'path' => $f, 'folder' => true, 'size' => null, 'modified' => null, 'id' => '', 'root' => true], dbx_scope());
    dbx_guard($path); return dbx_list($path, $max);
}
function dbx_search_scoped($q, $path = '', $max = 50) {
    if (dbx_norm_path($path) !== '') { dbx_guard($path); return dbx_search($q, $path, $max); }
    $out = [];
    foreach (dbx_scope() as $f) { foreach (dbx_search($q, $f, $max) as $e) $out[$e['path']] = $e; if (count($out) >= $max) break; }
    return array_values($out);
}
/* déverrouillage par le code maître : jeton de 15 minutes, lié à la session */
function dbx_unlock($who, $code) {
    $f = json_decode(dbk('dbx_unlock_fail', '{}'), true) ?: [];
    if (($f['n'] ?? 0) >= 5 && now_ms() - ($f['at'] ?? 0) < 900000) fail(429, 'Trop d\'essais : réessayez dans 15 minutes.');
    $code = preg_replace('/\D/', '', (string) $code);
    if ($code === '' || !password_verify($code, (string) kv_get('master_hash'))) {
        usleep(400000);
        kv_set('dbx_unlock_fail', json_encode(['n' => (now_ms() - ($f['at'] ?? 0) < 900000 ? ($f['n'] ?? 0) : 0) + 1, 'at' => now_ms()]));
        if (function_exists('log_event')) log_event('settings', 'company', 'update', 'Dropbox', 'Code maître refusé (dossiers Dropbox)');
        fail(403, 'Code maître incorrect.');   // pas 401 : le navigateur le prendrait pour une session expirée
    }
    kv_set('dbx_unlock_fail', '');
    $t = bin2hex(random_bytes(16));
    kv_set('dbx_unlock', json_encode(['h' => hash('sha256', $t), 'exp' => now_ms() + 900000, 'u' => $who['user']['id'] ?? 'key']));
    return $t;
}
function dbx_unlocked($who, $t) {
    $u = json_decode(dbk('dbx_unlock', '{}'), true) ?: [];
    if (empty($u['h']) || now_ms() > ($u['exp'] ?? 0) || ($u['u'] ?? '') !== ($who['user']['id'] ?? 'key') || !hash_equals($u['h'], hash('sha256', (string) $t)))
        fail(403, 'Session de choix des dossiers expirée : ressaisissez le code maître.');
}

/* ---------- suivi par Axel : nouveaux fichiers dans des dossiers suivis ----------
   dbx_watch : [{path, cursor, by, at}] (choisis par le bureau / les administrateurs, dans les dossiers autorisés).
   Les nouveaux fichiers deviennent des événements (dbx_new, numérotés) ; chaque personne a son « vu jusqu'à »
   (dbx_seen:<id>) et Axel lui propose « Analyser ? Oui / Non ». Les fichiers copiés par l'ERP lui-même sont ignorés. */
const DBX_WATCH_EVERY = 120;   // secondes
function dbx_watches() { return array_values(array_filter((array) (json_decode(dbk('dbx_watch', '[]'), true) ?: []), fn($w) => !empty($w['path']))); }
function dbx_mine_add($p) { $m = json_decode(dbk('dbx_mine', '[]'), true) ?: []; $m[] = mb_strtolower($p); kv_set('dbx_mine', json_encode(array_slice($m, -300))); }
function dbx_uid($who) { return ($who['kind'] ?? '') === 'session' ? (string) ($who['user']['id'] ?? 'key') : 'key'; }
function dbx_events() { return json_decode(dbk('dbx_new', '[]'), true) ?: []; }
function dbx_pending($who) {
    $seen = (int) dbk('dbx_seen:' . dbx_uid($who), '0');
    return array_values(array_filter(dbx_events(), fn($e) => (int) $e['seq'] > $seen && dbx_in_scope($e['path'])));
}
function dbx_watch_check($force = false) {
    $ws = dbx_watches(); if (!$ws) return 0;
    if (!$force && time() - (int) dbk('dbx_watch_at', '0') < DBX_WATCH_EVERY) return 0;
    kv_set('dbx_watch_at', (string) time());
    $mine = array_flip(json_decode(dbk('dbx_mine', '[]'), true) ?: []);
    $ev = dbx_events(); $seq = (int) dbk('dbx_seq', '0'); $n = 0; $keep = [];
    foreach ($ws as $w) {
        if (!dbx_in_scope($w['path'])) continue;                  // dossier retiré des dossiers autorisés : suivi arrêté
        try {
            $r = ['cursor' => $w['cursor'], 'has_more' => true]; $i = 0;
            while (!empty($r['has_more']) && $i++ < 10) {
                $r = dbx_rpc('files/list_folder/continue', ['cursor' => $r['cursor']]);
                foreach ($r['entries'] ?? [] as $e) {
                    if (($e['.tag'] ?? '') !== 'file' || isset($mine[mb_strtolower($e['path_display'] ?? '')])) continue;
                    $ev[] = ['seq' => ++$seq, 'path' => $e['path_display'], 'name' => $e['name'], 'folder' => $w['path'], 'size' => (int) ($e['size'] ?? 0), 'at' => gmdate('c')]; $n++;
                }
            }
            $w['cursor'] = $r['cursor'];
        } catch (RuntimeException $e) {
            if (str_contains($e->getMessage(), 'reset')) { try { $w['cursor'] = dbx_rpc('files/list_folder/get_latest_cursor', ['path' => $w['path']])['cursor']; } catch (Throwable $x) {} }
            elseif (str_contains($e->getMessage(), 'not_found')) continue;   // dossier supprimé ou déplacé
        }
        $keep[] = $w;
    }
    $lim = gmdate('c', time() - 14 * 86400);
    kv_set('dbx_new', json_encode(array_slice(array_values(array_filter($ev, fn($e) => $e['at'] >= $lim)), -300), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    kv_set('dbx_seq', (string) $seq); kv_set('dbx_watch', json_encode($keep, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $n;
}
/* copie d'un fichier Dropbox dans les fichiers de l'ERP (pour le ranger dans une fiche) */
function dbx_import_file($path) {
    $p = dbx_norm_path($path); dbx_guard($p);
    $m = dbx_rpc('files/get_metadata', ['path' => $p]);
    if (($m['.tag'] ?? '') !== 'file') throw new RuntimeException("Ce n'est pas un fichier.");
    if ((int) ($m['size'] ?? 0) > 20 * 1048576) throw new RuntimeException('Fichier trop volumineux (20 Mo maximum).');
    [$bytes] = dbx_download($p);
    $dir = rtrim(cfg('upload_dir'), '/'); if (!is_dir($dir)) mkdir($dir, 0750, true);
    $id = bin2hex(random_bytes(16)); file_put_contents("$dir/$id", $bytes);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: 'application/octet-stream';
    $name = mb_substr(basename($p), 0, 255);
    db()->prepare('INSERT INTO ways_files (id, name, mime, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')->execute([$id, $name, $mime, strlen($bytes), now_ms(), 'Dropbox']);
    return ['fileId' => $id, 'name' => $name, 'mime' => $mime, 'size' => strlen($bytes), 'dropboxPath' => $p];
}

/* ---------- documents des véhicules → Dropbox ---------- */
/* dossier du véhicule : lien « Dossier Dropbox » de la fiche (dropbox.com/home/…), sinon <dossier des véhicules>/<n°> - <plaque> - <modèle> */
function dbx_path_from_link($link) {
    if (!preg_match('#^https://(www\.)?dropbox\.com/home(/[^?\#]*)#i', (string) $link, $m)) return '';
    return dbx_norm_path(rawurldecode($m[2]));
}
function dbx_link_from_path($p) { return 'https://www.dropbox.com/home' . implode('/', array_map('rawurlencode', explode('/', $p))); }
function dbx_vehicle_folder($vid, &$v, &$changed) {
    $p = dbx_path_from_link($v['dropboxLink'] ?? '');
    if ($p !== '') return $p;
    $base = dbx_norm_path(dbk('dbx_veh_path'));
    if ($base === '') return '';
    $name = trim(preg_replace('/[\\\\\/:*?"<>|]+/', ' ', trim(($v['fleetNo'] ?? '') . ' - ' . ($v['plate'] ?? '') . ' - ' . ($v['model'] ?? ''), ' -')));
    if ($name === '') $name = $vid;
    $p = $base . '/' . $name;
    if (!dbx_in_scope($p)) return $p;          // refusé plus loin (hors des dossiers autorisés)
    dbx_mkdir($p);
    $v['dropboxLink'] = dbx_link_from_path($p); $changed = true;
    return $p;
}
/* anciens documents : marqués « anciens », ou remplacés par un plus récent du même type (même règle que currentDocs() de l'ERP) */
function dbx_old_ids($docs) {
    $by = []; $all = [];
    foreach ((array) $docs as $d) {
        if (empty($d['id'])) continue; $all[$d['id']] = 1;
        if (!empty($d['old'])) continue;
        $k = ($d['type'] ?? '') === 'autre' ? 'id:' . $d['id'] : (string) ($d['type'] ?? '');
        $key = (string) (($d['expires'] ?? '') ?: ($d['issued'] ?? ''));
        if (!isset($by[$k]) || $key > $by[$k][1]) $by[$k] = [$d['id'], $key];
    }
    foreach ($by as [$id]) unset($all[$id]);
    return $all;
}
/* appelé par write_doc : met en file les documents à copier ou à déplacer */
function dbx_on_write($coll, $id, $data) {
    if ($coll !== 'vehicles' || !dbx_connected() || dbk('dbx_veh_sync', '1') !== '1') return;
    $q = json_decode(dbk('dbx_queue', '[]'), true) ?: []; $n = count($q); $old = dbx_old_ids($data['docs'] ?? []);
    foreach ((array) ($data['docs'] ?? []) as $d) {
        if (empty($d['id']) || empty($d['file'])) continue;
        $need = empty($d['dbx']) ? (empty($d['dbxErr']) ? 'up' : null) : (isset($old[$d['id']]) && empty($d['dbxOld']) ? 'old' : null);
        if ($need && !in_array([$id, $d['id']], $q, true)) $q[] = [$id, $d['id']];
    }
    if (count($q) !== $n) kv_set('dbx_queue', json_encode(array_slice($q, -500)));
}
function dbx_doc_name($d) {
    $types = defined('AI_VDOC_TYPES') ? AI_VDOC_TYPES : [];
    $ext = strtolower(pathinfo((string) ($d['fileName'] ?? ''), PATHINFO_EXTENSION)) ?: (str_contains((string) ($d['mime'] ?? ''), 'pdf') ? 'pdf' : (str_contains((string) ($d['mime'] ?? ''), 'png') ? 'png' : 'jpg'));
    $parts = array_filter([($d['issued'] ?? '') ?: date('Y-m-d'), $types[$d['type'] ?? ''] ?? ($d['type'] ?? 'Document'), $d['name'] ?? '', $d['number'] ?? '']);
    $n = preg_replace('/[\\\\\/:*?"<>|]+/', ' ', implode(' - ', array_unique($parts)));
    return mb_substr(trim(preg_replace('/\s+/', ' ', $n)), 0, 150) . '.' . $ext;
}
function dbx_tick($budget = 20) {
    if (!dbx_connected()) return ['ok' => true, 'skipped' => true];
    $t0 = microtime(true);
    $lock = (int) dbk('dbx_lock', '0'); if ($lock && now_ms() - $lock < 90000) return ['ok' => true, 'busy' => true];
    $found = 0; try { $found = dbx_watch_check(); } catch (Throwable $e) {}
    $q = json_decode(dbk('dbx_queue', '[]'), true) ?: []; if (!$q) return ['ok' => true, 'done' => 0, 'left' => 0, 'found' => $found];
    kv_set('dbx_lock', (string) now_ms());
    $done = 0; $errs = [];
    try {
        while ($q && microtime(true) - $t0 < $budget) {
            [$vid, $did] = array_shift($q);
            $r = get_doc('vehicles', $vid); if (!$r || $r['deleted']) continue;
            $v = json_decode($r['data'], true) ?: []; $changed = false;
            $k = null; foreach ((array) ($v['docs'] ?? []) as $i => $d) if (($d['id'] ?? '') === $did) $k = $i;
            if ($k === null) continue;
            $d = $v['docs'][$k]; $isOld = isset(dbx_old_ids($v['docs'])[$did]);
            try {
                $folder = dbx_vehicle_folder($vid, $v, $changed);
                if ($folder === '') { $d['dbxErr'] = "Pas de dossier Dropbox : renseignez « Dossier Dropbox » dans la fiche ou le dossier des véhicules dans Paramètres."; }
                elseif (!dbx_in_scope($folder)) { $d['dbxErr'] = "Le dossier Dropbox de ce véhicule ($folder) n'est pas dans les dossiers autorisés."; }
                elseif (empty($d['dbx'])) {
                    $file = rtrim(cfg('upload_dir'), '/') . '/' . preg_replace('/[^a-f0-9]/', '', (string) $d['file']);
                    if (!is_file($file)) { $d['dbxErr'] = 'Fichier introuvable sur le serveur'; }
                    else {
                        $dir = $isOld ? $folder . '/' . DBX_OLD_DIR : $folder;
                        $res = dbx_upload($dir . '/' . dbx_doc_name($d), file_get_contents($file));
                        $d['dbx'] = $res['path_display'] ?? ''; $d['dbxAt'] = gmdate('c'); unset($d['dbxErr']); dbx_mine_add($d['dbx']);
                        if ($isOld) $d['dbxOld'] = true;
                    }
                } elseif ($isOld && empty($d['dbxOld'])) {
                    $to = $folder . '/' . DBX_OLD_DIR . '/' . basename($d['dbx']);
                    if (strcasecmp(dirname($d['dbx']), $folder . '/' . DBX_OLD_DIR) !== 0) {
                        $res = dbx_rpc('files/move_v2', ['from_path' => $d['dbx'], 'to_path' => $to, 'autorename' => true]);
                        $d['dbx'] = $res['metadata']['path_display'] ?? $to; dbx_mine_add($d['dbx']);
                    }
                    $d['dbxOld'] = true;
                }
            } catch (RuntimeException $e) {
                if ((int) $e->getCode() === 401 || (int) $e->getCode() >= 500 || (int) $e->getCode() === 429) { array_unshift($q, [$vid, $did]); $errs[] = $e->getMessage(); break; }
                $d['dbxErr'] = mb_substr($e->getMessage(), 0, 300);
                if (str_contains($e->getMessage(), 'not_found') && !empty($d['dbx'])) { $d['dbxOld'] = true; }   // déjà déplacé ou supprimé à la main
            }
            $v['docs'][$k] = $d; $done++;
            $r2 = get_doc('vehicles', $vid); $cur = $r2 && !$r2['deleted'] ? (json_decode($r2['data'], true) ?: []) : null;
            if ($cur !== null) {      // relu juste avant d'écrire : on ne touche qu'au document traité
                foreach ((array) ($cur['docs'] ?? []) as $i => $x) if (($x['id'] ?? '') === $did) {
                    $x = array_merge($x, array_intersect_key($d, array_flip(['dbx', 'dbxAt', 'dbxErr', 'dbxOld'])));
                    if (!isset($d['dbxErr'])) unset($x['dbxErr']);
                    $cur['docs'][$i] = $x;
                }
                if ($changed && empty($cur['dropboxLink'])) $cur['dropboxLink'] = $v['dropboxLink'];
                write_doc('vehicles', $vid, $cur, 'dropbox');
            }
        }
    } finally {
        $rest = json_decode(dbk('dbx_queue', '[]'), true) ?: [];          // ajouts pendant le traitement
        foreach ($rest as $x) if (!in_array($x, $q, true)) $q[] = $x;
        kv_set('dbx_queue', json_encode($q)); kv_set('dbx_lock', '0');
    }
    if ($errs) kv_set('dbx_error', $errs[0] . ' (' . gmdate('c') . ')'); elseif ($done) kv_set('dbx_error', '');
    return ['ok' => !$errs, 'done' => $done, 'left' => count($q), 'found' => $found] + ($errs ? ['error' => $errs[0]] : []);
}

function dbx_status($admin, $who = null) {
    $acc = json_decode(dbk('dbx_account', '{}'), true) ?: [];
    $s = ['appSet' => dbx_app_set(), 'connected' => dbx_connected(), 'account' => $acc ?: null, 'error' => dbk('dbx_error') ?: null,
          'vehPath' => dbk('dbx_veh_path') ?: null, 'vehSync' => dbk('dbx_veh_sync', '1') === '1', 'color' => dbk('dbx_color', 'green'),
          'queue' => count(json_decode(dbk('dbx_queue', '[]'), true) ?: []), 'team' => dbk('dbx_root') !== '', 'folders' => dbx_scope(),
          'watch' => array_map(fn($w) => ['path' => $w['path'], 'by' => $w['by'] ?? '', 'at' => $w['at'] ?? ''], dbx_watches())];
    if ($admin) { $s['redirectUri'] = dbx_redirect_uri(); $s['appKey'] = dbk('dbx_key') ?: null; }
    return $s;
}

/* retour de Dropbox après autorisation (navigateur, sans jeton de session : vérifié par « state ») */
function dropbox_public_routes($route, $parts, $method) {
    if ($route !== 'dropbox' || ($parts[1] ?? '') !== 'callback') return;
    $st = json_decode(dbk('dbx_state', '{}'), true) ?: [];
    $page = function ($ok, $msg) {
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta charset="utf-8"><title>Dropbox</title><body style="font-family:system-ui;padding:40px;max-width:560px;margin:auto">'
            . '<h2>' . ($ok ? 'Dropbox est relié à l\'ERP ✓' : 'Liaison Dropbox impossible') . '</h2><p>' . htmlspecialchars($msg) . '</p>'
            . '<p><a href="../../#parametres">Revenir à l\'ERP</a></p>' . ($ok ? '<script>setTimeout(()=>location.href="../../#parametres",1500)</script>' : '') . '</body>';
        exit;
    };
    if (!empty($_GET['error'])) $page(false, 'Autorisation refusée dans Dropbox (' . ($_GET['error_description'] ?? $_GET['error']) . ').');
    if (empty($st['state']) || !hash_equals($st['state'], (string) ($_GET['state'] ?? '')) || now_ms() - (int) ($st['at'] ?? 0) > 900000) $page(false, 'Lien expiré ou invalide : relancez « Connecter Dropbox » depuis Paramètres.');
    kv_set('dbx_state', '');
    [$code, $res] = dbx_http(dbx_url('oauth2', 'token'), ['Content-Type: application/x-www-form-urlencoded'], http_build_query([
        'grant_type' => 'authorization_code', 'code' => (string) ($_GET['code'] ?? ''), 'redirect_uri' => $st['redirect'] ?? dbx_redirect_uri(),
        'client_id' => dbk('dbx_key'), 'client_secret' => dbk('dbx_secret')]));
    $d = json_decode($res, true);
    if ($code >= 400 || empty($d['refresh_token'])) $page(false, 'Dropbox a refusé le code (' . ($d['error_description'] ?? $d['error'] ?? "HTTP $code") . '). Vérifiez la clé et le secret de l\'app.');
    kv_set('dbx_refresh', $d['refresh_token']); kv_set('dbx_at', $d['access_token'] ?? ''); kv_set('dbx_at_exp', (string) (time() + (int) ($d['expires_in'] ?? 14400)));
    kv_set('dbx_root', ''); kv_set('dbx_error', '');
    try {
        $a = dbx_rpc('users/get_current_account');
        $ri = $a['root_info'] ?? [];
        if (($ri['.tag'] ?? '') === 'team' && !empty($ri['root_namespace_id']) && $ri['root_namespace_id'] !== ($ri['home_namespace_id'] ?? '')) kv_set('dbx_root', (string) $ri['root_namespace_id']);
        kv_set('dbx_account', json_encode(['name' => $a['name']['display_name'] ?? '', 'email' => $a['email'] ?? '', 'team' => $a['team']['name'] ?? null], JSON_UNESCAPED_UNICODE));
    } catch (Throwable $e) { kv_set('dbx_account', json_encode(['name' => '?'])); }
    if (function_exists('log_event')) log_event('settings', 'company', 'update', 'Dropbox', 'Compte Dropbox relié', $st['by'] ?? 'ERP');
    $page(true, 'Vous pouvez revenir à l\'ERP.');
}

function dropbox_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'dropbox') return;
    $act = $parts[1] ?? ''; $admin = $role === 'admin';
    if (!is_office($role)) fail(403, 'Réservé au bureau et aux administrateurs');
    $b = $method === 'POST' ? body_json() : [];
    if ($act === 'status' && $method === 'GET') out(dbx_status($admin) + ['newCount' => dbx_connected() ? count(dbx_pending($who)) : 0]);
    if ($act === 'new' && $method === 'GET') { $p = dbx_pending($who); out(['total' => count($p), 'events' => array_slice($p, -30)]); }
    if ($act === 'new-ack' && $method === 'POST') {
        $up = (int) ($b['upTo'] ?? 0); $k = 'dbx_seen:' . dbx_uid($who);
        if ($up > (int) dbk($k, '0')) kv_set($k, (string) $up);
        if (!empty($b['analyze'])) log_event('settings', 'company', 'update', 'Dropbox', 'Nouveaux fichiers envoyés à Axel pour analyse');
        out(['ok' => true]);
    }
    if ($act === 'watch' && $method === 'POST') {
        if (!dbx_connected()) fail(400, "Dropbox n'est pas relié.");
        $p = dbx_norm_path($b['path'] ?? ''); if ($p === '' || !dbx_in_scope($p)) fail(403, 'Dossier non autorisé.');
        $ws = array_values(array_filter(dbx_watches(), fn($w) => mb_strtolower($w['path']) !== mb_strtolower($p)));
        if (!empty($b['on'])) {
            if (count($ws) >= 30) fail(400, '30 dossiers suivis au maximum.');
            try { $c = dbx_rpc('files/list_folder/get_latest_cursor', ['path' => $p, 'recursive' => false, 'include_deleted' => false]); }
            catch (RuntimeException $e) { fail(502, $e->getMessage()); }
            $ws[] = ['path' => $p, 'cursor' => $c['cursor'] ?? '', 'by' => preg_replace('/^(user|token):/', '', (string) ($GLOBALS['LOG_WHO'] ?? '')), 'at' => gmdate('c')];
        }
        kv_set('dbx_watch', json_encode($ws, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        log_event('settings', 'company', 'update', 'Dropbox', (!empty($b['on']) ? 'Suivi Assistant activé : ' : 'Suivi Assistant arrêté : ') . $p);
        out(['ok' => true, 'watch' => array_map(fn($w) => ['path' => $w['path'], 'by' => $w['by'] ?? '', 'at' => $w['at'] ?? ''], dbx_watches())]);
    }
    if ($act === 'tick' && $method === 'POST') out(dbx_tick());
    if (in_array($act, ['list', 'search', 'link'], true) && $method === 'POST') {
        if (!dbx_connected()) fail(400, "Dropbox n'est pas relié (Paramètres).");
        try {
            if ($act === 'list') out(['path' => dbx_norm_path($b['path'] ?? ''), 'entries' => dbx_list_scoped($b['path'] ?? '')]);
            if ($act === 'search') { $q = trim((string) ($b['query'] ?? '')); if (mb_strlen($q) < 2) fail(400, 'Recherche trop courte'); out(['entries' => dbx_search_scoped($q, $b['path'] ?? '')]); }
            dbx_guard($b['path'] ?? '');
            $r = dbx_rpc('files/get_temporary_link', ['path' => dbx_norm_path($b['path'] ?? '')]);
            out(['link' => $r['link'] ?? '', 'name' => $r['metadata']['name'] ?? '']);
        } catch (RuntimeException $e) { /* jamais 401 : ce code déconnecterait l'utilisateur de l'ERP */ fail($e->getCode() === 403 ? 403 : 502, $e->getMessage()); }
    }
    if (!$admin) fail(403, 'Réservé aux administrateurs');
    /* choix des dossiers : administrateur + code maître */
    if ($act === 'unlock' && $method === 'POST') { if (!dbx_connected()) fail(400, "Dropbox n'est pas relié."); out(['token' => dbx_unlock($who, $b['master'] ?? ''), 'minutes' => 15]); }
    if ($act === 'browse' && $method === 'POST') {
        dbx_unlocked($who, $b['token'] ?? '');
        try { out(['path' => dbx_norm_path($b['path'] ?? ''), 'entries' => array_values(array_filter(dbx_list($b['path'] ?? '', 3000), fn($e) => $e['folder']))]); }
        catch (RuntimeException $e) { fail(502, $e->getMessage()); }
    }
    if ($act === 'folders' && $method === 'POST') {
        dbx_unlocked($who, $b['token'] ?? '');
        $ps = []; foreach ((array) ($b['paths'] ?? []) as $p) { $p = dbx_norm_path($p); if ($p !== '') $ps[mb_strtolower($p)] = $p; }
        $ps = array_values($ps); usort($ps, fn($a, $c) => strlen($a) <=> strlen($c));
        $keep = []; foreach ($ps as $p) { $lp = mb_strtolower($p); foreach ($keep as $k) if (str_starts_with($lp, mb_strtolower($k) . '/')) continue 2; $keep[] = $p; }   // un sous-dossier d'un dossier déjà choisi est inutile
        if (count($keep) > 50) fail(400, '50 dossiers au maximum.');
        try { foreach ($keep as $p) { $m = dbx_rpc('files/get_metadata', ['path' => $p]); if (($m['.tag'] ?? '') !== 'folder') fail(400, "« $p » n'est pas un dossier."); } }
        catch (RuntimeException $e) { fail(400, $e->getMessage()); }
        sort($keep, SORT_NATURAL | SORT_FLAG_CASE);
        kv_set('dbx_folders', json_encode($keep, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); kv_set('dbx_unlock', '');
        log_event('settings', 'company', 'update', 'Dropbox', 'Dossiers Dropbox autorisés : ' . ($keep ? implode(', ', $keep) : 'aucun'));
        out(['ok' => true, 'status' => dbx_status(true)]);
    }
    if ($act === 'config' && $method === 'POST') {
        foreach (['appKey' => 'dbx_key', 'appSecret' => 'dbx_secret'] as $f => $k) { $v = trim((string) ($b[$f] ?? '')); if ($v !== '') { if (!preg_match('/^[A-Za-z0-9]{6,64}$/', $v)) fail(400, 'Clé ou secret invalide : copiez-les depuis la console Dropbox (onglet Settings).'); kv_set($k, $v); } }
        if (array_key_exists('vehPath', $b)) kv_set('dbx_veh_path', dbx_norm_path($b['vehPath']));
        if (array_key_exists('vehSync', $b)) kv_set('dbx_veh_sync', $b['vehSync'] ? '1' : '0');
        if (array_key_exists('color', $b)) { if (!in_array($b['color'], DBX_COLORS, true)) fail(400, 'Couleur non permise (le jaune est réservé aux dossiers manuels, le bleu aux dossiers système).'); kv_set('dbx_color', $b['color']); }
        out(['ok' => true, 'status' => dbx_status(true)]);
    }
    if ($act === 'auth-url' && $method === 'POST') {
        if (!dbx_app_set()) fail(400, "Saisissez d'abord la clé et le secret de l'app Dropbox.");
        $state = bin2hex(random_bytes(16)); $red = dbx_redirect_uri();
        kv_set('dbx_state', json_encode(['state' => $state, 'at' => now_ms(), 'redirect' => $red, 'by' => $GLOBALS['LOG_WHO'] ?? 'ERP']));
        out(['url' => 'https://www.dropbox.com/oauth2/authorize?' . http_build_query(['client_id' => dbk('dbx_key'), 'response_type' => 'code',
            'token_access_type' => 'offline', 'redirect_uri' => $red, 'state' => $state])]);
    }
    if ($act === 'disconnect' && $method === 'POST') {
        try { if (dbx_connected()) dbx_rpc('auth/token/revoke'); } catch (Throwable $e) {}
        foreach (['dbx_refresh', 'dbx_at', 'dbx_at_exp', 'dbx_root', 'dbx_account', 'dbx_error', 'dbx_queue', 'dbx_lock'] as $k) kv_set($k, '');
        if (!empty($b['forget'])) { kv_set('dbx_key', ''); kv_set('dbx_secret', ''); }
        log_event('settings', 'company', 'update', 'Dropbox', 'Compte Dropbox déconnecté');
        out(['ok' => true]);
    }
    if ($act === 'resync' && $method === 'POST') {   // recopier les documents des véhicules pas encore dans Dropbox
        $n = 0; foreach (od_coll_docs('vehicles') as $id => $v) {
            foreach ((array) ($v['docs'] ?? []) as $i => $d) if (!empty($d['dbxErr'])) { unset($v['docs'][$i]['dbxErr']); $fix = true; }
            if (!empty($fix)) { write_doc('vehicles', $id, $v, 'dropbox'); $fix = false; }
            dbx_on_write('vehicles', $id, $v); $n++;
        }
        out(['ok' => true, 'queue' => count(json_decode(dbk('dbx_queue', '[]'), true) ?: [])]);
    }
    fail(404, 'Route inconnue');
}
