# ERP W.A.Y.S. — API de données sur ways.support (ONE.COM)

Remplace la base de données et le stockage de fichiers de l'artéfact claude.ai par ton propre serveur.
Adresse prévue : `https://ways.support/erp/` (application) et `https://ways.support/erp/api/` (API).

## Contenu
```
api/index.php          l'API (documents, changements en direct, import/export, fichiers)
api/lib.php            fonctions communes
api/config.sample.php  modèle de configuration → à copier en config.php
api/schema.sql         tables MySQL à créer
api/.htaccess          routage + protection des fichiers sensibles
uploads/.htaccess      bloque l'accès direct aux fichiers envoyés
client/ways-api.js     client JavaScript pour l'ERP (remplace claude.use("db") et "assets")
test/                  test automatique local (SQLite)
```

## Installation (≈ 15 min)
1. **HTTPS** : dans le panneau ONE.COM, vérifie que le certificat SSL est actif pour ways.support
   (le site répond aujourd'hui en http://). L'API transmet une clé d'accès : ne l'utilise qu'en https://.
2. **Base de données** : panneau ONE.COM → *Base de données MySQL* → crée/ouvre la base, note
   l'hôte, le nom, l'utilisateur et le mot de passe. Ouvre **phpMyAdmin** → onglet *Importer* → `api/schema.sql`.
3. **Configuration** : copie `api/config.sample.php` en `api/config.php`, remplis les accès MySQL, et
   remplace la clé d'accès par une clé aléatoire de 64 caractères (générateur : `php -r "echo bin2hex(random_bytes(32));"`
   ou demande-la-moi).
4. **Envoi des fichiers** (SFTP / gestionnaire de fichiers ONE.COM) :
   ```
   /www/erp/api/      ← contenu de api/ (avec config.php)
   /www/erp/uploads/  ← dossier uploads/ (avec son .htaccess)
   /www/erp/          ← plus tard : index.html + js/ de l'ERP + client/ways-api.js
   ```
5. **Vérification** : ouvre `https://ways.support/erp/api/health` → doit afficher `{"ok":true,...}`.
   `https://ways.support/erp/api/config.php` doit afficher **403 Forbidden**.

