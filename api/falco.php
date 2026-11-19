<?php
// Passerelle comptable vers Falco (et donc Horus, le logiciel du comptable).
// Les factures et notes de crédit de vente (aujourd'hui celles d'Odoo) sont transmises à Falco
// « vers la comptabilité » uniquement : jamais via Peppol, Odoo les a déjà envoyées aux clients.
//
// API Falco : https://api.falco-app.be/v1, en-têtes X-Falco-App-Secret (application) + X-Falco-Api-Key (organisation).
//  GET  falco/status      état (tout utilisateur connecté ; détails pour l'administrateur)
//  POST falco/sync        transmission automatique si activée (au plus toutes les 5 min)
//  POST falco/config      secret, clé, date de bascule, mode automatique (administrateur)
//  POST falco/test        whoami : organisation reliée (administrateur)
//  POST falco/push        transmet les documents en attente, ou {ids:[…]} précis (administrateur)
//  POST falco/disconnect  efface la connexion (administrateur)
//
// Chaque document transmis reçoit docs.<id>.falco = {id, status, sentAt, error} : jamais transmis deux fois.

const FA_EVERY  = 300;
const FA_BUDGET = 20;

function fak($k, $def = '') { $v = kv_get($k, $def); return $v === null ? (string) $def : (string) $v; }
function fa_configured() { return fak('fa_secret') !== '' && fak('fa_key') !== ''; }
function fa_base() { return rtrim(fak('fa_base', 'https://api.falco-app.be'), '/'); }

function fa_request($method, $path, $json = null, $multipart = null) {
    $hdr = ['X-Falco-App-Secret: ' . fak('fa_secret'), 'X-Falco-Api-Key: ' . fak('fa_key'), 'Accept: application/json', 'User-Agent: ways-erp'];
    $ch = curl_init(fa_base() . $path);
    $opt = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 45, CURLOPT_CONNECTTIMEOUT => 10];
    if ($json !== null) { $hdr[] = 'Content-Type: application/json'; $opt[CURLOPT_POSTFIELDS] = json_encode($json, JSON_UNESCAPED_UNICODE); }
    if ($multipart !== null) $opt[CURLOPT_POSTFIELDS] = $multipart;   // curl pose lui-même multipart/form-data
    $opt[CURLOPT_HTTPHEADER] = $hdr;
    curl_setopt_array($ch, $opt);
    $res = curl_exec($ch); $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) throw new RuntimeException('Falco ne répond pas (' . $err . ')');
    $data = json_decode((string) $res, true);
    if ($status >= 400 || $status === 0) {
        kv_set('fa_lastbody', mb_substr((string) $res, 0, 6000));
        $msg = '';
        if (is_array($data)) {
            $msg = trim(($data['title'] ?? '') . ' ' . ($data['detail'] ?? ($data['message'] ?? '')));
            if (!empty($data['validation_errors']) && is_array($data['validation_errors']))
                $msg .= ($msg ? ' — ' : '') . implode(' · ', array_map(fn($e) => trim(($e['property'] ?? '') . ' : ' . ($e['error'] ?? ''), ' :'), $data['validation_errors']));
            $rest = array_diff_key($data, array_flip(['type', 'title', 'status', 'instance', 'trace_id', 'detail', 'message', 'validation_errors']));
            if ($rest) $msg .= ($msg ? ' — ' : '') . mb_substr(json_encode($rest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 0, 700);
            if ($msg === '' && !empty($data['type'])) $msg = (string) $data['type'];
        }
        if ($status === 401 || $status === 403) $msg = 'accès refusé : vérifiez le secret de l\'application et la clé API (et leurs autorisations)' . ($msg ? " — $msg" : '');
        if ($msg === '') $msg = mb_substr(trim(strip_tags((string) $res)), 0, 400);
        throw new RuntimeException("Falco : $msg (HTTP $status)", $status);
    }
    return $data;
}

