<?php
// Sécurité de la connexion : second facteur (TOTP, application d'authentification) et code maître.
//
//  • Admin et bureau : second facteur obligatoire. À la première connexion après la mise en place, l'utilisateur
//    l'active (QR code + 8 codes de secours). Les autres rôles peuvent l'activer (facultatif).
//  • Le code maître remplace seulement le code reçu par e-mail : il ne dispense jamais du second facteur.
//    Bloqué 1 heure après 5 échecs de connexion en 15 minutes (tous comptes confondus) ; chaque utilisation et
//    chaque blocage sont signalés par e-mail aux administrateurs.
//  • Limite par adresse IP : 10 échecs en 15 minutes → 15 minutes d'attente.
//  • Les sessions admin/bureau ouvertes avant l'activation du second facteur sont fermées (kv tfa_epoch).
//
// Données (ways_kv, jamais renvoyées au navigateur) :
//   tfa:<uid>        {"secret":…, "on":true, "at":ms, "rec":[hash…], "step":dernier pas utilisé}
//   tfa_pend:<hash>  ticket d'étape 2 (10 min) {"uid", "exp", "enroll": secret|null, "tries", "master"}
//   master_fail      [ms…] échecs récents · master_lock  ms de fin de blocage · ipfail:<ip> [ms…]
//
//  POST auth/2fa                 {ticket, code}  → session (+ codes de secours à l'activation)
//  GET  auth/tfa                 état pour soi
//  POST auth/tfa/recovery        {code}  nouveaux codes de secours (code de l'application exigé)
//  POST auth/tfa/enable          {}  → secret à scanner (rôles où il est facultatif) · POST auth/tfa/confirm {code}
//  POST auth/users/<id>/tfa-reset  (admin) l'utilisateur réactivera son second facteur à la prochaine connexion

const TFA_ROLES = ['admin', 'bureau'];
const TFA_TICKET_MIN = 10;
const MASTER_FAILS = 5;
const MASTER_LOCK_MIN = 60;
const IP_FAILS = 10;

function sec_now() { return now_ms(); }
function sec_ip() { return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '?'), 0, 45); }

/* ---------- base32 / TOTP (RFC 6238 : SHA-1, 6 chiffres, 30 s) ---------- */
function b32_enc($bin) {
    $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 5) as $ch) $out .= $a[bindec(str_pad($ch, 5, '0'))];
    return $out;
}
function b32_dec($s) {
    $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = '';
    foreach (str_split(strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $s))) as $c) $bits .= str_pad(decbin(strpos($a, $c)), 5, '0', STR_PAD_LEFT);
    $out = ''; foreach (str_split($bits, 8) as $b) if (strlen($b) === 8) $out .= chr(bindec($b));
    return $out;
}
function totp_at($secret, $step) {
    $h = hash_hmac('sha1', pack('N2', 0, $step), b32_dec($secret), true);
    $o = ord($h[19]) & 15;
    $n = ((ord($h[$o]) & 127) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string) ($n % 1000000), 6, '0', STR_PAD_LEFT);
}
// renvoie le pas accepté (fenêtre ±1, soit ±30 s) ou null ; $after = dernier pas déjà utilisé (anti-rejeu)
function totp_check($secret, $code, $after = 0) {
    $code = preg_replace('/\D/', '', (string) $code);
    if (strlen($code) !== 6) return null;
    $t = intdiv(time(), 30);
    for ($d = -1; $d <= 1; $d++) { $s = $t + $d; if ($s > $after && hash_equals(totp_at($secret, $s), $code)) return $s; }
    return null;
}

