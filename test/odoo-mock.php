<?php // Faux Odoo 19 (API JSON-2) pour les tests. Données dans un fichier JSON modifiable par le test.
header('Content-Type: application/json');
$f = getenv('ODOO_MOCK_DATA') ?: sys_get_temp_dir() . '/odoo-mock.json';
if (!file_exists($f)) {
    $w = '2026-11-15 10:00:00';
    file_put_contents($f, json_encode([
        'account.tax' => [['id' => 1, 'amount' => 21, 'amount_type' => 'percent'], ['id' => 2, 'amount' => 6, 'amount_type' => 'percent']],
        'res.partner' => [
            ['id' => 1, 'name' => 'Liège Airport SA', 'vat' => 'BE0123456749', 'email' => 'compta@liege.example', 'phone' => '+32 4 000 00 00', 'street' => 'Rue de l\'Aéroport 50', 'street2' => false, 'zip' => '4460', 'city' => 'Grâce-Hollogne', 'country_id' => [20, 'Belgique'], 'lang' => 'fr_BE', 'ref' => 'C001', 'active' => true, 'customer_rank' => 3, 'create_date' => '2024-01-10 08:00:00', 'write_date' => $w],
            ['id' => 2, 'name' => 'Brussels Cargo NV', 'vat' => 'BE0999888767', 'email' => false, 'phone' => false, 'street' => 'Cargo 2', 'street2' => 'Bât. 7', 'zip' => '1930', 'city' => 'Zaventem', 'country_id' => [20, 'Belgique'], 'lang' => 'en_US', 'ref' => false, 'active' => true, 'customer_rank' => 1, 'create_date' => '2025-03-01 08:00:00', 'write_date' => $w],
            ['id' => 3, 'name' => 'Client occasionnel', 'vat' => false, 'email' => false, 'phone' => false, 'street' => false, 'street2' => false, 'zip' => false, 'city' => false, 'country_id' => [75, 'France'], 'lang' => 'fr_FR', 'ref' => false, 'active' => true, 'customer_rank' => 0, 'create_date' => '2026-01-01 08:00:00', 'write_date' => $w],
        ],
        'product.product' => [
            ['id' => 10, 'name' => 'Étalonnage clé dynamométrique', 'default_code' => 'ETAL-01', 'lst_price' => 45.5, 'standard_price' => 0, 'uom_id' => [1, 'Unité'], 'taxes_id' => [1], 'type' => 'service', 'active' => true, 'sale_ok' => true, 'write_date' => $w],
            ['id' => 11, 'name' => 'Manomètre', 'default_code' => false, 'lst_price' => 120, 'standard_price' => 70, 'uom_id' => [1, 'Unité'], 'taxes_id' => [1], 'type' => 'consu', 'active' => true, 'sale_ok' => true, 'write_date' => $w],
        ],
        'account.move' => [
            ['id' => 100, 'name' => 'INV/2026/00001', 'move_type' => 'out_invoice', 'state' => 'posted', 'payment_state' => 'not_paid', 'invoice_date' => '2026-11-01', 'date' => '2026-11-01', 'invoice_date_due' => '2026-12-01', 'commercial_partner_id' => [1, 'Liège Airport SA'], 'amount_untaxed' => 211, 'amount_tax' => 44.31, 'amount_total' => 255.31, 'amount_residual' => 255.31, 'ref' => 'PO-77', 'invoice_origin' => false, 'payment_reference' => '+++000/0000/10097+++', 'reversed_entry_id' => false, 'invoice_pdf_report_id' => [500, 'INV_2026_00001.pdf'], 'message_main_attachment_id' => [500, 'x'], 'write_date' => $w],
            ['id' => 101, 'name' => 'RINV/2026/00001', 'move_type' => 'out_refund', 'state' => 'posted', 'payment_state' => 'paid', 'invoice_date' => '2026-11-05', 'date' => '2026-11-05', 'invoice_date_due' => '2026-11-05', 'commercial_partner_id' => [2, 'Brussels Cargo NV'], 'amount_untaxed' => 45.5, 'amount_tax' => 9.56, 'amount_total' => 55.06, 'amount_residual' => 0, 'ref' => false, 'invoice_origin' => false, 'payment_reference' => false, 'reversed_entry_id' => [100, 'INV/2026/00001'], 'invoice_pdf_report_id' => false, 'message_main_attachment_id' => [501, 'RINV.pdf'], 'write_date' => $w],
            ['id' => 102, 'name' => '/', 'move_type' => 'out_invoice', 'state' => 'draft', 'payment_state' => 'not_paid', 'invoice_date' => false, 'date' => '2026-11-14', 'invoice_date_due' => false, 'commercial_partner_id' => [3, 'Client occasionnel'], 'amount_untaxed' => 120, 'amount_tax' => 25.2, 'amount_total' => 145.2, 'amount_residual' => 145.2, 'ref' => false, 'invoice_origin' => false, 'payment_reference' => false, 'reversed_entry_id' => false, 'write_date' => $w],
            ['id' => 103, 'name' => 'BILL/2026/00001', 'move_type' => 'in_invoice', 'state' => 'posted', 'payment_state' => 'not_paid', 'commercial_partner_id' => [2, 'x'], 'write_date' => $w],
        ],
        'ir.attachment' => [['id' => 500, 'name' => 'INV_2026_00001.pdf', 'mimetype' => 'application/pdf', 'datas' => base64_encode("%PDF-1.4 facture")], ['id' => 501, 'name' => 'RINV.pdf', 'mimetype' => 'application/pdf', 'datas' => base64_encode("%PDF-1.4 nc")]],
        'account.move.line' => [
            ['id' => 1, 'move_id' => [100, 'x'], 'name' => 'Prestations novembre', 'display_type' => 'line_section', 'quantity' => 0, 'price_unit' => 0, 'discount' => 0, 'tax_ids' => [], 'product_id' => false, 'sequence' => 1],
            ['id' => 2, 'move_id' => [100, 'x'], 'name' => "[ETAL-01] Étalonnage clé dynamométrique\nSN 4455", 'display_type' => 'product', 'quantity' => 2, 'price_unit' => 50, 'discount' => 9, 'tax_ids' => [1], 'product_id' => [10, 'x'], 'sequence' => 2],
            ['id' => 3, 'move_id' => [100, 'x'], 'name' => 'Manomètre', 'display_type' => 'product', 'quantity' => 1, 'price_unit' => 120, 'discount' => 0, 'tax_ids' => [1], 'product_id' => [11, 'x'], 'sequence' => 3],
            ['id' => 4, 'move_id' => [100, 'x'], 'name' => 'Merci pour votre confiance', 'display_type' => 'line_note', 'quantity' => 0, 'price_unit' => 0, 'discount' => 0, 'tax_ids' => [], 'product_id' => false, 'sequence' => 4],
            ['id' => 5, 'move_id' => [100, 'x'], 'name' => 'TVA 21%', 'display_type' => 'tax', 'quantity' => 0, 'price_unit' => 0, 'discount' => 0, 'tax_ids' => [], 'product_id' => false, 'sequence' => 9],
            ['id' => 6, 'move_id' => [101, 'x'], 'name' => 'Étalonnage', 'display_type' => 'product', 'quantity' => 1, 'price_unit' => 45.5, 'discount' => 0, 'tax_ids' => [1], 'product_id' => [10, 'x'], 'sequence' => 1],
            ['id' => 7, 'move_id' => [102, 'x'], 'name' => 'Manomètre', 'display_type' => 'product', 'quantity' => 1, 'price_unit' => 120, 'discount' => 0, 'tax_ids' => [1], 'product_id' => [11, 'x'], 'sequence' => 1],
        ],
    ], JSON_UNESCAPED_UNICODE));
}
if (($_SERVER['HTTP_HOST'] ?? '') === 'localhost:8767') { http_response_code(308); header('Location: http://127.0.0.1:8767' . $_SERVER['REQUEST_URI']); echo '<!doctype html><html lang=en><title>Redirecting...</title><h1>Redirecting...</h1>'; exit; }
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$all = json_decode(file_get_contents($f), true);
$serie = $all['_serie'] ?? '19.0';
if ($path === '/web/database/list') { echo json_encode(['jsonrpc' => '2.0', 'id' => null, 'result' => ['ways-test']]); exit; }
if ($path === '/jsonrpc') {
    $q = json_decode(file_get_contents('php://input'), true)['params'] ?? [];
    $ret = fn($r) => print(json_encode(['jsonrpc' => '2.0', 'id' => 1, 'result' => $r], JSON_UNESCAPED_UNICODE));
    $err = fn($n, $m) => print(json_encode(['jsonrpc' => '2.0', 'id' => 1, 'error' => ['code' => 200, 'message' => 'Odoo Server Error', 'data' => ['name' => $n, 'message' => $m]]]));
    if ($q['service'] === 'common' && $q['method'] === 'version') { $ret(['server_serie' => $serie, 'server_version' => $serie . '+e']); exit; }
    if ($q['service'] === 'common' && $q['method'] === 'authenticate') { [$db, $login, $pw] = $q['args']; $ret($db === 'ways-test' && $login === 'api@ways.test' && $pw === 'odoo-test-key' ? 7 : false); exit; }
    if ($q['service'] === 'object' && $q['method'] === 'execute_kw') {
        [$db, $uid, $pw, $model, $method, $args, $kw] = $q['args'] + [6 => []];
        if ($uid !== 7 || $pw !== 'odoo-test-key') { $err('odoo.exceptions.AccessDenied', 'Access Denied'); exit; }
        [$code, $out] = handle($all, $model, $method, ['domain' => $args[0] ?? []] + (array) $kw);
        if ($code !== 200) { $err('builtins.KeyError', $out['message'] ?? 'error'); exit; }
        $ret($out); exit;
    }
    $err('x', 'unsupported'); exit;
}
if ((float) $serie < 19) { http_response_code(303); header('Location: /web/login?redirect=' . urlencode($_SERVER['REQUEST_URI'])); echo 'Redirecting...'; exit; }
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'bearer odoo-test-key') { http_response_code(401); echo json_encode(['name' => 'odoo.exceptions.AccessDenied', 'message' => 'Access Denied']); exit; }
if (!preg_match('#^/json/2/([a-z._]+)/([a-z_]+)$#', $path, $m)) { http_response_code(404); echo json_encode(['message' => 'Not Found']); exit; }
[, $model, $method] = $m;
$b = json_decode(file_get_contents('php://input'), true) ?: [];
[$code, $out] = handle($all, $model, $method, $b);
http_response_code($code); echo json_encode($out, JSON_UNESCAPED_UNICODE);
function handle($data, $model, $method, $b) {
$rows = $data[$model] ?? null;
if ($rows === null) return [404, ['name' => 'KeyError', 'message' => "Unknown model $model"]];
$val = fn($r, $k) => is_array($r[$k] ?? null) && isset($r[$k][0]) && !is_array($r[$k][0]) && count($r[$k]) === 2 && is_string($r[$k][1]) ? $r[$k][0] : ($r[$k] ?? null);
$match = function ($r, $dom) use ($val) {
    foreach ($dom as [$k, $op, $v]) {
        $x = $val($r, $k);
        $ok = match ($op) { '=' => $x == $v, '>' => $x > $v, '>=' => $x >= $v, 'in' => in_array($x, $v), default => false };
        if (!$ok) return false;
    }
    return true;
};
$rows = array_values(array_filter($rows, fn($r) => $match($r, $b['domain'] ?? [])));
if ($method === 'search_count') return [200, count($rows)];
if ($method !== 'search_read') return [400, ['message' => "Unsupported $method"]];
usort($rows, fn($a, $c) => $a['id'] <=> $c['id']);
if (!empty($b['limit'])) $rows = array_slice($rows, 0, $b['limit']);
$fields = $b['fields'] ?? [];
foreach ($fields as $fl) if ($rows && !array_key_exists($fl, $rows[0]) && !in_array($fl, ['create_date'])) { /* champ inconnu toléré pour BILL */ }
return [200, array_map(fn($r) => array_intersect_key($r, array_flip(array_merge(["id"], $fields))), $rows)];
}
