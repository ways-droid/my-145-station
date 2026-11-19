<?php // Faux Ponto (API api.myponto.com) pour les tests : 2 comptes, 150 mouvements paginés sur le premier.
header('Content-Type: application/json');
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH); parse_str($_SERVER['QUERY_STRING'] ?? '', $q);
$extra = getenv('PONTO_MOCK_EXTRA') ?: sys_get_temp_dir() . '/ponto-extra.json';
if ($path === '/oauth2/token') {
    if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Basic ' . base64_encode('po-id:po-secret')) { http_response_code(401); echo json_encode(['error' => 'invalid_client']); exit; }
    echo json_encode(['access_token' => 'tok', 'expires_in' => 1799, 'token_type' => 'bearer']); exit;
}
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer tok') { http_response_code(401); echo json_encode(['errors' => [['code' => 'unauthorized', 'detail' => 'Invalid token']]]); exit; }
$acc = fn($id, $iban, $desc, $bal, $fi) => ['id' => $id, 'type' => 'account', 'attributes' => ['reference' => $iban, 'description' => $desc, 'currency' => 'EUR', 'currentBalance' => $bal, 'availableBalance' => $bal,
    'currentBalanceReferenceDate' => '2026-11-15T20:00:00Z', 'holderName' => 'W.A.Y.S. SRL', 'authorizationExpirationExpectedAt' => '2027-02-10T00:00:00Z'],
    'meta' => ['synchronizedAt' => '2026-11-15T20:00:00Z', 'availability' => 'available'], 'relationships' => ['financialInstitution' => ['data' => ['id' => $fi, 'type' => 'financialInstitution']]]];
if ($path === '/accounts') { $l = [$acc('acc-beo', 'BE68539007547034', 'Compte à vue', 12345.67, 'fi-beo')]; if (!file_exists($extra . '.norev')) $l[] = $acc('acc-rev', 'LT123250013004017999', 'EUR main', 2500.10, 'fi-rev'); echo json_encode(['data' => $l, 'links' => []]); exit; }
if (preg_match('#^/financial-institutions/(.+)$#', $path, $m)) { echo json_encode(['data' => ['id' => $m[1], 'attributes' => ['name' => $m[1] === 'fi-beo' ? 'Beobank' : 'Revolut']]]); exit; }
if (preg_match('#^/accounts/([^/]+)/transactions$#', $path, $m)) {
    $tx = fn($id, $date, $amt, $name, $rem, $type = 'unstructured') => ['id' => $id, 'type' => 'transaction', 'attributes' => ['amount' => $amt, 'currency' => 'EUR', 'valueDate' => $date . 'T10:00:00Z', 'executionDate' => $date . 'T10:00:00Z',
        'counterpartName' => $name, 'counterpartReference' => 'BE71096123456769', 'remittanceInformation' => $rem, 'remittanceInformationType' => $type, 'description' => '']];
    $list = [];
    if ($m[1] === 'acc-beo') {
        foreach ((file_exists($extra) ? json_decode(file_get_contents($extra), true) : []) as $e) $list[] = $tx(...$e);
        $list[] = $tx('t-ogm', '2026-11-14', 66.55, 'Liège Airport', '+++202/6000/05044+++', 'structured');
        $list[] = $tx('t-num', '2026-11-13', 1210.0, 'Client X', 'Paiement facture F-2026-051 merci');
        for ($i = 1; $i <= 148; $i++) $list[] = $tx("t-$i", date('Y-m-d', strtotime("2026-11-12 -$i days")), -10.0 * $i, 'Fournisseur', "Achat $i");
        $list[] = $tx('t-old', '2023-01-01', -5, 'Ancien', 'trop vieux');
    }
    $start = 0;
    if (!empty($q['page']['after'])) { foreach ($list as $k => $t) if ($t['id'] === $q['page']['after']) $start = $k + 1; }
    $lim = (int) ($q['page']['limit'] ?? 100);
    $page = array_slice($list, $start, $lim);
    $links = [];
    if ($start + $lim < count($list) && $page) $links['next'] = 'http://' . $_SERVER['HTTP_HOST'] . $path . '?page%5Blimit%5D=' . $lim . '&page%5Bafter%5D=' . end($page)['id'];
    echo json_encode(['data' => $page, 'links' => $links]); exit;
}
if (preg_match('#^/accounts/([^/]+)/payments(?:/([^/]+))?$#', $path, $m)) {   // initiation de paiement
    $f = $extra . '.pay'; $st = file_exists($f) ? json_decode(file_get_contents($f), true) : [];
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $b = json_decode(file_get_contents('php://input'), true); $a = $b['data']['attributes'] ?? [];
        if (($b['data']['type'] ?? '') !== 'payment' || empty($a['creditorAccountReference']) || empty($a['amount'])) { http_response_code(400); echo json_encode(['errors' => [['code' => 'invalid', 'detail' => 'bad payment']]]); exit; }
        if (file_exists($extra . '.noredirect') && !empty($a['redirectUri'])) { http_response_code(400); echo json_encode(['errors' => [['code' => 'invalidRedirectUri', 'detail' => 'redirectUri not allowed']]]); exit; }
        $id = 'pp-' . (count($st) + 1); $st[$id] = ['status' => 'unsigned', 'attr' => $a]; file_put_contents($f, json_encode($st));
        http_response_code(201); echo json_encode(['data' => ['id' => $id, 'type' => 'payment', 'attributes' => ['status' => 'unsigned'] + $a, 'links' => empty($a['redirectUri']) ? [] : ['redirect' => 'https://ponto.example/sign/' . $id]]]); exit;
    }
    $id = $m[2] ?? ''; if (!isset($st[$id])) { http_response_code(404); echo json_encode(['errors' => [['code' => 'resourceNotFound', 'detail' => $id]]]); exit; }
    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') { unset($st[$id]); file_put_contents($f, json_encode($st)); echo json_encode(['data' => ['id' => $id]]); exit; }
    echo json_encode(['data' => ['id' => $id, 'attributes' => ['status' => $st[$id]['status']]]]); exit;
}
http_response_code(404); echo json_encode(['errors' => [['code' => 'notFound', 'detail' => $path]]]);