/* ---------- état du second facteur ---------- */
function tfa_get($uid) { return json_decode((string) kv_get('tfa:' . $uid, ''), true) ?: null; }
function tfa_set($uid, $v) { kv_set('tfa:' . $uid, $v ? json_encode($v) : ''); }
function tfa_on($uid) { $t = tfa_get($uid); return !empty($t['on']) && !empty($t['secret']); }
function tfa_required($u) { return in_array($u['role'] ?? '', TFA_ROLES, true); }
function tfa_epoch() {
    $e = (int) kv_get('tfa_epoch', '0');
    if (!$e) { $e = sec_now(); kv_set('tfa_epoch', (string) $e); }
    return $e;
}
// session encore valable ? (les sessions admin/bureau d'avant le second facteur sont fermées)
function tfa_session_ok($r) {
    if (!in_array($r['role'] ?? '', TFA_ROLES, true)) return true;
    return (int) $r['s_created'] >= tfa_epoch();
}
function tfa_new_recovery() {
    $plain = []; $hash = [];
    for ($i = 0; $i < 8; $i++) { $c = strtoupper(bin2hex(random_bytes(4))); $c = substr($c, 0, 4) . '-' . substr($c, 4); $plain[] = $c; $hash[] = hash('sha256', $c); }
    return [$plain, $hash];
}
function tfa_uri($u, $secret) {
    $label = rawurlencode('W.A.Y.S. ERP:' . $u['name']);
    return "otpauth://totp/$label?secret=$secret&issuer=" . rawurlencode('W.A.Y.S. ERP') . '&algorithm=SHA1&digits=6&period=30';
}
// vérifie un code de l'application (ou de secours si $allowRec) pour un utilisateur activé ; met à jour l'anti-rejeu
function tfa_verify_user($uid, $code, $allowRec = true) {
    $t = tfa_get($uid); if (!$t || empty($t['on'])) return false;
    $s = totp_check($t['secret'], $code, (int) ($t['step'] ?? 0));
    if ($s !== null) { $t['step'] = $s; tfa_set($uid, $t); return 'totp'; }
    if ($allowRec) {
        $c = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $code));
        if (strlen($c) === 8) {
            $h = hash('sha256', substr($c, 0, 4) . '-' . substr($c, 4));
            $i = array_search($h, $t['rec'] ?? [], true);
            if ($i !== false) { array_splice($t['rec'], $i, 1); tfa_set($uid, $t); return 'recovery'; }
        }
    }
    return false;
}

/* ---------- tickets d'étape 2 ---------- */
function tfa_pend_key($tk) { return 'tfa_pend:' . substr(hash('sha256', $tk), 0, 40); }   // clé ≤ 64 caractères (ways_kv.k)
function tfa_ticket($u, $master, $enroll) {
    $pdo = db(); $now = sec_now();
    foreach ($pdo->query("SELECT k, v FROM ways_kv WHERE k LIKE 'tfa_pend:%'")->fetchAll() as $r) { $v = json_decode($r['v'], true); if (!$v || ($v['exp'] ?? 0) < $now) $pdo->prepare('DELETE FROM ways_kv WHERE k = ?')->execute([$r['k']]); }
    $tk = bin2hex(random_bytes(24));
    kv_set(tfa_pend_key($tk), json_encode(['uid' => $u['id'], 'exp' => $now + TFA_TICKET_MIN * 60000, 'enroll' => $enroll, 'tries' => 0, 'master' => $master]));
    return $tk;
}
function tfa_ticket_get($tk) {
    if (!preg_match('/^[a-f0-9]{48}$/', (string) $tk)) return null;
    $k = tfa_pend_key($tk);
    $v = json_decode((string) kv_get($k, ''), true);
    if (!$v || ($v['exp'] ?? 0) < sec_now()) return null;
    $v['_k'] = $k; return $v;
}
function tfa_ticket_drop($v) { db()->prepare('DELETE FROM ways_kv WHERE k = ?')->execute([$v['_k']]); }

/* ---------- limites et code maître ---------- */
function sec_recent($k, $minutes) { $cut = sec_now() - $minutes * 60000; return array_values(array_filter(json_decode((string) kv_get($k, '[]'), true) ?: [], fn($t) => $t > $cut)); }
function sec_ip_guard() {
    if (count(sec_recent('ipfail:' . sec_ip(), 15)) >= IP_FAILS) fail(429, 'Trop d\'essais depuis cette connexion. Réessayez dans 15 minutes.');
}
function sec_fail_note() {
    $ip = sec_ip(); $l = sec_recent('ipfail:' . $ip, 15); $l[] = sec_now(); kv_set('ipfail:' . $ip, json_encode($l));
    if (sec_master_locked()) return;
    $m = sec_recent('master_fail', 15); $m[] = sec_now(); kv_set('master_fail', json_encode($m));
    if (count($m) >= MASTER_FAILS) {
        kv_set('master_lock', (string) (sec_now() + MASTER_LOCK_MIN * 60000)); kv_set('master_fail', '[]');
        sec_alert_admins('Code maître bloqué', "Après " . MASTER_FAILS . " échecs de connexion en 15 minutes, le code maître de l'ERP est bloqué pendant " . MASTER_LOCK_MIN . " minutes.\n\nDernier essai depuis l'adresse $ip.\n\nSi ce n'était pas vous ou votre équipe, quelqu'un essaie peut-être d'entrer dans l'ERP : changez le code maître (api/setup.php).");
    }
}
function sec_master_locked() { return (int) kv_get('master_lock', '0') > sec_now(); }
function sec_admin_emails() { $o = []; foreach (db()->query("SELECT email FROM ways_users WHERE role = 'admin' AND active = 1") as $r) if (filter_var($r['email'], FILTER_VALIDATE_EMAIL)) $o[] = $r['email']; return array_unique($o); }
function sec_alert_admins($subject, $text) {
    if (function_exists('sbx_id') && sbx_id()) return;
    foreach (sec_admin_emails() as $to) { try { send_mail($to, 'ERP W.A.Y.S. · ' . $subject, $text . "\n\n— " . gmdate('d/m/Y H:i') . ' UTC'); } catch (Throwable $e) { error_log('WAYS alerte: ' . $e->getMessage()); } }
    if (function_exists('log_event')) log_event('auth', 'security', 'alert', $subject, null, 'ERP');
}

