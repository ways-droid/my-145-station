<?php
// Liaison WEBFLEET.connect (https://csv.webfleet.com/extern), entièrement côté serveur.
// Les identifiants (compte, utilisateur, mot de passe, clé API) sont saisis par un administrateur
// dans Paramètres et rangés dans ways_kv ; ils ne sont jamais renvoyés au navigateur.
//
//  GET  webfleet/status     état de la liaison (tout utilisateur connecté)
//  POST webfleet/sync       synchronise si nécessaire (positions ≥ 60 s, trajets ≥ 15 min ; tout utilisateur)
//  POST webfleet/config     enregistre les identifiants (administrateur ; champ vide = inchangé)
//  POST webfleet/test       teste la connexion et liste les véhicules Webfleet (administrateur)
//  POST webfleet/disconnect efface les identifiants (administrateur)
//
// Positions → vehPos/<vehicleId> ; trajets → trips/wf-<tripid>. Correspondance : champ webfleetId de la
// fiche véhicule = n° d'objet Webfleet (objectno), sinon nom d'objet ou plaque.

const WF_POS_EVERY   = 60;        // secondes (Webfleet : 6 requêtes / min)
const WF_TRIPS_EVERY = 900;
const WF_DRIVERS_EVERY = 21600;   // secondes : liste des chauffeurs toutes les 6 h       // secondes (Webfleet : 1 requête / min, 15 min recommandées)
const WF_BACKFILL_DAYS = 30;

function wfk($k, $def = '') { $v = kv_get($k, $def); return $v === null ? (string) $def : (string) $v; }
function wf_configured() { return wfk('wf_account') !== '' && wfk('wf_user') !== '' && wfk('wf_pass') !== ''; }

function wf_call($action, $params = []) {
    $q = array_merge([
        'account' => wfk('wf_account'),
        'lang' => 'en', 'outputformat' => 'json', 'useISO8601' => 'true', 'useUTF8' => 'true', 'action' => $action,
    ], $params);
    if (($k = wfk('wf_apikey')) !== '') $q['apikey'] = $k;
    $url = wfk('wf_base', 'https://csv.webfleet.com/extern') . '?' . http_build_query($q);
    /* Webfleet refuse désormais l'identifiant et le mot de passe dans l'URL (erreur 1180) : authentification HTTP Basic */
    $auth = 'Authorization: Basic ' . base64_encode(wfk('wf_user') . ':' . wfk('wf_pass'));
    $code = ''; $msg = ''; $body = false; $status = 0;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $hdr = [];
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_HTTPHEADER => [$auth],
            CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$hdr) { $p = explode(':', $h, 2); if (count($p) === 2) $hdr[strtolower(trim($p[0]))] = trim($p[1]); return strlen($h); }]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $cerr = curl_error($ch);
        curl_close($ch);
        if ($body === false) throw new RuntimeException('Webfleet ne répond pas (' . $cerr . ')');
        $code = $hdr['x-webfleet-errorcode'] ?? ''; $msg = $hdr['x-webfleet-errormessage'] ?? '';
    } else {
        $ctx = stream_context_create(['http' => ['timeout' => 25, 'ignore_errors' => true, 'header' => $auth]]);
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false) throw new RuntimeException('Webfleet ne répond pas');
        foreach ($http_response_header ?? [] as $h) {
            if (stripos($h, 'X-Webfleet-Errorcode:') === 0) $code = trim(substr($h, 21));
            if (stripos($h, 'X-Webfleet-Errormessage:') === 0) $msg = trim(substr($h, 24));
        }
    }
    $data = json_decode($body, true);
    if (is_array($data) && isset($data['errorCode'])) { $code = (string) $data['errorCode']; $msg = $data['errorMsg'] ?? $msg; }
    if ($code !== '' && $code !== '0') throw new RuntimeException("Webfleet : $msg (code $code)", (int) $code);
    if (!is_array($data)) {
        $t = trim((string) $body);
        if ($t === '') return [];   // aucun résultat
        throw new RuntimeException('Réponse Webfleet inattendue : ' . mb_substr($t, 0, 120));
    }
    return array_is_list($data) ? $data : [$data];
}

function wf_norm($s) { return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $s)); }

// Index des véhicules de l'ERP : n° Webfleet, plaque
function wf_vehicle_index() {
    $by = ['id' => [], 'no' => [], 'plate' => []];
    $st = db()->prepare("SELECT id, data FROM ways_docs WHERE coll = 'vehicles' AND deleted = 0");
    $st->execute();
    foreach ($st as $r) {
        $v = json_decode($r['data'], true) ?: [];
        if (!empty($v['webfleetId'])) $by['id'][wf_norm($v['webfleetId'])] = $r['id'];
        elseif (!empty($v['fleetNo'])) $by['no'][wf_fleetno_norm($v['fleetNo'])] = $r['id'];   // identifiant W.A.Y.S. = n° WebFleet
        if (!empty($v['plate'])) $by['plate'][wf_norm($v['plate'])] = $r['id'];
    }
    return $by;
}
function wf_match($idx, $o) {
    foreach ([$o['objectno'] ?? '', $o['objectuid'] ?? '', $o['objectname'] ?? ''] as $k) {
        $k = wf_norm($k); if ($k !== '' && isset($idx['id'][$k])) return $idx['id'][$k];
    }
    $k = wf_fleetno_norm($o['objectno'] ?? ''); if ($k !== '' && isset($idx['no'][$k]) && !in_array($idx['no'][$k], $idx['id'], true)) return $idx['no'][$k];
    foreach ([$o['objectname'] ?? '', $o['description'] ?? ''] as $k) {
        $k = wf_norm($k); if ($k !== '' && isset($idx['plate'][$k])) return $idx['plate'][$k];
    }
    return null;
}
function wf_num($x) { return ($x === null || $x === '') ? null : +$x; }