## Migration depuis claude.ai
1. Dans l'ancienne version (artéfact claude.ai) : **Paramètres → Sauvegarde et migration** → « Exporter les données » (JSON) et « Exporter les fichiers joints » (ZIP).
2. Ouvre l'ERP sur le serveur (`https://ways.support/erp-test/`), saisis la clé d'accès donnée par la page d'installation.
3. **Paramètres → Serveur ways.support** : dépose d'abord le JSON, puis le ZIP. Un import peut être relancé sans doublons
   (les fichiers gardent leur identifiant d'origine, les liens des fiches restent valables).

## Connexion par code (nom + code à 8 chiffres par e-mail)
1. Panneau ONE.COM → E-mail : crée la boîte **noreply@ways.support** (note son mot de passe).
2. Ouvre `https://ways.support/erp-test/api/setup.php` : clé d'accès de l'installation, mot de passe de la boîte
   (serveur `send.one.com`, port 465), ton **code maître** (8 chiffres ou plus, stocké haché) et ton compte administrateur.
   Un e-mail de test est envoyé.
3. Dans l'ERP : tape ton nom → code reçu par e-mail (ou code maître) → session de 8 heures sur l'appareil.
   Ajoute les autres personnes dans **Paramètres → Utilisateurs** (rôles Administrateur, Bureau, Terrain).

La clé d'accès de config.php reste valable pour les outils (tests, migration) mais n'est plus demandée dans l'ERP.

## Points d'accès
| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `health` | état (sans clé) |
| GET | `docs/{collection}` | tous les documents |
| GET / PUT / PATCH / DELETE | `docs/{collection}/{id}` | lire / remplacer / modifier (fusion, `null` efface un champ) / supprimer |
| GET | `changes?since=REV&colls=a,b` | changements depuis une révision (mises à jour en direct, sondage toutes les 3 s) |
| POST | `import` | import en masse `{ "clients": { "c-001": {...} }, ... }` ou listes `[{ "id": ..., ...}]` |
| GET | `export` | sauvegarde complète en JSON |
| POST / GET / DELETE | `files`, `files/{id}` | fichiers (photos, certificats, documents Administration) ; `id` facultatif au POST pour garder l'identifiant d'un fichier migré |

Toutes les routes sauf `health` demandent l'en-tête `Authorization: Bearer <clé>`.
Si ONE.COM bloque PUT/PATCH/DELETE, le client peut passer par POST + `X-HTTP-Method-Override` (`methodOverride: true`).

## Choix techniques
- **Une table générique** (`ways_docs`) : chaque collection de l'ERP y est stockée en JSON, comme dans l'artéfact.
  Aucune migration de schéma quand on ajoute un champ ou un module.
- **Révision globale** : chaque écriture incrémente un compteur ; les écrans demandent « ce qui a changé depuis N ».
  Plusieurs postes (bureau, atelier, mobile) restent synchronisés.
- **Suppressions conservées** comme marqueurs, pour que les autres postes les voient passer.
- **Fichiers** hors accès direct, servis par l'API ; seuls images et PDF s'affichent dans le navigateur, le reste est téléchargé.

## Limites actuelles (volontaires)
- **Clé d'accès partagée provisoire** : quiconque a la clé a tout l'accès. Elle sera remplacée par le
  login nom + code à 8 chiffres par e-mail + master code (prochain chantier). Ne la mets pas dans une page publique.
- Pas encore de rôles par utilisateur ni d'historique des modifications (le champ `updated_by` est déjà enregistré).

## Test local
`bash test/test.sh` (PHP 8 + SQLite) : écrit, modifie, supprime, importe, envoie un fichier et exporte.

## Étapes suivantes
1. Exporter les données de l'artéfact (bouton à ajouter dans Paramètres) puis les envoyer via `import`.
2. Brancher core.js sur `ways-api.js` (save / patch / remove / onSnapshot) et remplacer les URL `/_blob/<id>` par `fileUrl(id)`.
3. Login par e-mail, puis WEBFLEET.connect (tâche planifiée).

### Droits par rôle (appliqués par le serveur, `api/perm.php`)
- **Administrateur** : tout. **Bureau** : tout sauf les utilisateurs et les coordonnées de l'entreprise.
- **Terrain** : produits et documents administratifs invisibles ; clients en lecture seule ; factures/devis en résumé seulement (n°, statut, client — ni lignes ni montants) ; peut créer, délier ou supprimer la facture brouillon d'une livraison de gaz ou d'étalonnage ; solde bancaire masqué ; export/import refusés.

### Liaison WEBFLEET (`api/webfleet.php`)
- Paramètres → **Liaison WEBFLEET** (administrateur) : compte, utilisateur WEBFLEET.connect, mot de passe, clé API → enregistrés dans `ways_kv`, jamais renvoyés.
- Synchronisation déclenchée par les navigateurs ouverts, cadence imposée par le serveur : positions (showObjectReportExtern) toutes les 60 s → `vehPos`, trajets (showTripReportExtern) toutes les 15 min → `trips/wf-<tripid>` (30 jours au premier passage).
- Correspondance : champ « ID WebFleet » de la fiche = n° d'objet Webfleet (sinon nom d'objet ou plaque).
- Fiches chauffeur (collection `drivers`, bureau et administrateurs) : créées depuis showDriverReportExtern toutes les 6 h ;
  WebFleet est recopié dans `wf` (miroir) et ne remplit que les champs vides de l'ERP. Flotte → Chauffeurs : cartes
  (véhicule en cours, état, permis, « ≠ WebFleet » si la fiche diffère), carte en surbrillance si le chauffeur est au volant
  (position WebFleet « en route » avec ce chauffeur, signal < 30 min), recherche (nom, n° WebFleet, téléphone, société, e-mail,
  plaque, chip…). « Informations complémentaires » = champ `description` de WebFleet (lu et renvoyé) ; la note interne reste
  dans l'ERP. Amendes du chauffeur (lien `driverId`, ou le nom pour les anciennes) : actives, clôturées repliables.
