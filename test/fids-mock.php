<?php
// Faux portail data.gov.il (jeu « Flights » de l'Israel Airports Authority) pour les tests.
header('Content-Type: application/json');
if (($_GET['resource_id'] ?? '') !== 'e83f763b-b7d7-479e-b172-ae981ddc6de5') { http_response_code(404); echo '{"success":false}'; exit; }
echo json_encode(['success' => true, 'result' => ['records' => [
    ['CHOPER' => '5C', 'CHFLTN' => '0851', 'CHOPERD' => 'CHALLENGE AIRLINES', 'CHSTOL' => '2026-11-19T03:40:00', 'CHPTOL' => '2026-11-19T03:55:00', 'CHAORD' => 'A', 'CHLOC1' => 'LGG', 'CHLOC1D' => 'LIEGE', 'CHTERM' => 3, 'CHRMINE' => 'LANDED'],
    ['CHOPER' => '5C', 'CHFLTN' => '852', 'CHOPERD' => 'CHALLENGE AIRLINES', 'CHSTOL' => '2026-11-19T07:00:00', 'CHPTOL' => '2026-11-19T07:20:00', 'CHAORD' => 'D', 'CHLOC1' => 'LGG', 'CHLOC1D' => 'LIEGE', 'CHTERM' => 3, 'CHRMINE' => 'DELAYED'],
    ['CHOPER' => 'LY', 'CHFLTN' => '001', 'CHSTOL' => '2026-11-19T00:30:00', 'CHPTOL' => '2026-11-19T00:30:00', 'CHAORD' => 'D', 'CHLOC1' => 'JFK', 'CHRMINE' => 'DEPARTED']]]]);
