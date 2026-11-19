<?php
// Liaison Odoo (phase B : Odoo reste maître des clients, produits et factures ; l'ERP les reçoit en lecture seule).
// API externe : JSON-2 pour Odoo 19+ (POST <url>/json/2/<modèle>/<méthode>, « Authorization: bearer <clé> »),
// JSON-RPC /jsonrpc pour Odoo 18 et antérieurs (execute_kw, clé API comme mot de passe). Détection automatique.
// L'adresse, la base, la clé API et sa date d'expiration sont saisies par un administrateur dans Paramètres
// et rangées dans ways_kv ; la clé n'est jamais renvoyée au navigateur.
//
//  GET  odoo/status      état (tout utilisateur connecté ; détails pour l'administrateur)
//  POST odoo/sync        synchronise si nécessaire (toutes les 15 min ; reprise continue pendant l'import initial)
//  POST odoo/config      enregistre la connexion (administrateur ; champ vide = inchangé)
//  POST odoo/test        teste la connexion et compte les données côté Odoo (administrateur)
//  POST odoo/disconnect  efface la connexion (administrateur) ; les données importées restent
//
// Odoo → ERP :
//   res.partner (clients, customer_rank > 0)       → clients   (fiche existante reliée par TVA ou nom, sinon odoo-p-<id>)
//   product.product (vendables)                    → products  (relié par référence ou nom, sinon odoo-pr-<id>)
//   account.move (out_invoice / out_refund) + lignes → docs    (odoo-inv-<id>, facture / nc)
// Chaque enregistrement porte odooId et source "odoo" ; perm.php empêche de modifier dans l'ERP ce qu'Odoo gère.

const OD_EVERY   = 900;   // secondes entre deux synchronisations complètes
const OD_BUDGET  = 20;    // secondes de travail max par appel (l'import initial continue à l'appel suivant)
const OD_BATCH   = 200;
const ODOO_CLIENT_KEYS  = ['name', 'vat', 'email', 'phone', 'address', 'city', 'zip', 'town', 'country', 'countryCode', 'lang', 'odooId', 'odooRef', 'source', 'archived'];
const ODOO_PRODUCT_KEYS = ['name', 'ref', 'price', 'cost', 'vat', 'unit', 'odooId', 'source', 'archived'];

function odk($k, $def = '') { $v = kv_get($k, $def); return $v === null ? (string) $def : (string) $v; }
function od_configured() { return odk('od_url') !== '' && odk('od_key') !== ''; }
function od_state() { return json_decode(odk('od_state', '{}'), true) ?: []; }
function od_save_state($s) { kv_set('od_state', json_encode($s)); }