function wf_sync_positions() {
    $objs = wf_call('showObjectReportExtern');
    $idx = wf_vehicle_index();
    $now = gmdate('c');
    $n = 0; $unmatched = [];
    foreach ($objs as $o) {
        if (!empty($o['deleted']) && $o['deleted'] !== 'false') continue;
        $vid = wf_match($idx, $o);
        if (!$vid) { $unmatched[] = ['objectno' => (string) ($o['objectno'] ?? ''), 'objectname' => (string) ($o['objectname'] ?? '')]; continue; }
        $lat = wf_num($o['latitude_mdeg'] ?? null); $lon = wf_num($o['longitude_mdeg'] ?? null);
        $odo = isset($o['odometer_long']) && $o['odometer_long'] !== '' ? round($o['odometer_long'] / 1000, 1)
             : (isset($o['odometer']) && $o['odometer'] !== '' ? round($o['odometer'] / 10, 1) : null);
        $ign = isset($o['ignition']) ? (int) $o['ignition'] === 1 : null;
        $still = isset($o['standstill']) ? (int) $o['standstill'] === 1 : null;
        $p = [
            'vehicleId' => $vid, 'objectno' => (string) ($o['objectno'] ?? ''),
            'lat' => $lat === null ? null : $lat / 1e6, 'lon' => $lon === null ? null : $lon / 1e6,
            'address' => (string) ($o['postext'] ?? ''), 'at' => (string) ($o['pos_time'] ?? $o['msgtime'] ?? ''),
            'odometer' => $odo, 'speed' => wf_num($o['speed'] ?? null), 'ignition' => $ign,
            'state' => $ign === false ? 'coupe' : ($still === false ? 'route' : ($ign ? 'arret' : null)),
            'driver' => (string) ($o['drivername'] ?? ''), 'source' => 'api', 'importedAt' => $now,
        ];
        $old = get_doc('vehPos', $vid);
        $prev = ($old && !$old['deleted']) ? (json_decode($old['data'], true) ?: []) : [];
        $same = ($prev['at'] ?? null) === $p['at'] && ($prev['odometer'] ?? null) == $p['odometer'] && ($prev['state'] ?? null) === $p['state']
             && ($prev['source'] ?? '') === 'api' && ($prev['driver'] ?? '') === $p['driver'];
        if ($same) continue;
        write_doc('vehPos', $vid, $p, 'webfleet');
        $n++;
    }
    kv_set('wf_objects', (string) count($objs));
    kv_set('wf_unmatched', json_encode($unmatched, JSON_UNESCAPED_UNICODE));
    return $n;
}

function wf_sync_trips() {
    $last = (int) wfk('wf_trips_done', '0');      // ms : fin couverte par la dernière synchro réussie
    $from = $last ? max($last - 86400000, now_ms() - WF_BACKFILL_DAYS * 86400000) : now_ms() - WF_BACKFILL_DAYS * 86400000;
    $tz = new DateTimeZone('Europe/Brussels');
    $f = (new DateTime('@' . intdiv($from, 1000)))->setTimezone($tz)->format('Y-m-d\TH:i:sP');
    $t = (new DateTime('now', $tz))->format('Y-m-d\TH:i:sP');
    $rows = wf_call('showTripReportExtern', ['range_pattern' => 'ud', 'rangefrom_string' => $f, 'rangeto_string' => $t]);
    $idx = wf_vehicle_index();
    $now = gmdate('c');
    $modes = [1 => 'private', 2 => 'business', 3 => 'commute'];
    $n = 0;
    foreach ($rows as $r) {
        $tid = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($r['tripid'] ?? ''));
        if ($tid === '') continue;
        $vid = wf_match($idx, $r);
        if (!$vid) continue;
        $id = 'wf-' . substr($tid, 0, 60);
        $sl = wf_num($r['start_latitude'] ?? null); $sn = wf_num($r['start_longitude'] ?? null);
        $el = wf_num($r['end_latitude'] ?? null);   $en = wf_num($r['end_longitude'] ?? null);
        $trip = [
            'vehicleId' => $vid, 'objectno' => (string) ($r['objectno'] ?? ''), 'tripid' => $tid,
            'start' => (string) ($r['start_time'] ?? ''), 'end' => (string) ($r['end_time'] ?? ''),
            'from' => (string) ($r['start_postext'] ?? ''), 'to' => (string) ($r['end_postext'] ?? ''),
            'km' => round((+($r['distance'] ?? 0)) / 1000, 1), 'durationMin' => round((+($r['duration'] ?? 0)) / 60),
            'driver' => (string) ($r['drivername'] ?? ''), 'mode' => $modes[(int) ($r['tripmode'] ?? 0)] ?? '',
            'startOdo' => isset($r['start_odometer']) ? round($r['start_odometer'] / 1000, 1) : null,
            'endOdo' => isset($r['end_odometer']) ? round($r['end_odometer'] / 1000, 1) : null,
            'startLat' => $sl === null ? null : $sl / 1e6, 'startLon' => $sn === null ? null : $sn / 1e6,
            'endLat' => $el === null ? null : $el / 1e6, 'endLon' => $en === null ? null : $en / 1e6,
            'source' => 'api', 'importedAt' => $now,
        ];
        $old = get_doc('trips', $id);
        if ($old && !$old['deleted']) {
            $prev = json_decode($old['data'], true) ?: [];
            if (($prev['end'] ?? '') === $trip['end'] && ($prev['km'] ?? null) == $trip['km'] && ($prev['mode'] ?? '') === $trip['mode'] && ($prev['vehicleId'] ?? '') === $vid) continue;
        }
        write_doc('trips', $id, $trip, 'webfleet');
        $n++;
    }
    kv_set('wf_trips_done', (string) now_ms());
    return $n;
}

