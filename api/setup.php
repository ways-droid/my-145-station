<?php
// Configuration guidée de la connexion : serveur e-mail (SMTP ONE.COM), code maître, premier administrateur.
// Protégée par la clé d'accès de l'installation. Peut être rouverte pour changer un réglage.
require __DIR__ . '/lib.php';
require __DIR__ . '/auth.php';

function h($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function page($title, $body) {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Frame-Options: DENY');
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
       . '<title>' . h($title) . '</title><style>
body{font-family:system-ui,sans-serif;background:#f3f5f7;color:#222;margin:0;padding:24px}
.box{max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 12px #0001}
h1{font-size:22px;margin:0 0 6px;color:#7a1f2b}h2{font-size:16px;margin:26px 0 0;padding-top:16px;border-top:1px solid #eee}p{line-height:1.5}
label{display:block;font-weight:600;margin:14px 0 4px}input,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bbb;border-radius:8px;font-size:15px}
.row{display:grid;grid-template-columns:2fr 1fr;gap:12px}small{color:#666}
button{margin-top:22px;width:100%;padding:12px;border:0;border-radius:8px;background:#2e7d32;color:#fff;font-size:16px;cursor:pointer}
.err{background:#fdecea;color:#b71c1c;padding:12px;border-radius:8px}.ok{background:#e8f5e9;color:#1b5e20;padding:12px;border-radius:8px}.warn{background:#fff8e1;color:#7a5200;padding:12px;border-radius:8px}
</style></head><body><div class="box">' . $body . '</div></body></html>';
    exit;
}

$env = basename(dirname(__DIR__));
$key = (string) ($_POST['key'] ?? '');
$keyOk = false;
foreach ((array) cfg('api_tokens') as $t) if (strlen($t) >= 32 && $key !== '' && hash_equals($t, $key)) $keyOk = true;

try { auth_tables(); } catch (Throwable $e) { page('Erreur', '<h1>Base de données injoignable</h1><p class="err">' . h($e->getMessage()) . '</p>'); }

$cur = [
    'smtp_host' => kv_get('smtp_host', 'send.one.com'), 'smtp_port' => kv_get('smtp_port', '465'),
    'smtp_user' => kv_get('smtp_user', 'noreply@my-145-station.com'), 'smtp_from_name' => kv_get('smtp_from_name', 'my-145-station'),
];
$admin = db()->query("SELECT * FROM ways_users WHERE role = 'admin' ORDER BY created_at LIMIT 1")->fetch() ?: ['name' => '', 'email' => ''];
$hasPass = (bool) kv_get('smtp_pass');
$hasMaster = (bool) kv_get('master_hash');
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['step'] ?? '') === 'save') {
    if (!$keyOk) { usleep(500000); page('Clé refusée', '<h1>Clé d\'accès refusée</h1><p class="err">Utilisez la clé affichée par la page d\'installation.</p><p><a href="setup.php">Recommencer</a></p>'); }
    $in = fn($k) => trim((string) ($_POST[$k] ?? ''));
    $errs = [];
    foreach (['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from_name'] as $k) $cur[$k] = $in($k);
    $pass = (string) ($_POST['smtp_pass'] ?? '');
    $m1 = preg_replace('/\s/', '', (string) ($_POST['master1'] ?? '')); $m2 = preg_replace('/\s/', '', (string) ($_POST['master2'] ?? ''));
    $admin['name'] = $in('admin_name'); $admin['email'] = $in('admin_email');
    if ($cur['smtp_host'] === '' || !ctype_digit($cur['smtp_port'])) $errs[] = 'Serveur ou port SMTP invalide.';
    if (!filter_var($cur['smtp_user'], FILTER_VALIDATE_EMAIL)) $errs[] = 'L\'adresse d\'envoi doit être une adresse e-mail complète.';
    if ($pass === '' && !$hasPass) $errs[] = 'Indiquez le mot de passe de la boîte d\'envoi.';
    if ($m1 !== '' || !$hasMaster) {
        if (!preg_match('/^\d{8,}$/', $m1)) $errs[] = 'Le code maître doit contenir au moins 8 chiffres.';
        elseif ($m1 !== $m2) $errs[] = 'Les deux saisies du code maître ne correspondent pas.';
    }
    if ($admin['name'] === '' || !filter_var($admin['email'], FILTER_VALIDATE_EMAIL)) $errs[] = 'Indiquez le nom et l\'adresse e-mail de l\'administrateur.';
    if ($errs) $msg = '<p class="err">' . implode('<br>', array_map('h', $errs)) . '</p>';
    else {
        foreach (['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from_name'] as $k) kv_set($k, $cur[$k]);
        if ($pass !== '') kv_set('smtp_pass', $pass);
        if ($m1 !== '') kv_set('master_hash', password_hash($m1, PASSWORD_DEFAULT));
        $ex = find_user_by_name($admin['name']);
        if ($ex) db()->prepare("UPDATE ways_users SET email = ?, role = 'admin', active = 1 WHERE id = ?")->execute([$admin['email'], $ex['id']]);
        else db()->prepare("INSERT INTO ways_users (id, name, email, role, active, created_at) VALUES (?, ?, ?, 'admin', 1, ?)")->execute(['u' . bin2hex(random_bytes(6)), $admin['name'], $admin['email'], now_ms()]);
        $mail = '';
        try { send_mail($admin['email'], 'my-145-station : connexion configurée', "La connexion par code de my-145-station ($env) est configurée. Les codes de connexion seront envoyés depuis " . $cur['smtp_user'] . '.'); $mail = '<p class="ok">Un e-mail de test a été envoyé à ' . h($admin['email']) . '. Vérifiez votre boîte (et les indésirables).</p>'; }
        catch (Throwable $e) { $mail = '<p class="warn"><b>Réglages enregistrés, mais l\'e-mail de test n\'est pas parti :</b><br>' . h($e->getMessage()) . '<br>Vérifiez l\'adresse et le mot de passe de la boîte, puis enregistrez à nouveau. Le code maître permet déjà de se connecter.</p>'; }
        page('Connexion configurée', '<h1>Connexion configurée ✔</h1>' . $mail
            . '<p>Ouvrez l\'outil (<a href="../">' . h($env) . '</a>) : tapez votre nom (<b>' . h($admin['name']) . '</b>), puis le code reçu par e-mail ou votre code maître.</p>'
            . '<p>Ajoutez ensuite les autres utilisateurs dans <b>Paramètres → Utilisateurs</b>.</p>');
    }
}

page('Connexion de my-145-station', '<h1>Connexion de my-145-station</h1>'
    . '<p>Environnement : <b>' . h($env) . '</b>. ' . (login_configured() ? 'La connexion par code est <b>active</b> ; vous pouvez modifier les réglages ci-dessous.' : 'Cette page active la connexion par nom et code à 8 chiffres envoyé par e-mail.') . '</p>' . $msg
    . '<form method="post" autocomplete="off"><input type="hidden" name="step" value="save">'
    . '<label>Clé d\'accès de l\'installation</label><input name="key" type="password" required><small>Celle affichée par install.php. Elle autorise cette page.</small>'
    . '<h2>Boîte d\'envoi des codes</h2><small>Créez-la d\'abord dans le panneau ONE.COM → E-mail (par exemple noreply@my-145-station.com).</small>'
    . '<label>Adresse d\'envoi</label><input name="smtp_user" value="' . h($cur['smtp_user']) . '">'
    . '<label>Mot de passe de cette boîte</label><input name="smtp_pass" type="password" placeholder="' . ($hasPass ? 'inchangé si laissé vide' : '') . '"><small>Il reste sur le serveur.</small>'
    . '<div class="row"><div><label>Serveur SMTP</label><input name="smtp_host" value="' . h($cur['smtp_host']) . '"></div><div><label>Port</label><input name="smtp_port" value="' . h($cur['smtp_port']) . '"></div></div>'
    . '<label>Nom de l\'expéditeur</label><input name="smtp_from_name" value="' . h($cur['smtp_from_name']) . '">'
    . '<h2>Code maître</h2><small>Au moins 8 chiffres, connu de vous seul. Il remplace le code e-mail en cas de besoin. Il est stocké haché : personne ne peut le relire.</small>'
    . '<label>Code maître' . ($hasMaster ? ' <small>(laisser vide pour le garder)</small>' : '') . '</label><input name="master1" type="password" inputmode="numeric">'
    . '<label>Confirmer le code maître</label><input name="master2" type="password" inputmode="numeric">'
    . '<h2>Administrateur</h2>'
    . '<label>Nom (tel que tapé à la connexion)</label><input name="admin_name" value="' . h($admin['name']) . '">'
    . '<label>E-mail</label><input name="admin_email" value="' . h($admin['email']) . '">'
    . '<button>Enregistrer et envoyer un e-mail de test</button></form>');
