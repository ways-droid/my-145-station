<?php
// Factures d'achat : lues dans Falco (qui les reçoit via Peppol), affichées dans le module Achats.
// Falco reste le point d'accès Peppol et la source pour la comptabilité : l'ERP lit, affiche, relie aux paiements,
// et peut mettre à jour le statut de paiement ou répondre au fournisseur via Peppol (accepter / refuser).
//
//  GET  achats/status           état de la synchro (administrateur et bureau)
//  POST achats/sync {force}     synchronisation (au plus toutes les 30 min ; forcée : toutes les 60 s)
//  POST achats/pdf {id}         rapatrie le PDF de la facture (mis en cache) → {fileId}
//  POST achats/paid {id,status} statut de paiement dans Falco : not_paid | partially_paid | paid
//  POST achats/response {id,code,reason}  réponse Peppol au fournisseur : accepted | rejected | under_query | paid
//
// Collection purchases/<fa-ID Falco> : champs Falco (protégés) + champs ERP (archived, note, pdfFileId, response).

const FP_EVERY   = 1800;   // secondes
const FP_REFRESH = 21600;  // relecture des 6 derniers mois (statuts de paiement) toutes les 6 h
const FP_BUDGET  = 20;     // secondes par appel
const FP_KEYS = ['peppol', 'paymentLocal', 'fileName', 'number', 'date', 'dueDate', 'currency', 'amount', 'credit', 'supplierName', 'supplierVat', 'supplierCompanyNo', 'falcoId',
    'paymentStatus', 'peppolStatus', 'files', 'createdAt', 'updatedAt', 'source', 'inboundId', 'paymentRef', 'supplierIban', 'receivedAt', 'response', 'pdfFileId'];

function fp_list($path, $q) {
    $r = fa_request('GET', $path . '?' . http_build_query($q));
    // forme de la réponse paginée non documentée : on cherche la liste où qu'elle soit (data, items, content, results, …)
    $found = null;
    if (is_array($r) && array_is_list($r)) $found = $r;
    elseif (is_array($r)) {
        foreach (['data', 'items', 'content', 'results', 'documents', 'records'] as $k) if (isset($r[$k]) && is_array($r[$k])) { $found = array_is_list($r[$k]) ? $r[$k] : ($r[$k]['items'] ?? $r[$k]['data'] ?? null); if (is_array($found)) break; }
        if ($found === null) foreach ($r as $v) if (is_array($v) && array_is_list($v) && $v && is_array($v[0])) { $found = $v; break; }
    }
    $diag = json_decode(fak('fp_diag', '{}'), true) ?: [];
    $diag[$path] = ['at' => gmdate('c'), 'query' => $q, 'keys' => is_array($r) ? array_slice(array_keys($r), 0, 12) : gettype($r), 'count' => is_array($found) ? count($found) : null,
        'sample' => mb_substr(json_encode(is_array($found) && $found ? $found[0] : $r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 0, 600)];
    kv_set('fp_diag', json_encode($diag, JSON_UNESCAPED_UNICODE));
    return is_array($found) ? $found : [];
}
function fp_raw($path) {
    $ch = curl_init(fa_base() . $path);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 45, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER => ['X-Falco-App-Secret: ' . fak('fa_secret'), 'X-Falco-Api-Key: ' . fak('fa_key'), 'Accept: application/octet-stream', 'User-Agent: ways-erp']]);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $ct = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE); curl_close($ch);
    if ($res === false || $st >= 400) {
        $d = json_decode((string) $res, true);
        throw new RuntimeException('Falco : ' . (is_array($d) ? trim(($d['title'] ?? '') . ' ' . ($d['detail'] ?? '')) : 'fichier indisponible') . " (HTTP $st)");
    }
    return [$res, $ct];
}
function fp_key($number, $vat) { return mb_strtolower(trim((string) $number)) . '|' . fa_vat($vat); }
function fp_digits($s) { return preg_replace('/\D/', '', (string) $s); }