// Synchronisation avec verrou (plusieurs navigateurs ouverts) et cadence imposée par Webfleet
/* Chauffeurs : la liste Webfleet (showDriverReportExtern) + les noms vus dans les positions/trajets alimentent
   la liste des chauffeurs de l'ERP (settings/company.drivers). Ajout seulement : un nom déjà proposé une fois
   puis supprimé dans l'ERP n'est pas réajouté (wf_drivers_seen). */
function wf_driver_name($r) {
    $n = trim((string) ($r['name'] ?? ''));
    if ($n === '') $n = trim(implode(' ', array_filter([(string) ($r['name1'] ?? ''), (string) ($r['name2'] ?? ''), (string) ($r['name3'] ?? '')])));
    return preg_replace('/\s+/u', ' ', $n);
}
function wf_sync_drivers() {
    $names = []; $list = [];
    try { $rows = wf_call('showDriverReportExtern'); }
    catch (Throwable $e) { $rows = []; $warn = $e->getMessage(); }
    foreach ((array) $rows as $r) {
        if (!is_array($r)) continue;
        $n = wf_driver_name($r); if ($n === '') continue;
        $names[] = $n;
        $list[] = ['driverno' => (string) ($r['driverno'] ?? ''), 'name' => $n, 'email' => (string) ($r['email'] ?? ''), 'phone' => (string) ($r['phonemobile'] ?? ($r['phonebusiness'] ?? ''))];
    }
    foreach (['vehPos', 'trips'] as $c) {
        $st = db()->prepare('SELECT data FROM ways_docs WHERE coll = ? AND deleted = 0');
        $st->execute([$c]);
        foreach ($st as $row) { $d = json_decode($row['data'], true) ?: []; if (($d['source'] ?? '') === 'api' && trim((string) ($d['driver'] ?? '')) !== '') $names[] = preg_replace('/\s+/u', ' ', trim($d['driver'])); }
    }
    $key = fn($x) => mb_strtolower(trim($x));
    $seen = json_decode(wfk('wf_drivers_seen', '[]'), true) ?: [];
    $seenK = array_flip(array_map($key, $seen));
    $old = get_doc('settings', 'company');
    $set = ($old && !$old['deleted']) ? (json_decode($old['data'], true) ?: []) : [];
    $have = array_values(array_filter((array) ($set['drivers'] ?? []), 'is_string'));
    $haveK = array_flip(array_map($key, $have));
    $added = [];
    foreach (array_unique($names) as $n) {
        $k = $key($n);
        if (isset($seenK[$k])) continue;
        $seenK[$k] = 1; $seen[] = $n;
        if (isset($haveK[$k])) continue;
        $haveK[$k] = 1; $have[] = $n; $added[] = $n;
    }
    $wfNames = array_values(array_unique(array_merge((array) ($set['wfDrivers'] ?? []), $names)));
    if ($added || $wfNames != ($set['wfDrivers'] ?? [])) {
        $set['drivers'] = $have; $set['wfDrivers'] = $wfNames;
        write_doc('settings', 'company', $set, 'webfleet');
    }
    kv_set('wf_drivers_seen', json_encode($seen, JSON_UNESCAPED_UNICODE));
    kv_set('wf_drivers_list', json_encode($list, JSON_UNESCAPED_UNICODE));
    foreach ((array) $rows as $r) if (is_array($r) && wf_driver_name($r) !== '') wf_driver_upsert($r);
    if (empty($warn) && $rows) wf_mark_gone($rows);   // jamais sur une liste vide ou en erreur
    return count($added);
}

/* Chauffeurs désactivés (ou supprimés) dans WebFleet : ils disparaissent de la liste des actifs.
   La fiche reste (amendes, trajets) avec wfGone = date de disparition ; réapparition = wfGone retiré. */
function wf_mark_gone($rows) {
    $uids = $nos = [];
    foreach ((array) $rows as $r) if (is_array($r)) {
        if (($u = (string) ($r['driveruid'] ?? '')) !== '') $uids[$u] = 1;
        if (($n = (string) ($r['driverno'] ?? '')) !== '') $nos[$n] = 1;
    }
    $gone = $back = 0;
    foreach (od_coll_docs('drivers') as $id => $d) {
        $wf = $d['wf'] ?? null; if (!is_array($wf) || (($wf['driveruid'] ?? '') === '' && ($wf['driverno'] ?? '') === '')) continue;   // fiche créée dans l'ERP
        $here = ($wf['driveruid'] ?? '') !== '' ? isset($uids[$wf['driveruid']]) : isset($nos[$wf['driverno']]);
        if (!$here && empty($d['wfGone'])) { $d['wfGone'] = gmdate('c'); write_doc('drivers', $id, $d, 'webfleet'); log_event('drivers', $id, 'update', (string) ($d['name'] ?? ''), 'Désactivé dans WebFleet (absent de la liste des chauffeurs actifs)'); $gone++; }
        elseif ($here && !empty($d['wfGone'])) { unset($d['wfGone']); write_doc('drivers', $id, $d, 'webfleet'); log_event('drivers', $id, 'update', (string) ($d['name'] ?? ''), 'De nouveau actif dans WebFleet'); $back++; }
    }
    return ['gone' => $gone, 'back' => $back];
}

