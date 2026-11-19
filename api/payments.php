<?php
// Paiement des factures d'achat via Ponto (initiation de paiement, PSD2).
// L'ERP prépare le virement (IBAN, montant, communication pris sur la facture reçue par Falco/Peppol) ;
// il n'est exécuté qu'après la signature du titulaire du compte, dans Ponto / sa banque (authentification forte).
//
// Garde-fous :
//  • session nominative seulement (jamais une clé d'accès, jamais Axel), rôle admin ou bureau, droit « Initier des paiements »
//    accordé par un administrateur, second facteur actif et ressaisi pour chaque paiement ;
//  • montant et IBAN recalculés côté serveur depuis la facture (le navigateur n'envoie que l'identifiant de la facture) ;
//  • IBAN contrôlé : clé de contrôle, déjà payé depuis nos comptes (historique Ponto tenu par le serveur), changement
//    par rapport aux factures précédentes du fournisseur → confirmation explicite exigée ;
//  • plafonds par paiement et par jour (Paramètres, admin avec second facteur) ; un seul paiement en cours par facture ;
//  • e-mail aux administrateurs (et à la personne) à chaque paiement préparé ; interdit dans l'environnement de test.
//
//  GET  pay/check/<purchaseId>   contrôles avant paiement
//  POST pay/create   {id, accountId, code, ibanAck}
//  POST pay/status   {id}        relit le statut chez Ponto (doc payments/<id>)
//  POST pay/cancel   {id}        annule un paiement pas encore signé
//  GET  pay/limits · POST pay/limits {one, day, code} (admin)

const PAY_LIMITS_DEFAULT = ['one' => 10000, 'day' => 25000];
const PAY_ACTIVE = ['unsigned', 'pending', 'accepted-technical-validation', 'accepted-customer-profile', 'accepted-funds-checked', 'accepted-settlement-in-process'];

