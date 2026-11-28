<?php
/* ======================= WhatsApp (API Cloud de Meta, numéro dédié à l'équipe) =======================
   - Un numéro de la station (SIM dédiée) relié en « API seule » à l'app Meta de l'entreprise : aucune application WhatsApp
     n'utilise ce numéro, l'outil et Muninn le surveillent. Identifiants (jeton, secret de l'app) dans ways_kv, jamais renvoyés.
   - Webhook public : api/whatsapp/webhook (vérification par jeton, signature X-Hub-Signature-256 du secret de l'app).
   - Équipe seulement : numéros reconnus = liste de Paramètres (personne inscrite dans l'outil).
     Muninn répond avec les droits de la personne ; la conversation est la même que dans le panneau Muninn (fil privé de la personne).
   - Numéros inconnus : réponse automatique (une fois par semaine et par numéro) ; messages gardés pour les administrateurs.
   - Réponse au webhook immédiate, traitement juste après (fastcgi_finish_request) ; file wa_queue reprise si besoin. */

const WA_GRAPH = 'https://graph.facebook.com/';
const WA_RATE = 30;              // messages par personne et par 10 minutes
const WA_UNKNOWN_TXT = "Bonjour, ce numéro WhatsApp est réservé à l'équipe de la station. Pour nous joindre, merci d'utiliser nos coordonnées habituelles.";

function wak($k, $d = '') { $v = kv_get($k); return $v === null || $v === '' ? (string) $d : (string) $v; }
function wa_configured() { return wak('wa_token') !== '' && wak('wa_phone_id') !== '' && wak('wa_secret') !== ''; }
function wa_ver() { return preg_match('/^v\d+\.\d+$/', wak('wa_ver')) ? wak('wa_ver') : 'v23.0'; }
function wa_base() { return wak('wa_base_url') !== '' ? rtrim(wak('wa_base_url'), '/') . '/' : WA_GRAPH; }   // faux Meta des tests
function wa_api_url($path) { return wa_base() . wa_ver() . '/' . ltrim($path, '/'); }
/* numéro au format international sans « + » (Belgique par défaut) : 0470 12 34 56 → 32470123456 */
function wa_norm($n) {
    $d = preg_replace('/\D/', '', (string) $n);
    if ($d === '') return '';
    if (str_starts_with($d, '00')) $d = substr($d, 2);
    elseif (str_starts_with($d, '0')) $d = '32' . substr($d, 1);
    return strlen($d) >= 8 ? $d : '';
}
function wa_http($method, $url, $body = null, $raw = false, $timeout = 30) {
    if (!preg_match('#^https?://#', $url)) $url = wa_api_url($url);   // chemin de l'API Graph (sinon : adresse complète, ex. fichier à télécharger)
    $ch = curl_init($url);
    $h = ['Authorization: Bearer ' . wak('wa_token')];
    if ($body !== null) $h[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $h, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 10]
        + ($body !== null ? [CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE)] : []));
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $ct = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) throw new RuntimeException("Meta injoignable : $err");
    if ($raw) { if ($st >= 400) throw new RuntimeException("Téléchargement refusé par Meta (HTTP $st)"); return [$res, $ct]; }
    $d = json_decode($res, true);
    if ($st >= 400 || isset($d['error'])) {
        $e = $d['error'] ?? []; $msg = trim(($e['message'] ?? "HTTP $st") . (isset($e['error_data']['details']) ? ' — ' . $e['error_data']['details'] : ''));
        $code = (int) ($e['code'] ?? 0);
        if ($code === 190) $msg .= " (jeton d'accès invalide ou expiré : saisissez un jeton permanent d'utilisateur système dans Paramètres)";
        elseif ($code === 131047) $msg .= ' (plus de 24 h depuis le dernier message de cette personne : seul un modèle approuvé peut être envoyé)';
        elseif ($code === 133010) $msg .= ' (numéro pas encore enregistré : bouton « Enregistrer le numéro » dans Paramètres)';
        throw new RuntimeException('WhatsApp : ' . $msg, $code ?: $st);
    }
    return $d ?: [];
}
/* texte de Muninn (markdown) → mise en forme WhatsApp */
function wa_fmt($t) {
    $t = preg_replace('/^#{1,6}\s*(.+)$/m', '*$1*', (string) $t);
    $t = preg_replace('/\*\*(.+?)\*\*/s', '*$1*', $t);
    $t = preg_replace('/\[([^\]]+)\]\(erp:[^)\s]+\)/', '$1', $t);   // liens internes de l'outil : seulement le libellé
    $t = preg_replace('/\[([^\]]+)\]\((https?:[^)]+)\)/', '$1 ($2)', $t);
    $t = preg_replace('/^\s*[-*]\s+/m', '• ', $t);
    return trim($t);
}
function wa_send_text($to, $text) {
    $text = wa_fmt($text); $parts = [];
    while (mb_strlen($text) > 3800) { $cut = mb_strrpos(mb_substr($text, 0, 3800), "\n") ?: 3800; $parts[] = mb_substr($text, 0, $cut); $text = ltrim(mb_substr($text, $cut)); }
    $parts[] = $text; $ids = [];
    foreach ($parts as $p) if (trim($p) !== '') {
        $r = wa_http('POST', wak('wa_phone_id') . '/messages', ['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', 'to' => $to, 'type' => 'text', 'text' => ['preview_url' => false, 'body' => $p]]);
        $ids[] = $r['messages'][0]['id'] ?? '';
    }
    wa_stat('out', count($ids));
    return $ids;
}
function wa_typing($msgId) {   // « lu » + « en train d'écrire… » pendant que Muninn travaille
    try { wa_http('POST', wak('wa_phone_id') . '/messages', ['messaging_product' => 'whatsapp', 'status' => 'read', 'message_id' => $msgId, 'typing_indicator' => ['type' => 'text']], false, 10); } catch (Throwable $e) {}
}
function wa_stat($k, $n = 1) { $s = json_decode(wak('wa_stats_' . gmdate('Y-m'), '{}'), true) ?: []; $s[$k] = ($s[$k] ?? 0) + $n; kv_set('wa_stats_' . gmdate('Y-m'), json_encode($s)); }