/* fiches chauffeur (collection drivers) : WebFleet est recopié dans « wf » (miroir) ; les champs de l'ERP
   ne sont remplis depuis WebFleet que s'ils sont vides (ce que le bureau a saisi n'est jamais écrasé). */
const WF_DRV_MAP = ['name' => 'name', 'company' => 'company', 'phone' => 'telmobile', 'phonePrivate' => 'telprivate', 'email' => 'email',
    'street' => 'street', 'zip' => 'zip', 'city' => 'city', 'country' => 'country', 'cardId' => 'dt_cardid', 'info' => 'description'];
function wf_driver_snapshot($r) {
    $lic = json_decode((string) ($r['driving_license'] ?? ''), true);
    return array_filter([
        'driverno' => (string) ($r['driverno'] ?? ''), 'driveruid' => (string) ($r['driveruid'] ?? ''), 'name' => wf_driver_name($r),
        'company' => (string) ($r['company'] ?? ''), 'telmobile' => (string) ($r['telmobile'] ?? ''), 'telprivate' => (string) ($r['telprivate'] ?? ''),
        'email' => (string) ($r['email'] ?? ''), 'street' => (string) ($r['street'] ?? ''), 'zip' => (string) ($r['zip'] ?? ''), 'city' => (string) ($r['city'] ?? ''),
        'country' => (string) ($r['state'] ?? ($r['country'] ?? '')), 'dt_cardid' => (string) ($r['dt_cardid'] ?? ''),
        'description' => mb_substr((string) ($r['description'] ?? ''), 0, 4000),
        'objectno' => (string) ($r['objectno'] ?? ''), 'signontime' => (string) ($r['signontime'] ?? ''),
        'workstate' => isset($r['current_workstate']) && $r['current_workstate'] !== '' ? (int) $r['current_workstate'] : null,
        'license' => is_array($lic) ? array_filter(['number' => (string) ($lic['number'] ?? ''), 'expiry' => substr((string) ($lic['expiry_date'] ?? ''), 0, 10), 'types' => $lic['types'] ?? null]) : null,
    ], fn($v) => $v !== '' && $v !== null && $v !== []);
}
function wf_driver_find($snap) {
    static $idx = null;
    if ($idx === null) { $idx = []; foreach (od_coll_docs('drivers') as $id => $d) {
        foreach (['u:' . ($d['wf']['driveruid'] ?? ''), 'n:' . ($d['wf']['driverno'] ?? ''), 'm:' . mb_strtolower(trim((string) ($d['name'] ?? '')))] as $k) if (!preg_match('/^.:$/', $k)) $idx[$k] = $id; } }
    foreach (['u:' . ($snap['driveruid'] ?? ''), 'n:' . ($snap['driverno'] ?? ''), 'm:' . mb_strtolower($snap['name'] ?? '')] as $k) if (!preg_match('/^.:$/', $k) && isset($idx[$k])) return $idx[$k];
    $id = 'wf-' . (preg_replace('/[^A-Za-z0-9]/', '', $snap['driverno'] ?? '') ?: substr(md5($snap['name']), 0, 10));
    $idx['n:' . ($snap['driverno'] ?? '')] = $id; $idx['m:' . mb_strtolower($snap['name'])] = $id;
    return $id;
}
function wf_driver_upsert($r, $by = 'webfleet') {
    $snap = wf_driver_snapshot($r); $id = wf_driver_find($snap);
    $old = get_doc('drivers', $id); $d = ($old && !$old['deleted']) ? (json_decode($old['data'], true) ?: []) : null;
    if ($old && $old['deleted']) return null;                     // supprimée dans l'ERP : on ne la recrée pas
    $prevSnap = $d['wf'] ?? null; unset($prevSnap['syncedAt']);
    $new = $d ?? [];
    foreach (WF_DRV_MAP as $k => $w) if (trim((string) ($new[$k] ?? '')) === '' && ($snap[$w] ?? '') !== '') $new[$k] = $snap[$w];
    if (empty($new['licenseNo']) && !empty($snap['license']['number'])) $new['licenseNo'] = $snap['license']['number'];
    if (empty($new['licenseExpiry']) && !empty($snap['license']['expiry'])) $new['licenseExpiry'] = $snap['license']['expiry'];
    if ($d !== null && $prevSnap == $snap && $new == $d) return $id;
    $new['wf'] = $snap + ['syncedAt' => gmdate('c')];
    write_doc('drivers', $id, $new, $by);
    return $id;
}

/* ---------- import des véhicules WebFleet qui n'ont pas encore de fiche ---------- */
function wf_fleetno_norm($x) { $t = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $x)); return preg_match('/^\d+$/', $t) ? str_pad($t, 3, '0', STR_PAD_LEFT) : $t; }
function wf_used_fleetnos() {   // identifiants W.A.Y.S. déjà pris, y compris par des fiches supprimées : jamais réutilisés
    $used = [];
    $st = db()->prepare("SELECT data FROM ways_docs WHERE coll = 'vehicles'"); $st->execute();
    foreach ($st as $r) { $n = wf_fleetno_norm((json_decode($r['data'], true) ?: [])['fleetNo'] ?? ''); if ($n !== '') $used[$n] = 1; }
    $c = get_doc('settings', 'company'); $set = $c ? (json_decode($c['data'], true) ?: []) : [];
    foreach ((array) ($set['usedFleetNos'] ?? []) as $n) { $n = wf_fleetno_norm($n); if ($n !== '') $used[$n] = 1; }
    return $used;
}
function wf_plate_in($s) {
    return preg_match('/\b(\d-?[A-Z]{3}-?\d{3}|[A-Z]{3}-?\d{3}|\d{3}-?[A-Z]{3})\b/', strtoupper((string) $s), $m) ? $m[1] : '';
}
/* Règle W.A.Y.S. : l'identifiant de la fiche = le n° de véhicule (objet) WebFleet, à l'identique.
   $dry : liste ce qui serait fait.
   - create : objet WebFleet sans fiche (ni par n°, ni par plaque) → fiche créée avec identifiant = n° WebFleet
   - link   : fiche de même identifiant ou de même plaque, pas encore reliée → reliée
   - rename : fiche reliée (ou de même plaque) dont l'identifiant diffère → identifiant aligné sur WebFleet (l'ancien reste réservé)
   - conflict : le n° WebFleet est déjà l'identifiant d'une autre fiche (ou d'un véhicule supprimé) → rien n'est fait, à régler à la main */