function od_http($base, $model, $method, $payload) {
    $url = rtrim($base, '/') . '/json/2/' . $model . '/' . $method;
    $hdr = ['Content-Type: application/json; charset=utf-8', 'Authorization: bearer ' . odk('od_key'), 'User-Agent: ways-erp'];
    if (($db = odk('od_db')) !== '') $hdr[] = 'X-Odoo-Database: ' . $db;
    $loc = '';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_HTTPHEADER => $hdr,
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$loc) { if (stripos($h, 'Location:') === 0) $loc = trim(substr($h, 9)); return strlen($h); }]);
        $res = curl_exec($ch); $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $cerr = curl_error($ch); curl_close($ch);
        if ($res === false) throw new RuntimeException('Odoo ne répond pas (' . $cerr . ')');
    } else {
        $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => implode("\r\n", $hdr), 'content' => $payload, 'timeout' => 30, 'ignore_errors' => true, 'follow_location' => 0]]);
        $res = @file_get_contents($url, false, $ctx);
        if ($res === false) throw new RuntimeException('Odoo ne répond pas');
        $status = 0;
        foreach ($http_response_header ?? [] as $h) { if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $status = (int) $m[1]; if (stripos($h, 'Location:') === 0) $loc = trim(substr($h, 9)); }
    }
    if ($loc !== '' && !preg_match('#^https?://#i', $loc)) { $p = parse_url($base); $loc = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '') . '/' . ltrim($loc, '/'); }
    return [$status, $res, $loc];
}
function od_base($url) {   // Odoo répond toujours à la racine du domaine
    $p = parse_url(trim($url));
    if (!$p || empty($p['host'])) return '';
    return strtolower($p['scheme'] ?? 'https') . '://' . strtolower($p['host']) . (isset($p['port']) ? ':' . $p['port'] : '');
}
function od_call_json2($model, $method, $body = []) {
    $payload = json_encode($body ?: new stdClass(), JSON_UNESCAPED_UNICODE);
    $base = od_base(odk('od_url'));
    [$status, $res, $loc] = od_http($base, $model, $method, $payload);
    if ($status >= 300 && $status < 400) {
        // redirection : si elle mène à la même API sur un autre domaine, on la suit et on retient la bonne adresse
        $nb = od_base($loc);
        if ($nb !== '' && $nb !== od_base($base) && str_contains(parse_url($loc, PHP_URL_PATH) ?? '', '/json/2/')) {
            [$status, $res, $loc2] = od_http($nb, $model, $method, $payload);
            if ($status >= 200 && $status < 300) kv_set('od_url', $nb);
            $loc = $loc2 ?: $loc;
        }
        if ($status >= 300 && $status < 400)
            throw new RuntimeException("Odoo : l'adresse renvoie vers " . ($loc ?: 'une autre page') . ". Indiquez l'adresse affichée dans votre navigateur quand vous êtes connecté à Odoo (ex. https://votre-societe.odoo.com).");
    }
    $data = json_decode((string) $res, true);
    if ($status >= 400 || $status === 0) {
        $msg = is_array($data) ? ($data['message'] ?? $data['name'] ?? '') : '';
        if ($status === 401) $msg = 'clé API refusée (expirée ou incorrecte)' . ($msg ? " — $msg" : '');
        if ($status === 404 && $msg === '') $msg = 'adresse ou base introuvable, ou Odoo antérieur à la version 19 (API JSON-2 absente)';
        if ($msg === '') $msg = mb_substr(trim(preg_replace('/\s+/', ' ', strip_tags((string) $res))), 0, 160);
        throw new RuntimeException("Odoo : $msg (HTTP $status)", $status);
    }
    if ($data === null && trim((string) $res) !== 'null') {
        $txt = trim(preg_replace('/\s+/', ' ', strip_tags((string) $res)));
        throw new RuntimeException(stripos((string) $res, '<html') !== false
            ? "Odoo a renvoyé une page web au lieu de données (« " . mb_substr($txt, 0, 80) . " »). Vérifiez l'adresse : elle doit être celle de votre base Odoo (ex. https://votre-societe.odoo.com), pas celle du site odoo.com ou de votre site internet."
            : 'Réponse Odoo inattendue : ' . mb_substr($txt, 0, 120));
    }
    return $data;
}
/* ---------- Odoo 18 et antérieurs : API externe JSON-RPC (/jsonrpc), clé API utilisée comme mot de passe ---------- */
function od_post_json($base, $path, $payload) {
    $hdr = ['Content-Type: application/json; charset=utf-8', 'User-Agent: ways-erp'];
    $ch = curl_init(rtrim($base, '/') . $path);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE), CURLOPT_HTTPHEADER => $hdr,
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 45, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_FOLLOWLOCATION => false]);
    $res = curl_exec($ch); $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $cerr = curl_error($ch); curl_close($ch);
    if ($res === false) throw new RuntimeException('Odoo ne répond pas (' . $cerr . ')');
    if ($status >= 300 && $status < 400) throw new RuntimeException("Odoo : l'adresse renvoie vers une autre page (HTTP $status). Vérifiez l'adresse de votre base Odoo.");
    $data = json_decode((string) $res, true);
    if (!is_array($data)) throw new RuntimeException("Odoo : réponse inattendue (HTTP $status) « " . mb_substr(trim(preg_replace('/\s+/', ' ', strip_tags((string) $res))), 0, 100) . ' »');
    if (isset($data['error'])) {
        $e = $data['error']; $name = $e['data']['name'] ?? ''; $msg = $e['data']['message'] ?? ($e['message'] ?? 'erreur');
        if (str_contains($name, 'AccessDenied')) $msg = 'identifiant ou clé API refusés';
        throw new RuntimeException("Odoo : $msg");
    }
    return $data['result'] ?? null;
}
function od_rpc($service, $method, $args) {
    return od_post_json(od_base(odk('od_url')), '/jsonrpc', ['jsonrpc' => '2.0', 'method' => 'call', 'id' => 1, 'params' => ['service' => $service, 'method' => $method, 'args' => $args]]);
}
function od_db() {
    if (($db = odk('od_db')) !== '') return $db;
    $list = od_post_json(od_base(odk('od_url')), '/web/database/list', ['jsonrpc' => '2.0', 'method' => 'call', 'params' => new stdClass()]);
    if (is_array($list) && count($list) === 1) { kv_set('od_db', (string) $list[0]); return (string) $list[0]; }
    throw new RuntimeException("Odoo : indiquez le nom de la base de données.");
}
function od_uid() {
    $sig = sha1(odk('od_url') . '|' . odk('od_db') . '|' . odk('od_login') . '|' . odk('od_key'));
    if (odk('od_uidsig') === $sig && (int) odk('od_uid') > 0) return (int) odk('od_uid');
    if (odk('od_login') === '') throw new RuntimeException("Odoo : indiquez l'identifiant de connexion (e-mail) de l'utilisateur à qui appartient la clé API.");
    $uid = od_rpc('common', 'authenticate', [od_db(), odk('od_login'), odk('od_key'), new stdClass()]);
    if (!$uid) throw new RuntimeException('Odoo : identifiant ou clé API refusés (vérifiez l\'e-mail de connexion et la clé).');
    kv_set('od_uid', (string) (int) $uid); kv_set('od_uidsig', $sig);
    return (int) $uid;
}
function od_proto() {
    if (($p = odk('od_proto')) !== '') return $p;
    $v = od_rpc('common', 'version', []);
    $serie = (float) ($v['server_serie'] ?? 0);
    $p = $serie >= 19 ? 'json2' : 'jsonrpc';
    kv_set('od_proto', $p); kv_set('od_version', (string) ($v['server_version'] ?? ''));
    return $p;
}
function od_call($model, $method, $body = []) {
    if (od_proto() === 'json2') return od_call_json2($model, $method, $body);
    $args = [$body['domain'] ?? []];
    $kw = $body; unset($kw['domain']);
    return od_rpc('object', 'execute_kw', [od_db(), od_uid(), odk('od_key'), $model, $method, $args, $kw ?: new stdClass()]);
}