/* ---------- envoi d'un fichier (Muninn → la personne qui lui parle) ---------- */
/* numéro WhatsApp d'une personne de l'outil : liste de l'équipe */
function wa_number_of($uid) {
    $uid = (string) $uid; if ($uid === '') return '';
    foreach (wa_contacts() as $c) {
        if (($c['kind'] ?? '') === 'user' && ($c['ref'] ?? '') === $uid) return $c['num'];
    }
    return '';
}
function wa_upload_media($bytes, $mime, $name) {
    $ch = curl_init(wa_api_url(wak('wa_phone_id') . '/media'));
    $file = class_exists('CURLStringFile') ? new CURLStringFile($bytes, $name, $mime) : null;
    $tmp = null; if (!$file) { $tmp = tempnam(sys_get_temp_dir(), 'wa'); file_put_contents($tmp, $bytes); $file = new CURLFile($tmp, $mime, $name); }
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . wak('wa_token')],
        CURLOPT_POSTFIELDS => ['messaging_product' => 'whatsapp', 'type' => $mime, 'file' => $file], CURLOPT_TIMEOUT => 120, CURLOPT_CONNECTTIMEOUT => 10]);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch); if ($tmp) @unlink($tmp);
    if ($res === false) throw new RuntimeException("Meta injoignable : $err");
    $d = json_decode($res, true) ?: [];
    if ($st >= 400 || empty($d['id'])) throw new RuntimeException('WhatsApp : envoi du fichier refusé (' . ($d['error']['message'] ?? "HTTP $st") . ')');
    return $d['id'];
}
/* Muninn envoie un fichier de l'outil (fileId) ou de Dropbox (dropboxPath) sur le WhatsApp de la personne qui lui parle — à elle seule */
function wa_send_file_to_me($who, $in) {
    if (!wa_configured()) return ['error' => "WhatsApp n'est pas relié à l'outil."];
    if (function_exists('sbx_id') && sbx_id()) return ['error' => 'Environnement de test : envoi WhatsApp désactivé.'];
    $uid = (string) ($who['user']['id'] ?? ''); $num = wa_number_of($uid);
    if ($num === '') return ['error' => "Je ne connais pas ton numéro WhatsApp : un administrateur doit l'ajouter dans Paramètres → WhatsApp de l'équipe (« Qui peut écrire à Muninn »)."];
    $last = (int) wak('wa_in:' . $num, '0');
    if (time() - $last > 86000) return ['error' => "WhatsApp n'autorise l'envoi d'un fichier que dans les 24 h qui suivent ton dernier message au numéro de la station Envoie-moi d'abord un message sur WhatsApp (par ex. « envoie-moi … »), puis je pourrai te l'envoyer."];
    $fid = preg_replace('/[^a-f0-9]/', '', (string) ($in['fileId'] ?? '')); $path = trim((string) ($in['dropboxPath'] ?? ''));
    if ($fid !== '') {
        $st = db()->prepare('SELECT name, mime, size FROM ways_files WHERE id = ?'); $st->execute([$fid]); $meta = $st->fetch(PDO::FETCH_ASSOC);
        $f = rtrim(cfg('upload_dir'), '/') . "/$fid";
        if (!$meta || !is_file($f)) return ['error' => "Fichier introuvable dans l'outil ($fid)."];
        if ((int) $meta['size'] > 95 * 1048576) return ['error' => 'Fichier trop volumineux pour WhatsApp (100 Mo maximum).'];
        $bytes = file_get_contents($f); $name = (string) $meta['name']; $mime = (string) $meta['mime'] ?: 'application/octet-stream';
    } elseif ($path !== '') {
        if (!function_exists('dbx_connected') || !dbx_connected()) return ['error' => "Dropbox n'est pas relié à l'outil."];
        $p = dbx_norm_path($path); if (!dbx_in_scope($p)) return ['error' => "Ce fichier n'est pas dans les dossiers Dropbox autorisés."];
        $m = dbx_rpc('files/get_metadata', ['path' => $p]);
        if (($m['.tag'] ?? '') !== 'file') return ['error' => "Ce n'est pas un fichier."];
        if ((int) ($m['size'] ?? 0) > 95 * 1048576) return ['error' => 'Fichier trop volumineux pour WhatsApp (100 Mo maximum).'];
        [$bytes] = dbx_download($p); $name = basename($p);
        $mime = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                 'xls' => 'application/vnd.ms-excel', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'txt' => 'text/plain', 'csv' => 'text/plain'][strtolower(pathinfo($p, PATHINFO_EXTENSION))] ?? 'application/pdf';
    } else return ['error' => 'Indique fileId (fichier de l\'outil) ou dropboxPath (fichier Dropbox).'];
    $img = in_array($mime, ['image/jpeg', 'image/png'], true) && strlen($bytes) <= 5 * 1048576;
    try {
        $mid = wa_upload_media($bytes, $mime, $name);
        $cap = mb_substr(trim((string) ($in['caption'] ?? '')), 0, 1000);
        $msg = $img ? ['id' => $mid] + ($cap !== '' ? ['caption' => $cap] : []) : ['id' => $mid, 'filename' => $name] + ($cap !== '' ? ['caption' => $cap] : []);
        wa_http('POST', wak('wa_phone_id') . '/messages', ['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', 'to' => $num, 'type' => $img ? 'image' : 'document', $img ? 'image' : 'document' => $msg]);
        wa_stat('out');
    } catch (RuntimeException $e) { return ['error' => $e->getMessage()]; }
    if (function_exists('log_event')) log_event('settings', 'company', 'update', 'WhatsApp', "Fichier « $name » envoyé par Muninn sur WhatsApp");
    return ['ok' => true, 'sent' => $name, 'to' => 'ton WhatsApp (…' . substr($num, -3) . ')'];
}

