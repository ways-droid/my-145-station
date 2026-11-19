<?php
// Installation guidée de l'API my-145-station : crée les tables, config.php et la clé d'accès.
// Ne fonctionne qu'une fois : dès que config.php existe, cette page se bloque.

$configFile = __DIR__ . '/config.php';
$envName    = basename(dirname(__DIR__));            // nom du dossier, ex. « test »
$uploadDir  = __DIR__ . '/../../../httpd.private/st-uploads-' . $envName;

function h($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }

function page($title, $body) {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
       . '<title>' . h($title) . '</title><style>
body{font-family:system-ui,sans-serif;background:#f3f5f7;color:#222;margin:0;padding:24px}
.box{max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 12px #0001}
h1{font-size:22px;margin:0 0 6px;color:#7a1f2b}p{line-height:1.5}label{display:block;font-weight:600;margin:16px 0 4px}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bbb;border-radius:8px;font-size:15px}
small{color:#666}button{margin-top:22px;width:100%;padding:12px;border:0;border-radius:8px;background:#2e7d32;color:#fff;font-size:16px;cursor:pointer}
.err{background:#fdecea;color:#b71c1c;padding:12px;border-radius:8px}.ok{background:#e8f5e9;color:#1b5e20;padding:12px;border-radius:8px}
.key{font-family:monospace;font-size:14px;background:#fff8e1;border:2px dashed #f9a825;padding:12px;border-radius:8px;word-break:break-all}
</style></head><body><div class="box">' . $body . '</div></body></html>';
    exit;
}

if (is_file($configFile)) {
    page('Déjà installé', '<h1>Déjà installé ✔</h1><p class="ok">L\'API de <b>' . h($envName) . '</b> est configurée. Cette page est désactivée.</p>'
        . '<p><a href="health">Vérifier l\'état de l\'API</a></p>');
}

$err = '';
$v = ['host' => '', 'name' => '', 'user' => ''];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach ($v as $k => $_) $v[$k] = trim($_POST[$k] ?? '');
    $pass = $_POST['pass'] ?? '';
    if (in_array('', $v, true) || $pass === '') {
        $err = 'Merci de remplir les quatre champs.';
    } else {
        try {
            $dsn = 'mysql:host=' . $v['host'] . ';dbname=' . $v['name'] . ';charset=utf8mb4';
            $pdo = new PDO($dsn, $v['user'], $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 10]);

            // Tables
            $sql = preg_replace('/^--.*$/m', '', file_get_contents(__DIR__ . '/schema.sql'));
            foreach (array_filter(array_map('trim', explode(';', $sql))) as $q) $pdo->exec($q);

            // Dossier des fichiers (privé)
            if (!is_dir($uploadDir)) @mkdir($uploadDir, 0750, true);
            if (!is_dir($uploadDir)) $uploadDir = __DIR__ . '/../uploads';   // repli
            if (!is_dir($uploadDir)) @mkdir($uploadDir, 0750, true);
            @file_put_contents($uploadDir . '/.htaccess', "Require all denied\n");

            // config.php
            $sample = require __DIR__ . '/config.sample.php';
            $token  = bin2hex(random_bytes(32));
            $cfg = [
                'dsn' => $dsn, 'db_user' => $v['user'], 'db_pass' => $pass,
                'api_tokens' => [$token],
                'upload_dir' => realpath($uploadDir) ?: $uploadDir,
                'max_upload_mb' => 20,
                'collections' => $sample['collections'],
            ];
            $php = "<?php\n// Créé par install.php le " . date('d/m/Y H:i') . " — ne pas partager.\nreturn " . var_export($cfg, true) . ";\n";
            if (@file_put_contents($configFile, $php, LOCK_EX) === false) throw new RuntimeException('Impossible d\'écrire config.php (droits du dossier).');
            @chmod($configFile, 0640);

            page('Installation réussie', '<h1>Installation réussie ✔</h1>'
                . '<p class="ok">Les tables sont créées et l\'API de <b>' . h($envName) . '</b> est prête.</p>'
                . '<p><b>Voici ta clé d\'accès provisoire.</b> Copie-la dans ton gestionnaire de mots de passe (nom : « my-145-station ' . h($envName) . ' »). '
                . 'Elle ne sera plus jamais affichée. Ne l\'envoie à personne, ni dans le chat.</p>'
                . '<p class="key">' . h($token) . '</p>'
                . '<p>Ensuite : <a href="health">vérifier l\'API</a> — tu dois voir <code>"ok":true</code>.</p>');
        } catch (PDOException $e) {
            $m = $e->getMessage();
            if (stripos($m, 'Access denied') !== false)          $err = 'Connexion refusée : vérifie l\'utilisateur et le mot de passe.';
            elseif (stripos($m, 'Unknown database') !== false)   $err = 'Base introuvable : vérifie le nom de la base.';
            elseif (preg_match('/getaddrinfo|Name or service|Connection refused|timed out/i', $m)) $err = 'Serveur MySQL introuvable : vérifie l\'hôte.';
            else $err = 'Erreur MySQL : ' . $m;
        } catch (Throwable $e) {
            $err = $e->getMessage();
        }
    }
}

page('Installation my-145-station', '<h1>Installation de my-145-station</h1>'
    . '<p>Environnement : <b>' . h($envName) . '</b>. Copie ici les informations de ta base MySQL, telles qu\'affichées dans le panneau de l\'hébergeur (rubrique <i>Base de données MySQL</i>).</p>'
    . ($err ? '<p class="err">' . h($err) . '</p>' : '')
    . '<form method="post" autocomplete="off">'
    . '<label>Hôte (serveur MySQL)</label><input name="host" value="' . h($v['host']) . '" placeholder="ex. mysql.mon-hebergeur.com">'
    . '<label>Nom de la base</label><input name="name" value="' . h($v['name']) . '">'
    . '<label>Utilisateur</label><input name="user" value="' . h($v['user']) . '">'
    . '<label>Mot de passe de la base</label><input name="pass" type="password"><small>Il reste sur ton serveur, dans un fichier protégé.</small>'
    . '<button>Installer</button></form>');