/* ---------- conversion d'un document ERP en import Falco ---------- */
function fa_money($v) { return number_format(round((float) $v, 2), 2, '.', ''); }
function fa_num($v, $minDec = 0) {   // décimal sans exposant : au moins $minDec décimales, au plus 4
    $t = rtrim(rtrim(number_format((float) $v, 4, '.', ''), '0'), '.');
    $dec = strpos($t, '.') === false ? 0 : strlen($t) - strpos($t, '.') - 1;
    return $dec < $minDec ? number_format((float) $v, $minDec, '.', '') : $t;
}
function fa_vat($v) { $v = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $v)); return $v; }
/* n° de TVA : formats officiels (VIES) ; contrôle de la clé pour la Belgique. Renvoie le n° normalisé ou ''. */
function fa_valid_vat($vat) {
    $v = fa_vat($vat);
    if ($v === '') return '';
    if (preg_match('/^\d{9,10}$/', $v)) $v = 'BE' . $v;                     // n° belge sans préfixe
    if (preg_match('/^BE(\d{9})$/', $v, $m)) $v = 'BE0' . $m[1];             // ancien format à 9 chiffres
    if (preg_match('/^CHE(\d{9})(MWST|TVA|IVA)?$/', $v, $m)) $v = 'CHE' . $m[1];
    $re = ['AT' => 'U\d{8}', 'BE' => '[01]\d{9}', 'BG' => '\d{9,10}', 'CY' => '\d{8}[A-Z]', 'CZ' => '\d{8,10}', 'DE' => '\d{9}', 'DK' => '\d{8}',
        'EE' => '\d{9}', 'EL' => '\d{9}', 'GR' => '\d{9}', 'ES' => '[A-Z0-9]\d{7}[A-Z0-9]', 'FI' => '\d{8}', 'FR' => '[A-HJ-NP-Z0-9]{2}\d{9}', 'HR' => '\d{11}',
        'HU' => '\d{8}', 'IE' => '\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W]', 'IT' => '\d{11}', 'LT' => '\d{9}|\d{12}', 'LU' => '\d{8}', 'LV' => '\d{11}', 'MT' => '\d{8}',
        'NL' => '\d{9}B\d{2}', 'PL' => '\d{10}', 'PT' => '\d{9}', 'RO' => '\d{2,10}', 'SE' => '\d{12}', 'SI' => '\d{8}', 'SK' => '\d{10}', 'XI' => '\d{9}|\d{12}',
        'GB' => '\d{9}|\d{12}|GD\d{3}|HA\d{3}', 'CHE' => '\d{9}', 'NO' => '\d{9}(MVA)?'];
    foreach ($re as $cc => $p) if (str_starts_with($v, $cc) && preg_match('/^' . $cc . '(?:' . $p . ')$/', $v)) {
        if ($cc === 'BE') { $n = substr($v, 2); if (97 - ((int) substr($n, 0, 8) % 97) !== (int) substr($n, 8, 2)) return ''; }
        return $cc === 'GR' ? 'EL' . substr($v, 2) : $v;
    }
    return '';
}
function fa_country_of($vat, $country) {
    $v = fa_vat($vat);
    if (preg_match('/^[A-Z]{2}/', $v) && !preg_match('/^\d/', $v)) return substr($v, 0, 2) === 'EL' ? 'GR' : substr($v, 0, 2);
    $map = ['france' => 'FR', 'pays-bas' => 'NL', 'nederland' => 'NL', 'netherlands' => 'NL', 'allemagne' => 'DE', 'germany' => 'DE', 'luxembourg' => 'LU', 'espagne' => 'ES', 'italie' => 'IT', 'royaume-uni' => 'GB', 'united kingdom' => 'GB', 'suisse' => 'CH'];
    $c = mb_strtolower(trim((string) $country));
    return $c === '' ? 'BE' : ($map[$c] ?? (strlen($c) === 2 ? strtoupper($c) : 'BE'));
}
function fa_addr($line, $zipcity, $country) {
    $sp = fn($v) => trim(preg_replace('/[\s\x{00A0}\x{202F}\x{2007}]+/u', ' ', (string) $v));
    $line = $sp($line); $zip = ''; $city = $sp($zipcity);
    $line = preg_replace('/\b(?:B|BE)-(\d{4})\b/u', '$1', $line);
    if ($city === '' && preg_match('/^(.*?)[,\s]+(\d{4,5})\s+([^,]+?)(?:,\s*(?:Belgique|België|Belgium|Belgien))?\s*$/iu', $line, $m)) { $line = trim($m[1], " ,"); $zip = $m[2]; $city = trim($m[3]); }
    elseif (preg_match('/^(?:[A-Z]{1,2}-)?(\d{4}\s?[A-Z]{2}|\d{3,5}(?:-\d{3,4})?|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\s+(.+)$/iu', $city, $m)) { $zip = $m[1]; $city = trim($m[2]); }
    return ['line1' => $line, 'zip' => $zip, 'city' => $city, 'country' => $country];
}
function fa_client_addr($c, $country) {
    if (trim((string) ($c['zip'] ?? '')) !== '' || trim((string) ($c['town'] ?? '')) !== '')
        return ['line1' => trim((string) ($c['address'] ?? '')), 'zip' => trim((string) ($c['zip'] ?? '')), 'city' => trim((string) ($c['town'] ?? '')), 'country' => $country];
    return fa_addr($c['address'] ?? '', $c['city'] ?? '', $country);
}
function fa_regime($rate, $receiverCountry, $receiverVat) {
    if ($rate > 0) return 'standard';
    if ($receiverCountry !== 'BE' && fa_vat($receiverVat) !== '') return in_array($receiverCountry, ['AT','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'], true) ? 'intra_community' : 'export';
    if ($receiverCountry !== 'BE') return 'export';
    return fa_vat($receiverVat) !== '' ? 'vat_reverse_charge' : 'taxes_not_applicable';
}
function fa_metadata($d, $client, $company, &$warn = null) {
    $rawVat = trim((string) ($client['vat'] ?? ''));
    $cv = fa_valid_vat($rawVat);
    if ($rawVat !== '' && $cv === '') $warn = 'n° de TVA du client « ' . ($client['name'] ?? '') . ' » non transmis car invalide : ' . $rawVat . ' (à corriger dans Odoo)';
    $client['vat'] = $cv;
    $rc = preg_match('/^[A-Z]{2}$/', strtoupper((string) ($client['countryCode'] ?? ''))) ? strtoupper($client['countryCode']) : fa_country_of($cv, $client['country'] ?? '');
    $lines = []; $byRate = [];
    foreach ($d['lines'] ?? [] as $l) {
        if (in_array($l['kind'] ?? '', ['section', 'note'], true)) continue;
        $qty = (float) ($l['qty'] ?? 0); $price = (float) ($l['price'] ?? 0); $rate = (float) ($l['vat'] ?? 0);
        if ($qty == 0 && $price == 0) continue;
        $base = round($qty * $price, 2);
        $reg = fa_regime($rate, $rc, $client['vat'] ?? '');
        $lines[] = ['name' => mb_substr(trim($l['label'] ?? '') ?: 'Article', 0, 250), 'description' => trim(($l['detail'] ?? '') ?: ($l['label'] ?? '')),
            'quantity' => fa_num($qty), 'unit_price' => fa_num($price, 2), 'tax_rate' => number_format($rate, 1, '.', ''), 'base_amount' => fa_money($base), 'tax_regime_type' => $reg];
        $k = $rate . '|' . $reg;
        $byRate[$k] = ($byRate[$k] ?? 0) + $base;
    }
    if (!$lines) throw new RuntimeException('document sans ligne');
    $ra = fa_client_addr($client, $rc);
    if ($ra['zip'] === '' || $ra['city'] === '' || $ra['line1'] === '')
        throw new RuntimeException('adresse incomplète du client « ' . ($client['name'] ?? '?') . ' » (' . implode(', ', array_keys(array_filter(['rue' => $ra['line1'] === '', 'code postal' => $ra['zip'] === '', 'ville' => $ra['city'] === '']))) . ' manquant) : complétez sa fiche dans Odoo, elle se mettra à jour ici');
    $subs = []; $ht = 0; $tva = 0;
    foreach ($byRate as $k => $base) {
        [$rate, $reg] = explode('|', $k);
        $tax = round($base * (float) $rate / 100, 2);
        $subs[] = ['tax_rate' => number_format((float) $rate, 1, '.', ''), 'base_amount' => fa_money($base), 'tax_amount' => fa_money($tax), 'tax_regime' => ['type' => $reg]];
        $ht += $base; $tva += $tax;
    }
    $m = [
        'document_type' => ($d['kind'] ?? '') === 'nc' ? 'sale_credit_note' : 'sale_invoice',
        'document_date' => (string) $d['date'], 'number' => (string) $d['number'], 'currency' => 'EUR',
        'base_amount' => fa_money($ht), 'total_amount' => fa_money($ht + $tva),
        'sender' => ['name' => (string) ($company['name'] ?? 'W.A.Y.S. SRL'), 'vat_number' => fa_vat($company['vat'] ?? ''), 'address' => fa_addr($company['address'] ?? '', '', 'BE')],
        'receiver' => array_filter(['name' => (string) ($client['name'] ?? 'Client'), 'vat_number' => fa_vat($client['vat'] ?? '') ?: null,
            'address' => fa_client_addr($client, $rc)], fn($v) => $v !== null),
        'tax_subtotals' => $subs, 'lines' => $lines,
        'send_peppol' => false, 'send_accounting' => true,
    ];
    if (!empty($d['dueDate']) && ($d['kind'] ?? '') !== 'nc') $m['due_date'] = (string) $d['dueDate'];   // interdit sur une note de crédit
    // intracommunautaire : Falco exige le lieu et la date de livraison → adresse du client, date de la facture
    if (array_filter($subs, fn($x) => $x['tax_regime']['type'] === 'intra_community'))
        $m['delivery'] = ['date' => (string) $d['date'], 'location_address' => $m['receiver']['address']];
    // Peppol BIS : buyer_reference ou purchase_order_reference obligatoire → référence client, sinon « N/A »
    $m['buyer_reference'] = trim((string) ($d['ref'] ?? '')) !== '' ? mb_substr(trim((string) $d['ref']), 0, 100) : 'N/A';
    if (($d['kind'] ?? '') === 'nc' && !empty($d['creditForNo'])) $m['billing_references'] = [['id' => (string) $d['creditForNo']]];
    $pm = array_filter(['code' => 'credit_transfer', 'communication' => (string) ($d['payRef'] ?? ''), 'iban' => preg_replace('/\s+/', '', (string) ($company['iban'] ?? ''))]);
    if (count($pm) > 1) $m['payment_means'] = [$pm];
    return $m;
}