/* ---------- message à un membre de l'équipe (demandé à Muninn) ----------
   WhatsApp n'accepte un texte libre que dans les 24 h qui suivent le dernier message de la personne au numéro
   de la station ; au-delà, seul un modèle approuvé par Meta peut partir : « message_equipe »
   (« Message de {{1}} via my-145-station : {{2}} »), créé depuis Paramètres → WhatsApp. */
const WA_TPL_NAME = 'message_equipe';
const WA_TPL_BODY = "Message de {{1}} via my-145-station :\n\n{{2}}\n\nRépondez ici pour parler à Muninn.";
function wa_tpl() { return ['name' => wak('wa_tpl_name', WA_TPL_NAME), 'lang' => wak('wa_tpl_lang', 'fr'), 'status' => wak('wa_tpl_status', ''), 'error' => wak('wa_tpl_error', '')]; }
function wa_window_open($num) { return time() - (int) wak('wa_in:' . $num, '0') < 86000; }
/* membres joignables : numéros de la liste de l'équipe */
function wa_team_targets() {
    $out = []; $seen = [];
    $names = []; foreach (db()->query('SELECT id, name, active FROM ways_users') as $u) $names[$u['id']] = (int) $u['active'] === 1 ? $u['name'] : null;
    foreach (wa_contacts() as $c) {
        $n = ($c['kind'] ?? '') === 'user' ? ($names[$c['ref'] ?? ''] ?? null) : ($c['name'] ?? '');
        if (!$n || isset($seen[$c['num']])) continue; $seen[$c['num']] = 1;
        $out[] = ['name' => $n, 'num' => $c['num'], 'kind' => $c['kind'], 'ref' => (string) $c['ref']];
    }
    return $out;
}
function wa_find_target($q) {
    $k = norm_name($q); if ($k === '') return [];
    $all = wa_team_targets(); $exact = array_values(array_filter($all, fn($t) => norm_name($t['name']) === $k));
    if ($exact) return $exact;
    $words = array_filter(explode(' ', $k));
    return array_values(array_filter($all, function ($t) use ($words) { $n = ' ' . norm_name($t['name']) . ' '; foreach ($words as $w) if (strpos($n, $w) === false) return false; return true; }));
}
function wa_send_team($fromName, $t, $text) {
    if (!wa_configured()) throw new RuntimeException("WhatsApp n'est pas relié à l'outil.");
    if (function_exists('sbx_id') && sbx_id()) throw new RuntimeException('Environnement de test : envoi WhatsApp désactivé.');
    $text = trim($text); $how = 'texte';
    if (wa_window_open($t['num'])) wa_send_text($t['num'], "💬 *Message de $fromName* (via Muninn) :\n\n$text");
    else {
        $tp = wa_tpl(); if ($tp['status'] !== 'APPROVED') throw new RuntimeException('Hors fenêtre de 24 h et modèle « ' . $tp['name'] . " » pas encore approuvé par Meta.");
        $param = mb_substr(preg_replace('/ {4,}/', '   ', preg_replace('/[\r\n\t]+/', ' · ', $text)), 0, 1000);   // Meta refuse les retours à la ligne dans les paramètres
        wa_http('POST', wak('wa_phone_id') . '/messages', ['messaging_product' => 'whatsapp', 'to' => $t['num'], 'type' => 'template', 'template' => ['name' => $tp['name'], 'language' => ['code' => $tp['lang']],
            'components' => [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => mb_substr($fromName, 0, 60)], ['type' => 'text', 'text' => $param]]]]]]);
        wa_stat('out'); $how = 'modèle';
    }
    kv_set('wa_relay:' . $t['num'], json_encode(['from' => $fromName, 'text' => mb_substr($text, 0, 1500), 'at' => time()], JSON_UNESCAPED_UNICODE));
    if (function_exists('log_event')) log_event('settings', 'company', 'update', 'WhatsApp', "Message de $fromName envoyé par Muninn à {$t['name']} ($how)");
    return $how;
}
/* message relayé récemment à cette personne (contexte pour Muninn quand elle répond) */
function wa_relay_for($uid) {
    $num = wa_number_of($uid); if ($num === '') return null;
    $r = json_decode(wak('wa_relay:' . $num, ''), true); return $r && time() - (int) $r['at'] < 3 * 86400 ? $r : null;
}
function wa_tpl_create() {
    if (wak('wa_waba') === '') throw new RuntimeException("Identifiant du compte WhatsApp Business (WABA ID) manquant.");
    $tp = wa_tpl();
    $r = wa_http('POST', wak('wa_waba') . '/message_templates', ['name' => $tp['name'], 'language' => $tp['lang'], 'category' => 'UTILITY',
        'components' => [['type' => 'BODY', 'text' => WA_TPL_BODY, 'example' => ['body_text' => [['Élise Dupont', "Peux-tu préparer le kit de roue pour le vol de 16 h ?"]]]]]]);
    kv_set('wa_tpl_status', (string) ($r['status'] ?? 'PENDING')); kv_set('wa_tpl_error', '');
}
function wa_tpl_check() {
    if (wak('wa_waba') === '') return;
    try { $r = wa_http('GET', wak('wa_waba') . '/message_templates?name=' . rawurlencode(wa_tpl()['name']) . '&fields=name,status,language,rejected_reason');
        $st = ''; foreach ((array) ($r['data'] ?? []) as $x) if (($x['name'] ?? '') === wa_tpl()['name'] && ($x['language'] ?? '') === wa_tpl()['lang']) { $st = (string) $x['status']; kv_set('wa_tpl_error', (string) ($x['rejected_reason'] ?? '') === 'NONE' ? '' : (string) ($x['rejected_reason'] ?? '')); }
        kv_set('wa_tpl_status', $st); }
    catch (Throwable $e) { kv_set('wa_tpl_error', $e->getMessage()); }
}

