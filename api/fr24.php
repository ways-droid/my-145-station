<?php
// Flightradar24 : suivi des avions du shift par immatriculation (API officielle FR24, offre « API » payante,
// différente de l'abonnement de l'application). Sans clé : la saisie manuelle des heures reste la règle.
// La clé est gardée dans ways_kv et n'est jamais renvoyée au navigateur.
//
//   GET  fr24/status            { configured, hint }
//   POST fr24/config            { key }            (administrateurs)
//   POST fr24/test              {}                 (administrateurs)
//   POST fr24/track             { regs: [..] }     → { items: { REG: { live?, last? } } }
//   POST fr24/aircraft          { reg }            → détails de l'avion (bureau) : ADSBdb (gratuit, sans clé), puis FR24 si besoin
//
// Fournisseur interchangeable : fr24_provider_track() est le seul endroit qui parle à FR24.

const FR24_API = 'https://fr24api.flightradar24.com/api/';

function fr24_key() { return (string) (kv_get('fr24_key') ?? ''); }
function fr24_base() { $b = (string) (kv_get('fr24_base') ?? ''); return $b !== '' ? rtrim($b, '/') . '/' : FR24_API; }   // faux FR24 des tests
function fr24_http($path, $q) {
    $ch = curl_init(fr24_base() . $path . '?' . http_build_query($q));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Accept-Version: v1', 'Authorization: Bearer ' . fr24_key()]]);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) throw new RuntimeException("Flightradar24 injoignable : $err");
    $d = json_decode($res, true);
    if ($st === 401 || $st === 403) throw new RuntimeException('Flightradar24 : clé API refusée (vérifiez la clé et l\'offre API dans Paramètres).');
    if ($st === 402) throw new RuntimeException('Flightradar24 : crédits API épuisés.');
    if ($st === 429) throw new RuntimeException('Flightradar24 : trop de demandes, réessayez dans un instant.');
    if ($st >= 400 || !is_array($d)) throw new RuntimeException('Flightradar24 : ' . (is_array($d) ? (string) ($d['message'] ?? $d['error'] ?? "erreur HTTP $st") : "erreur HTTP $st"));
    return $d;
}
/* détails d'un avion d'après son immatriculation : fabricant, type exact, code OACI, opérateur, Mode S.
   1) ADSBdb (base publique gratuite, sans clé) ; 2) Flightradar24 (vols des 14 derniers jours) si la clé existe et qu'il manque le type ou l'opérateur.
   Le moteur n'est fourni par aucune des deux : il reste à choisir. */
function adsbdb_base() { $b = (string) (kv_get('adsbdb_base') ?? ''); return $b !== '' ? rtrim($b, '/') . '/' : 'https://api.adsbdb.com/v0/'; }
function aircraft_lookup($reg) {
    $out = ['reg' => $reg, 'sources' => [], 'errors' => []];
    $ch = curl_init(adsbdb_base() . 'aircraft/' . rawurlencode($reg));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_USERAGENT => 'my-145-station']);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $a = $res !== false ? ((json_decode($res, true) ?: [])['response']['aircraft'] ?? null) : null;
    if (is_array($a)) {
        $out['sources'][] = 'ADSBdb';
        foreach (['manufacturer' => 'manufacturer', 'typeName' => 'type', 'icaoType' => 'icao_type', 'modeS' => 'mode_s', 'operator' => 'registered_owner',
            'operatorIcao' => 'registered_owner_operator_flag_code', 'country' => 'registered_owner_country_name'] as $k => $src)
            if (is_scalar($a[$src] ?? null) && trim((string) $a[$src]) !== '') $out[$k] = mb_substr(trim((string) $a[$src]), 0, 80);
    } elseif ($res === false) $out['errors'][] = 'ADSBdb injoignable';
    elseif ($st !== 404 && $st !== 200) $out['errors'][] = "ADSBdb : erreur HTTP $st";
    if (fr24_key() !== '' && (empty($out['icaoType']) || empty($out['operatorIcao']))) {
        try {
            $d = fr24_http('flight-summary/full', ['registrations' => $reg, 'flight_datetime_from' => gmdate('Y-m-d\TH:i:s\Z', time() - 14 * 86400), 'flight_datetime_to' => gmdate('Y-m-d\TH:i:s\Z'), 'limit' => 1]);
            $f = ((array) ($d['data'] ?? []))[0] ?? null;
            if (is_array($f)) {
                $out['sources'][] = 'Flightradar24';
                if (empty($out['icaoType']) && !empty($f['type'])) $out['icaoType'] = (string) $f['type'];
                if (empty($out['operatorIcao'])) foreach (['operating_as', 'painted_as'] as $k) if (!empty($f[$k])) { $out['operatorIcao'] = (string) $f[$k]; break; }
                if (empty($out['modeS']) && !empty($f['hex'])) $out['modeS'] = strtoupper((string) $f['hex']);
            }
        } catch (RuntimeException $e) { $out['errors'][] = $e->getMessage(); }
    }
    $out['found'] = !empty($out['sources']);
    return $out;
}
function fr24_norm_reg($r) { return strtoupper(preg_replace('/[^A-Za-z0-9-]/', '', (string) $r)); }
function fr24_key_reg($r) { return str_replace('-', '', fr24_norm_reg($r)); }    // 9H-CAC et 9HCAC : même avion
function fr24_iata($x, $a, $b) { foreach ([$a, $b] as $k) if (!empty($x[$k])) return strtoupper((string) $x[$k]); return ''; }
/* Suivi par immatriculation. FR24 ne donne pas les horaires prévus : seulement les vols en cours (live) et les vols
   passés (flight-summary, filtré sur « first_seen », d'où une fenêtre de 72 h). Pour chaque avion :
   live (en vol), last (dernier vol), arr (dernier atterrissage à la station), dep (dernier décollage de la station). */