function od_read($model, $domain, $fields, $limit = 0, $order = 'id asc') {
    $b = ['domain' => $domain, 'fields' => $fields, 'order' => $order, 'context' => ['active_test' => false, 'lang' => 'fr_BE']];
    if ($limit) $b['limit'] = $limit;
    return od_call($model, 'search_read', $b) ?: [];
}

/* ---------- utilitaires ---------- */
function od_norm($s) { return mb_strtoupper(preg_replace('/[^\p{L}\p{N}]/u', '', (string) $s)); }
function od_m2o($v) { return is_array($v) ? ($v[0] ?? null) : ($v ?: null); }       // [id, "nom"] | id | false
function od_m2o_name($v) { return is_array($v) ? (string) ($v[1] ?? '') : ''; }
function od_str($v) { return ($v === false || $v === null) ? '' : trim((string) $v); }
function od_coll_docs($coll) {
    if (function_exists('sbx_id') && sbx_id()) { $out = []; foreach (sbx_rows($coll) as $id => $r) $out[$id] = json_decode($r['data'], true) ?: []; return $out; }
    $out = [];
    $st = db()->prepare('SELECT id, data FROM ways_docs WHERE coll = ? AND deleted = 0');
    $st->execute([$coll]);
    foreach ($st as $r) $out[$r['id']] = json_decode($r['data'], true) ?: [];
    return $out;
}
function od_same($a, $b, $keys) { foreach ($keys as $k) if (($a[$k] ?? null) != ($b[$k] ?? null)) return false; return true; }
function od_put($coll, $id, $data, &$cache) { write_doc($coll, $id, $data, 'odoo'); $cache[$id] = $data; }

