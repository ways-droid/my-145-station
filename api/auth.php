<?php
// Connexion à l'ERP : nom → code à 8 chiffres envoyé par e-mail (ou code maître) → session de 8 heures.
// Inclus par index.php. Les identifiants SMTP et le code maître (haché) restent dans la base du serveur.

const SESSION_HOURS  = 8;
const CODE_MINUTES   = 10;
const CODE_ATTEMPTS  = 5;
const CODE_PER_15MIN = 5;
const ROLES = ['admin', 'bureau', 'terrain', 'garage', 'chauffeur'];
require_once __DIR__ . '/security.php';

function auth_tables() {
    static $done = false;
    if ($done) return;
    $pdo = db();
    $pdo->exec('CREATE TABLE IF NOT EXISTS ways_users (id VARCHAR(64) NOT NULL PRIMARY KEY, name VARCHAR(191) NOT NULL, email VARCHAR(191) NOT NULL, role VARCHAR(20) NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at BIGINT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS ways_codes (id VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL, code_hash VARCHAR(255) NOT NULL, expires BIGINT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS ways_sessions (token_hash VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL, expires BIGINT NOT NULL, created_at BIGINT NOT NULL, last_seen BIGINT NOT NULL, agent VARCHAR(255) NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS ways_kv (k VARCHAR(64) NOT NULL PRIMARY KEY, v TEXT NOT NULL)');
    $done = true;
}

function kv_get($k, $def = null) {
    auth_tables();
    $st = db()->prepare('SELECT v FROM ways_kv WHERE k = ?');
    $st->execute([$k]);
    $r = $st->fetch();
    return $r ? $r['v'] : $def;
}
function kv_set($k, $v) {
    if (strlen($k) > 64) throw new LengthException("Clé ways_kv trop longue : $k");   // colonne VARCHAR(64) en MySQL
    auth_tables();
    $pdo = db();
    $up = $pdo->prepare('UPDATE ways_kv SET v = ? WHERE k = ?');
    $up->execute([$v, $k]);
    if ($up->rowCount() === 0) {
        $st = $pdo->prepare('SELECT 1 FROM ways_kv WHERE k = ?'); $st->execute([$k]);
        if (!$st->fetch()) $pdo->prepare('INSERT INTO ways_kv (k, v) VALUES (?, ?)')->execute([$k, $v]);
    }
}

function login_configured() {
    if (!kv_get('master_hash') || !kv_get('smtp_host')) return false;
    $st = db()->query("SELECT COUNT(*) AS n FROM ways_users WHERE role = 'admin' AND active = 1");
    return ((int) $st->fetch()['n']) > 0;
}

// « Élise  Dupont » = « elise dupont »
function norm_name($s) {
    $s = trim(preg_replace('/\s+/u', ' ', (string) $s));
    $t = function_exists('transliterator_transliterate') ? transliterator_transliterate('Any-Latin; Latin-ASCII', $s) : iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    return strtolower($t !== false ? $t : $s);
}
function find_user_by_name($name) {
    $want = norm_name($name);
    if ($want === '') return null;
    foreach (db()->query('SELECT * FROM ways_users WHERE active = 1') as $u) if (norm_name($u['name']) === $want) return $u;
    return null;
}
function get_user($id) {
    $st = db()->prepare('SELECT * FROM ways_users WHERE id = ?'); $st->execute([$id]);
    return $st->fetch() ?: null;
}
function user_out($u) {
    return ['id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'active' => (int) $u['active'] === 1,
        'tfa' => tfa_on($u['id']), 'tfaRequired' => tfa_required($u), 'canPay' => can_pay_user($u), 'payRight' => in_array($u['id'], pay_users(), true)];
}
function mask_email($e) {
    [$a, $d] = array_pad(explode('@', $e, 2), 2, '');
    return mb_substr($a, 0, 1) . str_repeat('•', max(2, mb_strlen($a) - 1)) . '@' . $d;
}

function bearer_token() {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $t = stripos($h, 'Bearer ') === 0 ? trim(substr($h, 7)) : '';
    if ($t === '' && isset($_GET['token'])) $t = (string) $_GET['token'];   // liens <img> et téléchargements
    return $t;
}

