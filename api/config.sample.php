<?php
// Copier ce fichier en config.php et remplir les valeurs (base MySQL de l'hébergement de my-145-station).
// config.php ne doit JAMAIS être partagé ni versionné.
return [
    // MySQL / MariaDB
    'dsn'      => 'mysql:host=VOTRE_HOTE_MYSQL;dbname=VOTRE_BASE;charset=utf8mb4',
    'db_user'  => 'VOTRE_UTILISATEUR',
    'db_pass'  => 'VOTRE_MOT_DE_PASSE',

    // Accès provisoire en attendant le login (nom + code e-mail).
    // Générer une longue clé aléatoire, par ex. : php -r "echo bin2hex(random_bytes(32));"
    'api_tokens' => [
        'REMPLACER_PAR_UNE_CLE_ALEATOIRE_DE_64_CARACTERES',
    ],

    // Dossier des fichiers envoyés (hors de la racine web si possible).
    // Dossier privé de l'hébergement, inaccessible depuis le web.
    // Utiliser un sous-dossier différent pour l'environnement de test et la production.
    'upload_dir'     => __DIR__ . '/../../../private/st-uploads',
    'max_upload_mb'  => 20,

    // Collections supplémentaires.
    // La liste de base est dans api/lib.php ; ajouter ici seulement des collections supplémentaires.
    'collections' => [],
];
