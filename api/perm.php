<?php
// Droits par rôle, appliqués par le serveur (l'interface masque déjà les menus ; ici on garantit).
//
//  Administrateur (et clé d'API) : tout.
//  Bureau  : tout, sauf la gestion des utilisateurs (auth.php) et les coordonnées de l'entreprise
//            (nom, TVA, IBAN, adresse, e-mail, téléphone) qui restent celles fixées par un administrateur.
//  Terrain : Gaz, Flotte, Étalonnage, pannes.
//            - produits et documents administratifs : invisibles, non modifiables ;
//            - clients : lecture seule (nom, adresse… pour les livraisons) ;
//            - factures / devis / notes de crédit : seulement un résumé (n°, statut, client, lien
//              livraison), jamais les lignes ni les montants. Peut créer la facture brouillon d'une
//              livraison de gaz ou d'étalonnage, la délier d'une livraison, ou supprimer un tel brouillon ;
//            - paramètres : solde bancaire masqué ; ne peut modifier que les emplacements de stock gaz,
//              les chauffeurs et les numéros de flotte ;
//            - export / import complets : refusés.

const TERRAIN_HIDDEN     = ['products', 'adminDocs', 'adminFolders', 'bankAccounts', 'bankTx', 'codaFiles', 'purchases', 'drivers', 'payments', 'reminders'];
const TERRAIN_READONLY   = ['clients'];
const BANK_TX_KEYS = ['accountId', 'iban', 'amount', 'currency', 'date', 'execDate', 'counterpart', 'counterpartIban', 'remittance', 'structured', 'description', 'info', 'source', 'coda'];
const DOC_SUMMARY_KEYS   = ['kind', 'number', 'status', 'date', 'clientId', 'deliveryId', 'deliveryNo', 'source',
                            'invoiceId', 'creditFor', 'creditForNo', 'demo'];
const TERRAIN_DOC_SOURCES = ['gaz', 'etalonnage'];
const TERRAIN_DOC_PATCH  = ['deliveryId', 'deliveryNo'];
const SETTINGS_SECRET    = ['bankBalance', 'bankDate'];
const TERRAIN_SETTINGS   = ['gasLocations', 'drivers', 'demoDrivers', 'usedFleetNos'];
const COMPANY_IDENTITY   = ['name', 'vat', 'iban', 'address', 'email', 'phone'];

function role_of($who) {
    if (($who['kind'] ?? '') !== 'session') return 'admin';
    $r = $who['user']['role'] ?? 'terrain';
    return in_array($r, ['admin', 'bureau', 'terrain', 'garage', 'chauffeur'], true) ? $r : 'chauffeur';
}
/* bureau ou administrateur (accès complet aux modules de gestion) */
function is_office($r) { return in_array($r, ['admin', 'bureau'], true); }

/* ---------- rôles Garage et Chauffeur (du plus fort au plus faible : admin, bureau, terrain, garage, chauffeur) ----------
   Garage : sa fiche garage, ses chauffeurs ; les véhicules présents chez lui (déclarés ou confirmés par GPS) en entier,
            les autres en résumé (pour signaler une panne, qui passe alors « En attente » de validation par le bureau) ;
            pannes et entretiens de ses véhicules ou qui lui sont attribués. Rien d'autre.
   Chauffeur : véhicules (sans commentaires internes), pannes (lecture, signalement), ses prises en charge, trajets et amendes. */