/* ---------- étape 1 réussie : session directe ou étape 2 ---------- */
function auth_after_code($u, $master) {
    if ($master) sec_alert_admins('Connexion avec le code maître', "Le code maître vient d'être utilisé pour entrer dans le compte de « {$u['name']} » (adresse " . sec_ip() . ', ' . mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 120) . ").\n\nSi ce n'était pas vous, changez le code maître (api/setup.php) et fermez les sessions de ce compte en le désactivant puis réactivant.");
    $reset = (string) (cfg('tfa_reset') ?? '');   // secours via config.php (accès FTP) : nom de l'utilisateur dont le 2e facteur est remis à zéro
    if ($reset !== '' && norm_name($reset) === norm_name($u['name'])) tfa_set($u['id'], null);
    if (tfa_on($u['id'])) out(['ok' => true, 'tfa' => 'verify', 'ticket' => tfa_ticket($u, $master, null)]);
    if (tfa_required($u)) {
        $secret = b32_enc(random_bytes(20));
        out(['ok' => true, 'tfa' => 'enroll', 'ticket' => tfa_ticket($u, $master, $secret), 'secret' => $secret, 'uri' => tfa_uri($u, $secret)]);
    }
    if (function_exists('log_event')) log_event('auth', $u['id'], 'login', 'Connexion à l\'ERP', null, $u['name']);
    out(['ok' => true, 'token' => new_session($u), 'user' => user_out($u), 'hours' => SESSION_HOURS]);
}
function auth_step2($b) {
    sec_ip_guard();
    $v = tfa_ticket_get($b['ticket'] ?? '');
    if (!$v) fail(401, 'Étape expirée : recommencez la connexion.');
    $u = get_user($v['uid']); if (!$u || (int) $u['active'] !== 1) fail(401, 'Compte inactif.');
    $code = (string) ($b['code'] ?? '');
    $rec = null; $how = '';
    if ($v['enroll']) {
        $s = totp_check($v['enroll'], $code);
        if ($s !== null) { [$plain, $hash] = tfa_new_recovery(); tfa_set($u['id'], ['secret' => $v['enroll'], 'on' => true, 'at' => sec_now(), 'rec' => $hash, 'step' => $s]); $rec = $plain; $how = 'activation'; }
    } else $how = tfa_verify_user($u['id'], $code);
    if (!$how) {
        $v['tries']++; $k = $v['_k']; unset($v['_k']);
        if ($v['tries'] >= 5) { db()->prepare('DELETE FROM ways_kv WHERE k = ?')->execute([$k]); } else kv_set($k, json_encode($v));
        $l = sec_recent('ipfail:' . sec_ip(), 15); $l[] = sec_now(); kv_set('ipfail:' . sec_ip(), json_encode($l));
        usleep(400000);
        fail(401, $v['tries'] >= 5 ? 'Trop d\'essais : recommencez la connexion.' : 'Code de l\'application incorrect. Vérifiez que l\'heure du téléphone est à jour.');
    }
    tfa_ticket_drop($v);
    if (function_exists('log_event')) log_event('auth', $u['id'], 'login', $how === 'recovery' ? 'Connexion à l\'ERP (code de secours)' : ($how === 'activation' ? 'Connexion à l\'ERP · second facteur activé' : 'Connexion à l\'ERP'), null, $u['name']);
    if ($how === 'recovery') sec_alert_admins('Code de secours utilisé', "« {$u['name']} » s'est connecté avec un code de secours du second facteur. Il lui en reste " . count(tfa_get($u['id'])['rec'] ?? []) . '.');
    $o = ['ok' => true, 'token' => new_session($u), 'user' => user_out($u), 'hours' => SESSION_HOURS];
    if ($rec) $o['recovery'] = $rec;
    out($o);
}

