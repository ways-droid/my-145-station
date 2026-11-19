<?php // Faux WEBFLEET.connect pour les tests (réponses au format JSON documenté)
header('Content-Type: application/json');
$a = $_GET['action'] ?? '';
$hAuth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (isset($_GET['password']) || isset($_GET['username'])) { header('X-Webfleet-Errorcode: 1180'); header('X-Webfleet-Errormessage: URL credentials are not supported. Use BasicAuth instead.'); echo json_encode(['errorCode' => 1180, 'errorMsg' => 'URL credentials are not supported. Use BasicAuth instead.']); exit; }
$pw = stripos($hAuth, 'Basic ') === 0 ? (explode(':', base64_decode(substr($hAuth, 6)), 2)[1] ?? '') : ($_SERVER['PHP_AUTH_PW'] ?? '');
if ($pw !== 'secret') { header('X-Webfleet-Errorcode: 1101'); header('X-Webfleet-Errormessage: invalid credentials'); echo json_encode(['errorCode' => 1101, 'errorMsg' => 'invalid credentials']); exit; }
if ($a === 'showObjectReportExtern') {
  echo json_encode([
    ['objectno' => '012', 'objectname' => 'Caddy 012', 'latitude_mdeg' => 50637512, 'longitude_mdeg' => 5443210, 'postext' => 'Rue de l\'Aéroport, 4460 Grâce-Hollogne', 'pos_time' => '2026-11-14T22:40:00+01:00', 'speed' => '0', 'ignition' => 0, 'standstill' => 1, 'odometer_long' => 182345600, 'drivername' => 'Marc Terrain'],
    ['objectno' => '020', 'objectname' => '2-XYZ-999', 'latitude_mdeg' => 50845000, 'longitude_mdeg' => 4357000, 'postext' => 'Bruxelles', 'pos_time' => '2026-11-14T22:41:00+01:00', 'speed' => '87', 'ignition' => 1, 'standstill' => 0, 'odometer' => '512340', 'drivername' => ''],
    ['objectno' => '099', 'objectname' => 'Remorque inconnue'],
  ]); exit;
}
if ($a === 'showVehicleReportExtern') {
  echo json_encode([
    ['objectno' => '012', 'objectname' => 'Caddy 012', 'licenseplatenumber' => '1-ABC-123'],
    ['objectno' => '045', 'objectname' => '045 Master', 'licenseplatenumber' => '1-NEW-045', 'description' => 'Renault Master', 'identno' => 'vf1ma000000000045', 'fueltype' => '1', 'manufacturedyear' => '2021'],
    ['objectno' => '050', 'objectname' => 'Berlingo', 'licenseplatenumber' => '1-LNK-555'],
    ['objectno' => '061', 'objectname' => '061 - Ford Transit 2-TRA-061'],
    ['objectno' => '099', 'objectname' => 'Remorque inconnue'],
  ]); exit;
}
if ($a === 'showTripReportExtern') {
  if (($_GET['range_pattern'] ?? '') !== 'ud' || empty($_GET['rangefrom_string'])) { echo json_encode(['errorCode' => 45, 'errorMsg' => 'missing range']); exit; }
  echo json_encode([
    ['tripid' => '7001', 'objectno' => '012', 'start_time' => '2026-11-14T08:00:00+01:00', 'end_time' => '2026-11-14T08:42:00+01:00', 'start_postext' => 'Liège', 'end_postext' => 'Grâce-Hollogne', 'distance' => 18400, 'duration' => 2520, 'tripmode' => 2, 'drivername' => 'Marc Terrain', 'start_odometer' => 182327200, 'end_odometer' => 182345600],
    ['tripid' => '7002', 'objectno' => '099', 'start_time' => '2026-11-14T09:00:00+01:00', 'end_time' => '2026-11-14T09:10:00+01:00', 'distance' => 3000, 'duration' => 600],
  ]); exit;
}
$log = getenv('WF_MOCK_LOG') ?: sys_get_temp_dir() . '/wf-mock.log';
if (in_array($a, ['updateVehicle', 'updateDriverExtern', 'insertDriverExtern'], true)) {
  $q = $_GET; unset($q['account'], $q['apikey'], $q['lang'], $q['outputformat'], $q['useISO8601'], $q['useUTF8']);
  file_put_contents($log, json_encode($q, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);
  if ($a === 'updateVehicle' && ($q['objectno'] ?? '') === '099') { echo json_encode(['errorCode' => 8011, 'errorMsg' => 'User has no permission for this action']); exit; }
  exit;   // succès : réponse vide
}
if ($a === 'showDriverReportExtern') {
  $all = [
    ['driverno' => 'D1', 'driveruid' => 'uid-d1', 'name1' => 'Marc Terrain', 'email' => 'marc@example.test', 'description' => 'Chip ID : 00000119114301', 'objectno' => '012', 'current_workstate' => 5, 'driving_license' => json_encode(['number' => 'B123', 'expiry_date' => '2027-03-01'])],
    ['driverno' => 'D2', 'driveruid' => 'uid-d2', 'name1' => 'Sophie', 'name2' => 'Lambert', 'telmobile' => '+32470000000'],
  ];
  if (is_file(sys_get_temp_dir() . '/wf-mock-hide-d2')) $all = [$all[0]];   // D2 désactivé dans WebFleet
  if (!empty($_GET['driveruid'])) $all = array_values(array_filter($all, fn($r) => $r['driveruid'] === $_GET['driveruid']));
  echo json_encode($all); exit;
}
echo json_encode(['errorCode' => 9, 'errorMsg' => 'unknown action']);