const LIMITED_COLLS = [
    'garage' => ['vehicles', 'faults', 'vehEvents', 'garages', 'drivers', 'settings', 'notes'],
    'chauffeur' => ['vehicles', 'faults', 'driverLogs', 'trips', 'fines', 'settings', 'notes', 'drivers'],
];
const VEH_SUMMARY = ['fleetNo', 'plate', 'model', 'fuel', 'year', 'cat', 'status', 'retired', 'color'];
const VEH_GARAGE_LOCKED = ['fleetNo', 'plate', 'webfleetId', 'garageId', 'garageSince', 'retired', 'vin', 'dropboxLink', 'docsLink'];
const LIMITED_SETTINGS = ['name', 'drivers', 'demoDrivers', 'wfDrivers'];
function perm_nk($s) { $s = mb_strtolower(trim((string) $s)); $a = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s); if ($a !== false) $s = $a; $w = preg_split('/[^a-z0-9]+/', $s, -1, PREG_SPLIT_NO_EMPTY); sort($w); return implode(' ', $w); }
/* garage de l'utilisateur connecté (fiche garage dont userIds contient son id) */
function garage_of_user($uid) {
    if ($uid === '' || !function_exists('od_coll_docs')) return '';
    foreach (od_coll_docs('garages') as $id => $g) if (in_array($uid, (array) ($g['userIds'] ?? []), true)) return (string) $id;
    return '';
}
function me_garage() { return (string) ($GLOBALS['ME_GARAGE'] ?? ''); }
function geo_m($la1, $lo1, $la2, $lo2) { $r = 6371000; $dl = deg2rad($la2 - $la1); $do = deg2rad($lo2 - $lo1); $a = sin($dl / 2) ** 2 + cos(deg2rad($la1)) * cos(deg2rad($la2)) * sin($do / 2) ** 2; return 2 * $r * asin(min(1, sqrt($a))); }
/* véhicules présents dans un garage : déclarés (garageId) ou dont la dernière position WebFleet est dans son rayon */
function garage_vehicles($gid) {
    static $cache = [];
    if ($gid === '') return [];
    if (isset($cache[$gid])) return $cache[$gid];
    $g = get_doc('garages', $gid); $g = ($g && !$g['deleted']) ? (json_decode($g['data'], true) ?: []) : [];
    $out = [];
    foreach (od_coll_docs('vehicles') as $vid => $v) if (($v['garageId'] ?? '') === $gid) $out[$vid] = 'declare';
    if (isset($g['lat'], $g['lon']) && is_numeric($g['lat']) && is_numeric($g['lon'])) {
        $rad = max(50, min(2000, (float) ($g['radius'] ?? 150)));
        foreach (od_coll_docs('vehPos') as $vid => $p) if (isset($p['lat'], $p['lon']) && is_numeric($p['lat']) && geo_m((float) $g['lat'], (float) $g['lon'], (float) $p['lat'], (float) $p['lon']) <= $rad) $out[$vid] = isset($out[$vid]) ? 'gps' : 'gps-seul';
    }
    return $cache[$gid] = $out;
}
/* fiche chauffeur de la personne connectée (rôle chauffeur) : WhatsApp (drv:<id>), lien userId, ou même nom */
function me_driver() {
    static $cache = [];
    $uid = (string) ($GLOBALS['ME_UID'] ?? ''); $name = perm_nk($GLOBALS['ME_NAME'] ?? '');
    if (isset($cache[$uid . '|' . $name])) return $cache[$uid . '|' . $name];
    $d = ['id' => '', 'name' => ''];
    foreach (od_coll_docs('drivers') as $id => $x) {
        if ($uid === 'drv:' . $id || (($x['userId'] ?? '') !== '' && $x['userId'] === $uid) || ($name !== '' && perm_nk($x['name'] ?? '') === $name)) { $d = ['id' => (string) $id, 'name' => (string) ($x['name'] ?? '')]; break; }
    }
    if ($d['name'] === '' && $name !== '') $d['name'] = (string) ($GLOBALS['ME_NAME'] ?? '');
    return $cache[$uid . '|' . $name] = $d;
}
function is_me_driver($driverName, $driverId = '') { $m = me_driver(); return ($m['id'] !== '' && $driverId !== '' && $driverId === $m['id']) || ($m['name'] !== '' && perm_nk($driverName) === perm_nk($m['name'])); }
function limited_view($role, $coll, $data, $id) {
    if (!in_array($coll, LIMITED_COLLS[$role], true)) return null;
    if ($coll === 'settings') return array_intersect_key($data, array_flip(LIMITED_SETTINGS));
    if ($coll === 'notes') return empty($data['team']) ? $data : null;   // notes d'équipe : internes à W.A.Y.S.
    if (!$data) return $data;
    if ($role === 'garage') {
        $g = me_garage(); $at = garage_vehicles($g);
        switch ($coll) {
            case 'garages': return $id === null || $id === $g ? array_diff_key($data, array_flip(['notes', 'comments', 'supplierVat'])) : null;
            case 'vehicles': if ($id !== null && isset($at[$id])) return $data + ['atMyGarage' => $at[$id]];
                return array_intersect_key($data, array_flip(VEH_SUMMARY));
            case 'faults': return isset($at[$data['vehicleId'] ?? '']) || ($g !== '' && ($data['garageId'] ?? '') === $g) || (($data['reporterUid'] ?? '') === ($GLOBALS['ME_UID'] ?? '-')) ? $data : null;
            case 'vehEvents': return isset($at[$data['vehicleId'] ?? '']) || ($g !== '' && ($data['garageId'] ?? '') === $g) ? $data : null;
            case 'drivers': return $g !== '' && in_array($g, (array) ($data['garageIds'] ?? []), true) ? array_intersect_key($data, array_flip(['name', 'phone', 'garageIds'])) : null;
        }
        return null;
    }
    /* chauffeur */
    switch ($coll) {
        case 'vehicles': return array_diff_key($data, array_flip(['notes', 'todo', 'garage', 'purchasePrice', 'leasing']));
        case 'faults': return $data;
        case 'driverLogs': case 'trips': return is_me_driver($data['driver'] ?? '') ? $data : null;
        case 'fines': return is_me_driver($data['driver'] ?? '', (string) ($data['driverId'] ?? '')) ? $data : null;
        case 'drivers': return $id !== null && $id === me_driver()['id'] ? array_diff_key($data, array_flip(['notes'])) : null;
    }
    return null;
}
/* écritures Garage / Chauffeur ; $id = identifiant de la fiche */
function limited_write($role, $coll, $op, $old, $new, $id) {
    if (!in_array($coll, LIMITED_COLLS[$role], true) || in_array($coll, ['settings', 'garages', 'drivers', 'trips'], true)) deny();
    $uid = (string) ($GLOBALS['ME_UID'] ?? '');
    if ($role === 'chauffeur') {
        if ($old !== null || $op === 'delete') deny("Votre rôle permet de signaler une panne ou une prise en charge, pas de modifier une fiche existante.");
        if ($coll === 'faults') { $new['status'] = 'ouverte'; $new['reporterUid'] = $uid; unset($new['garageId']); return $new; }
        if ($coll === 'driverLogs') { $m = me_driver(); if ($m['name'] !== '') $new['driver'] = $m['name']; return $new; }
        deny();
    }
    /* garage */
    $g = me_garage(); if ($g === '') deny("Votre compte n'est relié à aucun garage : demandez au bureau de le faire.");
    $at = garage_vehicles($g);
    if ($coll === 'vehicles') {
        if ($old === null || $op === 'delete' || $id === null || !isset($at[$id])) deny("Ce véhicule n'est pas dans votre garage.");
        foreach (VEH_GARAGE_LOCKED as $k) { if (array_key_exists($k, $old)) $new[$k] = $old[$k]; else unset($new[$k]); }
        unset($new['atMyGarage']);
        return $new;
    }
    $vid = (string) (($new['vehicleId'] ?? '') ?: ($old['vehicleId'] ?? ''));
    $here = isset($at[$vid]);
    if ($coll === 'faults') {
        if ($old === null) {   // nouveau signalement
            $new['reporterUid'] = $uid; $new['reporterGarage'] = $g;
            if ($here) { $new['garageId'] = $g; if (!in_array($new['status'] ?? '', ['ouverte', 'planifiee', 'reparee'], true)) $new['status'] = 'ouverte'; }
            else { $new['status'] = 'attente'; unset($new['garageId']); }
            return $new;
        }
        if (!$here && ($old['garageId'] ?? '') !== $g && ($old['reporterUid'] ?? '') !== $uid) deny("Cette panne ne concerne pas votre garage.");
        if ($op === 'delete') { if (($old['status'] ?? '') === 'attente' && ($old['reporterUid'] ?? '') === $uid) return $new; deny("Seul le bureau peut supprimer cette panne."); }
        if (($old['status'] ?? '') === 'attente') $new['status'] = 'attente';   // validation réservée au bureau
        elseif (($new['status'] ?? '') === 'attente') $new['status'] = $old['status'] ?? 'ouverte';
        $new['garageId'] = $old['garageId'] ?? ($here ? $g : null); if ($new['garageId'] === null) unset($new['garageId']);
        $new['reporterUid'] = $old['reporterUid'] ?? null; if ($new['reporterUid'] === null) unset($new['reporterUid']);
        return $new;
    }
    if ($coll === 'vehEvents') {
        $mine = $old === null || ($old['garageId'] ?? '') === $g;
        if (!$here || !$mine) deny("Vous ne pouvez encoder l'historique que des véhicules présents dans votre garage.");
        if ($op === 'delete') return $new;
        $new['garageId'] = $g; return $new;
    }
    deny();
}
function deny($msg = "Votre rôle ne permet pas cette action.") { if (!empty($GLOBALS['PERM_THROW'])) throw new RuntimeException($msg); fail(403, $msg); }

