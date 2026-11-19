<?php
// API de données de my-145-station (outil de gestion de station Part 145)
//
//  GET    health                        état du serveur (sans clé)
//  GET    docs/{coll}                   tous les documents d'une collection
//  GET    docs/{coll}/{id}              un document
//  PUT    docs/{coll}/{id}              créer / remplacer          (corps = document JSON)
//  PATCH  docs/{coll}/{id}              modifier quelques champs   (fusion ; null = supprimer le champ)
//  DELETE docs/{coll}/{id}              supprimer
//  POST   delete                        suppression en lot { "coll": ["id", …] }
//  GET    changes?since=REV&colls=a,b   changements depuis une révision (mises à jour en direct)
//  POST   files (champ id facultatif : garde l'identifiant d'un fichier migré)
//  GET    auth/status · POST auth/request {name} · POST auth/verify {name, code} → session
//  GET    auth/me · POST auth/logout · auth/users (admin) · POST auth/test-mail (admin)
//  POST   import                        import en masse { "coll": { "id": {...}, ... }, ... }
//  GET    export                        export complet (sauvegarde)
//  POST   files                         envoi d'un fichier (multipart, champ "file")
//  GET    files/{id}                    lecture d'un fichier
//  DELETE files/{id}                    suppression d'un fichier

require __DIR__ . '/lib.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/perm.php';
require __DIR__ . '/assistant.php';
require __DIR__ . '/log.php';
require __DIR__ . '/sandbox.php';
require __DIR__ . '/dropbox.php';
require __DIR__ . '/whatsapp.php';
require __DIR__ . '/fr24.php';

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST' && isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
    $method = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']); // si l'hébergeur bloque PUT/PATCH/DELETE
}
$path  = trim($_GET['p'] ?? '', '/');
$parts = $path === '' ? [] : explode('/', $path);
$route = $parts[0] ?? '';

