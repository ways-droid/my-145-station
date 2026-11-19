<?php
// Copier ce fichier en config.php et remplir les valeurs (panneau ONE.COM > Base de données MySQL).
// config.php ne doit JAMAIS être partagé ni versionné.
return [
    // MySQL / MariaDB ONE.COM
    'dsn'      => 'mysql:host=VOTRE_HOTE.mysql.service.one.com;dbname=VOTRE_BASE;charset=utf8mb4',
    'db_user'  => 'VOTRE_UTILISATEUR',
    'db_pass'  => 'VOTRE_MOT_DE_PASSE',

    // Accès provisoire en attendant le login (nom + code e-mail).
    // Générer une longue clé aléatoire, par ex. : php -r "echo bin2hex(random_bytes(32));"
    'api_tokens' => [
        'REMPLACER_PAR_UNE_CLE_ALEATOIRE_DE_64_CARACTERES',
    ],

    // Dossier des fichiers envoyés (hors de la racine web si possible).
    // Dossier privé ONE.COM (à côté de httpd.www), inaccessible depuis le web.
    // Utiliser un sous-dossier différent pour erp-test et erp.
    'upload_dir'     => __DIR__ . '/../../../httpd.private/ways-uploads',
    'max_upload_mb'  => 20,

    // Collections autorisées (celles de l'ERP W.A.Y.S.).
    'collections' => [
        'clients','products','docs','gasTypes','bottles','gasMoves','deliveries',
        'vehicles','vehEvents','faults','driverLogs','tools','tires','labs','fines',
        'adminDocs','adminFolders','vehPos','trips','settings',
    ],
];
