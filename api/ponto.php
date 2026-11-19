<?php
// Banques via Ponto (Isabel Group) : intégration personnalisée de l'organisation W.A.Y.S.
// API https://api.myponto.com, jeton OAuth2 « client credentials » (identifiant + secret de l'intégration).
// Lecture seule : comptes, soldes, mouvements. Ponto synchronise lui-même les banques 4 fois par jour ;
// l'ERP ne déclenche jamais de synchronisation bancaire (réservé à la présence de l'utilisateur selon Ponto).
//
//  GET  ponto/status      état (administrateur et bureau)
//  POST ponto/sync        relit Ponto si nécessaire (toutes les 30 min ; import initial par lots)
//  POST ponto/config      identifiant + secret (administrateur ; champ vide = inchangé)
//  POST ponto/test        liste des comptes autorisés (administrateur)
//  POST ponto/disconnect  efface la connexion (administrateur) ; les mouvements importés restent
//
// Collections : bankAccounts/<id compte Ponto>, bankTx/po-<id transaction Ponto>.
// Rapprochement : un mouvement entrant est relié à une facture ouverte par la communication structurée,
// sinon par le montant exact + le numéro de facture dans la communication.

const PO_EVERY = 1800;
const PO_BUDGET = 20;
const PO_HISTORY_DAYS = 730;

function pok($k, $def = '') { $v = kv_get($k, $def); return $v === null ? (string) $def : (string) $v; }
function po_configured() { return pok('po_id') !== '' && pok('po_secret') !== ''; }
function po_base() { return rtrim(pok('po_base', 'https://api.myponto.com'), '/'); }

function po_http($method, $url, $headers, $body = null) {
    $ch = curl_init($url);
    $opt = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_HTTPHEADER => $headers];
    if ($body !== null) $opt[CURLOPT_POSTFIELDS] = $body;
    curl_setopt_array($ch, $opt);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) throw new RuntimeException('Ponto ne répond pas (' . $err . ')');
    $data = json_decode((string) $res, true);
    if ($st >= 400 || $st === 0) {
        $msg = '';
        if (is_array($data)) {
            if (!empty($data['errors'][0])) { $e = $data['errors'][0]; $msg = trim(($e['code'] ?? '') . ' ' . ($e['detail'] ?? ($e['title'] ?? ''))); }
            elseif (!empty($data['error'])) $msg = trim($data['error'] . ' ' . ($data['error_description'] ?? ''));
        }
        if ($st === 401 && str_contains($url, '/oauth2/token')) $msg = 'identifiant ou secret refusé' . ($msg ? " — $msg" : '');
        if ($msg === '') $msg = mb_substr(trim(strip_tags((string) $res)), 0, 200);
        throw new RuntimeException("Ponto : $msg (HTTP $st)", $st);
    }
    return $data;
}
function po_token() {
    if (pok('po_token') !== '' && (int) pok('po_token_exp', '0') > time() + 60) return pok('po_token');
    $r = po_http('POST', po_base() . '/oauth2/token', ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json',
        'Authorization: Basic ' . base64_encode(pok('po_id') . ':' . pok('po_secret'))], 'grant_type=client_credentials');
    if (empty($r['access_token'])) throw new RuntimeException('Ponto : jeton non reçu');
    kv_set('po_token', $r['access_token']); kv_set('po_token_exp', (string) (time() + (int) ($r['expires_in'] ?? 1700)));
    return $r['access_token'];
}
function po_get($path) {
    $url = str_starts_with($path, 'http') ? $path : po_base() . $path;
    return po_http('GET', $url, ['Accept: application/json', 'Authorization: Bearer ' . po_token()]);
}

/* ---------- comptes ---------- */
function po_accounts() {
    $out = []; $next = '/accounts?page%5Blimit%5D=100'; $n = 0;
    while ($next && $n++ < 10) { $r = po_get($next); foreach ($r['data'] ?? [] as $a) $out[] = $a; $next = $r['links']['next'] ?? null; }
    return $out;
}
function po_fi_name($a) {
    static $cache = [];
    $id = $a['relationships']['financialInstitution']['data']['id'] ?? '';
    if ($id === '') return '';
    if (!isset($cache[$id])) { try { $cache[$id] = (string) (po_get('/financial-institutions/' . rawurlencode($id))['data']['attributes']['name'] ?? ''); } catch (Throwable $e) { $cache[$id] = ''; } }
    return $cache[$id];
}