function fr24_provider_track(array $regs, $station = '') {
    $regs = array_values(array_unique(array_filter(array_map('fr24_norm_reg', $regs))));
    $out = []; $byKey = []; foreach ($regs as $r) { $out[$r] = []; $byKey[fr24_key_reg($r)] = $r; }
    if (!$regs) return $out;
    $st = strtoupper(preg_replace('/[^A-Za-z]/', '', (string) $station));
    $from = gmdate('Y-m-d\TH:i:s\Z', time() - 72 * 3600); $to = gmdate('Y-m-d\TH:i:s\Z');
    $GLOBALS['FR24_ERRORS'] = [];
    foreach (array_chunk($regs, 15) as $chunk) {
        $list = implode(',', $chunk);
        try { $live = fr24_http('live/flight-positions/full', ['registrations' => $list]); }
        catch (RuntimeException $e) { $GLOBALS['FR24_ERRORS'][] = 'Vols en cours : ' . $e->getMessage(); $live = []; }
        foreach ((array) ($live['data'] ?? []) as $p) { $r = $byKey[fr24_key_reg($p['reg'] ?? '')] ?? null; if ($r === null) { $GLOBALS['FR24_FOREIGN'] = ($GLOBALS['FR24_FOREIGN'] ?? 0) + 1; continue; }
            $out[$r]['live'] = ['flight' => (string) ($p['flight'] ?? $p['callsign'] ?? ''), 'from' => fr24_iata($p, 'orig_iata', 'orig_icao'), 'to' => fr24_iata($p, 'dest_iata', 'dest_icao'),
                'eta' => (string) ($p['eta'] ?? ''), 'alt' => (int) ($p['alt'] ?? 0), 'gspeed' => (int) ($p['gspeed'] ?? 0), 'type' => (string) ($p['type'] ?? ''), 'at' => (string) ($p['timestamp'] ?? '')]; }
        try { $sum = fr24_http('flight-summary/full', ['registrations' => $list, 'flight_datetime_from' => $from, 'flight_datetime_to' => $to]); }
        catch (RuntimeException $e) { $GLOBALS['FR24_ERRORS'][] = 'Vols récents : ' . $e->getMessage(); $sum = []; }
        foreach ((array) ($sum['data'] ?? []) as $f) { $r = $byKey[fr24_key_reg($f['reg'] ?? '')] ?? null; if ($r === null) { $GLOBALS['FR24_FOREIGN'] = ($GLOBALS['FR24_FOREIGN'] ?? 0) + 1; continue; }
            $x = ['flight' => (string) ($f['flight'] ?? $f['callsign'] ?? ''), 'from' => fr24_iata($f, 'orig_iata', 'orig_icao'), 'to' => fr24_iata($f, 'dest_iata_actual', 'dest_iata') ?: fr24_iata($f, 'dest_icao_actual', 'dest_icao'),
                'takeoff' => (string) ($f['datetime_takeoff'] ?? ''), 'landed' => (string) ($f['datetime_landed'] ?? ''), 'type' => (string) ($f['type'] ?? '')];
            if (!isset($out[$r]['last']) || strcmp($x['takeoff'], $out[$r]['last']['takeoff']) > 0) $out[$r]['last'] = $x;
            if ($st !== '' && $x['to'] === $st && $x['landed'] !== '' && (!isset($out[$r]['arr']) || strcmp($x['landed'], $out[$r]['arr']['at']) > 0)) $out[$r]['arr'] = ['at' => $x['landed'], 'from' => $x['from'], 'flight' => $x['flight']];
            if ($st !== '' && $x['from'] === $st && $x['takeoff'] !== '' && (!isset($out[$r]['dep']) || strcmp($x['takeoff'], $out[$r]['dep']['at']) > 0)) $out[$r]['dep'] = ['at' => $x['takeoff'], 'to' => $x['to'], 'flight' => $x['flight']]; }
    }
    return $out;
}