// Session d'un utilisateur connecté (ou null)
function session_user($token) {
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    auth_tables();
    $st = db()->prepare('SELECT s.token_hash, s.expires, s.last_seen, s.created_at AS s_created, u.* FROM ways_sessions s JOIN ways_users u ON u.id = s.user_id WHERE s.token_hash = ?');
    $st->execute([hash('sha256', $token)]);
    $r = $st->fetch();
    if (!$r || $r['expires'] < now_ms() || (int) $r['active'] !== 1 || !tfa_session_ok($r)) return null;
    if (now_ms() - $r['last_seen'] > 3600000) db()->prepare('UPDATE ways_sessions SET last_seen = ? WHERE token_hash = ?')->execute([now_ms(), $r['token_hash']]);
    return $r;
}

function send_mail($to, $subject, $text, $html = null) {
    require_once __DIR__ . '/vendor/phpmailer/Exception.php';
    require_once __DIR__ . '/vendor/phpmailer/PHPMailer.php';
    require_once __DIR__ . '/vendor/phpmailer/SMTP.php';
    $m = new PHPMailer\PHPMailer\PHPMailer(true);
    $m->isSMTP();
    $m->Host = kv_get('smtp_host');
    $m->Port = (int) kv_get('smtp_port', '465');
    $m->SMTPAuth = true;
    $m->Username = kv_get('smtp_user');
    $m->Password = kv_get('smtp_pass');
    $m->SMTPSecure = $m->Port === 465 ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    $m->Timeout = 15;
    $m->CharSet = 'UTF-8';
    $m->setFrom(kv_get('smtp_user'), kv_get('smtp_from_name', 'ERP W.A.Y.S.'));
    $m->addAddress($to);
    $m->Subject = $subject;
    if ($html) { $m->isHTML(true); $m->Body = $html; $m->AltBody = $text; } else { $m->Body = $text; }
    $m->send();
}

function code_mail($name, $code) {
    $c = substr($code, 0, 4) . ' ' . substr($code, 4);
    $text = "Bonjour $name,\n\nVotre code de connexion à l'ERP W.A.Y.S. : $c\n\nIl est valable " . CODE_MINUTES . " minutes. Si vous n'avez pas demandé ce code, ignorez ce message.\n\nW.A.Y.S. SRL";
    $html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">Bonjour ' . htmlspecialchars($name) . ',<br><br>Votre code de connexion à l\'ERP W.A.Y.S. :'
        . '<div style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:16px 0;color:#7a1f2b">' . $c . '</div>'
        . 'Il est valable ' . CODE_MINUTES . ' minutes. Si vous n\'avez pas demandé ce code, ignorez ce message.<br><br>W.A.Y.S. SRL</div>';
    return [$text, $html];
}

