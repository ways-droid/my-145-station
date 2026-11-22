<?php
// Fausse base d'avions OpenSky pour les tests : un seul Mode S connu.
header('Content-Type: application/json');
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_ends_with($p, '/metadata/aircraft/icao/738a01')) { echo json_encode(['icao24' => '738a01', 'registration' => '4X-ICA', 'serialNumber' => '29261', 'lineNumber' => '1187', 'built' => '1998-10-01', 'engines' => 'GE CF6-80C2B5F', 'model' => '747-412']); exit; }
http_response_code(404); echo '';