/* ---------- rapprochement ---------- */
function po_digits($s) { return preg_replace('/\D/', '', (string) $s); }
// communication structurée des factures de l'ERP (même calcul que ogm() dans sales.js)
function po_ogm_of($number) {
    $d = po_digits($number);
    if ($d === '') return '';
    $base = substr($d, 0, 4) . substr(str_pad(substr($d, 4), 6, '0', STR_PAD_LEFT), -6);
    $chk = (int) $base % 97; if ($chk === 0) $chk = 97;
    return $base . str_pad((string) $chk, 2, '0', STR_PAD_LEFT);
}
// renvoie la liste des factures reliées [{docId, number, amount, how}] ou null
function po_match($tx, $openDocs) {
    if (($tx['amount'] ?? 0) < 0) return po_match_out($tx, $openDocs);
    if (($tx['amount'] ?? 0) <= 0) return null;
    $openDocs = array_filter($openDocs, fn($d) => empty($d['purchase']));
    $amt = round((float) $tx['amount'], 2);
    $rem = (string) ($tx['remittance'] ?? '') . ' ' . (string) ($tx['description'] ?? '');
    $sd = $tx['structured'] ? po_digits($tx['remittance']) : (preg_match('/\+{3}\s*(\d{3})\s*\/\s*(\d{4})\s*\/\s*(\d{5})\s*\+{3}/', $rem, $m) ? $m[1] . $m[2] . $m[3] : '');
    if (strlen($sd) === 12) foreach ($openDocs as $id => $d) if ($d['ogm'] === $sd) return [['docId' => $id, 'number' => $d['number'], 'amount' => min($amt, $d['due']), 'how' => 'communication structurée']];
    // n° de facture cités dans la communication (un ou plusieurs) dont le total = montant reçu
    $cited = [];
    foreach ($openDocs as $id => $d) {
        if ($d['number'] === '') continue;
        if (preg_match('/(?<![A-Za-z0-9\/])' . preg_quote($d['number'], '/') . '(?![A-Za-z0-9\/])/i', $rem)) $cited[$id] = $d;
    }
    if ($cited && abs(array_sum(array_column($cited, 'due')) - $amt) < 0.01) {
        $out = []; foreach ($cited as $id => $d) $out[] = ['docId' => $id, 'number' => $d['number'], 'amount' => $d['due'], 'how' => count($cited) > 1 ? 'n° de factures et total' : 'montant et n° de facture'];
        return $out;
    }
    return null;
}
/* sortie bancaire → facture d'achat (Falco) : communication structurée du fournisseur, ou n° cité + montant */
function po_match_out($tx, $openDocs) {
    $amt = round(-(float) $tx['amount'], 2);
    $rem = (string) ($tx['remittance'] ?? '') . ' ' . (string) ($tx['description'] ?? '');
    $sd = po_digits($rem);
    $pur = array_filter($openDocs, fn($d) => !empty($d['purchase']));
    foreach ($pur as $id => $d) if (strlen($d['ogm']) === 12 && strpos($sd, $d['ogm']) !== false && abs($d['due'] - $amt) < 0.01)
        return [['docId' => $id, 'coll' => 'purchases', 'number' => $d['number'], 'amount' => -$d['due'], 'how' => 'communication structurée']];
    foreach ($pur as $id => $d) {
        if ($d['number'] === '' || abs($d['due'] - $amt) >= 0.01) continue;
        if (preg_match('/(?<![A-Za-z0-9\/])' . preg_quote($d['number'], '/') . '(?![A-Za-z0-9\/])/i', $rem)) return [['docId' => $id, 'coll' => 'purchases', 'number' => $d['number'], 'amount' => -$d['due'], 'how' => 'montant et n° de facture']];
    }
    return null;
}
function po_open_docs() {
    $out = []; $paid = [];   // montant déjà affecté par les mouvements reliés (paiement en plusieurs fois)
    foreach (od_coll_docs('bankTx') as $t) { foreach (($t['matches'] ?? []) as $x) $paid[$x['docId'] ?? ''] = ($paid[$x['docId'] ?? ''] ?? 0) + abs((float) ($x['amount'] ?? 0)); if (!empty($t['match']['docId'])) $paid[$t['match']['docId']] = ($paid[$t['match']['docId']] ?? 0) + abs((float) ($t['match']['amount'] ?? 0)); }
    foreach (od_coll_docs('docs') as $id => $d) {
        if (($d['kind'] ?? '') !== 'facture' || !in_array($d['status'] ?? '', ['envoyee', 'partiel'], true)) continue;
        $due = isset($d['odooTotals']['residual']) ? (float) $d['odooTotals']['residual'] : null;
        if ($due === null) { $t = 0; foreach ($d['lines'] ?? [] as $l) if (!in_array($l['kind'] ?? '', ['section', 'note'], true)) $t += round((float) ($l['qty'] ?? 0) * (float) ($l['price'] ?? 0) * (1 + (float) ($l['vat'] ?? 0) / 100), 2); $due = $t; }
        $og = ($d['source'] ?? '') === 'odoo' ? po_digits($d['payRef'] ?? '') : po_ogm_of($d['number'] ?? '');
        $due = round($due - ($paid[$id] ?? 0), 2); if ($due <= 0.005) continue;
        $out[$id] = ['number' => (string) ($d['number'] ?? ''), 'due' => $due, 'ogm' => $og];
    }
    foreach (od_coll_docs('purchases') as $id => $d) {
        if (!empty($d['credit']) || ($d['paymentStatus'] ?? '') === 'paid') continue;
        $due = round((float) ($d['amount'] ?? 0) - ($paid[$id] ?? 0), 2); if ($due <= 0.005) continue;
        $out[$id] = ['number' => (string) ($d['number'] ?? ''), 'due' => $due, 'ogm' => strlen(po_digits($d['paymentRef'] ?? '')) === 12 ? po_digits($d['paymentRef']) : '', 'purchase' => true];
    }
    return $out;
}