function wf_import_vehicles($dry) {
    $rich = true;
    try { $rows = wf_call('showVehicleReportExtern'); } catch (Throwable $e) { $rich = false; $rows = wf_call('showObjectReportExtern'); }
    $now = gmdate('c'); $who = $GLOBALS['LOG_WHO'] ?? 'webfleet';
    /* toutes les fiches (supprimées comprises, pour les identifiants réservés) */
    $all = []; $st = db()->prepare("SELECT id, data, deleted FROM ways_docs WHERE coll = 'vehicles'"); $st->execute();
    foreach ($st as $r) $all[$r['id']] = ['d' => json_decode($r['data'], true) ?: [], 'del' => (int) $r['deleted']];
    $c = get_doc('settings', 'company'); $set = $c ? (json_decode($c['data'], true) ?: []) : [];
    $reserved = []; foreach ((array) ($set['usedFleetNos'] ?? []) as $n) if (($n = wf_fleetno_norm($n)) !== '') $reserved[$n] = 1;
    $byNo = $byPlate = $byWf = [];
    foreach ($all as $id => $x) {
        if (($n = wf_fleetno_norm($x['d']['fleetNo'] ?? '')) !== '') $byNo[$n][] = $id;
        if ($x['del']) continue;
        if (($p = wf_norm($x['d']['plate'] ?? '')) !== '') $byPlate[$p] = $id;
        if (($w = wf_norm($x['d']['webfleetId'] ?? '')) !== '') $byWf[$w] = $id;
    }
    $lab = fn($id) => trim(($all[$id]['d']['fleetNo'] ?? '') . ' ' . ($all[$id]['d']['plate'] ?? '') . ' ' . ($all[$id]['d']['model'] ?? '')) . ($all[$id]['del'] ? ' (supprimé)' : (!empty($all[$id]['d']['retired']) ? ' (retiré)' : ''));
    $out = []; $seen = []; $addReserved = [];
    foreach ($rows as $o) {
        if (!empty($o['deleted']) && $o['deleted'] !== 'false') continue;
        $objno = trim((string) ($o['objectno'] ?? '')); $name = trim((string) ($o['objectname'] ?? '')); $desc = trim((string) ($o['description'] ?? ''));
        if ($objno === '' || isset($seen[$objno])) continue; $seen[$objno] = 1;
        $no = wf_fleetno_norm($objno);
        $plate = strtoupper(trim((string) ($o['licenseplatenumber'] ?? ''))) ?: wf_plate_in("$name $desc");
        $base = ['objectno' => $objno, 'objectname' => $name, 'plate' => $plate, 'fleetNo' => $no];
        if (!preg_match('/^[A-Z0-9]{1,6}$/', $no)) { $out[] = $base + ['action' => 'conflict', 'why' => "Le n° WebFleet « $objno » ne peut pas servir d'identifiant (1 à 6 lettres ou chiffres)."]; continue; }
        /* la fiche de ce véhicule : déjà reliée, sinon même plaque, sinon même identifiant */
        $vid = $byWf[wf_norm($objno)] ?? null;
        if (!$vid && $plate !== '') $vid = $byPlate[wf_norm($plate)] ?? null;
        $sameNo = array_values(array_filter($byNo[$no] ?? [], fn($i) => !$all[$i]['del']));
        if (!$vid && count($sameNo) === 1) {
            $cand = $sameNo[0]; $cp = wf_norm($all[$cand]['d']['plate'] ?? '');
            if ($plate === '' || $cp === '' || $cp === wf_norm($plate)) $vid = $cand;
        }
        $others = array_values(array_filter($byNo[$no] ?? [], fn($i) => $i !== $vid));
        if ($vid) {
            $v = $all[$vid]['d']; $cur = wf_fleetno_norm($v['fleetNo'] ?? ''); $linked = wf_norm($v['webfleetId'] ?? '') === wf_norm($objno);
            if ($cur === $no) {
                if ($linked) continue;   // déjà en ordre
                $out[] = $base + ['action' => 'link', 'vehicleId' => $vid, 'model' => $v['model'] ?? ''];
                if (!$dry) { $v['webfleetId'] = $objno; write_doc('vehicles', $vid, $v, $who); log_event('vehicles', $vid, 'webfleet', $lab($vid), "Relié au véhicule WebFleet $objno"); }
                continue;
            }
            if ($others || isset($reserved[$no])) { $out[] = $base + ['action' => 'conflict', 'vehicleId' => $vid, 'model' => $v['model'] ?? '',
                'why' => "La fiche " . $lab($vid) . " devrait prendre l'identifiant $no, mais il est déjà " . ($others ? "celui de " . implode(', ', array_map($lab, $others)) : "réservé (véhicule supprimé)") . '.']; continue; }
            $out[] = $base + ['action' => 'rename', 'vehicleId' => $vid, 'from' => $cur, 'model' => $v['model'] ?? ''];
            if (!$dry) {
                if ($cur !== '') $addReserved[$cur] = 1;
                $v['fleetNo'] = $no; $v['webfleetId'] = $objno; write_doc('vehicles', $vid, $v, $who);
                log_event('vehicles', $vid, 'webfleet', trim("$no " . ($v['plate'] ?? '')), "Identifiant aligné sur WebFleet : " . ($cur ?: '—') . " → $no");
            }
            $byNo[$no] = [$vid];
            continue;
        }
        if ($others || isset($reserved[$no])) { $out[] = $base + ['action' => 'conflict', 'model' => $desc,
            'why' => "L'identifiant $no est déjà " . ($others ? "celui de " . implode(', ', array_map($lab, $others)) : "réservé (véhicule supprimé)") . " : fiche non créée."]; continue; }
        $model = $desc !== '' ? $desc : (string) ($o['vehicletype'] ?? '');
        if ($model === '') $model = trim(preg_replace('/^\s*' . preg_quote($objno, '/') . '\s*[-–:·]?\s*/i', '', str_ireplace($plate, '', $name)), " -–·");
        $fuel = ['1' => 'Diesel', '2' => 'Essence', '3' => 'Essence/LPG', '4' => 'CNG', '6' => 'Électrique'][(string) ($o['fueltype'] ?? '')] ?? '';
        $v = ['fleetNo' => $no, 'plate' => $plate, 'model' => mb_substr($model, 0, 80), 'color' => (string) ($o['vehiclecolor'] ?? ''), 'year' => (string) ((int) ($o['manufacturedyear'] ?? 0) ?: ''),
              'fuel' => $fuel, 'vin' => strtoupper((string) ($o['identno'] ?? '')), 'km' => 0, 'status' => 'actif', 'driver' => '', 'driverDate' => '', 'webfleetId' => $objno,
              'nextServiceDate' => '', 'nextServiceKm' => 0, 'ctDate' => '', 'insuranceDate' => '', 'docs' => [], 'importedFrom' => 'webfleet', 'createdAt' => $now];
        $out[] = $base + ['action' => 'create', 'model' => $v['model']];
        $byNo[$no] = ['new'];
        if (!$dry) { $id = base_convert((string) now_ms(), 10, 36) . bin2hex(random_bytes(3)); write_doc('vehicles', $id, $v, $who);
            log_event('vehicles', $id, 'create', trim("$no $plate"), "Fiche créée depuis WebFleet (véhicule $objno)"); }
    }
    if (!$dry && $addReserved) {   // les anciens identifiants restent réservés
        $c = get_doc('settings', 'company'); $set = $c ? (json_decode($c['data'], true) ?: []) : [];
        $set['usedFleetNos'] = array_values(array_unique(array_merge((array) ($set['usedFleetNos'] ?? []), array_keys($addReserved))));
        write_doc('settings', 'company', $set, $who);
    }
    if (!$dry && array_filter($out, fn($x) => $x['action'] !== 'conflict')) { kv_set('wf_trips_done', '0'); kv_set('wf_trips_at', '0'); }   // rattrape 30 jours de trajets
    return ['ok' => true, 'dry' => $dry, 'rich' => $rich, 'items' => $out];
}