function od_taxes() {
    $map = [];
    foreach (od_read('account.tax', [], ['amount', 'amount_type']) as $t)
        $map[$t['id']] = ($t['amount_type'] ?? 'percent') === 'percent' ? +$t['amount'] : 0;
    return $map;
}
function od_rate($ids, $tax) { $r = 0; foreach ((array) $ids as $i) $r += $tax[$i] ?? 0; return round($r, 2); }

/* ---------- index des fiches ERP déjà reliées ---------- */
function od_index($docs, $by) {
    $ix = ['odoo' => [], 'key' => [], 'name' => []];
    foreach ($docs as $id => $d) {
        if (!empty($d['odooId'])) { $ix['odoo'][(string) $d['odooId']] = $id; continue; }
        if (($k = od_norm($d[$by] ?? '')) !== '') $ix['key'][$k] = $id;
        if (($k = od_norm($d['name'] ?? '')) !== '') $ix['name'][$k] = $id;
    }
    return $ix;
}

/* ---------- clients ---------- */
function od_partner_doc($p, $old) {
    $street = trim(od_str($p['street'] ?? '') . ' ' . od_str($p['street2'] ?? ''));
    $country = od_m2o_name($p['country_id'] ?? false);
    $lang = od_str($p['lang'] ?? '');
    return array_merge($old ?: ['createdAt' => substr(od_str($p['create_date'] ?? ''), 0, 10) ?: gmdate('Y-m-d')], [
        'name' => od_str($p['name'] ?? ''), 'vat' => od_str($p['vat'] ?? ''), 'email' => od_str($p['email'] ?? ''),
        'phone' => od_str($p['phone'] ?? ''), 'address' => $street,
        'city' => trim(od_str($p['zip'] ?? '') . ' ' . od_str($p['city'] ?? '')),
        'zip' => od_str($p['zip'] ?? ''), 'town' => od_str($p['city'] ?? ''), 'countryCode' => od_str($p['country_code'] ?? ''),
        'country' => ($country && !preg_match('/^(Belg|België)/i', $country)) ? $country : '',
        'lang' => str_starts_with($lang, 'en') ? 'en' : (($old['lang'] ?? '') ?: 'fr'),
        'odooId' => (int) $p['id'], 'odooRef' => od_str($p['ref'] ?? ''), 'source' => 'odoo', 'archived' => empty($p['active']),
    ]);
}
const OD_PARTNER_FIELDS = ['name', 'vat', 'email', 'phone', 'street', 'street2', 'zip', 'city', 'country_id', 'country_code', 'lang', 'ref', 'active', 'create_date', 'write_date'];
function od_upsert_partners($rows, &$clients, &$ix) {
    $n = 0;
    foreach ($rows as $p) {
        $oid = (string) $p['id'];
        $id = $ix['odoo'][$oid] ?? null;
        if (!$id && ($k = od_norm($p['vat'] ?? '')) !== '' && isset($ix['key'][$k])) $id = $ix['key'][$k];
        if (!$id && ($k = od_norm($p['name'] ?? '')) !== '' && isset($ix['name'][$k])) $id = $ix['name'][$k];
        $id = $id ?: 'odoo-p-' . $oid;
        $old = $clients[$id] ?? null;
        $doc = od_partner_doc($p, $old);
        $ix['odoo'][$oid] = $id;
        if ($old && od_same($old, $doc, ODOO_CLIENT_KEYS)) continue;
        od_put('clients', $id, $doc, $clients); $n++;
    }
    return $n;
}

