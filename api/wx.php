<?php
// Météo de la station pour le briefing du shift : METAR et TAF publics (aviationweather.gov, sans clé),
// mis en cache 10 minutes. Signale les rafales (gusts) au-dessus du seuil des Paramètres (45 kt par défaut).
//
//   GET wx/brief?icao=LLBG   → { icao, metar: {raw, at, wdir, wspd, wgst}, taf: {raw, at, maxGust, gusts: [{from, to, kt}]}, gustKt, alert, at }

const WX_API = 'https://aviationweather.gov/api/data/';

function wx_base() { $b = (string) (kv_get('wx_base') ?? ''); return $b !== '' ? rtrim($b, '/') . '/' : WX_API; }   // faux service des tests
function wx_http($path, $q) {
    $ch = curl_init(wx_base() . $path . '?' . http_build_query($q));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_USERAGENT => 'my-145-station/1.0 (station briefing)']);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($res === false || $st >= 400) throw new RuntimeException('Météo injoignable pour l\'instant.');
    if ($st === 204 || trim((string) $res) === '') return [];
    $d = json_decode($res, true);
    return is_array($d) ? $d : [];
}
/* rafales lues dans un texte METAR / TAF : 27015G48KT → 48 */
function wx_raw_gusts($raw) {
    preg_match_all('/\b(?:\d{3}|VRB)\d{2,3}G(\d{2,3})(KT|MPS)\b/', (string) $raw, $m, PREG_SET_ORDER);
    $out = []; foreach ($m as $x) $out[] = $x[2] === 'MPS' ? (int) round($x[1] * 1.944) : (int) $x[1];
    return $out;
}
function wx_time($t) { if ($t === null || $t === '') return ''; if (is_numeric($t)) return gmdate('Y-m-d\TH:i:s\Z', (int) $t); return (string) $t; }
function wx_brief($icao) {
    $m = wx_http('metar', ['ids' => $icao, 'format' => 'json']);
    $t = wx_http('taf', ['ids' => $icao, 'format' => 'json']);
    $mo = is_array($m[0] ?? null) ? $m[0] : [];
    $to = is_array($t[0] ?? null) ? $t[0] : [];
    $metar = $mo ? ['raw' => (string) ($mo['rawOb'] ?? ''), 'at' => wx_time($mo['obsTime'] ?? $mo['reportTime'] ?? ''), 'wdir' => $mo['wdir'] ?? null, 'wspd' => isset($mo['wspd']) ? (int) $mo['wspd'] : null,
        'wgst' => isset($mo['wgst']) && $mo['wgst'] !== null ? (int) $mo['wgst'] : (max(wx_raw_gusts($mo['rawOb'] ?? '') ?: [0]) ?: null), 'visib' => $mo['visib'] ?? null, 'temp' => $mo['temp'] ?? null] : null;
    $gusts = [];
    foreach ((array) ($to['fcsts'] ?? []) as $f) if (!empty($f['wgst'])) $gusts[] = ['from' => wx_time($f['timeFrom'] ?? ''), 'to' => wx_time($f['timeTo'] ?? ''), 'kt' => (int) $f['wgst']];
    if (!$gusts && !empty($to['rawTAF'])) foreach (wx_raw_gusts($to['rawTAF']) as $g) $gusts[] = ['from' => '', 'to' => '', 'kt' => $g];
    $taf = $to ? ['raw' => (string) ($to['rawTAF'] ?? ''), 'at' => wx_time($to['issueTime'] ?? ''), 'gusts' => $gusts, 'maxGust' => $gusts ? max(array_column($gusts, 'kt')) : null] : null;
    return ['icao' => $icao, 'metar' => $metar, 'taf' => $taf, 'at' => gmdate('Y-m-d\TH:i:s\Z')];
}
function wx_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'wx') return;
    if (($parts[1] ?? '') !== 'brief' || $method !== 'GET') fail(404, 'Inconnu');
    $icao = strtoupper(preg_replace('/[^A-Za-z]/', '', (string) ($_GET['icao'] ?? '')));
    if (strlen($icao) !== 4) fail(400, 'Code OACI de la station manquant (Paramètres).');
    $s = (array) (coll_docs('settings')['company'] ?? []);
    $lim = max(20, (int) ($s['gustKt'] ?? 45));
    $key = 'wx_cache:' . $icao; $c = json_decode((string) (kv_get($key) ?? ''), true);
    if (!is_array($c) || ($c['_t'] ?? 0) < time() - 600) {
        try { $c = wx_brief($icao); $c['_t'] = time(); kv_set($key, json_encode($c, JSON_UNESCAPED_SLASHES)); }
        catch (RuntimeException $e) { if (!is_array($c)) fail(502, $e->getMessage()); $c['stale'] = true; }
    }
    unset($c['_t']);
    $mg = max((int) ($c['metar']['wgst'] ?? 0), (int) ($c['taf']['maxGust'] ?? 0));
    $c['gustKt'] = $lim; $c['maxGust'] = $mg ?: null; $c['alert'] = $mg > $lim;
    out($c);
}
