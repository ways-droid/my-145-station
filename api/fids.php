<?php
// FIDS de l'aéroport Ben Gourion (TLV) : arrivées et départs publiés par l'Israel Airports Authority en données ouvertes
// (data.gov.il, jeu « Flights », sans clé). Lu seulement au clic sur Flightradar24 du shift, mis en cache 5 minutes.
// Heures locales d'Israël (LT). Une panne ou un refus du portail ne bloque rien : la réponse dit simplement « indisponible ».
//
//   POST fids/tlv { flights: ["5C851", "LY001"…] }  → { items: { "5C851": [{ dir: A|D, sched, est, status, other, city, terminal }] }, at, error? }

const FIDS_API = 'https://data.gov.il/api/3/action/datastore_search';
const FIDS_RESOURCE = 'e83f763b-b7d7-479e-b172-ae981ddc6de5';

function fids_base() { $b = (string) (kv_get('fids_base') ?? ''); return $b !== '' ? $b : FIDS_API; }   // faux portail des tests
/* « 5C 0851 », « 5c851 » → « 5C851 » */
function fids_norm($f) { $f = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $f)); return preg_match('/^([A-Z0-9]{2}[A-Z]?)0*(\d{1,4}[A-Z]?)$/', $f, $m) ? $m[1] . $m[2] : $f; }
function fids_rows() {
    $c = json_decode((string) (kv_get('fids_cache') ?? ''), true);
    if (is_array($c) && ($c['t'] ?? 0) > time() - 300) return $c['rows'];
    $ch = curl_init(fids_base() . '?' . http_build_query(['resource_id' => FIDS_RESOURCE, 'limit' => 1500]));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_USERAGENT => 'Mozilla/5.0 (my-145-station)']);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $d = $res !== false && $st === 200 ? json_decode($res, true) : null;
    $recs = $d['result']['records'] ?? null;
    if (!is_array($recs)) throw new RuntimeException($res === false ? 'FIDS TLV injoignable' : "FIDS TLV indisponible (HTTP $st)");
    $rows = [];
    foreach ($recs as $r) {
        if (!is_array($r)) continue;
        $fl = fids_norm(($r['CHOPER'] ?? '') . ($r['CHFLTN'] ?? '')); if ($fl === '') continue;
        $rows[] = ['f' => $fl, 'dir' => strtoupper(substr((string) ($r['CHAORD'] ?? ''), 0, 1)), 'sched' => (string) ($r['CHSTOL'] ?? ''), 'est' => (string) ($r['CHPTOL'] ?? ''),
            'status' => trim((string) ($r['CHRMINE'] ?? '')), 'other' => (string) ($r['CHLOC1'] ?? ''), 'city' => (string) ($r['CHLOC1D'] ?? ''), 'terminal' => (string) ($r['CHTERM'] ?? '')];
    }
    kv_set('fids_cache', json_encode(['t' => time(), 'rows' => $rows], JSON_UNESCAPED_UNICODE));
    return $rows;
}
function fids_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'fids') return;
    if (($parts[1] ?? '') !== 'tlv' || $method !== 'POST') fail(404, 'Route inconnue');
    $b = body_json(); $want = [];
    foreach (array_slice((array) ($b['flights'] ?? []), 0, 120) as $f) { $n = fids_norm($f); if (preg_match('/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/', $n)) $want[$n] = true; }
    $items = [];
    try { foreach (fids_rows() as $r) if (isset($want[$r['f']])) { $f = $r['f']; unset($r['f']); $items[$f][] = $r; } }
    catch (RuntimeException $e) { out(['items' => (object) [], 'error' => $e->getMessage(), 'at' => gmdate('c')]); }
    out(['items' => (object) $items, 'at' => gmdate('c')]);
}
