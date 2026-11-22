<?php
// FIDS de l'aéroport Ben Gourion (TLV) : arrivées et départs publiés par l'Israel Airports Authority en données ouvertes
// (data.gov.il, jeu « Flights », sans clé). Lu seulement au clic sur Flightradar24 du shift, mis en cache 5 minutes.
// Heures locales d'Israël (LT). Une panne ou un refus du portail ne bloque rien : la réponse dit simplement « indisponible ».
//
//   POST fids/board { airlines: ["5C"…], flights: [..] } → { rows: [{ fl, al, name, dir, sched, est, status, other, city, terminal }], at, error? }  (FIDS de la station)
//   POST fids/tlv { flights: ["5C851", "LY001"…] }  → { items: { "5C851": [{ dir: A|D, sched, est, status, other, city, terminal }] }, at, error? }

const FIDS_API = 'https://data.gov.il/api/3/action/datastore_search';
const FIDS_RESOURCE = 'e83f763b-b7d7-479e-b172-ae981ddc6de5';

function fids_base() { $b = (string) (kv_get('fids_base') ?? ''); return $b !== '' ? $b : FIDS_API; }   // faux portail des tests
/* « 5C 0851 », « 5c851 » → « 5C851 » */
function fids_norm($f) { $f = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $f)); return preg_match('/^([A-Z0-9]{2}[A-Z]?)0*(\d{1,4}[A-Z]?)$/', $f, $m) ? $m[1] . $m[2] : $f; }
function fids_rows() {
    // cache dans un fichier (le tableau complet dépasse la colonne kv) ; un échec d'écriture ne bloque jamais les données
    $cf = rtrim((string) cfg('upload_dir'), '/') . '/.fids-cache.json';
    $c = is_file($cf) ? json_decode((string) @file_get_contents($cf), true) : null;
    if (is_array($c) && ($c['t'] ?? 0) > time() - 300) return $c['rows'];
    $ch = curl_init(fids_base() . '?' . http_build_query(['resource_id' => FIDS_RESOURCE, 'limit' => 1500]));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_USERAGENT => 'Mozilla/5.0 (my-145-station)']);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $d = $res !== false && $st === 200 ? json_decode($res, true) : null;
    $recs = $d['result']['records'] ?? null;
    if (!is_array($recs)) throw new RuntimeException($res === false ? 'airport FIDS unreachable' : "airport FIDS unavailable (HTTP $st)");
    $rows = [];
    foreach ($recs as $r) {
        if (!is_array($r)) continue;
        $fl = fids_norm(($r['CHOPER'] ?? '') . ($r['CHFLTN'] ?? '')); if ($fl === '') continue;
        $rows[] = ['f' => $fl, 'al' => strtoupper(trim((string) ($r['CHOPER'] ?? ''))), 'name' => trim((string) ($r['CHOPERD'] ?? '')), 'dir' => strtoupper(substr((string) ($r['CHAORD'] ?? ''), 0, 1)), 'sched' => (string) ($r['CHSTOL'] ?? ''), 'est' => (string) ($r['CHPTOL'] ?? ''),
            'status' => trim((string) ($r['CHRMINE'] ?? '')), 'other' => (string) ($r['CHLOC1'] ?? ''), 'city' => (string) ($r['CHLOC1D'] ?? ''), 'terminal' => (string) ($r['CHTERM'] ?? '')];
    }
    try { $d = dirname($cf); if (!is_dir($d)) @mkdir($d, 0750, true); @file_put_contents($cf, json_encode(['t' => time(), 'rows' => $rows], JSON_UNESCAPED_UNICODE), LOCK_EX); } catch (Throwable $e) { }
    return $rows;
}
/* jamais d'erreur technique (SQL…) montrée à l'utilisateur */
function fids_msg($e) { return $e instanceof RuntimeException && strpos($e->getMessage(), 'airport FIDS') === 0 ? $e->getMessage() : 'airport FIDS temporarily unavailable'; }
function fids_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'fids') return;
    if (!in_array($parts[1] ?? '', ['tlv', 'board'], true) || $method !== 'POST') fail(404, 'Route inconnue');
    $b = body_json(); $want = []; $als = [];
    foreach (array_slice((array) ($b['flights'] ?? []), 0, 120) as $f) { $n = fids_norm($f); if (preg_match('/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/', $n)) $want[$n] = true; }
    if ($parts[1] === 'board') {
        foreach (array_slice((array) ($b['airlines'] ?? []), 0, 60) as $a) { $a = strtoupper(trim((string) $a)); if (preg_match('/^[A-Z0-9]{2,3}$/', $a)) $als[$a] = true; }
        // compagnies sans code IATA : par le nom (« CHALLENGE AIRLINES » du FIDS ⊂ « Challenge Airlines Malta » du client)
        $words = fn($s) => array_values(array_filter(preg_split('/[^A-Z0-9]+/', strtoupper((string) $s)), fn($w) => strlen($w) > 1));
        $names = []; foreach (array_slice((array) ($b['names'] ?? []), 0, 60) as $n) { $w = $words($n); if ($w) $names[] = $w; }
        $byName = function ($rn) use ($names, $words) { $r = $words($rn); if (!$r) return false;
            foreach ($names as $c) { $short = count($r) <= count($c) ? $r : $c; $long = $short === $r ? $c : $r;
                if (count($short) >= 2 || strlen($short[0]) >= 5) { if (!array_diff($short, $long)) return true; } }
            return false; };
        $rows = [];
        try { foreach (fids_rows() as $r) if (isset($als[$r['al'] ?? '']) || isset($want[$r['f']]) || ($names && $byName($r['name'] ?? ''))) { $r['fl'] = $r['f']; unset($r['f']); $rows[] = $r; } }
        catch (Throwable $e) { out(['rows' => [], 'error' => fids_msg($e), 'at' => gmdate('c')]); }
        usort($rows, fn($x, $y) => strcmp($x['est'] ?: $x['sched'], $y['est'] ?: $y['sched']));
        out(['rows' => $rows, 'at' => gmdate('c')]);
    }
    $items = [];
    try { foreach (fids_rows() as $r) if (isset($want[$r['f']])) { $f = $r['f']; unset($r['f'], $r['al'], $r['name']); $items[$f][] = $r; } }
    catch (Throwable $e) { out(['items' => (object) [], 'error' => fids_msg($e), 'at' => gmdate('c')]); }
    out(['items' => (object) $items, 'at' => gmdate('c')]);
}