/* ---------- Notes : personnelles (auteur seul) ou d'équipe (tout le monde) ----------
   L'auteur courant est $GLOBALS['ME_UID'] (personne connectée, ou personne qui parle à Axel) ; « * » = clé d'API (sauvegardes). */
function notes_uid($who) { return ($who['kind'] ?? '') === 'session' ? (string) ($who['user']['id'] ?? '') : '*'; }
function notes_mine($d) { $me = (string) ($GLOBALS['ME_UID'] ?? ''); return $me === '*' || ($me !== '' && (string) ($d['owner'] ?? '') === $me); }
function notes_write($role, $op, $old, $new) {
    $me = (string) ($GLOBALS['ME_UID'] ?? '');
    if ($old !== null && empty($old['team']) && !notes_mine($old)) deny('Cette note personnelle appartient à quelqu\'un d\'autre.');
    if ($op === 'delete') {
        if (!empty($old['team']) && !notes_mine($old) && !is_office($role)) deny('Seul son auteur ou le bureau peut supprimer cette note d\'équipe.');
        return $new;
    }
    if ($old === null) { if ($me !== '*' || empty($new['owner'])) { $new['owner'] = $me; $new['ownerName'] = (string) ($GLOBALS['ME_NAME'] ?? ($new['ownerName'] ?? '')); } }
    else { $new['owner'] = $old['owner'] ?? ''; $new['ownerName'] = $old['ownerName'] ?? ''; }   // l'auteur ne change jamais
    if ($old !== null && !empty($old['team']) && empty($new['team']) && !notes_mine($old)) deny('Seul son auteur peut rendre une note d\'équipe personnelle.');
    $new['team'] = !empty($new['team']);
    $new['updatedAt'] = gmdate('c');
    return $new;
}