/* ---------- produits ---------- */
const OD_PRODUCT_FIELDS = ['name', 'default_code', 'lst_price', 'standard_price', 'uom_id', 'taxes_id', 'type', 'active', 'write_date'];
function od_upsert_products($rows, &$products, &$ix, $tax) {
    $n = 0;
    foreach ($rows as $p) {
        $oid = (string) $p['id'];
        $ref = od_str($p['default_code'] ?? '');
        $id = $ix['odoo'][$oid] ?? null;
        if (!$id && ($k = od_norm($ref)) !== '' && isset($ix['key'][$k])) $id = $ix['key'][$k];
        if (!$id && ($k = od_norm($p['name'] ?? '')) !== '' && isset($ix['name'][$k])) $id = $ix['name'][$k];
        $id = $id ?: 'odoo-pr-' . $oid;
        $old = $products[$id] ?? null;
        $doc = array_merge($old ?: ['kind' => ($p['type'] ?? '') === 'service' ? 'service' : 'produit', 'stock' => 0, 'minStock' => 0], [
            'name' => od_str($p['name'] ?? ''), 'ref' => $ref !== '' ? $ref : 'ODOO-' . $oid,
            'price' => round(+($p['lst_price'] ?? 0), 4), 'cost' => round(+($p['standard_price'] ?? 0), 4),
            'vat' => $p['taxes_id'] ? od_rate($p['taxes_id'], $tax) : 21, 'unit' => od_m2o_name($p['uom_id'] ?? false),
            'odooId' => (int) $p['id'], 'source' => 'odoo', 'archived' => empty($p['active']),
        ]);
        $ix['odoo'][$oid] = $id;
        if ($old && od_same($old, $doc, ODOO_PRODUCT_KEYS)) continue;
        od_put('products', $id, $doc, $products); $n++;
    }
    return $n;
}

/* ---------- factures et notes de crédit ---------- */
const OD_MOVE_FIELDS = ['name', 'move_type', 'state', 'payment_state', 'invoice_date', 'date', 'invoice_date_due', 'commercial_partner_id',
    'amount_untaxed', 'amount_tax', 'amount_total', 'amount_residual', 'ref', 'invoice_origin', 'payment_reference', 'reversed_entry_id', 'write_date'];