/* ---------- synchronisation ---------- */
function po_run() {
    $t0 = microtime(true);
    $st = json_decode(pok('po_state', '{}'), true) ?: [];
    $stats = ['accounts' => 0, 'transactions' => 0, 'matched' => 0, 'more' => false];
    $accounts = po_accounts();
    $now = gmdate('c');
    db()->beginTransaction();
    foreach ($accounts as $a) {
        $at = $a['attributes'] ?? [];
        $old = get_doc('bankAccounts', $a['id']);
        $prev = ($old && !$old['deleted']) ? (json_decode($old['data'], true) ?: []) : [];
        $doc = array_merge($prev, [
            'iban' => (string) ($at['reference'] ?? ''), 'name' => (string) ($at['description'] ?? ''), 'product' => (string) ($at['product'] ?? ''),
            'holder' => (string) ($at['holderName'] ?? ''), 'currency' => (string) ($at['currency'] ?? 'EUR'), 'bank' => ($prev['bank'] ?? '') ?: po_fi_name($a),
            'balance' => isset($at['currentBalance']) ? (float) $at['currentBalance'] : null, 'available' => isset($at['availableBalance']) ? (float) $at['availableBalance'] : null,
            'balanceAt' => (string) ($at['currentBalanceReferenceDate'] ?? ($at['currentBalanceChangedAt'] ?? '')),
            'syncedAt' => (string) ($a['meta']['synchronizedAt'] ?? ''), 'consentUntil' => (string) ($at['authorizationExpirationExpectedAt'] ?? ''),
            'availability' => (string) ($a['meta']['availability'] ?? ''), 'source' => 'ponto', 'updatedAt' => $now,
        ]);
        write_doc('bankAccounts', $a['id'], $doc, 'ponto'); $stats['accounts']++;
    }
    // comptes retirés de l'intégration dans Ponto : retirés de l'ERP (leurs mouvements sont masqués, pas effacés,
    // et réapparaissent si le compte est de nouveau partagé)
    $keep = array_flip(array_map(fn($a) => $a['id'], $accounts));
    $st0 = json_decode(pok('po_state', '{}'), true) ?: [];
    foreach (array_keys(od_coll_docs('bankAccounts')) as $id) if (!isset($keep[$id])) { write_doc('bankAccounts', $id, [], 'ponto', 1); $stats['removed'] = ($stats['removed'] ?? 0) + 1; }
    db()->commit();
    $open = po_open_docs();
    $cutoff = gmdate('Y-m-d', time() - PO_HISTORY_DAYS * 86400);
    // enregistre une page de mouvements ; renvoie [continuer, dernier lien suivant]
    $page = function ($aid, $iban, $url, $knownNewest, &$stopAt) use (&$open, &$stats, $cutoff) {
        $r = po_get($url);
        db()->beginTransaction();
        $stop = false;
        foreach ($r['data'] ?? [] as $tx) {
            if ($knownNewest !== '' && $tx['id'] === $knownNewest) { $stop = true; break; }
            $x = $tx['attributes'] ?? [];
            $date = substr((string) ($x['valueDate'] ?? ($x['executionDate'] ?? '')), 0, 10);
            if ($date !== '' && $date < $cutoff) { $stop = true; break; }
            if ($stopAt === null) $stopAt = $tx['id'];
            $id = 'po-' . $tx['id'];
            $o = get_doc('bankTx', $id);
            $prev = ($o && !$o['deleted']) ? (json_decode($o['data'], true) ?: []) : [];
            $doc = array_merge($prev, [
                'accountId' => $aid, 'iban' => $iban, 'amount' => (float) ($x['amount'] ?? 0), 'currency' => (string) ($x['currency'] ?? 'EUR'),
                'date' => $date, 'execDate' => substr((string) ($x['executionDate'] ?? ''), 0, 10),
                'counterpart' => (string) ($x['counterpartName'] ?? ''), 'counterpartIban' => (string) ($x['counterpartReference'] ?? ''),
                'remittance' => (string) ($x['remittanceInformation'] ?? ''), 'structured' => ($x['remittanceInformationType'] ?? '') === 'structured',
                'description' => (string) ($x['description'] ?? ''), 'info' => (string) ($x['additionalInformation'] ?? ''), 'source' => 'ponto',
            ]);
            if (empty($prev['match']) && empty($prev['matches']) && empty($prev['matchOff']) && ($m = po_match($doc, $open))) { $doc['matches'] = $m; $stats['matched'] += count($m); foreach ($m as $x) unset($open[$x['docId']]); }
            if ($prev && $prev == $doc) continue;
            if (!$prev && function_exists('pay_hist_note_tx')) pay_hist_note_tx($doc);
            write_doc('bankTx', $id, $doc, 'ponto'); $stats['transactions']++;
        }
        db()->commit();
        return [!$stop, $stop ? null : ($r['links']['next'] ?? null)];
    };
    foreach ($accounts as $a) {
        $aid = $a['id']; $iban = (string) ($a['attributes']['reference'] ?? '');
        $s = ($st[$aid] ?? []) + ['newest' => '', 'cursor' => '', 'done' => false];
        $first = '/accounts/' . rawurlencode($aid) . '/transactions?page%5Blimit%5D=100';
        // 1. nouveaux mouvements, du plus récent jusqu'au dernier déjà connu
        $head = null; $url = $first; $n = 0;
        while ($url && $n++ < 20) {
            [$go, $next] = $page($aid, $iban, $url, $s['newest'], $head);
            if ($s['newest'] === '' && !$s['done'] && $s['cursor'] === '') { $s['cursor'] = $next ?: ''; if (!$next) $s['done'] = true; break; }   // import initial : la suite en 2.
            if (!$go) break;
            $url = $next;
        }
        if ($head !== null) $s['newest'] = $head;
        // 2. import initial de l'historique (2 ans), par lots
        while (!$s['done']) {
            if (microtime(true) - $t0 > PO_BUDGET) { $stats['more'] = true; break; }
            if ($s['cursor'] === '') { $s['done'] = true; break; }
            $dummy = '';
            [$go, $next] = $page($aid, $iban, $s['cursor'], '', $dummy);
            $s['cursor'] = ($go && $next) ? $next : '';
            if ($s['cursor'] === '') $s['done'] = true;
        }
        $st[$aid] = $s;
        if ($stats['more']) break;
    }
    kv_set('po_state', json_encode($st));
    return $stats;
}