/* document Falco → document ERP (les champs ERP du document existant sont conservés) */
function fp_doc($x, $old, $inbound) {
    $type = (string) ($x['type'] ?? '');
    $d = array_merge($old ?: [], [
        'source' => 'falco', 'falcoId' => (string) ($x['id'] ?? ''),
        'number' => (string) ($x['number'] ?? ''), 'date' => substr((string) ($x['invoice_date'] ?? ''), 0, 10), 'dueDate' => substr((string) ($x['invoice_due_date'] ?? ''), 0, 10),
        'currency' => (string) ($x['currency'] ?? 'EUR') ?: 'EUR', 'amount' => round(abs((float) ($x['amount'] ?? 0)), 2),
        'credit' => (bool) preg_match('/credit/i', $type) || (float) ($x['amount'] ?? 0) < 0,
        'supplierName' => (string) ($x['supplier_name'] ?? ''), 'supplierVat' => fa_vat($x['supplier_vat_number'] ?? ''), 'supplierCompanyNo' => (string) ($x['supplier_company_number'] ?? ''),
        'paymentStatus' => (string) ($x['payment_status'] ?? ''), 'peppolStatus' => (string) ($x['peppol_send_status'] ?? ''),
        'files' => array_values(array_map(fn($f) => ['id' => (string) ($f['id'] ?? ''), 'type' => (string) ($f['type'] ?? ''), 'name' => (string) ($f['file_name'] ?? ''), 'size' => (int) ($f['size_bytes'] ?? 0)], (array) ($x['files'] ?? []))),
        'createdAt' => (string) ($x['created_at'] ?? ''), 'updatedAt' => (string) ($x['updated_at'] ?? ''),
    ]);
    $k = fp_key($d['number'], $d['supplierVat']);
    if (isset($inbound[$k])) $d = array_merge($d, $inbound[$k]);
    return $d;
}
/* PDF joint dans une facture UBL (AdditionalDocumentReference / EmbeddedDocumentBinaryObject) */
function fp_ubl_pdf($xml) {
    if (!preg_match_all('/<(?:\w+:)?EmbeddedDocumentBinaryObject\b([^>]*)>([^<]+)</', $xml, $m, PREG_SET_ORDER)) return null;
    foreach ($m as $x) { $bin = base64_decode(preg_replace('/\s+/', '', $x[2]), true); if ($bin !== false && substr($bin, 0, 4) === '%PDF') return $bin; }
    return null;
}
function fp_same($a, $b) { foreach (FP_KEYS as $k) if (($a[$k] ?? null) != ($b[$k] ?? null)) return false; return true; }

/* Peppol entrant : chaque facture reçue devient une facture d'achat « pi-<id> » (Falco ne la range pas toujours
   dans Documents → Purchases). Si Falco a aussi un document d'achat correspondant (même n° et même TVA), on garde
   celui-ci (« fa-… ») et on y reporte les infos Peppol. Statuts relus sur 6 mois toutes les 6 h. */
