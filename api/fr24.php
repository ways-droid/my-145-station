<?php
// Flightradar24 : suivi des avions du shift par immatriculation (API officielle FR24, offre « API » payante,
// différente de l'abonnement de l'application). Sans clé : la saisie manuelle des heures reste la règle.
// La clé est gardée dans ways_kv et n'est jamais renvoyée au navigateur.
//
//   GET  fr24/status            { configured, hint }
//   POST fr24/config            { key }            (administrateurs)
//   POST fr24/test              {}                 (administrateurs)
//   POST fr24/track             { regs: [..] }     → { items: { REG: { live?, last? } } }
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
function fr24_norm_reg($r) { return strtoupper(preg_replace('/[^A-Za-z0-9-]/', '', (string) $r)); }
function fr24_provider_track(array $regs) {
    $regs = array_values(array_unique(array_filter(array_map('fr24_norm_reg', $regs))));
    $out = []; foreach ($regs as $r) $out[$r] = [];
    if (!$regs) return $out;
    $list = implode(',', array_slice($regs, 0, 15));
    $live = fr24_http('live/flight-positions/full', ['registrations' => $list]);
    foreach ((array) ($live['data'] ?? []) as $p) { $r = fr24_norm_reg($p['reg'] ?? ''); if (!isset($out[$r])) continue;
        $out[$r]['live'] = ['flight' => (string) ($p['flight'] ?? $p['callsign'] ?? ''), 'from' => (string) ($p['orig_iata'] ?? $p['orig_icao'] ?? ''), 'to' => (string) ($p['dest_iata'] ?? $p['dest_icao'] ?? ''),
            'eta' => (string) ($p['eta'] ?? ''), 'alt' => (int) ($p['alt'] ?? 0), 'gspeed' => (int) ($p['gspeed'] ?? 0), 'type' => (string) ($p['type'] ?? ''), 'at' => (string) ($p['timestamp'] ?? '')]; }
    $sum = fr24_http('flight-summary/full', ['registrations' => $list, 'flight_datetime_from' => gmdate('Y-m-d\TH:i:s', time() - 86400), 'flight_datetime_to' => gmdate('Y-m-d\TH:i:s', time() + 3600)]);
    foreach ((array) ($sum['data'] ?? []) as $f) { $r = fr24_norm_reg($f['reg'] ?? ''); if (!isset($out[$r])) continue;
        $x = ['flight' => (string) ($f['flight'] ?? $f['callsign'] ?? ''), 'from' => (string) ($f['orig_iata'] ?? $f['orig_icao'] ?? ''), 'to' => (string) ($f['dest_iata_actual'] ?? $f['dest_iata'] ?? $f['dest_icao'] ?? ''),
            'takeoff' => (string) ($f['datetime_takeoff'] ?? ''), 'landed' => (string) ($f['datetime_landed'] ?? ''), 'type' => (string) ($f['type'] ?? '')];
        if (!isset($out[$r]['last']) || strcmp($x['takeoff'], $out[$r]['last']['takeoff']) > 0) $out[$r]['last'] = $x; }
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
    if (fr24_key() === '') fail(400, "Flightradar24 n'est pas configuré : saisissez les heures à la main, ou ajoutez une clé API FR24 dans Paramètres.");
    try {
        if ($act === 'test' && $method === 'POST') { if ($role !== 'admin') fail(403, 'Réservé aux administrateurs'); fr24_http('live/flight-positions/full', ['registrations' => 'TEST-REG']); out(['ok' => true]); }
        if ($act === 'track' && $method === 'POST') {
            $regs = array_slice(array_map('strval', (array) ($b['regs'] ?? [])), 0, 15);
            if (!$regs) fail(400, 'Aucune immatriculation');
            out(['items' => fr24_provider_track($regs), 'at' => gmdate('c')]);
        }
    } catch (RuntimeException $e) { fail(502, $e->getMessage()); }
    fail(404, 'Route inconnue');
}