/* ---------- envoi vers WebFleet (bouton du bureau, jamais automatique) ---------- */
const WF_FUEL = ['diesel' => 1, 'essence' => 2];
function wf_objectno_of($vid, $v) {
    $p = get_doc('vehPos', $vid); $pd = ($p && !$p['deleted']) ? (json_decode($p['data'], true) ?: []) : [];
    return (string) (($pd['objectno'] ?? '') ?: ($v['webfleetId'] ?? ''));
}
function wf_push_vehicle($vid, $b) {
    $r = get_doc('vehicles', $vid); if (!$r || $r['deleted']) fail(404, 'Véhicule introuvable');
    $v = json_decode($r['data'], true) ?: [];
    $obj = wf_objectno_of($vid, $v); if ($obj === '') fail(400, "Ce véhicule n'est pas relié à WebFleet (identifiant WebFleet vide).");
    $q = ['objectno' => $obj]; $what = [];
    if (isset($b['odometer'])) {
        $km = (float) $b['odometer']; if ($km <= 0 || $km > 5000000) fail(400, 'Kilométrage invalide');
        $q['odometer'] = (string) (int) round($km * 1000); $what[] = 'compteur ' . number_format($km, 1, ',', ' ') . ' km';
    }
    if (!empty($b['details'])) {
        if (!empty($v['plate'])) { $q['licenseplatenumber'] = mb_substr($v['plate'], 0, 20); $what[] = 'immatriculation'; }
        if ((int) ($v['year'] ?? 0) > 1900) { $q['manufacturedyear'] = (string) (int) $v['year']; $what[] = 'année'; }
        if ((float) ($v['kw'] ?? 0) > 0) { $q['power'] = (string) (float) $v['kw']; $what[] = 'puissance'; }
        if ((int) ($v['cc'] ?? 0) > 0) { $q['enginesize'] = (string) (int) $v['cc']; $what[] = 'cylindrée'; }
        $f = WF_FUEL[mb_strtolower(trim((string) ($v['fuel'] ?? '')))] ?? null; if ($f) { $q['fueltype'] = (string) $f; $what[] = 'carburant'; }
    }
    if (count($q) === 1) fail(400, 'Rien à envoyer');
    try { wf_call('updateVehicle', $q); } catch (Throwable $e) { fail(502, wf_push_err($e)); }
    if (isset($q['odometer'])) {   // l'ERP repart aussitôt de la valeur corrigée
        $km = round((float) $b['odometer'], 1);
        $p = get_doc('vehPos', $vid);
        if ($p && !$p['deleted']) { $pd = json_decode($p['data'], true) ?: []; $pd['odometer'] = $km; write_doc('vehPos', $vid, $pd, 'webfleet'); }
        $v['km'] = $km; write_doc('vehicles', $vid, $v, $GLOBALS['LOG_WHO'] ?? 'ERP');
    }
    log_event('vehicles', $vid, 'webfleet', trim('Véhicule ' . ($v['fleetNo'] ?? '') . ' ' . ($v['plate'] ?? '')), 'Envoyé à WebFleet : ' . implode(', ', $what));
    out(['ok' => true, 'sent' => $what]);
}
function wf_push_err($e) {
    $m = $e->getMessage();
    if (preg_match('/permission|not allowed|authori[sz]|right|denied/i', $m))
        return "WebFleet refuse la modification : l'utilisateur WebFleet de l'ERP n'a sans doute pas le droit de modifier (à activer dans WebFleet, Administration → Utilisateurs). Détail : $m";
    return "WebFleet a refusé : $m";
}
function wf_push_driver($id) {
    $r = get_doc('drivers', $id); if (!$r || $r['deleted']) fail(404, 'Chauffeur introuvable');
    $d = json_decode($r['data'], true) ?: [];
    $q = ['name' => mb_substr((string) ($d['name'] ?? ''), 0, 50)];
    foreach (WF_DRV_MAP as $k => $w) if ($k !== 'name' && array_key_exists($k, $d)) $q[$w] = $w === 'description' ? mb_substr((string) $d[$k], 0, 4000) : (string) $d[$k];
    if (isset($q['country'])) $q['country'] = strtoupper(substr(trim($q['country']), 0, 2));
    if (($q['country'] ?? '') === '') unset($q['country']);
    $uid = (string) ($d['wf']['driveruid'] ?? ''); $no = (string) ($d['wf']['driverno'] ?? '');
    try {
        if ($uid !== '' || $no !== '') { $q += $uid !== '' ? ['driveruid' => $uid] : ['driverno_old' => $no]; wf_call('updateDriverExtern', $q); $act = 'mis à jour'; }
        else {
            $no = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($d['driverNo'] ?? ''));
            if ($no === '') fail(400, "Ce chauffeur n'existe pas encore dans WebFleet : indiquez son n° de chauffeur WebFleet dans la fiche pour le créer.");
            wf_call('insertDriverExtern', $q + ['driverno' => mb_substr($no, 0, 15)]); $act = 'créé';
        }
    } catch (RuntimeException $e) { fail(502, wf_push_err($e)); }
    try { $rows = wf_call('showDriverReportExtern', $uid !== '' ? ['driveruid' => $uid] : ['driverno' => $no]); } catch (Throwable $e) { $rows = []; }
    if ($rows && is_array($rows[0])) { $d['wf'] = wf_driver_snapshot($rows[0]) + ['syncedAt' => gmdate('c')]; }
    else { $d['wf'] = ($d['wf'] ?? []) + ['driverno' => $no]; }
    $d['wfPushedAt'] = gmdate('c');
    write_doc('drivers', $id, $d, $GLOBALS['LOG_WHO'] ?? 'ERP');
    log_event('drivers', $id, 'webfleet', 'Chauffeur ' . ($d['name'] ?? ''), "Fiche $act dans WebFleet");
    out(['ok' => true, 'action' => $act, 'record' => $d]);
}