/* ---------- PDF d'origine : celui qu'Odoo a envoyé au client ---------- */
function fa_odoo_pdf($odooId) {
    try { $r = od_read('account.move', [['id', '=', (int) $odooId]], ['invoice_pdf_report_id', 'message_main_attachment_id']); }
    catch (Throwable $e) { $r = od_read('account.move', [['id', '=', (int) $odooId]], ['message_main_attachment_id']); }
    $m = $r[0] ?? null;
    if (!$m) throw new RuntimeException('facture introuvable dans Odoo');
    $att = od_m2o($m['invoice_pdf_report_id'] ?? false) ?: od_m2o($m['message_main_attachment_id'] ?? false);
    if (!$att) throw new RuntimeException("pas encore de PDF dans Odoo (envoyez ou imprimez la facture dans Odoo)");
    $a = od_read('ir.attachment', [['id', '=', (int) $att]], ['datas', 'mimetype', 'name'])[0] ?? null;
    $bin = $a ? base64_decode((string) ($a['datas'] ?? ''), true) : false;
    if (!$bin || substr($bin, 0, 4) !== '%PDF') throw new RuntimeException('le PDF d\'Odoo est illisible');
    return [$bin, preg_replace('/[^A-Za-z0-9._-]/', '_', (string) ($a['name'] ?? 'facture.pdf'))];
}