function po_sync($force = false) {
    if (!po_configured()) return ['ok' => false, 'configured' => false];
    $t = now_ms();
    if ($t - (int) pok('po_lock', '0') < 90000) return ['ok' => true, 'busy' => true];
    $more = pok('po_more') === '1';
    if (!$force && !$more && $t - (int) pok('po_at', '0') < PO_EVERY * 1000) return ['ok' => true, 'skipped' => true];
    kv_set('po_lock', (string) $t);
    try {
        $r = po_run();
        kv_set('po_more', $r['more'] ? '1' : ''); kv_set('po_at', (string) $t);
        if (!$r['more']) kv_set('po_ok', (string) now_ms());
        kv_set('po_error', '');
        return ['ok' => true] + $r;
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        kv_set('po_at', (string) $t); kv_set('po_error', $e->getMessage() . ' (' . gmdate('c') . ')');
        return ['ok' => false, 'error' => $e->getMessage()];
    } finally { kv_set('po_lock', '0'); }
}

function po_status_out($admin) {
    $s = ['configured' => po_configured(), 'lastOk' => (int) pok('po_ok', '0') ?: null, 'importing' => pok('po_more') === '1' || (po_configured() && !pok('po_ok'))];
    if ($admin) { $s['error'] = pok('po_error') ?: null; $s['clientId'] = pok('po_id') ? substr(pok('po_id'), 0, 8) . '…' : null; }
    return $s;
}