function fr24_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'fr24') return;
    $act = $parts[1] ?? ''; $b = $method === 'POST' ? body_json() : [];
    if ($act === 'status' && $method === 'GET') { $k = fr24_key(); out(['configured' => $k !== '', 'hint' => $k !== '' && $role === 'admin' ? '…' . substr($k, -4) : '']); }
    if ($act === 'config' && $method === 'POST') {
        if ($role !== 'admin') fail(403, 'Réservé aux administrateurs');
        $k = trim((string) ($b['key'] ?? ''));
        if ($k !== '' && !preg_match('/^[A-Za-z0-9|._\-]{8,300}$/', $k)) fail(400, 'Clé API invalide');
        kv_set('fr24_key', $k); log_event('settings', 'fr24', 'update', $k === '' ? 'Flightradar24 déconnecté' : 'Clé Flightradar24 enregistrée');
        out(['ok' => true, 'configured' => $k !== '']);
    }
    if ($act === 'aircraft' && $method === 'POST') {
        if (!in_array($role, ['admin', 'bureau'], true)) fail(403, 'Réservé au bureau');
        $reg = fr24_norm_reg($b['reg'] ?? ''); if (!preg_match('/^[A-Z0-9]{1,3}-?[A-Z0-9]{1,6}$/', $reg)) fail(400, 'Immatriculation invalide');
        out(aircraft_lookup($reg));
    }
    if (fr24_key() === '') fail(400, "Flightradar24 n'est pas configuré : saisissez les heures à la main, ou ajoutez une clé API FR24 dans Paramètres.");
    try {
        if ($act === 'test' && $method === 'POST') { if ($role !== 'admin') fail(403, 'Réservé aux administrateurs'); fr24_http('live/flight-positions/full', ['registrations' => 'TEST-REG']); out(['ok' => true]); }
        if ($act === 'diag' && $method === 'POST') {
            if ($role !== 'admin') fail(403, 'Réservé aux administrateurs');
            $reg = fr24_norm_reg($b['reg'] ?? ''); if ($reg === '') fail(400, 'Immatriculation manquante');
            $from = gmdate('Y-m-d\TH:i:s\Z', time() - 72 * 3600); $to = gmdate('Y-m-d\TH:i:s\Z'); $res = [];
            foreach ([['live/flight-positions/full', ['registrations' => $reg]], ['flight-summary/full', ['registrations' => $reg, 'flight_datetime_from' => $from, 'flight_datetime_to' => $to]]] as [$path, $q]) {
                try { $d = fr24_http($path, $q); $rows = (array) ($d['data'] ?? []);
                    $res[] = ['endpoint' => $path, 'params' => $q, 'ok' => true, 'count' => count($rows), 'keys' => $rows ? array_keys((array) $rows[0]) : array_keys($d),
                        'sample' => array_map(fn($r) => array_intersect_key((array) $r, array_flip(['reg', 'flight', 'callsign', 'orig_iata', 'orig_icao', 'dest_iata', 'dest_icao', 'dest_iata_actual', 'eta', 'datetime_takeoff', 'datetime_landed', 'first_seen', 'timestamp', 'alt'])), array_slice($rows, -3))]; }
                catch (RuntimeException $e) { $res[] = ['endpoint' => $path, 'params' => $q, 'ok' => false, 'error' => $e->getMessage()]; }
            }
            out(['reg' => $reg, 'results' => $res, 'at' => gmdate('c')]);
        }
        if ($act === 'track' && $method === 'POST') {
            $regs = array_slice(array_map('strval', (array) ($b['regs'] ?? [])), 0, 60);
            if (!$regs) fail(400, 'Aucune immatriculation');
            $c = get_doc('settings', 'company'); $set = $c ? (json_decode($c['data'], true) ?: []) : [];
            $items = fr24_provider_track($regs, (string) ($b['station'] ?? $set['stationCode'] ?? ''));
            $errs = $GLOBALS['FR24_ERRORS'] ?? [];
            // FR24 a répondu avec d'autres avions que ceux demandés, et aucun des nôtres : c'est le comportement d'une clé de test (sandbox)
            if (!empty($GLOBALS['FR24_FOREIGN']) && !array_filter($items)) $errs[] = 'Flightradar24 renvoie des données de démonstration : la clé enregistrée est une clé de test (sandbox). Créez une clé de production sur fr24api.flightradar24.com et remplacez-la dans Paramètres.';
            if ($errs && count($errs) >= 2 * (int) ceil(count($regs) / 15)) fail(502, $errs[0]);   // tout a échoué : on le dit
            out(['items' => $items, 'errors' => $errs, 'at' => gmdate('c')]);
        }
    } catch (RuntimeException $e) { fail(502, $e->getMessage()); }
    fail(404, 'Route inconnue');
}
