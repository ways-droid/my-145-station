<?php
// Droits par rôle, appliqués par le serveur (l'interface masque déjà les menus ; ici on garantit).
//
//  Administrateur (et clé d'API) : tout.
//  Bureau  : tout, sauf la gestion des utilisateurs (auth.php) et les coordonnées de l'entreprise
//            (nom, TVA, adresse, e-mail, téléphone) qui restent celles fixées par un administrateur.
//  Terrain : articles et prix, Charge Sheet, documents administratifs : invisibles ; clients en lecture seule ;
//            paramètres : ne peut rien y modifier ; export / import complets : refusés ;
//            personnel : lecture seule, fiche complète pour soi (même e-mail), sinon l'essentiel
//            (nom, fonction, licences sans numéro, qualifications) sans documents ni données personnelles ;
//            roster : lecture seule, sans les remarques du bureau ;
//            shifts (handovers, shiftItems) : saisie permise tant que le shift n'est pas repris (clôturé).
//  (Les rôles propres à la station — Station Lead, Shift Foreman, Engineer… — arrivent avec le module Personnel.)

const TERRAIN_HIDDEN     = ['products', 'adminDocs', 'adminFolders', 'chargeLines'];
const TERRAIN_READONLY   = ['clients', 'settings', 'staff', 'roster', 'labs', 'hotels', 'travel', 'aircraft', 'expiries'];
const STAFF_PUBLIC       = ['name', 'function', 'employer', 'base', 'active', 'ratings', 'shift', 'demo'];

/* fiche du personnel vue par un rôle terrain : la sienne en entier, celles des autres réduites */
function staff_mine($d) { $me = (string) ($GLOBALS['ME_EMAIL'] ?? ''); return $me !== '' && mb_strtolower(trim((string) ($d['email'] ?? ''))) === $me; }
/* roster vu par le terrain : sans les remarques du bureau */
function roster_public($d) { if (is_array($d) && is_array($d['days'] ?? null)) foreach ($d['days'] as $k => $x) if (is_array($x)) unset($d['days'][$k]['note']); return $d; }
/* voyage de l'utilisateur connecté (sa fiche personnel a la même adresse e-mail) */
function travel_mine($d) { static $st = null; if (!is_array($d) || empty($d['staffId'])) return false; $st ??= coll_docs('staff'); $p = $st[(string) $d['staffId']] ?? null; return is_array($p) && staff_mine($p); }
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
   L'auteur courant est $GLOBALS['ME_UID'] (personne connectée, ou personne qui parle à Sindri) ; « * » = clé d'API (sauvegardes). */
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
    if ($coll === 'roster') return roster_public($data);
    if ($coll === 'travel') return travel_mine($data) ? $data : null;
    return $data;
}
// Ligne d'API (doc_out) filtrée : null = à ne pas envoyer.
function perm_out($role, $out) {
    if ($out['coll'] === 'userPrefs') return prefs_mine($out['id']) ? $out : null;
    if ($out['coll'] === 'notes' && !$out['deleted'] && perm_view($role, 'notes', $out['data'], $out['id']) === null) { $out['deleted'] = true; $out['data'] = null; return $out; }   // note devenue personnelle : retirée chez les autres
    if ($role !== 'terrain') return $out;
    if (in_array($out['coll'], TERRAIN_HIDDEN, true)) return null;
    if ($out['coll'] === 'staff' && is_array($out['data'])) $out['data'] = staff_public($out['data']);
    if ($out['coll'] === 'roster' && is_array($out['data'])) $out['data'] = roster_public($out['data']);
    if ($out['coll'] === 'travel' && is_array($out['data']) && !travel_mine($out['data'])) return null;
    return $out;
}

// Vérifie une écriture et renvoie les données à enregistrer.
//   $op : 'put' | 'patch' | 'delete' ; $old : document actuel (null s'il n'existe pas) ;
//   $new : document final (après fusion pour un patch), $patch : corps brut d'un patch.
/* ---------- Shift remis (handed over) : verrouillé pour tous ----------
   Après « Je remets le shift » (out.at), plus aucune modification du shift ni de ses lignes, sauf réactivation
   (handover.reopen = {by, at}) par le Station Lead (fonction « lead » dans Personnel, même e-mail) ou un administrateur,
   ou par un Shift Foreman si le Station Lead l'a autorisé (paramètre reopenForemen). Restent permis sur un shift verrouillé :
   la reprise (in) par l'équipe suivante, l'envoi Notion et la mise à jour Flightradar24. La clé d'API (sauvegardes) passe. */