function od_status($m) {
    if (($m['state'] ?? '') === 'draft') return 'brouillon';
    if (($m['state'] ?? '') === 'cancel') return 'annulee';
    return in_array($m['payment_state'] ?? '', ['paid', 'in_payment', 'reversed'], true) ? 'payee' : 'envoyee';
}
function od_upsert_moves($moves, &$docs, &$clients, &$cix, $pix, $tax) {
    if (!$moves) return 0;
    $ids = array_map(fn($m) => (int) $m['id'], $moves);
    $lines = [];
    foreach (od_read('account.move.line', [['move_id', 'in', $ids], ['display_type', 'in', ['product', 'line_section', 'line_note']]],
        ['move_id', 'name', 'quantity', 'price_unit', 'discount', 'tax_ids', 'product_id', 'display_type', 'sequence'], 0, 'move_id asc, sequence asc, id asc') as $l)
        $lines[od_m2o($l['move_id'])][] = $l;
    // clients absents (customer_rank à 0) : on les lit à la demande
    $missing = [];
    foreach ($moves as $m) { $pid = od_m2o($m['commercial_partner_id'] ?? false); if ($pid && !isset($cix['odoo'][(string) $pid])) $missing[$pid] = 1; }
    if ($missing) od_upsert_partners(od_read('res.partner', [['id', 'in', array_keys($missing)]], OD_PARTNER_FIELDS), $clients, $cix);
    $n = 0;
    foreach ($moves as $m) {
        $id = 'odoo-inv-' . $m['id'];
        $out = []; $notes = [];
        foreach ($lines[$m['id']] ?? [] as $l) {
            $txt = od_str($l['name'] ?? '');
            if ($l['display_type'] === 'line_section') { $out[] = ['kind' => 'section', 'label' => $txt]; continue; }
            if ($l['display_type'] === 'line_note') { if ($txt !== '') $notes[] = $txt; continue; }
            $parts = preg_split('/\R/', $txt, 2);
            $pid = od_m2o($l['product_id'] ?? false);
            $out[] = array_filter([
                'label' => $parts[0], 'detail' => $parts[1] ?? '', 'qty' => +($l['quantity'] ?? 0),
                'price' => round(+($l['price_unit'] ?? 0) * (1 - (+($l['discount'] ?? 0)) / 100), 4),
                'vat' => od_rate($l['tax_ids'] ?? [], $tax), 'productId' => $pid ? ($pix['odoo'][(string) $pid] ?? null) : null,
            ], fn($v) => $v !== null && $v !== '');
        }
        foreach ($out as &$o) { $o['qty'] = $o['qty'] ?? 0; $o['price'] = $o['price'] ?? 0; $o['vat'] = $o['vat'] ?? 0; } unset($o);
        $pid = od_m2o($m['commercial_partner_id'] ?? false);
        $rev = od_m2o($m['reversed_entry_id'] ?? false);
        $name = od_str($m['name'] ?? '');
        $doc = [
            'kind' => ($m['move_type'] ?? '') === 'out_refund' ? 'nc' : 'facture',
            'number' => ($name === '' || $name === '/') ? 'Brouillon Odoo ' . $m['id'] : $name,
            'status' => od_status($m), 'date' => od_str($m['invoice_date'] ?: ($m['date'] ?? '')), 'dueDate' => od_str($m['invoice_date_due'] ?? ''),
            'clientId' => $pid ? ($cix['odoo'][(string) $pid] ?? null) : null, 'lines' => $out, 'notes' => implode("\n", $notes),
            'ref' => od_str($m['ref'] ?? ''), 'origin' => od_str($m['invoice_origin'] ?? ''), 'payRef' => od_str($m['payment_reference'] ?? ''),
            'odooTotals' => ['ht' => +($m['amount_untaxed'] ?? 0), 'tva' => +($m['amount_tax'] ?? 0), 'ttc' => +($m['amount_total'] ?? 0), 'residual' => +($m['amount_residual'] ?? 0)],
            'paymentState' => od_str($m['payment_state'] ?? ''),
            'odooId' => (int) $m['id'], 'source' => 'odoo', 'odooWrite' => od_str($m['write_date'] ?? ''),
        ];
        if ($rev) { $doc['creditFor'] = 'odoo-inv-' . $rev; $doc['creditForNo'] = od_m2o_name($m['reversed_entry_id']); }
        $old = $docs[$id] ?? null;
        if ($old && ($old['odooWrite'] ?? '') === $doc['odooWrite'] && od_same($old, $doc, ['status', 'odooTotals', 'clientId'])) continue;
        if ($old) foreach (['deliveryId', 'deliveryNo', 'demo'] as $k) if (isset($old[$k])) $doc[$k] = $old[$k];
        od_put('docs', $id, $doc, $docs); $n++;
    }
    return $n;
}

