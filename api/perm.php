<?php
// Droits par rôle, appliqués par le serveur (l'interface masque déjà les menus ; ici on garantit).
//
//  Administrateur (et clé d'API) : tout.
//  Bureau  : tout, sauf la gestion des utilisateurs (auth.php) et les coordonnées de l'entreprise
//            (nom, TVA, adresse, e-mail, téléphone) qui restent celles fixées par un administrateur.
//  Terrain : articles et prix, documents administratifs : invisibles ; clients en lecture seule ;
//            paramètres : ne peut rien y modifier ; export / import complets : refusés ;
//            personnel : lecture seule, fiche complète pour soi (même e-mail), sinon l'essentiel
//            (nom, fonction, licences sans numéro, qualifications) sans documents ni données personnelles.
//  (Les rôles propres à la station — Station Lead, Shift Foreman, Engineer… — arrivent avec le module Personnel.)

const TERRAIN_HIDDEN     = ['products', 'adminDocs', 'adminFolders'];
const TERRAIN_READONLY   = ['clients', 'settings', 'staff'];
const STAFF_PUBLIC       = ['name', 'function', 'employer', 'base', 'active', 'ratings', 'shift', 'demo'];

/* fiche du personnel vue par un rôle terrain : la sienne en entier, celles des autres réduites */
function staff_mine($d) { $me = (string) ($GLOBALS['ME_EMAIL'] ?? ''); return $me !== '' && mb_strtolower(trim((string) ($d['email'] ?? ''))) === $me; }
function staff_public($d) {
    if (!is_array($d) || staff_mine($d)) return $d;
    $o = array_intersect_key($d, array_flip(STAFF_PUBLIC));
    if (isset($d['licences']) && is_array($d['licences'])) $o['licences'] = array_values(array_map(fn($l) => ['cat' => (string) ($l['cat'] ?? '')], array_filter($d['licences'], 'is_array')));
    return $o;
}
const COMPANY_IDENTITY   = ['name', 'vat', 'iban', 'address', 'email', 'phone', 'logo'];

function role_of($who) {
    if (($who['kind'] ?? '') !== 'session') return 'admin';
    $r = $who['user']['role'] ?? 'terrain';
    return in_array($r, ['admin', 'bureau', 'terrain'], true) ? $r : 'terrain';
}
/* bureau ou administrateur (accès complet aux modules de gestion) */
function is_office($r) { return in_array($r, ['admin', 'bureau'], true); }

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
    if ($role !== 'terrain' || $data === null) return $data;
    if (in_array($coll, TERRAIN_HIDDEN, true)) return null;
    if ($coll === 'staff') return staff_public($data);
    return $data;
}
// Ligne d'API (doc_out) filtrée : null = à ne pas envoyer.
function perm_out($role, $out) {
    if ($out['coll'] === 'userPrefs') return prefs_mine($out['id']) ? $out : null;
    if ($out['coll'] === 'notes' && !$out['deleted'] && perm_view($role, 'notes', $out['data'], $out['id']) === null) { $out['deleted'] = true; $out['data'] = null; return $out; }   // note devenue personnelle : retirée chez les autres
    if ($role !== 'terrain') return $out;
    if (in_array($out['coll'], TERRAIN_HIDDEN, true)) return null;
    if ($out['coll'] === 'staff' && is_array($out['data'])) $out['data'] = staff_public($out['data']);
    return $out;
}

// Vérifie une écriture et renvoie les données à enregistrer.
//   $op : 'put' | 'patch' | 'delete' ; $old : document actuel (null s'il n'existe pas) ;
//   $new : document final (après fusion pour un patch), $patch : corps brut d'un patch.
function perm_write($role, $coll, $op, $old, $new, $patch = null, $id = null) {
    if ($coll === 'userPrefs') { if ($id === null || !prefs_mine($id)) deny('Préférences d\'un autre utilisateur.'); return $new; }
    if ($coll === 'notes') return notes_write($role, $op, $old, $new);
    if ($role === 'admin') return $new;
    if ($coll === 'settings') {
        if ($op === 'delete' || $role !== 'bureau') deny();
        $base = $old ?: [];
        foreach (COMPANY_IDENTITY as $k) { if (array_key_exists($k, $base)) $new[$k] = $base[$k]; else unset($new[$k]); }
        return $new;
    }
    if ($role === 'bureau') return $new;
    // terrain
    if (in_array($coll, TERRAIN_HIDDEN, true) || in_array($coll, TERRAIN_READONLY, true)) deny();
    return $new;
}