/* ---------- routes pour soi et pour l'administrateur ---------- */
function tfa_state_out($uid) { $t = tfa_get($uid); return ['on' => !empty($t['on']), 'since' => (int) ($t['at'] ?? 0) ?: null, 'recoveryLeft' => count($t['rec'] ?? [])]; }
function security_private_routes($route, $parts, $method, $who) {
    if ($route !== 'auth' || ($parts[1] ?? '') !== 'tfa') return;
    if ($who['kind'] !== 'session') fail(403, 'Réservé aux sessions nominatives.');
    $u = $who['user']; $what = $parts[2] ?? '';
    if ($what === '' && $method === 'GET') out(tfa_state_out($u['id']) + ['required' => tfa_required($u)]);
    if ($what === 'recovery' && $method === 'POST') {
        $b = body_json();
        if (tfa_verify_user($u['id'], $b['code'] ?? '', false) !== 'totp') fail(401, 'Code de l\'application incorrect.');
        [$plain, $hash] = tfa_new_recovery(); $t = tfa_get($u['id']); $t['rec'] = $hash; tfa_set($u['id'], $t);
        out(['ok' => true, 'recovery' => $plain]);
    }
    if ($what === 'enable' && $method === 'POST') {
        if (tfa_on($u['id'])) fail(409, 'Le second facteur est déjà actif.');
        $secret = b32_enc(random_bytes(20)); kv_set('tfa_new:' . $u['id'], json_encode(['secret' => $secret, 'exp' => sec_now() + 600000]));
        out(['ok' => true, 'secret' => $secret, 'uri' => tfa_uri($u, $secret)]);
    }
    if ($what === 'confirm' && $method === 'POST') {
        $n = json_decode((string) kv_get('tfa_new:' . $u['id'], ''), true);
        if (!$n || $n['exp'] < sec_now()) fail(410, 'Délai dépassé : recommencez.');
        $s = totp_check($n['secret'], body_json()['code'] ?? '');
        if ($s === null) fail(401, 'Code de l\'application incorrect.');
        [$plain, $hash] = tfa_new_recovery(); tfa_set($u['id'], ['secret' => $n['secret'], 'on' => true, 'at' => sec_now(), 'rec' => $hash, 'step' => $s]); kv_set('tfa_new:' . $u['id'], '');
        if (function_exists('log_event')) log_event('auth', $u['id'], 'update', 'Second facteur activé', null, $u['name']);
        out(['ok' => true, 'recovery' => $plain]);
    }
    fail(404, 'Route inconnue');
}
function security_admin_routes($parts, $method, $who) {
    // auth/users/<id>/tfa-reset
    if (($parts[1] ?? '') === 'users' && ($parts[3] ?? '') === 'tfa-reset' && $method === 'POST') {
        $u = get_user(check_id($parts[2] ?? '')); if (!$u) fail(404, 'Utilisateur introuvable');
        tfa_set($u['id'], null); pay_users_set($u['id'], false);
        db()->prepare('DELETE FROM ways_sessions WHERE user_id = ?')->execute([$u['id']]);
        if (function_exists('log_event')) log_event('auth', $u['id'], 'update', 'Second facteur réinitialisé par un administrateur', null);
        sec_alert_admins('Second facteur réinitialisé', "Le second facteur de « {$u['name']} » a été réinitialisé par " . ($who['user']['name'] ?? 'une clé d\'accès') . ". Il devra le réactiver à sa prochaine connexion. Son droit de paiement a été retiré.");
        out(['ok' => true]);
    }
}

/* ---------- droit « Initier des paiements » (kv pay_users : liste d'identifiants) ---------- */
function pay_users() { return json_decode((string) kv_get('pay_users', '[]'), true) ?: []; }
function pay_users_set($uid, $on) {
    $l = array_values(array_diff(pay_users(), [$uid])); if ($on) $l[] = $uid;
    kv_set('pay_users', json_encode($l));
}
function can_pay_user($u) { return $u && in_array($u['role'] ?? '', TFA_ROLES, true) && (int) $u['active'] === 1 && in_array($u['id'], pay_users(), true) && tfa_on($u['id']); }