function me_staff() { static $p = false; if ($p !== false) return $p; $p = null; foreach (coll_docs('staff') as $d) if (is_array($d) && staff_mine($d)) { $p = $d; break; } return $p; }
function can_reopen_shift($role) {
    if ($role === 'admin') return true;
    $fn = (string) ((me_staff() ?? [])['function'] ?? '');
    if ($fn === 'lead') return true;
    return $fn === 'foreman' && !empty((coll_docs('settings')['company'] ?? [])['reopenForemen']);
}
const HO_LOCKED_OK = ['in', 'notion', 'fr24At', 'reopen'];
function shift_lock_write($role, $coll, $op, $old, $new, $patch) {
    $hoId = $coll === 'handovers' ? null : (string) (($old ?? $new)['ho'] ?? '');
    $ho = $coll === 'handovers' ? $old : ($hoId !== '' ? (coll_docs('handovers')[$hoId] ?? null) : null);
    $locked = is_array($ho) && !empty($ho['out']['at']) && empty($ho['reopen']['at']);
    if ($coll === 'handovers' && is_array($old)) {
        $keys = array_unique(array_merge(array_keys($old), array_keys($new ?? [])));
        $changed = array_values(array_filter($keys, fn($k) => json_encode($old[$k] ?? null) !== json_encode(($new ?? [])[$k] ?? null)));
        if (in_array('reopen', $changed, true) && !empty(($new ?? [])['reopen']['at']) && !can_reopen_shift($role)) deny('Seul le Station Lead (ou un Shift Foreman qu\'il a autorisé) peut réactiver un shift remis.');
        if (in_array('out', $changed, true) && !empty($old['out']['at']) && !can_reopen_shift($role)) deny('Seul le Station Lead (ou un Shift Foreman qu\'il a autorisé) peut annuler la remise d\'un shift.');
        if ($locked && array_diff($changed, HO_LOCKED_OK, ['out'])) deny('Ce shift a été remis : il est verrouillé. Le Station Lead peut le réactiver.');
        return;
    }
    if (!$locked) return;
    if ($coll === 'shiftItems' && $op === 'patch' && is_array($patch) && !array_diff(array_keys($patch), ['fr24'])) return;
    deny('Ce shift a été remis : il est verrouillé. Le Station Lead peut le réactiver.');
}
function perm_write($role, $coll, $op, $old, $new, $patch = null, $id = null) {
    if (($coll === 'handovers' || $coll === 'shiftItems') && ($GLOBALS['ME_UID'] ?? '') !== '*') shift_lock_write($role, $coll, $op, $old, $new, $patch);
    if ($coll === 'settings' && is_array($old) && !in_array($role, ['admin', 'bureau'], true) && (string) ((me_staff() ?? [])['function'] ?? '') === 'lead' && $op !== 'delete') {
        $o = $old; $n = $new ?? []; unset($o['reopenForemen'], $n['reopenForemen']);   // le Station Lead règle lui-même la délégation
        if (json_encode($o) === json_encode($n)) return $new;
    }
    if ($coll === 'userPrefs') { if ($id === null || !prefs_mine($id)) deny('Préférences d\'un autre utilisateur.'); return $new; }
    if ($coll === 'notes') return notes_write($role, $op, $old, $new);
    if ($coll === 'staff' && $role !== 'admin') {   // droit Administrateur système : octroyé ou retiré par un administrateur seulement
        if (!empty(($old ?? [])['sysAdmin']) !== !empty(($new ?? [])['sysAdmin']) && $op !== 'delete') deny('Seul un administrateur peut octroyer ou retirer le droit Administrateur système.');
        if ((($old ?? [])['function'] ?? '') === 'hq' || (($new ?? [])['function'] ?? '') === 'hq') { if ($op === 'delete' || (($old ?? [])['function'] ?? '') !== (($new ?? [])['function'] ?? '') || mb_strtolower(trim((string) (($old ?? [])['email'] ?? ''))) !== mb_strtolower(trim((string) (($new ?? [])['email'] ?? '')))) deny('Fonction Headquarters : seul un administrateur peut l\'octroyer, la retirer ou changer son e-mail.'); }
        if (!empty(($old ?? [])['sysAdmin']) && ($op === 'delete' || mb_strtolower(trim((string) ($old['email'] ?? ''))) !== mb_strtolower(trim((string) (($new ?? [])['email'] ?? ''))))) deny('Fiche d\'un administrateur système : seul un administrateur peut changer son e-mail ou la supprimer.');
    }
    if ($role === 'admin') return $new;
    if ($coll === 'settings') {
        if ($op === 'delete' || $role !== 'bureau') deny();
        $base = $old ?: [];
        foreach (COMPANY_IDENTITY as $k) { if (array_key_exists($k, $base)) $new[$k] = $base[$k]; else unset($new[$k]); }
        return $new;
    }
    if ($role === 'bureau') return $new;
    // terrain
    if ($coll === 'handovers' || $coll === 'shiftItems') {   // saisie du shift par l'équipe ; shift repris (handover terminé) : verrouillé
        $ho = $coll === 'handovers' ? $old : (($o = (string) (($old ?? $new)['ho'] ?? '')) !== '' ? (coll_docs('handovers')[$o] ?? null) : null);
        if (is_array($ho) && !empty($ho['in']['at'])) deny('Ce shift est clôturé : seul le bureau peut encore le modifier.');
        if ($coll === 'handovers' && $op === 'delete') deny();
        return $new;
    }
    if ($coll === 'tools') return tools_terrain_write($op, $old, $new);
    if ($coll === 'partMoves' && $op === 'delete') deny();
    if (($coll === 'needs' || $coll === 'situations') && $op === 'delete') deny();   // le bureau supprime ; une situation résolue se clôture
    if ($coll === 'needs' && (string) ((me_staff() ?? [])['function'] ?? '') !== 'lead') {   // approuver, refuser, commander : Station Lead ou bureau
        $a = (string) (($old ?? [])['status'] ?? 'asked'); $b = (string) (($new ?? [])['status'] ?? 'asked');
        if ($a !== $b && !($b === 'received' && $a === 'ordered')) deny('Seul le Station Lead ou le bureau peut approuver, refuser ou commander un besoin.');
        if (!is_array($old) && $b !== 'asked') deny('Seul le Station Lead ou le bureau peut approuver, refuser ou commander un besoin.');
    }   // le magasinier saisit et met à jour, le bureau supprime
    if (in_array($coll, TERRAIN_HIDDEN, true) || in_array($coll, TERRAIN_READONLY, true)) deny();
    return $new;
}
/* outillage : le terrain sort et rentre les outils (champs out et history), le registre reste au bureau */
function tools_usable(array $t) {
    $st = (string) ($t['status'] ?? 'service'); if ($st === '') $st = 'service';
    if ($st !== 'service') return false;
    return ($t['calRequired'] ?? true) === false || empty($t['nextDue']) || (string) $t['nextDue'] >= gmdate('Y-m-d');
}
function tools_terrain_write($op, $old, $new) {
    if ($op === 'delete' || !is_array($old)) deny();
    $hist = (array) ($new['history'] ?? []); $oh = (array) ($old['history'] ?? []);
    // l'historique ne fait que s'allonger (les plus anciennes lignes peuvent tomber au-delà de 300)
    if (count($hist) < min(count($oh), 299) || ($oh && !in_array(end($oh), $hist, false) && count($oh) < 300)) deny('Historique de l\'outil non modifiable.');
    $out = $old; $out['history'] = $hist;
    if (!empty($new['out'])) {
        if (empty($old['out']) && !tools_usable($old)) deny('Outil hors service, au labo ou étalonnage dépassé : il ne peut pas sortir.');
        $out['out'] = $new['out'];
    } else unset($out['out']);
    return $out;
}
