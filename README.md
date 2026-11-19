# my-145-station

Assistant de gestion de station pour un organisme de maintenance EASA Part 145 (première organisation : Challenge Technic, station TLV).

Tout ce qui touche aux avions et à la validation de la maintenance (CRS, cartes de travail, traçabilité des pièces, qualité) reste dans **AMOS**. Cet outil ne signe ni ne valide aucune maintenance : il aide le Station Lead et l'équipe à gérer la station.

Construit à partir d'une copie du socle de l'ERP W.A.Y.S. (pas un fork) : code, base de données, secrets, données, numéro WhatsApp, clé d'API Claude et Dropbox sont **entièrement séparés**.

## Modules

Présents dans ce socle :
- Connexion par nom + code à 8 chiffres par e-mail, second facteur (TOTP) pour les rôles Administrateur et Bureau, droits appliqués par le serveur (`api/perm.php`).
- Tableau de bord à widgets, historique des actions, environnement de test.
- Véhicules (fiche, documents, entretiens, pannes, prises en charge, pneus).
- Outillage et étalonnage (les outils de la station envoyés en étalonnage).
- Clients (compagnies aériennes, code court, préfixes d'immatriculation) et articles et prix (tarifs des Charge Sheets).
- Administration : documents, dossiers, notes, liens entre fiches, Dropbox (en attendant OneDrive).
- Axel, l'assistant IA (Claude), dans l'outil et sur WhatsApp.

Prévus, dans l'ordre : personnel et qualifications, planning (roster), planification des shifts avec Flightradar24 et handover vers Notion, Charge Sheet, outillage de la station, transferts de pièces, hôtels / vols / véhicules, scans OneDrive et e-mails, liaison avec W.A.Y.S.

Retirés du socle d'origine : facturation, devis, relances, achats, banque, analytique, Odoo, Falco, Ponto, CODA, paiements, WebFleet, gaz, amendes, chauffeurs, garages.

## Contenu
```
index.html, js/        application (HTML + JavaScript, FR/EN)
api/                   API PHP + MySQL (documents JSON, changements en direct, fichiers, connexion, journal)
api/config.sample.php  modèle de configuration → à copier en config.php (jamais versionné)
api/schema.sql         tables MySQL
client/ways-api.js     client JavaScript de l'API
test/                  test automatique local (PHP + SQLite, faux services)
```

## Test local
`bash test/test.sh` (PHP 8 + SQLite). Le workflow GitHub `Contrôles` lance `php -l`, `node --check` et ce test à chaque push et pull request.

## Déploiement
Environnement de test chez ONE.COM (`test.my-145-station.com`) : workflow « Déploiement test (ONE.COM) », lancé à la main depuis l'onglet Actions, avec les secrets `SFTP_HOST`, `SFTP_USER`, `SFTP_PASSWORD` (voir `.github/workflows/deploy.yml`). `config.php` n'est jamais envoyé. Avant l'utilisation réelle : serveur dédié en Europe. Installation sur un serveur : copier les fichiers, ouvrir `api/install.php` (base, `config.php`, clé d'accès), puis `api/setup.php` (boîte d'envoi des codes, code maître, premier administrateur).

## Choix techniques
- **Une table générique** (`ways_docs`) : chaque collection est stockée en JSON ; aucune migration de schéma pour ajouter un champ.
- **Révision globale** : chaque écriture incrémente un compteur ; les écrans demandent « ce qui a changé depuis N » toutes les 3 s.
- **Suppressions conservées** comme marqueurs, pour que les autres postes les voient passer.
- **Fichiers** hors accès direct, servis par l'API.
- **Historique** (`ways_log`) : chaque écriture est notée (qui, quoi, quand, champs changés), conservé 2 ans.
- Les clés et secrets (Dropbox, WhatsApp, Anthropic) restent dans `ways_kv` et ne sont jamais renvoyés au navigateur.

## Rôles (provisoires)
Administrateur, Bureau, Terrain. Les rôles de la station (Station Lead, Admin paramétrable, Shift Foreman, Engineer, Mechanic, Store Keeper, Helper) arrivent avec le module Personnel.
