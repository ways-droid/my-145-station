<?php
// Faux aviationweather.gov pour les tests : LLBG avec rafales à 48 kt dans le TAF, LLHA sans rafales.
header('Content-Type: application/json');
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH); $id = $_GET['ids'] ?? '';
if (str_ends_with($p, '/metar')) {
    echo json_encode([['icaoId' => $id, 'obsTime' => 1795161600, 'rawOb' => "METAR $id 201000Z 27018KT 9999 FEW030 22/12 Q1012 NOSIG", 'wdir' => 270, 'wspd' => 18, 'wgst' => null, 'visib' => '6+', 'temp' => 22]]); exit;
}
if (str_ends_with($p, '/taf')) {
    $g = $id === 'LLBG';
    echo json_encode([['icaoId' => $id, 'issueTime' => '2026-11-20T09:00:00Z', 'rawTAF' => "TAF $id 200900Z 2012/2112 27015KT 9999 SCT030" . ($g ? " TEMPO 2015/2020 27030G48KT" : ""),
        'fcsts' => [['timeFrom' => 1795176000, 'timeTo' => 1795262400, 'wdir' => 270, 'wspd' => 15, 'wgst' => null], ...($g ? [['timeFrom' => 1795186800, 'timeTo' => 1795204800, 'wdir' => 270, 'wspd' => 30, 'wgst' => 48]] : [])]]]); exit;
}
http_response_code(404); echo '[]';
