<?php
// Faux ADSBdb pour les tests : un seul avion connu.
header('Content-Type: application/json');
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_ends_with($p, '/aircraft/4X-ICA')) { echo json_encode(['response' => ['aircraft' => ['type' => '747 412', 'icao_type' => 'B744', 'manufacturer' => 'Boeing', 'mode_s' => '738A01', 'registration' => '4X-ICA',
    'registered_owner' => 'Challenge Airlines IL', 'registered_owner_operator_flag_code' => 'ICL', 'registered_owner_country_name' => 'Israel']]]); exit; }
http_response_code(404); echo json_encode(['response' => 'unknown aircraft']);