/* ---------- qui écrit ? ---------- */
function wa_contacts() { return array_values(array_filter((array) (json_decode(wak('wa_contacts', '[]'), true) ?: []), fn($c) => !empty($c['num']))); }
function wa_identify($num) {
    foreach (wa_contacts() as $c) if ($c['num'] === $num) {
        if (($c['kind'] ?? '') === 'user') {
            $st = db()->prepare('SELECT * FROM ways_users WHERE id = ? AND active = 1'); $st->execute([$c['ref'] ?? '']);
            if ($u = $st->fetch(PDO::FETCH_ASSOC)) return ['who' => ['kind' => 'session', 'user' => $u, 'label' => 'user:' . $u['name']], 'role' => $u['role'], 'name' => $u['name']];
            return null;   // compte désactivé
        }
    }
    return null;
}

/* ---------- réception ---------- */
function wa_webhook($method) {
    if ($method === 'GET') {   // vérification de l'adresse par Meta
        if (($_GET['hub_mode'] ?? '') === 'subscribe' && wak('wa_verify') !== '' && hash_equals(wak('wa_verify'), (string) ($_GET['hub_verify_token'] ?? ''))) {
            header('Content-Type: text/plain'); echo (string) ($_GET['hub_challenge'] ?? ''); exit;
        }
        http_response_code(403); echo 'forbidden'; exit;
    }
    $raw = file_get_contents('php://input');
    $sig = (string) ($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
    kv_set('wa_last_hook', (string) now_ms());   // Meta a bien appelé l'adresse (diagnostic)
    if (wak('wa_secret') === '' || !hash_equals('sha256=' . hash_hmac('sha256', $raw, wak('wa_secret')), $sig)) {
        kv_set('wa_error', "Meta a transmis un message, mais sa signature ne correspond pas : l'App secret saisi dans l'outil n'est pas celui de l'app Meta (" . date('d/m H:i') . ').');
        http_response_code(401); echo 'bad signature'; exit;
    }
    $d = json_decode($raw, true) ?: [];
    $q = json_decode(wak('wa_queue', '[]'), true) ?: []; $seen = array_flip(json_decode(wak('wa_seen', '[]'), true) ?: []); $new = 0;
    foreach ((array) ($d['entry'] ?? []) as $e) foreach ((array) ($e['changes'] ?? []) as $c) {
        $v = $c['value'] ?? []; if (($c['field'] ?? '') !== 'messages') continue;
        if (!empty($v['metadata']['phone_number_id']) && $v['metadata']['phone_number_id'] !== wak('wa_phone_id')) continue;   // autre numéro de l'app
        $names = []; foreach ((array) ($v['contacts'] ?? []) as $ct) $names[$ct['wa_id'] ?? ''] = $ct['profile']['name'] ?? '';
        foreach ((array) ($v['messages'] ?? []) as $m) {
            if (empty($m['id']) || isset($seen[$m['id']])) continue;     // Meta renvoie parfois deux fois le même message
            $seen[$m['id']] = 1; $m['_name'] = $names[$m['from'] ?? ''] ?? ''; $m['_at'] = now_ms(); $q[] = $m; $new++;
        }
        foreach ((array) ($v['statuses'] ?? []) as $s) if (($s['status'] ?? '') === 'failed') kv_set('wa_error', 'Envoi refusé par WhatsApp : ' . ($s['errors'][0]['title'] ?? $s['errors'][0]['message'] ?? 'erreur') . ' (' . gmdate('c') . ')');
    }
    if ($new) { kv_set('wa_queue', json_encode(array_slice($q, -200), JSON_UNESCAPED_UNICODE)); kv_set('wa_seen', json_encode(array_slice(array_keys($seen), -500))); kv_set('wa_last_in', (string) now_ms()); }
    /* répondre tout de suite à Meta, puis traiter (Muninn peut prendre une minute) */
    http_response_code(200); header('Content-Type: application/json'); $o = '{"ok":true}';
    header('Content-Length: ' . strlen($o)); header('Connection: close'); echo $o;
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); else { @ob_end_flush(); @flush(); }
    ignore_user_abort(true); @set_time_limit(300);
    if ($new && !getenv('WA_NO_INLINE')) wa_process();
    exit;
}
function wa_process($budget = 240) {
    if (!wa_configured()) return ['done' => 0];
    $lock = (int) wak('wa_lock', '0'); if ($lock && now_ms() - $lock < 300000) return ['busy' => true];
    kv_set('wa_lock', (string) now_ms()); $t0 = microtime(true); $done = 0;
    try {
        while (microtime(true) - $t0 < $budget) {
            $q = json_decode(wak('wa_queue', '[]'), true) ?: []; if (!$q) break;
            $m = array_shift($q); kv_set('wa_queue', json_encode($q, JSON_UNESCAPED_UNICODE));
            try { wa_handle($m); } catch (Throwable $e) { kv_set('wa_error', mb_substr($e->getMessage(), 0, 300) . ' (' . gmdate('c') . ')'); }
            $done++; kv_set('wa_lock', (string) now_ms());
        }
    } finally { kv_set('wa_lock', '0'); }
    return ['done' => $done, 'left' => count(json_decode(wak('wa_queue', '[]'), true) ?: [])];
}
function wa_handle($m) {
    $num = wa_norm($m['from'] ?? ''); if ($num === '') return;
    $type = (string) ($m['type'] ?? ''); wa_stat('in'); kv_set('wa_in:' . $num, (string) time());   // fenêtre de 24 h de WhatsApp
    $p = wa_identify($num);
    if (!$p) { wa_unknown($num, $m); return; }
    /* garde-fou : pas plus de WA_RATE messages en 10 minutes par personne */
    $rk = 'wa_rate:' . $num; $r = json_decode(wak($rk, '[]'), true) ?: []; $r = array_values(array_filter($r, fn($x) => $x > time() - 600)); $r[] = time(); kv_set($rk, json_encode($r));
    if (count($r) > WA_RATE) { if (count($r) === WA_RATE + 1) wa_send_text($num, "Je reçois beaucoup de messages : je fais une pause de quelques minutes."); return; }
    $text = ''; $files = [];
    if ($type === 'text') $text = (string) ($m['text']['body'] ?? '');
    elseif (in_array($type, ['image', 'document', 'video', 'sticker'], true)) {
        $med = $m[$type] ?? []; $text = (string) ($med['caption'] ?? '');
        if ($type === 'image' || $type === 'document') { try { $files[] = wa_media($med, $type); } catch (Throwable $e) { wa_send_text($num, "Je n'ai pas pu récupérer ton fichier (" . $e->getMessage() . "). Réessaie ou dépose-le dans l'outil."); return; } }
        else { wa_send_text($num, "Je ne sais pas lire ce type de fichier. Envoie plutôt une photo ou un PDF."); return; }
    } elseif ($type === 'audio') { wa_send_text($num, "Je ne peux pas écouter les messages vocaux : écris-moi ta demande 🙂"); return; }
    elseif ($type === 'location') { $l = $m['location'] ?? []; $text = 'Position partagée : ' . ($l['name'] ?? '') . ' ' . ($l['address'] ?? '') . ' (' . ($l['latitude'] ?? '') . ', ' . ($l['longitude'] ?? '') . ')'; }
    elseif ($type === 'interactive' || $type === 'button') $text = (string) ($m['button']['text'] ?? $m['interactive']['button_reply']['title'] ?? $m['interactive']['list_reply']['title'] ?? '');
    else return;   // réactions, etc.
    if (trim($text) === '' && !$files) return;
    if (!function_exists('ai_say_core') || aik('ai_key') === '') { wa_send_text($num, "Muninn n'est pas disponible pour le moment."); return; }
    wa_typing($m['id']);
    $GLOBALS['LOG_WHO'] = 'user:' . $p['name'] . ' (WhatsApp)'; $GLOBALS['AI_VIA'] = 'whatsapp';
    ai_tables();
    try {
        $res = ai_say_core($p['who'], $p['role'], ['text' => $text, 'files' => $files], 'whatsapp');
        for ($i = 0; !empty($res['more']) && $i < 6; $i++) { wa_typing($m['id']); $res = ai_say_core($p['who'], $p['role'], ['resume' => true], 'whatsapp'); }
    } catch (Throwable $e) { wa_send_text($num, "Désolé, je n'ai pas pu traiter ta demande : " . mb_substr($e->getMessage(), 0, 200)); return; }
    $reply = (string) ($res['reply'] ?? '');
    $acts = (array) ($res['actions'] ?? []);
    $done = array_filter($acts, fn($a) => in_array($a['op'] ?? '', ['create', 'update', 'deleted'], true));
    if ($done) $reply .= "\n\n_" . count($done) . ' modification' . (count($done) > 1 ? 's' : '') . " dans l'outil (annulable" . (count($done) > 1 ? 's' : '') . " depuis le panneau Muninn)._";
    wa_send_text($num, $reply !== '' ? $reply : 'OK');
}
function wa_media($med, $type) {
    $info = wa_http('GET', $med['id']);
    if ((int) ($info['file_size'] ?? 0) > 15 * 1048576) throw new RuntimeException('fichier de plus de 15 Mo');
    [$bytes, $ct] = wa_http('GET', $info['url'] ?? '', null, true, 60);
    $mime = (string) ($info['mime_type'] ?? $ct ?: 'application/octet-stream');
    $dir = rtrim(cfg('upload_dir'), '/'); if (!is_dir($dir)) mkdir($dir, 0750, true);
    $id = bin2hex(random_bytes(16)); file_put_contents("$dir/$id", $bytes);
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'][$mime] ?? 'bin';
    $name = mb_substr((string) ($med['filename'] ?? ($type === 'image' ? 'photo-whatsapp-' . date('Ymd-His') . ".$ext" : "document.$ext")), 0, 200);
    db()->prepare('INSERT INTO ways_files (id, name, mime, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')->execute([$id, $name, $mime, strlen($bytes), now_ms(), 'WhatsApp']);
    return ['id' => $id, 'name' => $name, 'mime' => $mime];
}
function wa_unknown($num, $m) {
    $u = json_decode(wak('wa_unknown', '[]'), true) ?: [];
    $u[] = ['num' => $num, 'name' => mb_substr((string) ($m['_name'] ?? ''), 0, 80), 'type' => $m['type'] ?? '', 'text' => mb_substr((string) ($m['text']['body'] ?? ($m['image']['caption'] ?? ($m['document']['filename'] ?? ''))), 0, 500), 'at' => gmdate('c')];
    kv_set('wa_unknown', json_encode(array_slice($u, -100), JSON_UNESCAPED_UNICODE));
    if (wak('wa_unknown_reply', '1') !== '1') return;
    $k = 'wa_ur:' . $num; if ((int) wak($k, '0') > time() - 7 * 86400) return;   // une réponse par semaine et par numéro
    kv_set($k, (string) time());
    try { wa_send_text($num, wak('wa_unknown_txt', WA_UNKNOWN_TXT)); } catch (Throwable $e) {}
}