function ponto_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'ponto') return;
    auth_tables();
    $act = $parts[1] ?? '';
    if (!is_office($role)) fail(403, 'Votre rôle ne permet pas cette action.');
    $admin = $role === 'admin';
    if ($act === 'status' && $method === 'GET') out(po_status_out($admin));
    if ($act === 'sync' && $method === 'POST') { $b = body_json(); $r = po_sync($admin && !empty($b['force'])); if (empty($r['skipped']) && empty($r['busy']) && function_exists('pay_refresh_all')) { try { pay_refresh_all(); } catch (Throwable $e) { } } out($r); }
    if (!$admin) fail(403, 'Réservé aux administrateurs');
    if ($act === 'config' && $method === 'POST') {
        $b = body_json();
        if (($v = trim((string) ($b['clientId'] ?? ''))) !== '') { kv_set('po_id', mb_substr($v, 0, 200)); kv_set('po_token', ''); }
        if (($v = trim((string) ($b['secret'] ?? ''))) !== '') { kv_set('po_secret', mb_substr($v, 0, 300)); kv_set('po_token', ''); }
        if (!po_configured()) fail(400, "Indiquez l'identifiant client et le secret de l'intégration Ponto.");
        kv_set('po_at', '0'); kv_set('po_error', '');
        out(['ok' => true, 'status' => po_status_out(true)]);
    }
    if ($act === 'test' && $method === 'POST') {
        if (!po_configured()) fail(400, 'Connexion Ponto incomplète');
        kv_set('po_token', '');
        try { $acc = po_accounts(); } catch (Throwable $e) { fail(502, $e->getMessage()); }
        out(['ok' => true, 'accounts' => array_map(fn($a) => ['iban' => (string) ($a['attributes']['reference'] ?? ''), 'name' => (string) ($a['attributes']['description'] ?? ''),
            'bank' => po_fi_name($a), 'balance' => $a['attributes']['currentBalance'] ?? null, 'currency' => (string) ($a['attributes']['currency'] ?? 'EUR'),
            'consentUntil' => (string) ($a['attributes']['authorizationExpirationExpectedAt'] ?? '')], $acc)]);
    }
    if ($act === 'disconnect' && $method === 'POST') {
        foreach (['po_id', 'po_secret', 'po_token', 'po_token_exp', 'po_error', 'po_ok', 'po_at', 'po_more'] as $k) kv_set($k, '');
        out(['ok' => true]);
    }
    fail(404, 'Route inconnue');
}