function fa_eligible($d, $from) {
    return ($d['source'] ?? '') === 'odoo' && in_array($d['kind'] ?? '', ['facture', 'nc'], true)
        && in_array($d['status'] ?? '', ['envoyee', 'payee'], true) && empty($d['falco']['id'])
        && (string) ($d['date'] ?? '') >= $from && empty($d['demo']);
}

function fa_push_one($id, $d, $clients, $company) {
    try {
        [$pdf, $name] = fa_odoo_pdf($d['odooId'] ?? 0);
        $warn = null;
        $meta = fa_metadata($d, $clients[$d['clientId'] ?? ''] ?? [], $company, $warn);
        $file = class_exists('CURLStringFile') ? new CURLStringFile($pdf, $name, 'application/pdf') : null;
        if (!$file) { $tmp = tempnam(sys_get_temp_dir(), 'fa'); file_put_contents($tmp, $pdf); $file = new CURLFile($tmp, 'application/pdf', $name); }
        kv_set('fa_lastmeta', json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        $r = fa_request('POST', '/v1/invoices/imports/pdf', null, ['file' => $file, 'metadata' => json_encode($meta, JSON_UNESCAPED_UNICODE)]);
        if (isset($tmp)) @unlink($tmp);
        $acc = $r['accounting_status'] ?? [];
        $ok = ($acc['status'] ?? 'submitted') !== 'failed';
        $d['falco'] = ['id' => (string) ($r['document_id'] ?? ''), 'status' => $ok ? 'sent' : 'failed', 'sentAt' => gmdate('c'), 'error' => $ok ? '' : (string) ($acc['error_message'] ?? 'refusé par la comptabilité')];
        if ($warn) $d['falco']['warning'] = $warn;
    } catch (Throwable $e) {
        $d['falco'] = ['status' => 'error', 'error' => $e->getMessage(), 'triedAt' => gmdate('c')];
    }
    write_doc('docs', $id, $d, 'falco');
    if (function_exists('log_event')) {
        global $FA_MANUAL;
        $f = $d['falco']; $lbl = log_label('docs', $d);
        $by = $FA_MANUAL ? null : 'falco';
        if ($f['status'] === 'sent') log_event('docs', $id, 'falco', $lbl, $f['warning'] ?? null ? ['note' => $f['warning']] : null, $by);
        else log_event('docs', $id, 'falco_error', $lbl, ['note' => $f['error'] ?? ''], $by);
    }
    return $d['falco'];
}

function fa_push($ids = null, $override = false, $manual = false) {
    $GLOBALS['FA_MANUAL'] = $manual;
    $t0 = microtime(true);
    $from = fak('fa_from');
    if ($from === '' && !$ids) throw new RuntimeException('Indiquez d\'abord la date de bascule.');
    if (!od_configured()) throw new RuntimeException('La liaison Odoo doit être active : le PDF de chaque facture vient d\'Odoo.');
    $docs = od_coll_docs('docs'); $clients = od_coll_docs('clients');
    $company = (od_coll_docs('settings')['company'] ?? []);
    if (fa_vat($company['vat'] ?? '') === '') throw new RuntimeException('Le n° de TVA de l\'entreprise manque dans Paramètres.');
    $sa = fa_addr($company['address'] ?? '', '', 'BE');
    if ($sa['line1'] === '' || $sa['zip'] === '' || $sa['city'] === '') {
        $raw = trim((string) ($company['address'] ?? ''));
        throw new RuntimeException("Complétez l'adresse du siège dans Paramètres, au format « Rue et numéro, code postal Ville », puis cliquez sur Enregistrer. " . ($raw === '' ? "Le serveur n'a aucune adresse enregistrée." : "Adresse lue sur le serveur : « $raw »."));
    }
    $todo = [];
    foreach ($docs as $id => $d) {
        if ($ids !== null) { if (in_array($id, $ids, true) && fa_eligible($d, $override ? '' : $from)) $todo[$id] = $d; }
        elseif (fa_eligible($d, $from) && ($manual || !in_array($d['falco']['status'] ?? '', ['error', 'failed'], true) || strtotime($d['falco']['triedAt'] ?? $d['falco']['sentAt'] ?? '1970-01-01') < time() - 3600)) $todo[$id] = $d;
    }
    kv_set('fa_lastbody', ''); kv_set('fa_lastmeta', '');   // le détail technique ne concerne que cette transmission
    uasort($todo, fn($a, $b) => strcmp($a['date'] ?? '', $b['date'] ?? '') ?: strcmp($a['number'] ?? '', $b['number'] ?? ''));
    $res = ['sent' => 0, 'errors' => 0, 'remaining' => 0, 'messages' => []];
    foreach ($todo as $id => $d) {
        if (microtime(true) - $t0 > FA_BUDGET) { $res['remaining']++; continue; }
        $f = fa_push_one($id, $d, $clients, $company);
        if (($f['status'] ?? '') === 'sent') $res['sent']++;
        else { $res['errors']++; if (count($res['messages']) < 1) $res['messages'][] = ($d['number'] ?? $id) . ' : ' . ($f['error'] ?? ''); }
    }
    return $res;
}

function fa_status_out($admin) {
    $docs = fa_configured() ? od_coll_docs('docs') : [];
    $from = fak('fa_from'); $c = ['sent' => 0, 'pending' => 0, 'errors' => 0]; $errList = [];
    $cl = $docs ? od_coll_docs('clients') : [];
    foreach ($docs as $d) {
        if (($d['falco']['status'] ?? '') === 'sent') $c['sent']++;
        elseif (in_array($d['falco']['status'] ?? '', ['error', 'failed'], true) && ($from === '' || (string) ($d['date'] ?? '') >= $from)) { $c['errors']++; $errList[] = ['number' => (string) ($d['number'] ?? ''), 'date' => (string) ($d['date'] ?? ''), 'client' => (string) ($cl[$d['clientId'] ?? '']['name'] ?? ''), 'error' => (string) ($d['falco']['error'] ?? ''),
            'status' => (string) ($d['status'] ?? ''), 'kind' => (string) ($d['kind'] ?? ''), 'tried' => (string) ($d['falco']['triedAt'] ?? $d['falco']['sentAt'] ?? ''), 'retry' => fa_eligible($d, $from)]; }
        elseif ($from !== '' && fa_eligible($d, $from)) $c['pending']++;
    }
    $s = ['configured' => fa_configured(), 'from' => $from ?: null, 'auto' => fak('fa_auto') === '1', 'lastOk' => (int) fak('fa_ok', '0') ?: null, 'counts' => $c];
    if ($admin) {
        $s['org'] = json_decode(fak('fa_org', 'null'), true); $s['error'] = fak('fa_error') ?: null;
        $s['lastBody'] = fak('fa_lastbody') ?: null; $s['lastMeta'] = fak('fa_lastmeta') ?: null;
        usort($errList, fn($a, $b) => strcmp($a['date'], $b['date'])); $s['errList'] = array_slice($errList, 0, 100);
        $co = od_coll_docs('settings')['company'] ?? [];
        $s['sender'] = ['name' => (string) ($co['name'] ?? ''), 'vat' => fa_vat($co['vat'] ?? ''), 'raw' => (string) ($co['address'] ?? ''), 'address' => fa_addr($co['address'] ?? '', '', 'BE')];
    }
    return $s;
}

function falco_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'falco') return;
    auth_tables();
    $act = $parts[1] ?? '';
    $admin = $role === 'admin';
    if ($act === 'status' && $method === 'GET') out(fa_status_out($admin));
    if ($act === 'sync' && $method === 'POST') {
        if (!fa_configured() || fak('fa_auto') !== '1' || fak('fa_from') === '') out(['ok' => true, 'skipped' => true]);
        $t = now_ms();
        if ($t - (int) fak('fa_at', '0') < FA_EVERY * 1000 || ($t - (int) fak('fa_lock', '0') < 90000)) out(['ok' => true, 'skipped' => true]);
        kv_set('fa_lock', (string) $t); kv_set('fa_at', (string) $t);
        try { $r = fa_push(); kv_set('fa_ok', (string) now_ms()); kv_set('fa_error', $r['errors'] ? implode(' · ', $r['messages']) : ''); $resp = ['ok' => true] + $r; }
        catch (Throwable $e) { kv_set('fa_error', $e->getMessage()); $resp = ['ok' => false, 'error' => $e->getMessage()]; }
        kv_set('fa_lock', '0');   // avant out() : exit() ne passe pas par les blocs finally
        out($resp);
    }
    if (!$admin) fail(403, 'Réservé aux administrateurs');
    if ($act === 'config' && $method === 'POST') {
        $b = body_json();
        if (($v = trim((string) ($b['secret'] ?? ''))) !== '') kv_set('fa_secret', mb_substr($v, 0, 300));
        if (($v = trim((string) ($b['key'] ?? ''))) !== '') kv_set('fa_key', mb_substr($v, 0, 300));
        if (!fa_configured()) fail(400, "Indiquez le secret de l'application et la clé API Falco.");
        if (array_key_exists('from', $b)) { $f = (string) $b['from']; kv_set('fa_from', preg_match('/^\d{4}-\d{2}-\d{2}$/', $f) ? $f : ''); }
        if (array_key_exists('auto', $b)) kv_set('fa_auto', !empty($b['auto']) ? '1' : '');
        kv_set('fa_error', '');
        out(['ok' => true, 'status' => fa_status_out(true)]);
    }
    if ($act === 'test' && $method === 'POST') {
        if (!fa_configured()) fail(400, 'Connexion Falco incomplète');
        try { $w = fa_request('GET', '/v1/organization/whoami'); } catch (Throwable $e) { fail(502, $e->getMessage()); }
        $org = is_array($w) ? ($w['organization'] ?? $w) : [];
        $info = ['name' => (string) ($org['name'] ?? $org['company_name'] ?? ''), 'vat' => (string) ($org['vat_number'] ?? $org['vat'] ?? '')];
        kv_set('fa_org', json_encode($info, JSON_UNESCAPED_UNICODE));
        out(['ok' => true, 'org' => $info]);
    }
    if ($act === 'push' && $method === 'POST') {
        if (!fa_configured()) fail(400, 'Connexion Falco incomplète');
        $b = body_json();
        $ids = isset($b['ids']) && is_array($b['ids']) ? array_values(array_filter(array_map('strval', $b['ids']))) : null;
        try { $r = fa_push($ids, !empty($b['override']), true); kv_set('fa_ok', (string) now_ms()); if (!$ids) kv_set('fa_error', $r['errors'] ? implode(' · ', $r['messages']) : ''); out(['ok' => true] + $r); }
        catch (Throwable $e) { fail(400, $e->getMessage()); }
    }
    if ($act === 'disconnect' && $method === 'POST') {
        foreach (['fa_secret', 'fa_key', 'fa_auto', 'fa_org', 'fa_error', 'fa_ok', 'fa_at'] as $k) kv_set($k, '');
        out(['ok' => true]);
    }
    fail(404, 'Route inconnue');
}