function wa_status() {
    $s = json_decode(wak('wa_stats_' . gmdate('Y-m'), '{}'), true) ?: [];
    return ['configured' => wa_configured(), 'phoneId' => wak('wa_phone_id') ?: null, 'wabaId' => wak('wa_waba') ?: null, 'ver' => wa_ver(),
        'number' => json_decode(wak('wa_number', 'null'), true), 'tokenHint' => wak('wa_token') !== '' ? '…' . substr(wak('wa_token'), -4) : null, 'secretSet' => wak('wa_secret') !== '',
        'verify' => wak('wa_verify') ?: null, 'webhook' => wa_webhook_url(), 'contacts' => wa_contacts(),
        'unknownReply' => wak('wa_unknown_reply', '1') === '1', 'unknownTxt' => wak('wa_unknown_txt', WA_UNKNOWN_TXT), 'unknown' => array_reverse(json_decode(wak('wa_unknown', '[]'), true) ?: []),
        'error' => wak('wa_error') ?: null, 'lastIn' => (int) wak('wa_last_in', '0') ?: null, 'queue' => count(json_decode(wak('wa_queue', '[]'), true) ?: []),
        'stats' => ['in' => (int) ($s['in'] ?? 0), 'out' => (int) ($s['out'] ?? 0)], 'registered' => wak('wa_pin') !== '', 'sub' => wak('wa_sub') ?: null, 'lastHook' => (int) wak('wa_last_hook', '0') ?: null, 'tpl' => wa_tpl(), 'tplBody' => WA_TPL_BODY];
}
/* abonne l'app au compte WhatsApp Business : sans cela, Meta n'envoie aucun message entrant (idempotent) */
function wa_subscribe() {
    if (wak('wa_waba') === '') { kv_set('wa_sub', 'Identifiant du compte WhatsApp Business (WABA ID) manquant'); return; }
    try { wa_http('POST', wak('wa_waba') . '/subscribed_apps'); kv_set('wa_sub', 'ok'); }
    catch (Throwable $e) { kv_set('wa_sub', $e->getMessage()); }
}
function wa_webhook_url() {
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/api/', PHP_URL_PATH);
    $base = preg_match('#^(.*?/api)/#', $uri, $m) ? $m[1] : '/api';
    return 'https://' . $host . $base . '/whatsapp/webhook';
}