function fp_in_fields($r) {
    $ps = str_replace('-', '_', (string) ($r['payment_status'] ?? ''));
    return [
        'inboundId' => (string) ($r['id'] ?? ''), 'paymentRef' => (string) ($r['payment_reference'] ?? ''),
        'supplierIban' => strtoupper(preg_replace('/\s/', '', (string) ($r['bank_account_number'] ?? ''))), 'receivedAt' => (string) ($r['received_at'] ?? ''),
        'number' => (string) ($r['invoice_reference'] ?? $r['number'] ?? ''), 'date' => substr((string) ($r['invoice_date'] ?? ''), 0, 10),
        'dueDate' => substr((string) ($r['invoice_due_date'] ?? ''), 0, 10), 'currency' => (string) ($r['currency'] ?? 'EUR') ?: 'EUR',
        'amount' => round(abs((float) ($r['amount'] ?? 0)), 2), 'credit' => !empty($r['is_credit_note']) || (float) ($r['amount'] ?? 0) < 0,
        'supplierName' => (string) ($r['sender_name'] ?? ''), 'supplierVat' => fa_vat($r['sender_vat_number'] ?? ''),
        'paymentStatus' => $ps, 'fileName' => (string) ($r['original_file_name'] ?? ''),
    ];
}
function fp_inbound_pull(&$st, &$existing, &$res, $full) {
    $map = [];
    $after = ($st['inAfterV2'] ?? '') === '' ? '' : ($full ? date('Y-m-d', time() - 183 * 86400) : $st['inAfterV2']);
    $page = 0; $max = $st['inAfterV2'] ?? '';
    $byKey = []; foreach ($existing as $id => $d) if (str_starts_with($id, 'fa-')) $byKey[fp_key($d['number'] ?? '', $d['supplierVat'] ?? '')] = $id;
    do {
        $q = ['page' => $page, 'page_size' => 200, 'sort_by' => 'received_at', 'sort_direction' => 'asc'];
        if ($after !== '') $q['received_after'] = date('Y-m-d', strtotime($after) - 86400);
        $rows = fp_list('/v1/peppol/inbound', $q);
        foreach ($rows as $r) {
            $f = fp_in_fields($r); if ($f['inboundId'] === '') continue;
            $k = fp_key($f['number'], $f['supplierVat']);
            $map[$k] = array_intersect_key($f, array_flip(['inboundId', 'paymentRef', 'supplierIban', 'receivedAt']));
            if (($f['receivedAt']) > $max) $max = $f['receivedAt'];
            $pid = 'pi-' . preg_replace('/[^A-Za-z0-9_-]/', '', $f['inboundId']);
            if (isset($byKey[$k])) {                       // déjà connu comme document d'achat Falco
                $fid = $byKey[$k]; $d = array_merge($existing[$fid], $map[$k]);
                if (!fp_same($existing[$fid], $d)) { write_doc('purchases', $fid, $d, 'falco'); $existing[$fid] = $d; $res['updated']++; }
                if (isset($existing[$pid])) { write_doc('purchases', $pid, $existing[$pid], 'falco', 1); unset($existing[$pid]); }
                continue;
            }
            $old = $existing[$pid] ?? null;
            if ($old && !empty($old['paymentLocal'])) unset($f['paymentStatus']);   // statut changé dans l'ERP : on le garde
            $d = array_merge($old ?: [], $f, ['source' => 'falco', 'peppol' => true]);
            if ($old && fp_same($old, $d)) continue;
            write_doc('purchases', $pid, $d, 'falco'); $existing[$pid] = $d;
            $old ? $res['updated']++ : $res['created']++;
        }
        $page++;
    } while (count($rows) >= 200 && $page < 25);
    $st['inAfterV2'] = $max;
    $prev = json_decode(fak('fp_inbound', '{}'), true) ?: [];
    kv_set('fp_inbound', json_encode(array_merge($prev, $map), JSON_UNESCAPED_UNICODE));
    return array_merge($prev, $map);
}