function pay_limits() { return (json_decode((string) kv_get('pay_limits', ''), true) ?: []) + PAY_LIMITS_DEFAULT; }
function iban_norm($s) { return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $s)); }
function iban_valid($i) {
    if (!preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/', $i)) return false;
    $r = substr($i, 4) . substr($i, 0, 4); $n = '';
    foreach (str_split($r) as $c) $n .= ctype_alpha($c) ? (string) (ord($c) - 55) : $c;
    $m = 0; foreach (str_split($n, 7) as $p) $m = (int) (($m . $p) % 97);
    return $m === 1;
}
function pay_name_key($s) { return trim(preg_replace('/\b(sa|srl|sprl|nv|bv|bvba|sas|sarl|gmbh|ltd|scrl|asbl)\b/', '', preg_replace('/[^a-z0-9 ]/', ' ', norm_name($s)))); }

/* ---------- historique des IBAN payés depuis nos comptes (données Ponto, tenu par le serveur) ---------- */
function pay_iban_hist() {
    $h = kv_get('pay_iban_hist', null);
    if ($h !== null && $h !== '') return json_decode($h, true) ?: [];
    $out = [];   // première utilisation : reprise des sorties déjà importées de Ponto
    foreach (od_coll_docs('bankTx') as $t) if (($t['source'] ?? '') === 'ponto' && (float) ($t['amount'] ?? 0) < 0) pay_iban_hist_add($out, $t['counterpartIban'] ?? '', $t['counterpart'] ?? '', $t['date'] ?? '');
    kv_set('pay_iban_hist', json_encode($out));
    return $out;
}
function pay_iban_hist_add(&$h, $iban, $name, $date) {
    $i = iban_norm($iban); if ($i === '' || !preg_match('/^[A-Z]{2}\d{2}/', $i)) return;
    $e = $h[$i] ?? ['n' => 0, 'names' => [], 'last' => ''];
    $e['n']++; $k = pay_name_key($name); if ($k !== '' && !in_array($k, $e['names'], true) && count($e['names']) < 5) $e['names'][] = $k;
    if ($date > $e['last']) $e['last'] = $date;
    $h[$i] = $e;
    if (count($h) > 400) { uasort($h, fn($a, $b) => strcmp($b['last'], $a['last'])); $h = array_slice($h, 0, 400, true); }   // ways_kv.v : TEXT (64 Ko)
}
// appelé par la synchro Ponto pour chaque nouvelle sortie
function pay_hist_note_tx($doc) {
    if ((float) ($doc['amount'] ?? 0) >= 0) return;
    $h = pay_iban_hist(); pay_iban_hist_add($h, $doc['counterpartIban'] ?? '', $doc['counterpart'] ?? '', $doc['date'] ?? ''); kv_set('pay_iban_hist', json_encode($h));
}

/* ---------- contrôles sur une facture d'achat ---------- */
function pay_due($id, $p) {
    $paid = 0;
    foreach (od_coll_docs('bankTx') as $t) foreach (($t['matches'] ?? []) as $x) if (($x['docId'] ?? '') === $id) $paid += abs((float) ($x['amount'] ?? 0));
    return round((float) ($p['amount'] ?? 0) - $paid, 2);
}
function pay_active_for($pid) {
    foreach (od_coll_docs('payments') as $id => $d) if (($d['purchaseId'] ?? '') === $pid && in_array($d['status'] ?? '', PAY_ACTIVE, true)) return [$id, $d];
    return null;
}
function pay_check($pid) {
    $all = od_coll_docs('purchases'); $p = $all[$pid] ?? null;
    if (!$p) fail(404, 'Facture d\'achat introuvable');
    $issues = []; $block = [];
    if (!po_configured()) $block[] = 'Ponto n\'est pas connecté (Paramètres → Liaison Ponto).';
    if (($p['source'] ?? '') !== 'falco') $block[] = 'Seules les factures reçues par Falco / Peppol peuvent être payées depuis l\'ERP.';
    if (!empty($p['credit'])) $block[] = 'C\'est une note de crédit : rien à payer.';
    if (($p['paymentStatus'] ?? '') === 'paid') $block[] = 'Facture déjà marquée payée.';
    if (strtoupper((string) ($p['currency'] ?? 'EUR')) !== 'EUR') $block[] = 'Seuls les paiements en euros sont pris en charge.';
    $due = pay_due($pid, $p); if ($due <= 0.005) $block[] = 'Plus rien à payer sur cette facture (paiements déjà reliés).';
    $iban = iban_norm($p['supplierIban'] ?? '');
    if ($iban === '') $block[] = 'L\'IBAN du fournisseur n\'est pas dans la facture électronique : payez depuis votre banque.';
    elseif (!iban_valid($iban)) $block[] = 'L\'IBAN de la facture est invalide (clé de contrôle) : contactez le fournisseur.';
    $hist = pay_iban_hist(); $st = 'new'; $other = [];
    $vat = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($p['supplierVat'] ?? ''))); $nk = pay_name_key($p['supplierName'] ?? '');
    foreach ($all as $id => $q) {
        if ($id === $pid || ($q['source'] ?? '') !== 'falco') continue;
        $same = $vat !== '' ? preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($q['supplierVat'] ?? ''))) === $vat : ($nk !== '' && pay_name_key($q['supplierName'] ?? '') === $nk);
        $qi = iban_norm($q['supplierIban'] ?? ''); if ($same && $qi !== '' && $qi !== $iban) $other[$qi] = true;
    }
    if ($iban !== '' && isset($hist[$iban])) $st = 'known';
    elseif ($other) $st = 'changed';
    if ($st === 'known' && $other && !array_filter(array_keys($other), fn($i) => isset($hist[$i]))) { /* ancien IBAN jamais payé : sans importance */ }
    $act = pay_active_for($pid); if ($act) $block[] = 'Un paiement est déjà en cours pour cette facture (à signer ou en traitement).';
    $lim = pay_limits(); if ($due > $lim['one']) $block[] = 'Montant au-dessus du plafond par paiement (' . number_format($lim['one'], 2, ',', ' ') . ' €).';
    $today = 0; foreach (od_coll_docs('payments') as $d) if (substr((string) ($d['at'] ?? ''), 0, 10) === gmdate('Y-m-d') && !in_array($d['status'] ?? '', ['rejected', 'cancelled', 'canceled', 'error'], true)) $today += (float) ($d['amount'] ?? 0);
    if ($today + $due > $lim['day']) $block[] = 'Plafond journalier atteint (' . number_format($lim['day'], 2, ',', ' ') . ' € par jour, déjà ' . number_format($today, 2, ',', ' ') . ' € aujourd\'hui).';
    $ref = preg_replace('/\D/', '', (string) ($p['paymentRef'] ?? ''));
    $structured = strlen($ref) === 12 && (int) substr($ref, 10) === (((int) substr($ref, 0, 10)) % 97 ?: 97);
    $rem = $structured ? $ref : mb_substr(trim(($p['paymentRef'] ?? '') !== '' ? (string) $p['paymentRef'] : 'Facture ' . ($p['number'] ?? '')), 0, 140);
    return ['p' => $p, 'due' => $due, 'iban' => $iban, 'ibanStatus' => $st, 'ibanPaid' => isset($hist[$iban]) ? $hist[$iban]['n'] : 0, 'ibanLast' => $hist[$iban]['last'] ?? '',
        'otherIbans' => array_keys($other), 'block' => $block, 'remittance' => $rem, 'structured' => $structured, 'active' => $act ? $act[0] : null, 'limits' => $lim];
}