function whatsapp_public_routes($route, $parts, $method) {
    if ($route === 'whatsapp' && ($parts[1] ?? '') === 'webhook') { if (function_exists('log_tables')) log_tables(); wa_webhook($method); }
}
function whatsapp_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'whatsapp') return;
    $act = $parts[1] ?? '';
    if (!is_office($role)) fail(403, 'Réservé au bureau et aux administrateurs');
    if ($act === 'tick' && $method === 'POST') out(['ok' => true] + wa_process(60));   // filet de sécurité si le traitement après le webhook a été interrompu
    if ($role !== 'admin') fail(403, 'Réservé aux administrateurs');
    $b = $method === 'POST' ? body_json() : [];
    if ($act === 'status' && $method === 'GET') {
        if (wak('wa_verify') === '') kv_set('wa_verify', bin2hex(random_bytes(12)));
        $us = []; foreach (db()->query('SELECT id, name, role FROM ways_users WHERE active = 1 ORDER BY name') as $u) $us[] = $u;
        out(wa_status() + ['users' => $us]);
    }
    if ($act === 'config' && $method === 'POST') {
        foreach (['token' => 'wa_token', 'secret' => 'wa_secret'] as $f => $k) if (($v = trim((string) ($b[$f] ?? ''))) !== '') kv_set($k, mb_substr($v, 0, 1000));
        foreach (['phoneId' => 'wa_phone_id', 'wabaId' => 'wa_waba'] as $f => $k) if (array_key_exists($f, $b)) { $v = preg_replace('/\D/', '', (string) $b[$f]); kv_set($k, $v); }
        if (isset($b['ver']) && preg_match('/^v\d+\.\d+$/', $b['ver'])) kv_set('wa_ver', $b['ver']);
        if (!empty($b['pin'])) { if (!preg_match('/^\d{6}$/', (string) $b['pin'])) fail(400, 'Le code PIN doit compter 6 chiffres.'); kv_set('wa_pin', (string) $b['pin']); }   // PIN déjà choisi dans le tableau de bord Meta
        if (array_key_exists('unknownReply', $b)) kv_set('wa_unknown_reply', $b['unknownReply'] ? '1' : '0');
        if (isset($b['unknownTxt'])) kv_set('wa_unknown_txt', mb_substr(trim((string) $b['unknownTxt']), 0, 1000));
        if (!empty($b['disconnect'])) { foreach (['wa_token', 'wa_secret', 'wa_phone_id', 'wa_waba', 'wa_number', 'wa_pin', 'wa_error'] as $k) kv_set($k, ''); log_event('settings', 'company', 'update', 'WhatsApp', 'Liaison WhatsApp retirée'); }
        else log_event('settings', 'company', 'update', 'WhatsApp', 'Réglages WhatsApp modifiés');
        out(['ok' => true, 'status' => wa_status()]);
    }
    if ($act === 'contacts' && $method === 'POST') {
        $out = []; $seen = [];
        foreach ((array) ($b['contacts'] ?? []) as $c) {
            $n = wa_norm($c['num'] ?? ''); $k = ($c['kind'] ?? '') === 'user' ? $c['kind'] : '';
            if ($n === '' || $k === '' || empty($c['ref']) || isset($seen[$n])) continue; $seen[$n] = 1;
            $out[] = ['num' => $n, 'kind' => $k, 'ref' => (string) $c['ref'], 'name' => mb_substr((string) ($c['name'] ?? ''), 0, 100)];
        }
        kv_set('wa_contacts', json_encode($out, JSON_UNESCAPED_UNICODE));
        log_event('settings', 'company', 'update', 'WhatsApp', 'Numéros de l\'équipe : ' . count($out));
        out(['ok' => true, 'status' => wa_status()]);
    }
    if (!wa_configured()) fail(400, "Saisissez d'abord le jeton, l'identifiant du numéro et le secret de l'app.");
    if ($act === 'template' && $method === 'POST') {
        try { if (!empty($b['create'])) wa_tpl_create(); else wa_tpl_check(); }
        catch (Throwable $e) { if (stripos($e->getMessage(), 'already') !== false || stripos($e->getMessage(), 'existe') !== false) wa_tpl_check(); else fail(502, $e->getMessage()); }
        log_event('settings', 'company', 'update', 'WhatsApp', 'Modèle « ' . wa_tpl()['name'] . ' » : ' . (wa_tpl()['status'] ?: 'inconnu'));
        out(['ok' => true, 'status' => wa_status()]);
    }
    try {
        if ($act === 'test' && $method === 'POST') {
            $r = wa_http('GET', wak('wa_phone_id') . '?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type');
            kv_set('wa_number', json_encode(['display' => $r['display_phone_number'] ?? '', 'name' => $r['verified_name'] ?? '', 'quality' => $r['quality_rating'] ?? '', 'verification' => $r['code_verification_status'] ?? '', 'platform' => $r['platform_type'] ?? ''], JSON_UNESCAPED_UNICODE));
            kv_set('wa_error', '');
            wa_subscribe();
            out(['ok' => true, 'status' => wa_status()]);
        }
        if ($act === 'register' && $method === 'POST') {   // inscription du numéro sur l'API Cloud + code PIN (vérification en deux étapes)
            $pin = wak('wa_pin') ?: (string) random_int(100000, 999999);
            wa_http('POST', wak('wa_phone_id') . '/register', ['messaging_product' => 'whatsapp', 'pin' => $pin]);
            kv_set('wa_pin', $pin);
            wa_subscribe();
            log_event('settings', 'company', 'update', 'WhatsApp', 'Numéro WhatsApp enregistré sur l\'API');
            out(['ok' => true, 'status' => wa_status()]);
        }
        if ($act === 'send-test' && $method === 'POST') {
            $n = wa_norm($b['to'] ?? ''); if ($n === '') fail(400, 'Numéro invalide');
            wa_send_text($n, (string) ($b['text'] ?? 'Test de my-145-station ✓'));
            out(['ok' => true]);
        }
    } catch (RuntimeException $e) { fail(502, $e->getMessage()); }
    fail(404, 'Route inconnue');
}
