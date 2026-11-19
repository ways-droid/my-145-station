<?php // Faux Falco (API v1) pour les tests ; journalise les imports dans FALCO_MOCK_LOG.
header('Content-Type: application/json');
$log = getenv('FALCO_MOCK_LOG') ?: sys_get_temp_dir() . '/falco-mock.log';
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$prob = function ($st, $title, $detail) { http_response_code($st); header('Content-Type: application/problem+json'); echo json_encode(['type' => 'about:blank', 'title' => $title, 'status' => $st, 'detail' => $detail]); exit; };
if (($_SERVER['HTTP_X_FALCO_APP_SECRET'] ?? '') !== 'as_test' || ($_SERVER['HTTP_X_FALCO_API_KEY'] ?? '') !== 'sk_test') $prob(401, 'Unauthorized', 'Invalid credentials');
if ($path === '/v1/organization/whoami') { echo json_encode(['id' => 'org_1', 'name' => 'W.A.Y.S. SRL', 'vat_number' => 'BE0000000000']); exit; }
if ($path === '/v1/invoices/imports/pdf' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $f = $_FILES['file'] ?? null;
    if (!$f || substr(file_get_contents($f['tmp_name']), 0, 4) !== '%PDF') $prob(422, 'Invalid file', 'PDF required');
    $m = json_decode($_POST['metadata'] ?? '', true);
    foreach (['document_type', 'document_date', 'number', 'base_amount', 'total_amount', 'sender', 'receiver', 'tax_subtotals', 'lines'] as $k) if (!isset($m[$k])) $prob(422, 'Validation error', "$k is required");
    if ($m['sender']['vat_number'] !== 'BE0000000000') $prob(422, 'Validation error', 'sender.vat_number must match the organization');
    if (empty($m['buyer_reference']) && empty($m['purchase_order_reference'])) { http_response_code(400); echo json_encode(['type' => 'urn:falco-api:billing:validation-failure', 'status' => 400, 'validation_errors' => [['property' => '', 'error' => 'One of `buyer_reference` or `purchase_order_reference` must be defined.']]]); exit; }
    if (empty($m['receiver']['address']['country'])) $prob(422, 'Validation error', 'receiver.address.country is required');
    file_put_contents($log, json_encode($m, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);
    http_response_code(201);
    echo json_encode(['document_id' => 'fd-' . $m['number'], 'peppol_status' => null, 'accounting_status' => ['status' => 'submitted', 'error_message' => null]]); exit;
}
// ---- factures d'achat et Peppol entrant ----
$PUR = [
    ['id' => 'pd-1', 'type' => 'purchase_invoice', 'number' => 'FA-778', 'invoice_date' => '2026-11-03', 'invoice_due_date' => '2026-11-10', 'currency' => 'EUR', 'amount' => '605.00',
     'supplier_id' => 's1', 'supplier_name' => 'Air Liquide Belgium', 'supplier_vat_number' => 'BE0400000000', 'payment_status' => 'not_paid', 'peppol_send_status' => 'not_sent',
     'files' => [['id' => 'f-9', 'type' => 'pdf', 'file_name' => 'FA-778.pdf', 'size_bytes' => 1200]], 'created_at' => '2026-11-03', 'updated_at' => '2026-11-03'],
    ['id' => 'pd-2', 'type' => 'purchase_credit_note', 'number' => 'NC-12', 'invoice_date' => '2026-11-05', 'currency' => 'EUR', 'amount' => '50.00',
     'supplier_name' => 'Garage Dupont', 'supplier_vat_number' => 'BE0411111111', 'payment_status' => 'not_paid', 'files' => [], 'created_at' => '2026-11-05', 'updated_at' => '2026-11-05'],
];
$st = getenv('FALCO_MOCK_LOG') ? dirname(getenv('FALCO_MOCK_LOG')) . '/falco-paid.json' : sys_get_temp_dir() . '/falco-paid.json';
$paid = is_file($st) ? json_decode(file_get_contents($st), true) : [];
foreach ($PUR as &$x) if (isset($paid[$x['id']])) $x['payment_status'] = $paid[$x['id']]; unset($x);
if ($path === '/v1/documents/purchases' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    if (($_SERVER['HTTP_X_FALCO_API_KEY'] ?? '') === 'sk_noscope') $prob(403, 'Forbidden', 'missing scope documents:purchases:read');
    $page = (int) ($_GET['page'] ?? 0);
    echo json_encode(['data' => $page === 0 ? $PUR : []]); exit;
}
if (preg_match('#^/v1/documents/purchases/([^/]+)/download/([^/]+)$#', $path, $m)) {
    if ($m[1] !== 'pd-1') $prob(404, 'Not found', 'no file');
    header('Content-Type: application/pdf'); echo "%PDF-1.4 facture achat " . $m[2]; exit;
}
if (preg_match('#^/v1/documents/purchases/([^/]+)/payment-status$#', $path, $m) && $_SERVER['REQUEST_METHOD'] === 'PUT') {
    $b = json_decode(file_get_contents('php://input'), true);
    $paid[$m[1]] = $b['payment_status']; file_put_contents($st, json_encode($paid));
    echo json_encode(['id' => $m[1], 'payment_status' => $b['payment_status']]); exit;
}
if ($path === '/v1/peppol/inbound') {
    echo json_encode(['data' => (int) ($_GET['page'] ?? 0) ? [] : [['id' => 'in-1', 'received_at' => '2026-11-03', 'invoice_date' => '2026-11-03', 'amount' => '605.00', 'sender_name' => 'Air Liquide Belgium',
        'sender_vat_number' => 'BE 0400.000.000', 'payment_reference' => '+++123/4567/89012+++', 'bank_account_number' => 'BE71 0961 2345 6769', 'invoice_reference' => 'FA-778', 'is_credit_note' => false],
        ['id' => 'in-2', 'original_file_name' => 'x.xml', 'received_at' => '2026-11-15T22:24:40.18+00:00', 'invoice_date' => '2026-11-10T00:00:00+00:00', 'invoice_due_date' => null, 'amount' => '55.93', 'sender_name' => 'FedEx Express BE BV',
         'sender_vat_number' => 'BE0406383379', 'currency' => 'EUR', 'payment_reference' => null, 'payment_status' => 'not_paid', 'bank_account_number' => 'BE34737048659990', 'invoice_reference' => '799414593', 'is_credit_note' => false]]]); exit;
}
if ($path === '/v1/peppol/inbound/in-2/download') {
    header('Content-Type: application/xml');
    echo '<?xml version="1.0"?><Invoice xmlns:cac="urn:cac" xmlns:cbc="urn:cbc"><cbc:ID>799414593</cbc:ID><cac:AdditionalDocumentReference><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="f.pdf">' . base64_encode("%PDF-1.4 fedex") . '</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference></Invoice>'; exit;
}
if (preg_match('#^/v1/peppol/inbound/([^/]+)/response$#', $path, $m) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($m[1] === 'in-nap') $prob(500, 'AccessPointNotFound', 'AccessPointNotFound');
    $b = json_decode(file_get_contents('php://input'), true);
    if (empty($b['response_code'])) $prob(422, 'Validation error', 'response_code required');
    if ($b['response_code'] === 'under_query') $prob(400, 'Bad Request', 'Follow the sequence of response codes: https://docs.peppol.eu/poacc/upgrade-3/profiles/63-invoiceresponse/');
    file_put_contents($log, json_encode(['response' => $m[1]] + $b) . "\n", FILE_APPEND);
    http_response_code(204); exit;
}
$prob(404, 'Not found', $path);