function fp_run($force = false) {
    $t0 = microtime(true);
    $st = json_decode(fak('fp_state', '{}'), true) ?: [];
    $res = ['created' => 0, 'updated' => 0, 'more' => false, 'peppol' => true];
    $inbound = json_decode(fak('fp_inbound', '{}'), true) ?: [];
    $existing = od_coll_docs('purchases');
    $put = function ($x) use (&$existing, &$res, $inbound) {
        $id = 'fa-' . preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($x['id'] ?? ''));
        if ($id === 'fa-') return;
        $old = $existing[$id] ?? null;
        $d = fp_doc($x, $old, $inbound);
        if ($old && fp_same($old, $d)) return;
        write_doc('purchases', $id, $d, 'falco'); $existing[$id] = $d;
        $old ? $res['updated']++ : $res['created']++;
    };
    // 1. nouveaux documents (par date de création, à partir du dernier vu ; premier passage : tout l'historique)
    $after = $st['after'] ?? ''; $page = (int) ($st['page'] ?? 0); $max = $st['max'] ?? $after;
    while (true) {
        if (microtime(true) - $t0 > FP_BUDGET) { $res['more'] = true; $st['page'] = $page; $st['max'] = $max; break; }
        $q = ['page' => $page, 'page_size' => 100, 'sort_by' => 'created_at', 'sort_direction' => 'asc'];
        if ($after !== '') $q['created_after'] = date('Y-m-d', strtotime($after) - 86400);
        $rows = fp_list('/v1/documents/purchases', $q);
        foreach ($rows as $x) { $put($x); if (($x['created_at'] ?? '') > $max) $max = (string) $x['created_at']; }
        if (count($rows) < 100) { $st['after'] = $max; $st['page'] = 0; unset($st['max']); break; }
        $page++;
    }
    // 2. relecture des 6 derniers mois : statuts de paiement, fichiers, suppressions éventuelles
    if (!$res['more'] && ($force || now_ms() - (int) ($st['refreshAt'] ?? 0) > FP_REFRESH * 1000)) {
        $page = 0;
        do {
            if (microtime(true) - $t0 > FP_BUDGET) { $res['more'] = true; break; }
            $rows = fp_list('/v1/documents/purchases', ['page' => $page, 'page_size' => 100, 'date_from' => date('Y-m-d', time() - 183 * 86400), 'sort_by' => 'invoice_date', 'sort_direction' => 'desc']);
            foreach ($rows as $x) $put($x);
            $page++;
        } while (count($rows) >= 100 && $page < 30);
        if (!$res['more']) $st['refreshAt'] = now_ms();
    }
    // 3. factures reçues via Peppol (nouvelles ; relecture des statuts sur 6 mois toutes les 6 h)
    if (!$res['more']) {
        $full = $force || now_ms() - (int) ($st['inRefreshAt'] ?? 0) > FP_REFRESH * 1000;
        try { $inbound = fp_inbound_pull($st, $existing, $res, $full); if ($full) $st['inRefreshAt'] = now_ms(); }
        catch (Throwable $e) { $res['peppol'] = false; $res['peppolError'] = $e->getMessage(); }
    }
    // 4. infos Peppol arrivées après le document
    foreach ($existing as $id => $d) {
        if (($d['source'] ?? '') !== 'falco' || !empty($d['inboundId']) || !str_starts_with($id, 'fa-')) continue;
        $k = fp_key($d['number'] ?? '', $d['supplierVat'] ?? '');
        if (isset($inbound[$k])) { $d = array_merge($d, $inbound[$k]); write_doc('purchases', $id, $d, 'falco'); $res['updated']++; }
    }
    kv_set('fp_state', json_encode($st));
    return $res;
}

function fp_status() {
    return ['configured' => fa_configured(), 'lastOk' => (int) fak('fp_ok', '0') ?: null, 'error' => fak('fp_error') ?: null, 'peppolError' => fak('fp_peppol_error') ?: null,
        'importing' => !empty((json_decode(fak('fp_state', '{}'), true) ?: [])['page']),
        'diag' => json_decode(fak('fp_diag', '{}'), true) ?: null, 'count' => count(od_coll_docs('purchases'))];
}