/* ---------- appels Ponto ---------- */
function po_send($method, $path, $body = null) {
    return po_http($method, po_base() . $path, ['Accept: application/vnd.api+json', 'Content-Type: application/vnd.api+json', 'Authorization: Bearer ' . po_token()], $body === null ? null : json_encode($body));
}
function pay_return_uri() {
    $host = $_SERVER['HTTP_HOST'] ?? ''; if ($host === '') return '';
    $base = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/');
    return 'https://' . $host . $base . '/index.html#achats';
}
function pay_status_label($s) {
    if ($s === 'unsigned') return 'à signer';
    if ($s === 'accepted-settlement-completed' || $s === 'accepted-with-change') return 'exécuté';
    if (str_starts_with($s, 'accepted') || $s === 'pending') return 'en traitement';
    if ($s === 'rejected') return 'refusé par la banque';
    if ($s === 'cancelled' || $s === 'canceled') return 'annulé';
    return $s;
}
function pay_refresh($id, $d) {
    if (!in_array($d['status'] ?? '', PAY_ACTIVE, true) || empty($d['pontoId'])) return $d;
    try { $r = po_send('GET', '/accounts/' . rawurlencode($d['accountId']) . '/payments/' . rawurlencode($d['pontoId'])); }
    catch (Throwable $e) { if ($e->getCode() === 404) { $d['status'] = 'cancelled'; $d['updatedAt'] = gmdate('c'); write_doc('payments', $id, $d, 'ponto'); } return $d; }
    $s = (string) ($r['data']['attributes']['status'] ?? $d['status']);
    if ($s !== $d['status']) {
        $d['status'] = $s; $d['statusLabel'] = pay_status_label($s); $d['updatedAt'] = gmdate('c');
        if ($s !== 'unsigned' && empty($d['signedAt'])) $d['signedAt'] = gmdate('c');
        if (str_starts_with($s, 'accepted')) { $h = pay_iban_hist(); pay_iban_hist_add($h, $d['iban'], $d['supplier'], gmdate('Y-m-d')); kv_set('pay_iban_hist', json_encode($h)); }
        write_doc('payments', $id, $d, 'ponto');
        if (function_exists('log_event')) log_event('purchases', $d['purchaseId'], 'update', 'Paiement ' . pay_status_label($s) . ' · ' . number_format($d['amount'], 2, ',', ' ') . ' €', null, 'ponto');
    }
    return $d;
}
function pay_refresh_all() {
    foreach (od_coll_docs('payments') as $id => $d) if (in_array($d['status'] ?? '', PAY_ACTIVE, true) && strtotime((string) ($d['at'] ?? '')) > time() - 14 * 86400) { try { pay_refresh($id, $d); } catch (Throwable $e) { } }
}

