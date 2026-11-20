<?php
// Faux Flightradar24 (API v1) pour les tests : clé « fr24-good », un avion en vol et un vol terminé.
header('Content-Type: application/json');
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') === 'Bearer fr24-sandbox') { echo json_encode(['data' => [['flight' => 'SK7679', 'reg' => 'EI-SIN', 'orig_iata' => 'ARN', 'dest_iata' => 'FUE', 'eta' => '2023-12-15T14:47:28Z']]]); exit; }
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer fr24-good') { http_response_code(401); echo json_encode(['message' => 'Unauthenticated.']); exit; }
if (($_SERVER['HTTP_ACCEPT_VERSION'] ?? '') !== 'v1') { http_response_code(400); echo json_encode(['message' => 'Accept-Version required']); exit; }
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH); $regs = explode(',', $_GET['registrations'] ?? '');
if (str_ends_with($p, 'live/flight-positions/full')) {
    $d = []; if (in_array('9H-ABC', $regs, true)) $d[] = ['fr24_id' => 'x1', 'flight' => 'MT123', 'reg' => '9H-ABC', 'type' => 'B763', 'orig_iata' => 'LGG', 'dest_iata' => 'TLV', 'eta' => '2026-11-19T14:35:00Z', 'alt' => 35000, 'gspeed' => 460, 'timestamp' => '2026-11-19T11:00:00Z'];
    echo json_encode(['data' => $d]); exit;
}
if (str_ends_with($p, 'flight-summary/full')) {
    if (empty($_GET['flight_datetime_from']) || !str_ends_with($_GET['flight_datetime_from'], 'Z')) { http_response_code(400); echo json_encode(['message' => 'flight_datetime_from required']); exit; }
    $d = []; if (in_array('4X-ICA', $regs, true)) $d[] = ['fr24_id' => 'x2', 'flight' => 'IL55', 'reg' => '4X-ICA', 'type' => 'B744', 'orig_iata' => 'CGN', 'dest_iata' => 'TLV', 'datetime_takeoff' => '2026-11-19T06:10:00Z', 'datetime_landed' => '2026-11-19T10:02:00Z'];
    if (in_array('9H-DEP', $regs, true)) { $d[] = ['flight' => 'MT9', 'reg' => '9H-DEP', 'orig_iata' => 'LGG', 'dest_iata' => 'TLV', 'datetime_takeoff' => '2026-11-19T01:00:00Z', 'datetime_landed' => '2026-11-19T05:20:00Z'];
        $d[] = ['flight' => 'MT10', 'reg' => '9H-DEP', 'orig_iata' => 'TLV', 'dest_iata' => 'LGG', 'datetime_takeoff' => '2026-11-19T08:05:00Z', 'datetime_landed' => '2026-11-19T12:30:00Z']; }
    echo json_encode(['data' => $d]); exit;
}
http_response_code(404); echo json_encode(['message' => 'not found']);