/* ---------- moteur : étapes successives, reprise par lots ---------- */
function od_utc($ms) { return gmdate('Y-m-d H:i:s', intdiv($ms, 1000)); }
function od_run() {
    $t0 = microtime(true);
    $st = od_state();
    if ((int) ($st['schema'] ?? 1) < 2) { unset($st['partners']); $st['schema'] = 2; od_save_state($st); }   // relire tous les clients (code postal séparé)
    $stats = ['clients' => 0, 'products' => 0, 'invoices' => 0, 'refreshed' => 0];
    $tax = od_taxes();
    $clients = od_coll_docs('clients'); $cix = od_index($clients, 'vat');
    $products = od_coll_docs('products'); $pix = od_index($products, 'ref');
    $docs = null;
    $steps = [
        'partners' => ['res.partner', [['customer_rank', '>', 0]], OD_PARTNER_FIELDS],
        'products' => ['product.product', [['sale_ok', '=', true]], OD_PRODUCT_FIELDS],
        'moves'    => ['account.move', [['move_type', 'in', ['out_invoice', 'out_refund']]], OD_MOVE_FIELDS],
    ];
    foreach ($steps as $step => [$model, $domain, $fields]) {
        $s = $st[$step] ?? ['since' => '', 'lastId' => 0, 'runStart' => ''];
        if (!$s['lastId']) $s['runStart'] = od_utc(now_ms() - 300000);       // marge de 5 min
        while (true) {
            if (microtime(true) - $t0 > OD_BUDGET) { $st[$step] = $s; od_save_state($st); return ['more' => true] + $stats; }
            $d = $domain;
            if ($s['since'] !== '') $d[] = ['write_date', '>=', $s['since']];
            if ($s['lastId']) $d[] = ['id', '>', $s['lastId']];
            $rows = od_read($model, $d, $fields, $step === 'moves' ? 100 : OD_BATCH);
            db()->beginTransaction();
            if ($step === 'partners') $stats['clients'] += od_upsert_partners($rows, $clients, $cix);
            if ($step === 'products') $stats['products'] += od_upsert_products($rows, $products, $pix, $tax);
            if ($step === 'moves') { if ($docs === null) $docs = od_coll_docs('docs'); $stats['invoices'] += od_upsert_moves($rows, $docs, $clients, $cix, $pix, $tax); }
            db()->commit();
            if ($rows) $s['lastId'] = max(array_map(fn($r) => (int) $r['id'], $rows));
            if (count($rows) < ($step === 'moves' ? 100 : OD_BATCH)) { $s = ['since' => $s['runStart'], 'lastId' => 0, 'runStart' => '']; $st[$step] = $s; od_save_state($st); break; }
            $st[$step] = $s; od_save_state($st);
        }
    }
    // paiements et suppressions : on relit l'état des factures encore ouvertes
    if ($docs === null) $docs = od_coll_docs('docs');
    $open = [];
    foreach ($docs as $id => $d) if (($d['source'] ?? '') === 'odoo' && !in_array($d['status'] ?? '', ['payee', 'annulee'], true) && !empty($d['odooId'])) $open[(int) $d['odooId']] = $id;
    foreach (array_chunk(array_keys($open), 300) as $chunk) {
        $seen = [];
        $rows = od_read('account.move', [['id', 'in', $chunk]], ['state', 'payment_state', 'amount_residual']);
        db()->beginTransaction();
        foreach ($rows as $m) {
            $seen[(int) $m['id']] = 1;
            $id = $open[(int) $m['id']]; $d = $docs[$id];
            $nst = od_status($m); $res = +($m['amount_residual'] ?? 0);
            if ($nst === ($d['status'] ?? '') && $res == ($d['odooTotals']['residual'] ?? null)) continue;
            $d['status'] = $nst; $d['paymentState'] = od_str($m['payment_state'] ?? ''); $d['odooTotals']['residual'] = $res;
            od_put('docs', $id, $d, $docs); $stats['refreshed']++;
        }
        foreach ($chunk as $oid) if (!isset($seen[$oid])) { write_doc('docs', $open[$oid], [], 'odoo', 1); $stats['refreshed']++; }   // supprimée dans Odoo
        db()->commit();
    }
    return ['more' => false] + $stats;
}

function od_sync($force = false) {
    if (!od_configured()) return ['ok' => false, 'configured' => false];
    $t = now_ms();
    $lock = (int) odk('od_lock', '0');
    if ($lock && $t - $lock < 90000) return ['ok' => true, 'busy' => true];
    $more = !empty(od_state()['more']);
    if (!$force && !$more && $t - (int) odk('od_at', '0') < OD_EVERY * 1000) return ['ok' => true, 'skipped' => true];
    kv_set('od_lock', (string) $t);
    try {
        $r = od_run();
        $st = od_state(); $st['more'] = $r['more']; od_save_state($st);
        kv_set('od_at', (string) $t);
        if (!$r['more']) { kv_set('od_ok', (string) now_ms()); if (!odk('od_first')) kv_set('od_first', (string) now_ms()); }
        kv_set('od_error', '');
        return ['ok' => true] + $r;
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        kv_set('od_at', (string) $t);
        kv_set('od_error', $e->getMessage() . ' (' . gmdate('c') . ')');
        return ['ok' => false, 'error' => $e->getMessage()];
    } finally { kv_set('od_lock', '0'); }
}