// Ce qu'un rôle peut lire d'un document : null = invisible, sinon les données (éventuellement réduites).
/* préférences personnelles (tableau de bord…) : document « p-<id utilisateur> », visible et modifiable par lui seul */
function prefs_mine($id) { $me = (string) ($GLOBALS['ME_UID'] ?? ''); return $me === '*' || ($me !== '' && $id === 'p-' . $me); }
function perm_view($role, $coll, $data, $id = null) {
    if ($coll === 'userPrefs') return $id === null || prefs_mine($id) ? $data : null;
    if ($coll === 'notes' && is_array($data) && $data && empty($data['team']) && !notes_mine($data)) return null;
    if (isset(LIMITED_COLLS[$role]) && $data !== null) return limited_view($role, $coll, (array) $data, $id);
    if ($role !== 'terrain' || $data === null) return $data;
    if (in_array($coll, TERRAIN_HIDDEN, true)) return null;
    if ($coll === 'docs') {
        $s = array_intersect_key($data, array_flip(DOC_SUMMARY_KEYS));
        $s['lines'] = [];
        $s['summary'] = true;
        return $s;
    }
    if ($coll === 'settings') return array_diff_key($data, array_flip(SETTINGS_SECRET));
    return $data;
}
// Ligne d'API (doc_out) filtrée : null = à ne pas envoyer.
function perm_out($role, $out) {
    if ($out['coll'] === 'userPrefs') return prefs_mine($out['id']) ? $out : null;
    if (($out['coll'] === 'notes' || isset(LIMITED_COLLS[$role])) && !$out['deleted'] && in_array($out['coll'], LIMITED_COLLS[$role] ?? [$out['coll']], true) && perm_view($role, $out['coll'], $out['data'], $out['id']) === null) { $out['deleted'] = true; $out['data'] = null; return $out; }   // plus visible (note devenue personnelle, véhicule sorti du garage…) : retirée chez la personne
    if (isset(LIMITED_COLLS[$role])) {
        if (!in_array($out['coll'], LIMITED_COLLS[$role], true)) return null;
        if (!$out['deleted']) $out['data'] = perm_view($role, $out['coll'], $out['data'], $out['id']);
        return $out;
    }
    if ($role !== 'terrain') return $out;
    if (in_array($out['coll'], TERRAIN_HIDDEN, true)) return null;
    if (!$out['deleted']) $out['data'] = perm_view($role, $out['coll'], $out['data'], $out['id']);
    return $out;
}

function is_field_draft($d) {
    return is_array($d) && ($d['kind'] ?? '') === 'facture' && ($d['status'] ?? '') === 'brouillon'
        && in_array($d['source'] ?? '', TERRAIN_DOC_SOURCES, true);
}