function wf_sync($force = false) {
    if (!wf_configured()) return ['ok' => false, 'configured' => false];
    $t = now_ms();
    $lock = (int) wfk('wf_lock', '0');
    if ($lock && $t - $lock < 120000) return ['ok' => true, 'busy' => true];
    $needPos = $force || $t - (int) wfk('wf_pos_at', '0') >= WF_POS_EVERY * 1000;
    $needTrips = $t - (int) wfk('wf_trips_at', '0') >= WF_TRIPS_EVERY * 1000 || ($force && $t - (int) wfk('wf_trips_at', '0') >= 65000);
    $needDrv = $t - (int) wfk('wf_drv_at', '0') >= WF_DRIVERS_EVERY * 1000 || ($force && $t - (int) wfk('wf_drv_at', '0') >= 65000);
    if (!$needPos && !$needTrips && !$needDrv) return ['ok' => true, 'skipped' => true];
    kv_set('wf_lock', (string) $t);
    $res = ['ok' => true, 'positions' => null, 'trips' => null];
    $errs = [];
    try {
        if ($needPos) {
            kv_set('wf_pos_at', (string) $t);
            try { db()->beginTransaction(); $res['positions'] = wf_sync_positions(); db()->commit(); kv_set('wf_pos_ok', (string) now_ms()); }
            catch (Throwable $e) { if (db()->inTransaction()) db()->rollBack(); $errs[] = 'Positions — ' . $e->getMessage(); }
        }
        if ($needTrips) {
            kv_set('wf_trips_at', (string) $t);
            if ($needPos) sleep(1);
            try { db()->beginTransaction(); $res['trips'] = wf_sync_trips(); db()->commit(); kv_set('wf_trips_ok', (string) now_ms()); }
            catch (Throwable $e) { if (db()->inTransaction()) db()->rollBack(); $errs[] = 'Trajets — ' . $e->getMessage(); }
        }
        if ($needDrv) {
            kv_set('wf_drv_at', (string) $t);
            try { db()->beginTransaction(); $res['drivers'] = wf_sync_drivers(); db()->commit(); }
            catch (Throwable $e) { if (db()->inTransaction()) db()->rollBack(); $errs[] = 'Chauffeurs — ' . $e->getMessage(); }
        }
    } finally { kv_set('wf_lock', '0'); }
    kv_set('wf_error', $errs ? implode(' · ', $errs) . ' (' . gmdate('c') . ')' : '');
    if ($errs) { $res['ok'] = false; $res['error'] = implode(' · ', $errs); }
    return $res;
}