function purchases_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'achats') return;
    auth_tables();
    if (!is_office($role)) fail(403, 'Réservé au bureau et aux administrateurs');
    $act = $parts[1] ?? '';
    if ($act === 'status' && $method === 'GET') out(fp_status());
    if (!fa_configured()) fail(400, 'Connectez d\'abord Falco dans Paramètres.');
    $b = $method === 'POST' ? body_json() : [];
    if ($act === 'sync' && $method === 'POST') {
        $t = now_ms(); $force = !empty($b['force']);
        $last = (int) fak('fp_at', '0');
        $more = !empty((json_decode(fak('fp_state', '{}'), true) ?: [])['page']);
        if (($t - $last < ($force || $more ? 60000 : FP_EVERY * 1000)) || $t - (int) fak('fp_lock', '0') < 90000) out(['ok' => true, 'skipped' => true]);
        kv_set('fp_lock', (string) $t); kv_set('fp_at', (string) $t);
        try {
            db()->beginTransaction(); $r = fp_run($force); db()->commit();
            kv_set('fp_ok', (string) now_ms()); kv_set('fp_error', ''); kv_set('fp_peppol_error', $r['peppolError'] ?? '');
            $resp = ['ok' => true] + $r;
        } catch (Throwable $e) {
            if (db()->inTransaction()) db()->rollBack();
            $m = $e->getMessage();
            if (in_array($e->getCode(), [401, 403], true)) $m .= ' — la clé API Falco doit avoir l\'autorisation « documents:purchases:read ».';
            kv_set('fp_error', $m); $resp = ['ok' => false, 'error' => $m];
        }
        kv_set('fp_lock', '0');   // avant out() : exit() ne passe pas par les blocs finally
        out($resp);
    }
    $id = (string) ($b['id'] ?? '');
    $old = $id !== '' ? get_doc('purchases', $id) : null;
    $d = ($old && !$old['deleted']) ? (json_decode($old['data'], true) ?: []) : null;
    if (!$d || ($d['source'] ?? '') !== 'falco') fail(404, 'Facture d\'achat introuvable');
    if ($act === 'pdf' && $method === 'POST') {
        $dir = cfg('upload_dir');
        if (!empty($d['pdfFileId']) && is_file("$dir/{$d['pdfFileId']}")) out(['ok' => true, 'fileId' => $d['pdfFileId']]);
        try {
            if (!empty($d['falcoId'])) {
                $fid = 'main';
                foreach ($d['files'] ?? [] as $f) if (($f['type'] ?? '') === 'pdf') { $fid = $f['id'] ?: 'main'; break; }
                [$bin, $ct] = fp_raw('/v1/documents/purchases/' . rawurlencode($d['falcoId']) . '/download/' . rawurlencode($fid));
            } elseif (!empty($d['inboundId'])) {
                [$bin, $ct] = fp_raw('/v1/peppol/inbound/' . rawurlencode($d['inboundId']) . '/download');
            } else fail(404, 'Aucun fichier pour cette facture');
        } catch (Throwable $e) { fail(502, $e->getMessage()); }
        if (substr($bin, 0, 4) !== '%PDF' && ($pdfIn = fp_ubl_pdf($bin)) !== null) $bin = $pdfIn;   // UBL Peppol : PDF joint par le fournisseur
        $pdf = substr($bin, 0, 4) === '%PDF';
        if (!$pdf && stripos(substr($bin, 0, 400), '<') !== false) $ct = 'application/xml';
        if (!is_dir($dir)) mkdir($dir, 0750, true);
        $file = bin2hex(random_bytes(16));
        file_put_contents("$dir/$file", $bin);
        $name = preg_replace('/[^A-Za-z0-9._ -]/', '_', trim(($d['supplierName'] ?? '') . ' ' . ($d['number'] ?? ''))) . ($pdf ? '.pdf' : ($ct === 'application/xml' ? '.xml' : ''));
        db()->prepare('INSERT INTO ways_files (id, name, mime, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')->execute([$file, $name ?: 'facture', $pdf ? 'application/pdf' : ($ct ?: 'application/octet-stream'), strlen($bin), now_ms(), 'Falco']);
        $d['pdfFileId'] = $file; write_doc('purchases', $id, $d, 'falco');
        out(['ok' => true, 'fileId' => $file, 'pdf' => $pdf]);
    }
    if ($act === 'paid' && $method === 'POST') {
        $s = (string) ($b['status'] ?? '');
        if (!in_array($s, ['not_paid', 'partially_paid', 'paid'], true)) fail(400, 'Statut invalide');
        if (empty($d['falcoId'])) {   // facture Peppol sans document d'achat Falco : statut suivi dans l'ERP
            $d['paymentStatus'] = $s; $d['paymentLocal'] = true; write_doc('purchases', $id, $d, $who['label']);
            out(['ok' => true, 'paymentStatus' => $s, 'local' => true]);
        }
        try { $r = fa_request('PUT', '/v1/documents/purchases/' . rawurlencode($d['falcoId']) . '/payment-status', ['payment_status' => $s]); }
        catch (Throwable $e) { fail(502, $e->getMessage() . (in_array($e->getCode(), [401, 403], true) ? ' — autorisation nécessaire : « documents:purchases:update-payment-status ».' : '')); }
        $d['paymentStatus'] = (string) ($r['payment_status'] ?? $s); write_doc('purchases', $id, $d, $who['label']);
        out(['ok' => true, 'paymentStatus' => $d['paymentStatus']]);
    }
    if ($act === 'response' && $method === 'POST') {
        $code = (string) ($b['code'] ?? '');
        if (!in_array($code, ['accepted', 'rejected', 'under_query', 'paid'], true)) fail(400, 'Réponse invalide');
        if (empty($d['inboundId'])) fail(400, 'Cette facture n\'est pas arrivée par Peppol : répondez au fournisseur par email.');
        $reason = mb_substr(trim((string) ($b['reason'] ?? '')), 0, 500);
        if (in_array($code, ['rejected', 'under_query'], true) && $reason === '') fail(400, 'Indiquez la raison pour le fournisseur.');
        $body = ['response_code' => $code];
        if ($reason !== '') $body['status'] = [['status_reason_code' => $code === 'rejected' ? 'OTH' : 'NOA', 'status_reason' => $reason]];
        try { fa_request('POST', '/v1/peppol/inbound/' . rawurlencode($d['inboundId']) . '/response', $body); }
        catch (Throwable $e) {
            if (stripos($e->getMessage(), 'sequence') !== false) {
                // règle Peppol OP-BR111 : les statuts avancent AB → IP → UQ → CA → RE → AP → PD ; après AP seul PD est permis, RE et PD sont finaux
                $lbl = ['accepted' => 'accepter', 'rejected' => 'refuser', 'under_query' => 'poser une question', 'paid' => 'signaler le paiement'][$code];
                fail(409, "Impossible de $lbl cette facture : une réponse plus avancée a déjà été envoyée au fournisseur (par Falco ou votre comptable, par exemple « acceptée »). Sur Peppol, une réponse ne peut pas revenir en arrière ; après une acceptation, seule la réponse « payée » est encore possible. Pour changer d'avis, contactez le fournisseur directement.");
            }
            if (stripos($e->getMessage(), 'AccessPointNotFound') !== false) {
                // le fournisseur reçoit ses factures via Peppol mais n'est pas inscrit pour recevoir les réponses (Invoice Response)
                $d['peppolNoResponse'] = gmdate('c'); write_doc('purchases', $id, $d, $who['label']);
                fail(409, "Le fournisseur " . ($d['supplierName'] ?? '') . " ne peut pas recevoir de réponse par Peppol : son fournisseur Peppol n'est pas inscrit pour ce type de message (« AccessPointNotFound »). La facture elle-même est bien reçue. Rien n'a été envoyé : si une réponse est nécessaire (refus, question), contactez-le par e-mail ou par téléphone. Une acceptation ou un paiement n'a pas besoin d'être signalé.");
            }
            fail(502, $e->getMessage() . (in_array($e->getCode(), [401, 403], true) ? ' — autorisation nécessaire : « peppol:inbound:write ».' : ''));
        }
        $d['response'] = ['code' => $code, 'reason' => $reason, 'at' => gmdate('c'), 'by' => preg_replace('/^(user|token):/', '', (string) ($who['label'] ?? ''))];
        write_doc('purchases', $id, $d, $who['label']);
        out(['ok' => true, 'response' => $d['response']]);
    }
    fail(404, 'Route inconnue');
}