// Vérifie une écriture et renvoie les données à enregistrer.
//   $op : 'put' | 'patch' | 'delete' ; $old : document actuel (null s'il n'existe pas) ;
//   $new : document final (après fusion pour un patch), $patch : corps brut d'un patch.
function perm_write($role, $coll, $op, $old, $new, $patch = null, $id = null) {
    if ($coll === 'userPrefs') { if ($id === null || !prefs_mine($id)) deny('Préférences d\'un autre utilisateur.'); return $new; }
    if ($coll === 'notes') { if (isset(LIMITED_COLLS[$role]) && is_array($new)) $new['team'] = false; return notes_write($role, $op, $old, $new); }
    if (isset(LIMITED_COLLS[$role])) return limited_write($role, $coll, $op, $old, $new, $id);
    if ($coll === 'payments') deny("Les paiements sont tenus par le serveur : utilisez « Payer » sur la facture d'achat.");
    if ($coll === 'bankTx' && is_array($old) && in_array($old['source'] ?? '', ['ponto', 'coda'], true)) {   // mouvement lu à la banque : seuls les liens et notes de l'ERP sont modifiables
        if ($op === 'delete') deny("Ce mouvement vient de la banque : il ne peut pas être supprimé.");
        foreach (BANK_TX_KEYS as $k) { if (array_key_exists($k, $old)) $new[$k] = $old[$k]; else unset($new[$k]); }
        return $new;
    }
    if ($coll === 'codaFiles') deny("L'historique CODA est tenu par le serveur : utilisez « Générer » ou « Annuler ».");
    // Factures d'achat lues dans Falco : seuls les champs propres à l'ERP (archivage, note) sont modifiables.
    if ($coll === 'purchases' && is_array($old) && ($old['source'] ?? '') === 'falco') {
        if ($op === 'delete') deny("Cette facture vient de Falco : elle ne peut pas être supprimée ici (archivez-la).");
        foreach (FP_KEYS as $k) { if (array_key_exists($k, $old)) $new[$k] = $old[$k]; else unset($new[$k]); }
        return $new;
    }
    // Données gérées dans Odoo (liaison active ou non) : on ne les modifie pas dans l'ERP, quel que soit le rôle.
    if (is_array($old) && ($old['source'] ?? '') === 'odoo') {
        if ($coll === 'docs') deny("Ce document vient d'Odoo : modifiez-le dans Odoo, il se met à jour ici automatiquement.");
        if (in_array($coll, ['clients', 'products'], true)) {
            if ($op === 'delete') deny("Cette fiche vient d'Odoo : archivez-la dans Odoo.");
            if ($role === 'terrain') deny();
            foreach ($coll === 'clients' ? ODOO_CLIENT_KEYS : ODOO_PRODUCT_KEYS as $k) { if (array_key_exists($k, $old)) $new[$k] = $old[$k]; else unset($new[$k]); }
            return $new;
        }
    }
    if ($coll === 'docs' && $op !== 'delete' && ($new['source'] ?? '') === 'odoo' && $role !== 'admin') deny();
    if ($role === 'admin') return $new;
    if ($coll === 'settings') {
        if ($op === 'delete') deny();
        $base = $old ?: [];
        if ($role === 'bureau') {
            foreach (COMPANY_IDENTITY as $k) { if (array_key_exists($k, $base)) $new[$k] = $base[$k]; else unset($new[$k]); }
            return $new;
        }
        // terrain : on repart du document actuel et on ne reprend que les champs autorisés
        $res = $base;
        foreach (TERRAIN_SETTINGS as $k) { if (array_key_exists($k, $new)) $res[$k] = $new[$k]; else unset($res[$k]); }
        return $res;
    }
    if ($role === 'bureau') return $new;

    // terrain
    if (in_array($coll, TERRAIN_HIDDEN, true) || in_array($coll, TERRAIN_READONLY, true)) deny();
    if ($coll === 'docs') {
        if ($op === 'put') {
            if ($old !== null || !is_field_draft($new)) deny("Votre rôle ne permet que la création de la facture brouillon d'une livraison.");
            return $new;
        }
        if ($op === 'patch') {
            if ($old === null || !is_array($patch) || array_diff(array_keys($patch), TERRAIN_DOC_PATCH)) deny();
            return $new;
        }
        if ($op === 'delete') {
            if ($old !== null && !is_field_draft($old)) deny("Votre rôle ne permet de supprimer que la facture brouillon d'une livraison.");
            return $new;
        }
    }
    return $new;
}