function od_status_out($admin) {
    $exp = odk('od_keyexp');
    $s = ['configured' => od_configured(), 'url' => rtrim(odk('od_url'), '/'), 'lastOk' => (int) odk('od_ok', '0') ?: null,
          'importing' => !empty(od_state()['more']) || (od_configured() && !odk('od_first')), 'keyExp' => $exp ?: null,
          'keyDays' => $exp ? (int) floor((strtotime($exp . ' 23:59:59') - time()) / 86400) : null];
    if ($admin) { $s['db'] = odk('od_db'); $s['login'] = odk('od_login'); $s['version'] = odk('od_version') ?: null; $s['api'] = odk('od_proto') ?: null; $s['error'] = odk('od_error') ?: null; $s['hasKey'] = odk('od_key') !== ''; }
    return $s;
}

function odoo_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'odoo') return;
    auth_tables();
    $act = $parts[1] ?? '';
    $admin = $role === 'admin';
    if ($act === 'status' && $method === 'GET') out(od_status_out($admin));
    if ($act === 'sync' && $method === 'POST') { $b = body_json(); out(od_sync($admin && !empty($b['force']))); }
    if (!$admin) fail(403, 'Réservé aux administrateurs');
    if ($act === 'config' && $method === 'POST') {
        $b = body_json();
        $url = trim((string) ($b['url'] ?? ''));
        if ($url !== '') {
            if (!preg_match('#^https://[^\s/]+(/[^\s]*)?$#i', $url)) fail(400, "Adresse Odoo invalide (ex. https://ways.odoo.com).");
            $url = od_base($url);
            if (preg_match('#^https://(www\.)?odoo\.com$#', $url)) fail(400, "C'est l'adresse du site odoo.com : indiquez celle de votre base (ex. https://votre-societe.odoo.com).");
            if ($url !== odk('od_url')) { kv_set('od_state', '{}'); kv_set('od_first', ''); }
            kv_set('od_url', $url);
        }
        if (odk('od_url') === '') fail(400, "Indiquez l'adresse de votre Odoo.");
        if (array_key_exists('db', $b)) kv_set('od_db', mb_substr(trim((string) $b['db']), 0, 100));
        if (array_key_exists('login', $b)) kv_set('od_login', mb_substr(trim((string) $b['login']), 0, 150));
        kv_set('od_proto', ''); kv_set('od_uid', '');
        if (($k = trim((string) ($b['key'] ?? ''))) !== '') kv_set('od_key', mb_substr($k, 0, 200));
        if (odk('od_key') === '') fail(400, 'Indiquez la clé API Odoo.');
        if (array_key_exists('keyExp', $b)) { $e = (string) $b['keyExp']; kv_set('od_keyexp', preg_match('/^\d{4}-\d{2}-\d{2}$/', $e) ? $e : ''); }
        kv_set('od_at', '0'); kv_set('od_error', '');
        out(['ok' => true, 'status' => od_status_out(true)]);
    }
    if ($act === 'test' && $method === 'POST') {
        if (!od_configured()) fail(400, 'Connexion Odoo incomplète');
        try {
            $c = od_call('res.partner', 'search_count', ['domain' => [['customer_rank', '>', 0]]]);
            $p = od_call('product.product', 'search_count', ['domain' => [['sale_ok', '=', true]]]);
            $i = od_call('account.move', 'search_count', ['domain' => [['move_type', 'in', ['out_invoice', 'out_refund']]]]);
        } catch (Throwable $e) { fail(502, $e->getMessage()); }
        out(['ok' => true, 'clients' => $c, 'products' => $p, 'invoices' => $i]);
    }
    if ($act === 'disconnect' && $method === 'POST') {
        foreach (['od_url', 'od_db', 'od_login', 'od_uid', 'od_proto', 'od_version', 'od_key', 'od_keyexp', 'od_error', 'od_ok', 'od_first', 'od_at'] as $k) kv_set($k, '');
        kv_set('od_state', '{}');
        out(['ok' => true]);
    }
    fail(404, 'Route inconnue');
}