try {
    if ($route === 'health') {
        out(['ok' => true, 'rev' => current_rev(), 'time' => now_ms()]);
    }

    auth_public_routes($route, $parts, $method);    // auth/status, auth/request, auth/verify
    dropbox_public_routes($route, $parts, $method); // retour OAuth de Dropbox (vérifié par « state »)
    whatsapp_public_routes($route, $parts, $method); // webhook WhatsApp de Meta (vérifié par signature)
    $who  = auth_who();
    $user = $who['label'];
    $GLOBALS['LOG_WHO'] = $user;
    $GLOBALS['ME_UID'] = notes_uid($who); $GLOBALS['ME_NAME'] = (string) ($who['user']['name'] ?? ''); $GLOBALS['ME_EMAIL'] = mb_strtolower(trim((string) ($who['user']['email'] ?? '')));
    if (function_exists('log_tables')) log_tables();
    sbx_init();                                          // environnement de test de cette session ?
    sbx_guard($route, $parts, $method);   // hors transaction (MySQL valide implicitement toute transaction sur un CREATE)
    $role = role_of($who);
    $pdo  = db();
    auth_private_routes($route, $parts, $method, $who);
    assistant_routes($route, $parts, $method, $who, $role);
    log_routes($route, $parts, $method, $who, $role);
    sandbox_routes($route, $parts, $method, $who, $role);
    dropbox_routes($route, $parts, $method, $who, $role);
    whatsapp_routes($route, $parts, $method, $who, $role);
    fr24_routes($route, $parts, $method, $who, $role);

    // ---------- Documents ----------
    if ($route === 'docs') {
        $coll = check_coll($parts[1] ?? '');
        $id   = isset($parts[2]) ? check_id(rawurldecode($parts[2])) : null;

        if ($id === null && $method === 'GET') {
            $docs = [];
            foreach (sbx_rows($coll) as $r) { $o = perm_out($role, doc_out($coll, $r['id'], $r)); if ($o && $o['data'] !== null) $docs[] = $o; }
            out(['rev' => current_rev(), 'docs' => $docs]);
        }
        if ($id === null) fail(405, 'Méthode non permise');

        if ($method === 'GET') {
            $r = get_doc($coll, $id);
            $o = ($r && !$r['deleted']) ? perm_out($role, doc_out($coll, $id, $r)) : null;
            if (!$o || $o['data'] === null) fail(404, 'Document introuvable');
            out($o);
        }
        if ($method === 'PUT') {
            $data = body_json();
            $pdo->beginTransaction();
            $r = get_doc($coll, $id);
            $old = ($r && !$r['deleted']) ? (json_decode($r['data'], true) ?: []) : null;
            $data = perm_write($role, $coll, 'put', $old, $data, null, $id);
            $rev = write_doc($coll, $id, $data, $user);
            $pdo->commit();
            out(['ok' => true, 'rev' => $rev]);
        }
        if ($method === 'PATCH') {
            $patch = body_json();
            $pdo->beginTransaction();
            $r = get_doc($coll, $id);
            $old = ($r && !$r['deleted']) ? (json_decode($r['data'], true) ?: []) : null;
            $data = perm_write($role, $coll, 'patch', $old, deep_merge($old ?: [], $patch), $patch, $id);
            $rev = write_doc($coll, $id, $data, $user);
            $pdo->commit();
            out(['ok' => true, 'rev' => $rev]);
        }
        if ($method === 'DELETE') {
            $pdo->beginTransaction();
            $r = get_doc($coll, $id);
            $old = ($r && !$r['deleted']) ? (json_decode($r['data'], true) ?: []) : null;
            perm_write($role, $coll, 'delete', $old, [], null, $id);
            $rev = $r ? write_doc($coll, $id, [], $user, 1) : current_rev();
            $pdo->commit();
            out(['ok' => true, 'rev' => $rev]);
        }
        fail(405, 'Méthode non permise');
    }

    // ---------- Changements (polling) ----------
    if ($route === 'changes' && $method === 'GET') {
        $since = max(0, (int) ($_GET['since'] ?? 0));
        $colls = array_filter(explode(',', $_GET['colls'] ?? ''));
        foreach ($colls as $c) check_coll($c);
        $sql = 'SELECT coll, id, data, rev, updated_at, deleted FROM ways_docs WHERE rev > ?';
        $args = [$since];
        if ($colls) {
            $sql .= ' AND coll IN (' . implode(',', array_fill(0, count($colls), '?')) . ')';
            $args = array_merge($args, $colls);
        }
        $sql .= ' ORDER BY rev LIMIT 2000';
        $st = $pdo->prepare($sql);
        $st->execute($args);
        $changes = [];
        $max = $since;
        $n = 0;
        $rows = $st->fetchAll(); $n0 = count($rows);
        foreach ($rows as $r) $max = max($max, (int) $r['rev']);
        $rows = sbx_changes($since, $colls, $rows);
        foreach ($rows as $r) { $n++; $max = max($max, (int) $r['rev']); if ($o = perm_out($role, doc_out($r['coll'], $r['id'], $r))) $changes[] = $o; }
        $more = $n0 === 2000;
        out(['rev' => $more ? $max : max($max, current_rev()), 'more' => $more, 'changes' => $changes]);
    }

    // ---------- Suppression en lot : { "coll": ["id1", "id2", …], … } ----------
    if ($route === 'delete' && $method === 'POST') {
        $all = body_json();
        $n = 0;
        $pdo->beginTransaction();
        foreach ($all as $coll => $ids) {
            check_coll($coll);
            if (!is_array($ids)) fail(400, "Format invalide pour $coll");
            foreach ($ids as $id) {
                $id = check_id((string) $id);
                $r = get_doc($coll, $id);
                if ($r && !$r['deleted']) { perm_write($role, $coll, 'delete', json_decode($r['data'], true) ?: [], [], null, $id); write_doc($coll, $id, [], $user, 1); $n++; }
            }
        }
        $pdo->commit();
        out(['ok' => true, 'deleted' => $n, 'rev' => current_rev()]);
    }

    // ---------- Import / export ----------
    if ($route === 'import' && $method === 'POST') {
        if ($role !== 'admin') deny("Seul un administrateur peut importer des données.");
        $all = body_json();
        $n = 0;
        $pdo->beginTransaction();
        foreach ($all as $coll => $docs) {
            check_coll($coll);
            if (!is_array($docs)) fail(400, "Format invalide pour $coll");
            foreach ($docs as $key => $doc) {
                if (!is_array($doc)) continue;
                $id = array_is_list($docs) ? ($doc['id'] ?? null) : $key;
                if ($id === null) fail(400, "Document sans id dans $coll");
                unset($doc['id']);
                write_doc($coll, check_id((string) $id), $doc, $user);
                $n++;
            }
        }
        $pdo->commit();
        out(['ok' => true, 'imported' => $n, 'rev' => current_rev()]);
    }
    if ($route === 'export' && $method === 'GET') {
        if (!is_office($role)) deny();
        $res = [];
        foreach ($pdo->query('SELECT coll, id, data FROM ways_docs WHERE deleted = 0 ORDER BY coll, id') as $r) {
            $res[$r['coll']][$r['id']] = json_decode($r['data'], true);
        }
        header('Content-Disposition: attachment; filename="station-export-' . date('Ymd-His') . '.json"');
        out($res);
    }

    // ---------- Fichiers ----------
    if ($route === 'files') {
        $dir = cfg('upload_dir');
        if (!is_dir($dir)) mkdir($dir, 0750, true);
        $fid = $parts[1] ?? null;

        if ($fid === null && $method === 'POST') {
            $f = $_FILES['file'] ?? null;
            if (!$f || $f['error'] !== UPLOAD_ERR_OK) fail(400, 'Aucun fichier reçu');
            if ($f['size'] > cfg('max_upload_mb') * 1048576) fail(413, 'Fichier trop volumineux');
            // Migration : un fichier exporté de claude.ai garde son identifiant (32 caractères hexadécimaux)
            $want = $_POST['id'] ?? '';
            if ($want !== '') {
                if (!preg_match('/^[a-f0-9]{32}$/', $want)) fail(400, 'Identifiant invalide');
                $st = $pdo->prepare('SELECT * FROM ways_files WHERE id = ?');
                $st->execute([$want]);
                if ($old = $st->fetch()) {
                    if (is_file("$dir/$want")) out(['ok' => true, 'exists' => true, 'id' => $want, 'name' => $old['name'], 'mime' => $old['mime'], 'size' => (int) $old['size'], 'url' => "files/$want"]);
                    $pdo->prepare('DELETE FROM ways_files WHERE id = ?')->execute([$want]);
                }
                $id = $want;
            } else {
                $id = bin2hex(random_bytes(16));
            }
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: 'application/octet-stream';
            if (!move_uploaded_file($f['tmp_name'], "$dir/$id")) fail(500, 'Enregistrement impossible');
            $name = mb_substr(basename($f['name']), 0, 255);
            $pdo->prepare('INSERT INTO ways_files (id, name, mime, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$id, $name, $mime, $f['size'], now_ms(), $user]);
            out(['ok' => true, 'id' => $id, 'name' => $name, 'mime' => $mime, 'size' => $f['size'], 'url' => "files/$id"]);
        }
        if ($fid !== null) {
            if (!preg_match('/^[a-f0-9]{32}$/', $fid)) fail(400, 'Identifiant invalide');
            $st = $pdo->prepare('SELECT * FROM ways_files WHERE id = ?');
            $st->execute([$fid]);
            $meta = $st->fetch();
            if (!$meta || !is_file("$dir/$fid")) fail(404, 'Fichier introuvable');
            if ($method === 'GET') {
                $safe = ['image/jpeg','image/png','image/gif','image/webp','application/pdf'];
                $inline = in_array($meta['mime'], $safe, true) && !isset($_GET['download']);
                header('Content-Type: ' . ($inline ? $meta['mime'] : 'application/octet-stream'));
                header('Content-Length: ' . filesize("$dir/$fid"));
                header('X-Content-Type-Options: nosniff');
                header('Cache-Control: private, max-age=86400');
                header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename*=UTF-8\'\'' . rawurlencode($meta['name']));
                readfile("$dir/$fid");
                exit;
            }
            if ($method === 'DELETE') {
                @unlink("$dir/$fid");
                $pdo->prepare('DELETE FROM ways_files WHERE id = ?')->execute([$fid]);
                out(['ok' => true]);
            }
        }
        fail(405, 'Méthode non permise');
    }

    fail(404, 'Route inconnue');
} catch (PDOException $e) {
    if (db()->inTransaction()) db()->rollBack();
    error_log('WAYS API: ' . $e->getMessage());
    // détail technique pour les administrateurs (aide au diagnostic), message générique pour les autres
    $isAdm = isset($role) && $role === 'admin';
    fail(500, 'Erreur de base de données' . ($isAdm ? ' — ' . mb_substr(preg_replace('/\s+/', ' ', $e->getMessage()), 0, 240) : ''));
}