function wf_status($admin) {
    $s = ['configured' => wf_configured(), 'posOk' => (int) wfk('wf_pos_ok', '0') ?: null, 'tripsOk' => (int) wfk('wf_trips_ok', '0') ?: null,
          'error' => wfk('wf_error') ?: null, 'objects' => (int) wfk('wf_objects', '0'),
          'unmatched' => json_decode(wfk('wf_unmatched', '[]'), true) ?: [],
          // clé du fond de carte CARTO : limitée au domaine ways.support par CARTO, elle est forcément lue par le navigateur (URL des tuiles)
          'mapKey' => wfk('map_key') ?: null];
    if ($admin) { $s['account'] = wfk('wf_account'); $s['username'] = wfk('wf_user'); $s['hasApikey'] = wfk('wf_apikey') !== ''; }
    return $s;
}

function webfleet_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'webfleet') return;
    auth_tables();
    $act = $parts[1] ?? '';
    $admin = $role === 'admin';
    if ($act === 'status' && $method === 'GET') out(wf_status($admin));
    if ($act === 'sync' && $method === 'POST') { $b = body_json(); out(wf_sync($admin && !empty($b['force']))); }
    if (in_array($act, ['push-vehicle', 'push-driver'], true) && $method === 'POST') {
        if (!is_office($role)) fail(403, 'Réservé au bureau et aux administrateurs');
        if (!wf_configured()) fail(400, "WebFleet n'est pas connecté (Paramètres).");
        $b = body_json(); $id = (string) ($b['id'] ?? '');
        if ($act === 'push-vehicle') wf_push_vehicle($id, $b); else wf_push_driver($id);
    }
    if (!$admin) fail(403, 'Réservé aux administrateurs');
    if ($act === 'config' && $method === 'POST') {
        $b = body_json();
        foreach (['account' => 'wf_account', 'username' => 'wf_user'] as $f => $k) {
            $v = trim((string) ($b[$f] ?? ''));
            if ($v === '' && wfk($k) === '') fail(400, 'Indiquez le compte et l\'utilisateur Webfleet.');
            if ($v !== '') kv_set($k, mb_substr($v, 0, 100));
        }
        foreach (['password' => 'wf_pass', 'apikey' => 'wf_apikey'] as $f => $k) {
            $v = (string) ($b[$f] ?? '');
            if ($v !== '') kv_set($k, mb_substr($v, 0, 200));
        }
        if (wfk('wf_pass') === '') fail(400, 'Indiquez le mot de passe de l\'utilisateur Webfleet.');
        kv_set('wf_pos_at', '0'); kv_set('wf_trips_at', '0'); kv_set('wf_error', '');
        out(['ok' => true, 'status' => wf_status(true)]);
    }
    if ($act === 'mapkey' && $method === 'POST') {
        $k = trim((string) (body_json()['key'] ?? ''));
        if ($k !== '' && !preg_match('/^[A-Za-z0-9._~-]{8,200}$/', $k)) fail(400, 'Clé invalide : collez la clé reçue de CARTO, sans espace.');
        kv_set('map_key', $k); log_event('settings', 'company', 'update', 'Fond de carte', $k === '' ? 'Clé CARTO retirée' : 'Clé CARTO enregistrée');
        out(['ok' => true, 'status' => wf_status(true)]);
    }
    if ($act === 'import-vehicles' && $method === 'POST') {
        if (!$admin) fail(403, 'Réservé aux administrateurs');
        if (!wf_configured()) fail(400, 'Identifiants Webfleet manquants');
        $b = body_json();
        try { $r = wf_import_vehicles(empty($b['go'])); } catch (Throwable $e) { fail(502, $e->getMessage()); }
        if (!empty($b['go'])) { try { wf_sync_positions(); kv_set('wf_pos_at', (string) now_ms()); } catch (Throwable $e) {} }
        out($r + ['status' => wf_status(true)]);
    }
    if ($act === 'test' && $method === 'POST') {
        if (!wf_configured()) fail(400, 'Identifiants Webfleet manquants');
        try { $objs = wf_call('showObjectReportExtern'); }
        catch (Throwable $e) { fail(502, $e->getMessage()); }
        kv_set('wf_pos_at', (string) now_ms());
        $idx = wf_vehicle_index();
        out(['ok' => true, 'objects' => array_map(fn($o) => ['objectno' => (string) ($o['objectno'] ?? ''), 'objectname' => (string) ($o['objectname'] ?? ''),
            'vehicleId' => wf_match($idx, $o)], $objs)]);
    }
    if ($act === 'disconnect' && $method === 'POST') {
        foreach (['wf_account', 'wf_user', 'wf_pass', 'wf_apikey', 'wf_error', 'wf_unmatched', 'wf_objects', 'wf_pos_ok', 'wf_trips_ok', 'wf_trips_done', 'wf_drv_at', 'wf_drivers_seen', 'wf_drivers_list'] as $k) kv_set($k, '');
        out(['ok' => true]);
    }
    fail(404, 'Route inconnue');
}