- Envoi vers WebFleet, **jamais automatique**, seulement par bouton (bureau, administrateurs, bloqué en environnement de test) :
  `POST webfleet/push-vehicle {id, odometer}` (updateVehicle, compteur en mètres ; l'ERP repart de la même valeur),
  `POST webfleet/push-vehicle {id, details:true}` (immatriculation, année, puissance, cylindrée, carburant ; jamais le nom
  d'objet ni le VIN), `POST webfleet/push-driver {id}` (updateDriverExtern, ou insertDriverExtern avec le n° saisi).
  L'utilisateur WEBFLEET.connect doit avoir le droit de modifier. Chaque envoi est noté dans l'historique.
- Fond de carte des positions : CARTO Voyager / Dark Matter ; CARTO exige une clé gratuite (carto.com/basemaps/apikey, liée au domaine). Paramètres → Liaison WEBFLEET → Fond de carte (`POST webfleet/mapkey`, administrateurs) ; clé dans `ways_kv` (`map_key`), transmise aux navigateurs avec `webfleet/status` puisqu'elle figure dans l'URL des tuiles.
- Tests : `test/webfleet-mock.php` simule WEBFLEET.connect.

### Liaison Odoo (`api/odoo.php`, phase B : Odoo maître)
- Paramètres → **Liaison Odoo** (administrateur) : adresse, base (facultative), clé API et sa date d'expiration → `ways_kv`, clé jamais renvoyée. Odoo 19+ (API JSON-2) et formule Custom requis.
- Toutes les 15 min (import initial par lots de 20 s) : `res.partner` (clients) → `clients`, `product.product` vendables → `products`, `account.move` out_invoice/out_refund + lignes → `docs` (`odoo-inv-<id>`), puis relecture des factures ouvertes (paiements, suppressions).
- Fiches existantes reliées par n° de TVA (clients) ou référence (articles). Tout ce qui vient d'Odoo porte `source: "odoo"` et n'est pas modifiable dans l'ERP (`perm.php`), sauf les champs propres à l'ERP (notes, type d'article, stock).
- Tests : `test/odoo-mock.php` simule l'API JSON-2.

### Passerelle comptable Falco (`api/falco.php`, `js/falco.js`)
- Paramètres → **Liaison Falco (comptabilité)** (administrateur) : secret d'application (dev.falco-app.be), clé API de l'organisation (Falco → API access), date de bascule, mode manuel / automatique (5 min).
- Factures et NC Odoo émises, datées à partir de la bascule → `POST /v1/invoices/imports/pdf` (PDF d'Odoo + métadonnées), `send_peppol: false`, `send_accounting: true` (→ Horus). Statut gardé dans `docs.<id>.falco` : jamais transmis deux fois. Envoi manuel d'une sélection possible depuis la liste des factures.
- Tests : `test/falco-mock.php`.

### Banques via Ponto (`api/ponto.php`, `js/bank.js`)
- Paramètres → **Liaison Ponto (banques)** (administrateur) : identifiant client + secret d'une *custom integration* Ponto (AIS, lecture seule). Jeton OAuth2 client credentials sur `https://api.myponto.com`.
- Toutes les 30 min : comptes → `bankAccounts`, mouvements → `bankTx/po-<id>` (2 ans au premier passage, puis jusqu'au dernier connu). Jamais de synchronisation bancaire forcée (Ponto relit les banques 4×/jour).
- Rapprochement : entrée reliée à une facture ouverte par communication structurée (payRef Odoo ou OGM ERP), sinon montant exact + n° dans la communication ; lien manuel / déliaison possible. Menu **Finances → Banque** (admin, bureau ; invisible au terrain). Tableau de bord : solde des comptes Ponto.
- Tests : `test/ponto-mock.php`.

### Fichiers CODA (`api/coda.php`)
- Banque → onglet **Fichiers CODA** (admin, bureau) : un fichier = un compte + une période, au format Febelfin CODA 2.6 (enregistrements 0, 1, 2.1/2.2/2.3, 8, 9 de 128 caractères, Windows-1252, CRLF ; communication structurée 101).
- Solde initial = solde Ponto actuel − mouvements depuis le début de période. N° de relevé par compte et par année (`2026-001`…).
- Anti-doublon : chaque mouvement inclus est marqué (`bankTx.coda`) ; chevauchement refusé (409) ; la période proposée reprend au lendemain du dernier fichier ; un fichier peut être annulé (mouvements libérés). Historique `codaFiles` tenu par le serveur, filtrable par compte / année / état.


## Achats (factures fournisseurs via Falco)

Falco reste le point d'accès Peppol : il reçoit les factures fournisseurs et les transmet au comptable.
L'ERP les lit (`api/purchases.php`, collection `purchases`) toutes les 30 min, avec l'historique complet au premier passage :
PDF à la demande, statut de paiement mis à jour dans Falco, réponse Peppol au fournisseur (accepter / refuser / question),
archivage et note interne. Les sorties bancaires sont reliées automatiquement à une facture d'achat
(communication structurée du fournisseur, ou n° cité + montant) ou à la main via « Relier… ».
Autorisations de la clé API Falco : `documents:purchases:read`, `documents:purchases:update-payment-status`,
`peppol:inbound:read`, `peppol:inbound:write`.

## Axel, l'assistant IA (Claude)

Panneau « ✦ Axel » pour le bureau et les administrateurs (`api/assistant.php`, `js/assistant.js`). Axel est un collègue :
il consulte l'ERP (recherche, fiche complète, totaux) et écrit avec les **droits d'un employé Bureau** (`create_record`,
`update_record`, `add_vehicle_document`), contrôlés par `perm_write` comme pour une personne. Règles : ventes toujours en
brouillon avec numéro attribué par le serveur, données Odoo/Falco protégées, suppressions seulement proposées (l'utilisateur
confirme), rien n'est envoyé hors de l'ERP (e-mail, Falco, Peppol), 25 écritures au plus par demande. Chaque écriture est notée
dans l'historique au nom « Axel (pour <personne>) » et peut être annulée depuis le panneau. Fichiers déposés (PDF, photo) lus
par Claude. Clé API Anthropic, modèle et plafond mensuel (USD) dans Paramètres ; la clé reste dans `ways_kv`.

**Fil de conversation** : un fil par utilisateur, gardé sur le serveur (table `ways_ai_thread`), donc identique sur tous
ses appareils et privé (personne d'autre, administrateurs compris, ne le lit dans l'ERP). Tout le fil s'affiche d'un bloc
(800 derniers messages) ; « Nouveau sujet » ouvre un sujet (Axel repart sans le contexte précédent) et le menu « Sujets »
permet d'y revenir en un clic. Routes `assistant/thread`, `say`, `topic`, `mark`. Une réponse longue interrompue
(onglet fermé) se termine à la réouverture du panneau.

**Rapprochement bancaire** : outils `bank_suggestions` (mouvements non reliés d'une période classés en certains, probables
et ambigus) et `link_payment` (même calcul que « Relier… », refusé si le mouvement est déjà relié, annulable). Axel relie
seul les certains, les probables avec l'accord de l'utilisateur, jamais les ambigus. Au-delà de 4 modifications, le panneau
les regroupe avec « Voir le détail » et « Tout annuler ».

**Contexte envoyé à Claude** : la question en cours est toujours gardée en entier (jusqu'à 30 tours d'outils, sur plusieurs
reprises) ; les questions précédentes sont résumées ; `ai_fix_msgs` garantit qu'aucun échange outil ↔ résultat n'est coupé.

**Ce qu'Axel apprend** : outil `remember` ; quand on lui dit « retiens que… » ou qu'il est corrigé sur une règle de travail
générale, il la note (300 caractères, 80 notes au plus, rien de personnel ni de confidentiel). Ces notes sont partagées avec
toute l'équipe et ajoutées à ses consignes ; les administrateurs les relisent et les suppriment dans Paramètres → Axel →
« Ce qu'Axel a appris ». Rien n'est retenu en environnement de test.

## Liaison Dropbox (`api/dropbox.php`, `js/dropbox.js`)

- Paramètres → **Liaison Dropbox** (administrateur) : créer une app sur dropbox.com/developers/apps (Scoped access, Full Dropbox ;
  permissions account_info.read, files.metadata.read, files.content.read, files.content.write ; Redirect URI affichée dans
  Paramètres, `…/api/dropbox/callback`), saisir App key + App secret, puis « Connecter Dropbox » (OAuth, jeton offline gardé
  dans `ways_kv`, jamais renvoyé). Espace d'équipe : en-tête Dropbox-API-Path-Root, les chemins sont ceux de dropbox.com/home/….
- **Dossiers autorisés** (`dbx_folders`) : choisis par un administrateur **avec le code maître** (`dropbox/unlock` → jeton de
  15 min lié à la session, puis `dropbox/browse` et `dropbox/folders` ; 5 essais faux = blocage 15 min ; noté dans l'historique).
  Seuls ces dossiers et leurs sous-dossiers sont visibles (ERP, Axel) et utilisés pour la copie ; aucun dossier = rien de visible.
  Le choix est proposé dès le retour de l'autorisation Dropbox.
- Administration → dossier **Dropbox** (bureau, administrateurs ; couleur au choix, ni jaune ni bleu) : navigation, recherche,
  ouverture par lien temporaire.
- Documents des véhicules : chaque fichier ajouté dans une fiche (à la main ou par Axel) est copié dans le dossier Dropbox du
  véhicule (lien « Dossier Dropbox », sinon `<dossier des véhicules>/<n°> - <plaque> - <modèle>`, créé et lié) ; un document
  remplacé ou ancien est déplacé dans `Expired`. File d'attente (`dbx_queue`, remplie par `write_doc`) traitée par
  `POST dropbox/tick` (navigateurs du bureau, chaque minute). Rien n'est supprimé dans Dropbox.
- **Suivi Assistant** : case « ✦ Suivi Assistant » sur un dossier (Administration → Dropbox ; bureau ou administrateur, à tout
  moment, dans les dossiers autorisés). `dropbox/tick` vérifie les dossiers suivis toutes les 2 min (curseur Dropbox) ; chaque
  nouveau fichier (hors copies faites par l'ERP) devient un événement ; chaque personne voit dans Axel « 📂 Nouveau(x)
  fichier(s) Dropbox — Analyser ? Oui / Non » (pastille sur le bouton Axel). Oui : Axel lit les fichiers et propose quoi en
  faire (`dropbox_import` + `add_vehicle_document` pour ranger un document dans une fiche véhicule).
- Axel : `dropbox_search`, `dropbox_list`, `dropbox_read`, `dropbox_import` (PDF, photos, texte ; lecture seule ; le contenu lu n'est pas gardé
  dans le fil). Tests : `test/dropbox-mock.php`.

## WhatsApp de l'équipe (`api/whatsapp.php`, `js/whatsapp.js`)

- Numéro W.A.Y.S. dédié (SIM jamais utilisée sur WhatsApp), relié en **API seule** à l'app Meta de l'entreprise (API Cloud,
  sans intermédiaire). Pas d'application WhatsApp sur ce numéro : l'ERP et Axel le surveillent. (La coexistence app + API
  n'est ouverte qu'aux Tech Providers / via un intermédiaire ; écartée pour l'instant.)
- Paramètres → **WhatsApp de l'équipe** (administrateur) : Phone number ID, WABA ID, jeton permanent d'utilisateur système,
  App secret (dans `ways_kv`, jamais renvoyés) ; « Tester », « Enregistrer le numéro » (`/register` avec un PIN à 6 chiffres
  gardé sur le serveur), message test ; adresse du webhook et Verify token à copier dans Meta.
- Webhook public `api/whatsapp/webhook` : vérification Meta (GET), signature `X-Hub-Signature-256` (POST), doublons ignorés,
  réponse immédiate puis traitement (`fastcgi_finish_request`) ; file `wa_queue` reprise par `whatsapp/tick` si besoin.
- **Équipe seulement** : numéros reconnus = liste de Paramètres (compte ERP ou fiche chauffeur) + chauffeurs dont le GSM est
  dans la fiche (option). Axel répond avec les droits de la personne (chauffeur = terrain) ; même fil que son panneau Axel
  (messages marqués « WhatsApp ») ; photos et PDF passés à Axel ; messages vocaux refusés poliment ; 30 messages / 10 min
  par personne au maximum. Numéros inconnus : réponse automatique (1 fois/semaine/numéro), messages visibles par les admins.
- Tests : `test/meta-mock.php`.

## Historique des actions

`api/log.php` (table `ways_log`, créée automatiquement, conservée 2 ans) : chaque écriture passant par `write_doc()`
est notée (création, modification avec les champs changés, suppression, validation, paiement, rapprochement,
archivage…), plus les événements explicites (connexion, envoi à Falco, e-mail préparé, PDF téléchargé).
Les synchronisations (Odoo, Falco, Ponto, Webfleet) ne notent que créations, suppressions et changements de statut ;
positions et trajets Webfleet ne sont pas notés. Consultation (bureau, administrateurs) : Management → Historique
et l'encart « Historique » des fiches (facture, véhicule et ses interventions, panne, facture d'achat).

## Environnement de test

`api/sandbox.php` : par session (bureau, administrateurs), Paramètres → Environnement de test. Les écritures de la
session vont dans `ways_docs_sbx` (couche posée sur la base principale, lue en priorité) ; la base principale et les
autres utilisateurs ne voient rien. Quitter le test (ou se déconnecter) efface la couche ; les couches abandonnées sont
purgées après 2 jours. Bloqué pendant un test : Falco, Peppol, synchronisations Odoo/Ponto/Webfleet/Achats (ignorées),
réglages des liaisons et de l'assistant, utilisateurs, import ; rien n'est noté dans l'historique.

### Envoi de fichiers par Axel sur WhatsApp
- Outil `whatsapp_send_file` : fichier de l'ERP (fileId) ou de Dropbox, envoyé **uniquement** à la personne qui parle à Axel (numéro de la liste de l'équipe ou GSM de la fiche chauffeur), dans les 24 h qui suivent son dernier message.
- Rôle Terrain (chauffeurs) : seulement le certificat de conformité, d'immatriculation, de contrôle technique ou d'assurance **actuels** d'un véhicule qu'il conduit (position WebFleet) ou a conduit / auquel il s'est identifié (trajets, carnet de bord) dans les 30 derniers jours ; sinon refus avec invitation à s'identifier. Pas d'accès Dropbox.

### Fiches véhicules ↔ WebFleet
- Règle : l'identifiant W.A.Y.S. d'une fiche = le n° du véhicule dans WebFleet, à l'identique. Une fiche sans « ID WebFleet » est reliée par son identifiant.
- Paramètres → Liaison WEBFLEET → « Aligner les fiches sur WebFleet… » (administrateur) : aperçu puis application. Créer (véhicule WebFleet sans fiche), Relier (même n° ou même plaque), Renommer (identifiant différent → n° WebFleet ; l'ancien reste réservé), Conflit (n° déjà pris par une autre fiche ou un véhicule supprimé : rien n'est fait). Plaque, modèle, VIN, carburant, année repris de `showVehicleReportExtern` ; 30 jours de trajets rattrapés.

### Chauffeurs désactivés dans WebFleet
- À chaque lecture de la liste des chauffeurs (6 h), une fiche liée à WebFleet (driveruid / driverno) absente de la liste des actifs reçoit `wfGone` (date) ; elle réapparaît d'elle-même si le chauffeur est réactivé. Jamais sur une liste vide ou en erreur. Fiches créées dans l'ERP : non concernées.
- Affichage : grisés, en bas, dans une section repliable « Désactivés dans WebFleet ». Plus reconnus par WhatsApp / Axel.

### Notes (Administration → Notes)
- Collection `notes` : notes personnelles (`team: false`, visibles de leur auteur seulement — filtrées par le serveur, `owner` imposé) et notes d'équipe (tout le monde). Passage personnelle → équipe confirmé (2e clic) ; seul l'auteur peut rendre une note d'équipe personnelle (elle disparaît alors chez les autres). Contenu des notes personnelles jamais dans l'historique.
- Couleurs, étiquettes, épinglage, ordre par glisser-déposer (`order`), pièces jointes (`files`) visibles aussi dans Gestion Documents (dossier système « Notes »), liens vers les fiches de l'ERP (`links` : véhicules, chauffeurs, factures, achats, clients, outils, amendes, pannes, bouteilles, livraisons).
- Axel : notes de la personne qui lui parle + notes d'équipe (jamais celles des autres) ; une note qu'il crée est personnelle ; partage par `propose_share_note` + « oui » + `confirm_action`.

### Rôles Garage et Chauffeur — Garages (Flotte → Garages)
- Rôles, du plus fort au plus faible : admin, bureau, terrain, garage, chauffeur (`perm.php` : `LIMITED_COLLS`, `limited_view`, `limited_write` ; filtrage par fiche, y compris dans le flux de changements).
- Garage : sa fiche (`garages`, compte relié par `userIds`), ses chauffeurs (`drivers.garageIds`), les véhicules présents chez lui (déclarés `vehicles.garageId` ou dernière position WebFleet dans le rayon) en entier — les autres en résumé ; encode entretiens (`vehEvents.garageId`) et pannes. Panne signalée sur un véhicule absent → statut `attente`, validée par le bureau. Champs d'identité du véhicule verrouillés.
- Chauffeur : véhicules (sans commentaires internes), signaler une panne / une prise en charge, ses trajets et amendes. Les chauffeurs reconnus sur WhatsApp ont ce rôle.
- Fiche garage : véhicules présents (déclaré / GPS ✓ / GPS ✗), alerte quand un chauffeur du garage roule, km des chauffeurs du garage (30 j / 90 j / 1 an), tâches et pannes attribuées (`faults.garageId`, `faults.kind` panne / défaut / tâche), interventions et coûts, factures d'achat du fournisseur relié (n° TVA ou nom) et montant dû, commentaires.
- Véhicules : distribution — dernier remplacement (date, km) et case « non applicable » (`beltNA`, `beltLastDate`, `beltLastKm`).

### Tableau de bord à widgets
- `js/dashboard.js` : registre `WIDGETS` (titre, icône, couleur, module requis, taille par défaut S/M/L, `r()` = contenu). Un widget n'est proposé que si le module est accessible au rôle.
- Grille libre GridStack (vendorisée dans `js/vendor/`, licence MIT) : 12 colonnes, placement libre (`x, y, w, h`), redimensionnement par les bords et les coins ; 1 colonne sur mobile (non enregistrée).
- Chaque utilisateur compose sa page (Personnaliser : ajouter depuis le catalogue, glisser n'importe où, redimensionner, retirer, rétablir) ; disposition dans `userPrefs/p-<id utilisateur>` (lisible et modifiable par lui seul, hors historique).