function new_session($u) {
    tfa_epoch();   // fixe la date de mise en place du second facteur avant la première session (les plus anciennes sont fermées)
    $token = bin2hex(random_bytes(32));
    $t = now_ms();
    db()->prepare('INSERT INTO ways_sessions (token_hash, user_id, expires, created_at, last_seen, agent) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([hash('sha256', $token), $u['id'], $t + SESSION_HOURS * 3600000, $t, $t, mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 250)]);
    db()->prepare('DELETE FROM ways_sessions WHERE expires < ?')->execute([$t]);
    return $token;
}

// Routes publiques (avant contrôle d'accès)
function auth_public_routes($route, $parts, $method) {
    if ($route !== 'auth') return;
    auth_tables();
    $what = $parts[1] ?? '';
    if ($what === 'status' && $method === 'GET') out(['configured' => login_configured()]);

    if ($what === 'request' && $method === 'POST') {
        if (!login_configured()) fail(409, 'La connexion par code n\'est pas encore configurée.');
        $b = body_json();
        $u = find_user_by_name($b['name'] ?? '');
        if (!$u) fail(404, 'Nom inconnu. Vérifiez l\'orthographe ou demandez à l\'administrateur de vous ajouter.');
        $pdo = db();
        $st = $pdo->prepare('SELECT COUNT(*) AS n FROM ways_codes WHERE user_id = ? AND created_at > ?');
        $st->execute([$u['id'], now_ms() - 900000]);
        if ((int) $st->fetch()['n'] >= CODE_PER_15MIN) fail(429, 'Trop de demandes. Réessayez dans quelques minutes.');
        $code = str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
        $pdo->prepare('DELETE FROM ways_codes WHERE expires < ?')->execute([now_ms()]);
        $pdo->prepare('INSERT INTO ways_codes (id, user_id, code_hash, expires, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)')
            ->execute([bin2hex(random_bytes(8)), $u['id'], password_hash($code, PASSWORD_DEFAULT), now_ms() + CODE_MINUTES * 60000, now_ms()]);
        [$text, $html] = code_mail($u['name'], $code);
        try { send_mail($u['email'], 'Votre code de connexion ERP W.A.Y.S.', $text, $html); }
        catch (Throwable $e) { error_log('WAYS mail: ' . $e->getMessage()); fail(502, 'L\'e-mail n\'a pas pu être envoyé. Utilisez le code maître ou prévenez l\'administrateur.'); }
        out(['ok' => true, 'sentTo' => mask_email($u['email']), 'minutes' => CODE_MINUTES]);
    }

    if ($what === '2fa' && $method === 'POST') auth_step2(body_json());
    if ($what === 'verify' && $method === 'POST') {
        if (!login_configured()) fail(409, 'La connexion par code n\'est pas encore configurée.');
        sec_ip_guard();
        $b = body_json();
        $u = find_user_by_name($b['name'] ?? '');
        $code = preg_replace('/\D/', '', (string) ($b['code'] ?? ''));
        if (!$u || $code === '') fail(401, 'Nom ou code incorrect.');
        $pdo = db();
        // code maître (contournement réservé à l'administrateur ; remplace le code e-mail, pas le second facteur)
        $master = !sec_master_locked() && password_verify($code, (string) kv_get('master_hash'));
        $ok = $master;
        if (!$ok) {
            $st = $pdo->prepare('SELECT * FROM ways_codes WHERE user_id = ? AND expires > ? ORDER BY created_at DESC LIMIT 3');
            $st->execute([$u['id'], now_ms()]);
            foreach ($st->fetchAll() as $c) {
                if ($c['attempts'] >= CODE_ATTEMPTS) continue;
                if (password_verify($code, $c['code_hash'])) { $ok = true; $pdo->prepare('DELETE FROM ways_codes WHERE user_id = ?')->execute([$u['id']]); break; }
                $pdo->prepare('UPDATE ways_codes SET attempts = attempts + 1 WHERE id = ?')->execute([$c['id']]);
            }
        }
        if (!$ok) { sec_fail_note(); usleep(400000); fail(401, 'Code incorrect ou expiré.'); }
        auth_after_code($u, $master);
    }
}

// Routes réservées aux personnes connectées ; $who = ['kind' => 'session'|'key', 'user' => …]
function auth_private_routes($route, $parts, $method, $who) {
    if ($route !== 'auth') return;
    $what = $parts[1] ?? '';
    $isAdmin = $who['kind'] === 'key' || ($who['user']['role'] ?? '') === 'admin';

    if ($what === 'me' && $method === 'GET') {
        out(['user' => $who['kind'] === 'session' ? user_out($who['user']) : ['id' => '', 'name' => 'Clé d\'accès', 'email' => '', 'role' => 'admin', 'active' => true], 'kind' => $who['kind'], 'configured' => login_configured(),
             'sandbox' => function_exists('sbx_id') && sbx_id() ? ['since' => (int) $GLOBALS['SBX']['since']] : null,
             'session' => $who['kind'] === 'session' ? ['since' => (int) $who['user']['s_created'], 'expires' => (int) $who['user']['expires']] : null]);
    }
    if ($what === 'logout' && $method === 'POST') {
        if (function_exists('sbx_id') && sbx_id()) { db()->prepare('DELETE FROM ways_docs_sbx WHERE sbx = ?')->execute([sbx_id()]); kv_set($GLOBALS['SBX']['key'], ''); }   // quitter la session = quitter le test
        db()->prepare('DELETE FROM ways_sessions WHERE token_hash = ?')->execute([hash('sha256', bearer_token())]);
        out(['ok' => true]);
    }
    security_private_routes($route, $parts, $method, $who);
    if (!$isAdmin) fail(403, 'Réservé à l\'administrateur.');
    security_admin_routes($parts, $method, $who);

    if ($what === 'users') {
        $id = $parts[2] ?? null;
        if ($id === null && $method === 'GET') {
            $list = [];
            foreach (db()->query('SELECT * FROM ways_users ORDER BY name') as $u) $list[] = user_out($u);
            out(['users' => $list]);
        }
        if ($id !== null && ($method === 'PUT' || $method === 'PATCH')) {
            $id = check_id($id);
            $b = body_json();
            $cur = get_user($id);
            $name = trim(preg_replace('/\s+/u', ' ', (string) ($b['name'] ?? ($cur['name'] ?? ''))));
            $email = trim((string) ($b['email'] ?? ($cur['email'] ?? '')));
            $role = (string) ($b['role'] ?? ($cur['role'] ?? 'bureau'));
            $active = array_key_exists('active', $b) ? ($b['active'] ? 1 : 0) : (int) ($cur['active'] ?? 1);
            if ($name === '') fail(400, 'Le nom est obligatoire.');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'Adresse e-mail invalide.');
            if (!in_array($role, ROLES, true)) fail(400, 'Rôle inconnu.');
            foreach (db()->query('SELECT id, name FROM ways_users') as $o) if ($o['id'] !== $id && norm_name($o['name']) === norm_name($name)) fail(409, 'Un utilisateur porte déjà ce nom.');
            if ($cur && $cur['role'] === 'admin' && ($role !== 'admin' || !$active)) {
                $n = (int) db()->query("SELECT COUNT(*) AS n FROM ways_users WHERE role = 'admin' AND active = 1")->fetch()['n'];
                if ($n <= 1) fail(409, 'Il doit rester au moins un administrateur actif.');
            }
            if ($cur) db()->prepare('UPDATE ways_users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?')->execute([$name, $email, $role, $active, $id]);
            else db()->prepare('INSERT INTO ways_users (id, name, email, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?)')->execute([$id, $name, $email, $role, $active, now_ms()]);
            // droit de paiement : admin/bureau seulement ; donné ou retiré uniquement par une personne (pas une clé d'accès) dont le second facteur est actif
            $wantPay = array_key_exists('canPay', $b) ? !empty($b['canPay']) : in_array($id, pay_users(), true);
            if (!in_array($role, TFA_ROLES, true) || !$active) $wantPay = false;
            if ($wantPay !== in_array($id, pay_users(), true)) {
                if ($who['kind'] !== 'session' || !tfa_on($who['user']['id'])) fail(403, 'Seul un administrateur connecté avec son second facteur peut modifier le droit de paiement.');
                pay_users_set($id, $wantPay);
                if (function_exists('log_event')) log_event('auth', $id, 'update', $wantPay ? 'Droit « Initier des paiements » accordé' : 'Droit « Initier des paiements » retiré', null);
                sec_alert_admins($wantPay ? 'Droit de paiement accordé' : 'Droit de paiement retiré', "« $name » " . ($wantPay ? 'peut désormais préparer des paiements depuis l\'ERP' : 'ne peut plus préparer de paiements') . ' (modifié par ' . $who['user']['name'] . ').');
            }
            if (!$active || ($cur && $cur['role'] !== $role && in_array($role, TFA_ROLES, true) && !tfa_on($id))) db()->prepare('DELETE FROM ways_sessions WHERE user_id = ?')->execute([$id]);   // devient admin/bureau : reconnexion avec second facteur
            out(['ok' => true, 'user' => user_out(get_user($id))]);
        }
        if ($id !== null && $method === 'DELETE') {
            $cur = get_user(check_id($id));
            if (!$cur) out(['ok' => true]);
            if ($cur['role'] === 'admin') {
                $n = (int) db()->query("SELECT COUNT(*) AS n FROM ways_users WHERE role = 'admin' AND active = 1")->fetch()['n'];
                if ($n <= 1) fail(409, 'Il doit rester au moins un administrateur actif.');
            }
            db()->prepare('DELETE FROM ways_sessions WHERE user_id = ?')->execute([$cur['id']]);
            db()->prepare('DELETE FROM ways_users WHERE id = ?')->execute([$cur['id']]);
            tfa_set($cur['id'], null); pay_users_set($cur['id'], false);
            out(['ok' => true]);
        }
    }
    if ($what === 'test-mail' && $method === 'POST') {
        $b = body_json();
        $to = $b['to'] ?? ($who['user']['email'] ?? '');
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) fail(400, 'Adresse e-mail invalide.');
        try { send_mail($to, 'Test ERP W.A.Y.S.', "Ce message confirme que l'ERP W.A.Y.S. peut envoyer des e-mails."); }
        catch (Throwable $e) { fail(502, 'Envoi impossible : ' . $e->getMessage()); }
        out(['ok' => true]);
    }
    fail(404, 'Route inconnue');
}