/* ---------- routes ---------- */
function pay_guard($who, $role) {
    if ($who['kind'] !== 'session') fail(403, 'Les paiements ne peuvent être préparés que par une personne connectée (pas par une clé d\'accès).');
    if (function_exists('sbx_id') && sbx_id()) fail(403, 'Pas de paiement depuis l\'environnement de test.');
    if (!is_office($role)) fail(403, 'Votre rôle ne permet pas de préparer des paiements.');
    if (!can_pay_user(get_user($who['user']['id']))) fail(403, 'Vous n\'avez pas le droit « Initier des paiements » (à demander à un administrateur ; second facteur obligatoire).');
    if (!po_configured()) fail(409, 'Ponto n\'est pas connecté (Paramètres → Banques).');
}
function payments_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'pay') return;
    $act = $parts[1] ?? '';
    if (!is_office($role)) fail(403, 'Votre rôle ne permet pas cette action.');
    if ($act === 'limits' && $method === 'GET') out(pay_limits());
    if ($act === 'limits' && $method === 'POST') {
        if ($role !== 'admin' || $who['kind'] !== 'session') fail(403, 'Réservé à un administrateur connecté.');
        $b = body_json();
        if (tfa_verify_user($who['user']['id'], $b['code'] ?? '', false) !== 'totp') fail(401, 'Code de l\'application incorrect (ou déjà utilisé : attendez le suivant).');
        $l = ['one' => max(0, round((float) ($b['one'] ?? 0), 2)), 'day' => max(0, round((float) ($b['day'] ?? 0), 2))];
        kv_set('pay_limits', json_encode($l));
        sec_alert_admins('Plafonds de paiement modifiés', 'Nouveaux plafonds : ' . number_format($l['one'], 2, ',', ' ') . ' € par paiement, ' . number_format($l['day'], 2, ',', ' ') . ' € par jour (par ' . $who['user']['name'] . ').');
        out(['ok' => true] + $l);
    }
    if ($act === 'check' && $method === 'GET') {
        $c = pay_check(check_id($parts[2] ?? ''));
        $me = $who['kind'] === 'session' ? get_user($who['user']['id']) : null;
        $accounts = []; foreach (od_coll_docs('bankAccounts') as $id => $a) if (($a['source'] ?? '') === 'ponto' && strtoupper($a['currency'] ?? 'EUR') === 'EUR') $accounts[] = ['id' => $id, 'iban' => $a['iban'] ?? '', 'name' => $a['name'] ?? '', 'bank' => $a['bank'] ?? '', 'balance' => $a['balance'] ?? null];
        out(['due' => $c['due'], 'iban' => $c['iban'], 'ibanStatus' => $c['ibanStatus'], 'ibanPaid' => $c['ibanPaid'], 'ibanLast' => $c['ibanLast'], 'otherIbans' => $c['otherIbans'],
            'supplier' => (string) ($c['p']['supplierName'] ?? ''), 'number' => (string) ($c['p']['number'] ?? ''), 'remittance' => $c['remittance'], 'structured' => $c['structured'],
            'block' => $c['block'], 'active' => $c['active'], 'limits' => $c['limits'], 'accounts' => $accounts, 'canPay' => can_pay_user($me), 'tfa' => $me ? tfa_on($me['id']) : false, 'ponto' => po_configured()]);
    }
    if ($act === 'status' && $method === 'POST') {
        $id = check_id((string) (body_json()['id'] ?? '')); $d = od_coll_docs('payments')[$id] ?? null; if (!$d) fail(404, 'Paiement introuvable');
        try { $d = pay_refresh($id, $d); } catch (Throwable $e) { fail(502, $e->getMessage()); }
        out(['ok' => true, 'status' => $d['status'], 'label' => pay_status_label($d['status'])]);
    }
    if ($act === 'cancel' && $method === 'POST') {
        pay_guard($who, $role);
        $id = check_id((string) (body_json()['id'] ?? '')); $d = od_coll_docs('payments')[$id] ?? null; if (!$d) fail(404, 'Paiement introuvable');
        if (($d['status'] ?? '') !== 'unsigned') fail(409, 'Ce paiement est déjà signé : il ne peut plus être annulé depuis l\'ERP (voyez avec votre banque).');
        try { po_send('DELETE', '/accounts/' . rawurlencode($d['accountId']) . '/payments/' . rawurlencode($d['pontoId'])); } catch (Throwable $e) { if ($e->getCode() !== 404) fail(502, $e->getMessage()); }
        $d['status'] = 'cancelled'; $d['statusLabel'] = 'annulé'; $d['updatedAt'] = gmdate('c'); $d['cancelledBy'] = $who['user']['name'];
        write_doc('payments', $id, $d, 'user:' . $who['user']['name']);
        if (function_exists('log_event')) log_event('purchases', $d['purchaseId'], 'update', 'Paiement annulé avant signature', null);
        out(['ok' => true]);
    }
    if ($act === 'create' && $method === 'POST') {
        pay_guard($who, $role);
        $b = body_json(); $u = get_user($who['user']['id']);
        $pid = check_id((string) ($b['id'] ?? ''));
        $c = pay_check($pid);
        if ($c['block']) fail(409, implode(' ', $c['block']));
        if ($c['ibanStatus'] !== 'known' && empty($b['ibanAck'])) fail(409, 'IBAN jamais payé depuis vos comptes : confirmez l\'avoir vérifié auprès du fournisseur.');
        $acc = od_coll_docs('bankAccounts')[(string) ($b['accountId'] ?? '')] ?? null;
        if (!$acc || ($acc['source'] ?? '') !== 'ponto') fail(400, 'Choisissez le compte à débiter.');
        if (tfa_verify_user($u['id'], $b['code'] ?? '', false) !== 'totp') fail(401, 'Code de l\'application incorrect (ou déjà utilisé : attendez le code suivant).');
        $p = $c['p'];
        $attr = ['remittanceInformation' => $c['remittance'], 'remittanceInformationType' => $c['structured'] ? 'structured' : 'unstructured', 'currency' => 'EUR',
            'amount' => $c['due'], 'creditorName' => mb_substr((string) ($p['supplierName'] ?? ''), 0, 70), 'creditorAccountReference' => $c['iban'], 'creditorAccountReferenceType' => 'IBAN',
            'endToEndId' => substr(preg_replace('/[^A-Za-z0-9]/', '', 'WAYS' . ($p['number'] ?? '') . date('His')), 0, 35)];
        $ret = pay_return_uri(); $r = null; $noRedirect = false;
        try { $r = po_send('POST', '/accounts/' . rawurlencode($b['accountId']) . '/payments', ['data' => ['type' => 'payment', 'attributes' => $attr + ($ret ? ['redirectUri' => $ret] : [])]]); }
        catch (Throwable $e) {
            if ($ret && stripos($e->getMessage(), 'redirect') !== false) { $noRedirect = true; try { $r = po_send('POST', '/accounts/' . rawurlencode($b['accountId']) . '/payments', ['data' => ['type' => 'payment', 'attributes' => $attr]]); } catch (Throwable $e2) { fail(502, $e2->getMessage()); } }
            else fail(502, $e->getMessage());
        }
        $pontoId = (string) ($r['data']['id'] ?? ''); if ($pontoId === '') fail(502, 'Ponto n\'a pas renvoyé de paiement.');
        $status = (string) ($r['data']['attributes']['status'] ?? 'unsigned');
        $doc = ['purchaseId' => $pid, 'number' => (string) ($p['number'] ?? ''), 'supplier' => (string) ($p['supplierName'] ?? ''), 'iban' => $c['iban'], 'ibanStatus' => $c['ibanStatus'],
            'amount' => $c['due'], 'currency' => 'EUR', 'remittance' => $c['remittance'], 'structured' => $c['structured'], 'accountId' => (string) $b['accountId'], 'accountIban' => (string) ($acc['iban'] ?? ''),
            'pontoId' => $pontoId, 'status' => $status, 'statusLabel' => pay_status_label($status), 'redirect' => (string) ($r['data']['links']['redirect'] ?? ''), 'by' => $u['name'], 'byId' => $u['id'], 'at' => gmdate('c'), 'source' => 'ponto'];
        $id = 'pay-' . preg_replace('/[^A-Za-z0-9_-]/', '', $pontoId);
        db()->beginTransaction(); write_doc('payments', $id, $doc, 'user:' . $u['name']); db()->commit();
        if (function_exists('log_event')) log_event('purchases', $pid, 'update', 'Paiement préparé · ' . number_format($c['due'], 2, ',', ' ') . ' € vers ' . $c['iban'], null);
        $txt = "Paiement préparé dans l'ERP par {$u['name']} — à signer dans Ponto / la banque :\n\n"
            . "Fournisseur : " . ($p['supplierName'] ?? '') . "\nFacture : " . ($p['number'] ?? '') . "\nMontant : " . number_format($c['due'], 2, ',', ' ') . " €\n"
            . "IBAN bénéficiaire : {$c['iban']}" . ($c['ibanStatus'] === 'known' ? " (déjà payé {$c['ibanPaid']} fois)" : ($c['ibanStatus'] === 'changed' ? ' ⚠ IBAN DIFFÉRENT des factures précédentes de ce fournisseur' : ' ⚠ IBAN JAMAIS PAYÉ jusqu\'ici')) . "\n"
            . "Compte débité : " . ($acc['iban'] ?? '') . "\nCommunication : {$c['remittance']}\n\nSi ce paiement n'est pas attendu, ne le signez pas et annulez-le dans l'ERP ou dans Ponto.";
        sec_alert_admins('Paiement à signer · ' . number_format($c['due'], 2, ',', ' ') . ' € · ' . ($p['supplierName'] ?? ''), $txt);
        if (!in_array($u['email'], sec_admin_emails(), true)) { try { send_mail($u['email'], 'ERP W.A.Y.S. · Paiement préparé', $txt); } catch (Throwable $e) { } }
        out(['ok' => true, 'id' => $id, 'status' => $status, 'redirect' => $doc['redirect'], 'noRedirect' => $noRedirect]);
    }
    fail(404, 'Route inconnue');
}
