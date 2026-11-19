<?php
// Génération de fichiers CODA (Febelfin, version 2.6) à partir des mouvements bancaires importés via Ponto.
// Un fichier = un compte + une période. Chaque mouvement mis dans un fichier est marqué (bankTx.coda) :
// un même mouvement ne peut pas se retrouver dans deux fichiers, sauf annulation du premier.
//
//  POST coda/preview  {accountId, from, to}           → nombre, totaux, soldes, doublons éventuels
//  POST coda/generate {accountId, from, to}           → crée le fichier + l'entrée d'historique (codaFiles)
//  POST coda/cancel   {id}                            → annule un fichier (ses mouvements redeviennent libres)
// Administrateur et bureau. Le fichier se télécharge via files/<fileId>.

function cd_line($s) {
    // 128 caractères exactement, jeu Latin-1/Windows-1252 (comme les fichiers des banques belges)
    $s = (string) $s;
    if (strlen($s) !== 128) throw new RuntimeException('Ligne CODA de ' . strlen($s) . ' caractères');
    return $s . "\r\n";
}
function cd_txt($v, $len) {   // texte → Windows-1252, majuscules non imposées, rogné et complété d'espaces
    $v = preg_replace('/[\r\n\t]+/', ' ', trim((string) $v));
    $t = @iconv('UTF-8', 'Windows-1252//TRANSLIT', $v);
    if ($t === false) $t = preg_replace('/[^\x20-\x7E]/', '?', $v);
    $t = substr($t, 0, $len);
    return str_pad($t, $len, ' ');
}
function cd_num($v, $len) { return str_pad(substr(preg_replace('/\D/', '', (string) $v), -$len), $len, '0', STR_PAD_LEFT); }
function cd_amt($v) { return str_pad((string) (int) round(abs((float) $v) * 1000), 15, '0', STR_PAD_LEFT); }
function cd_date($ymd) { return $ymd ? substr($ymd, 8, 2) . substr($ymd, 5, 2) . substr($ymd, 2, 2) : '000000'; }
function cd_iban($v) { return strtoupper(preg_replace('/\s+/', '', (string) $v)); }
function cd_acc37($iban, $cur) {
    $i = cd_iban($iban);
    if (str_starts_with($i, 'BE')) return [2, str_pad($i, 31) . '   ' . cd_txt($cur ?: 'EUR', 3)];
    return [3, str_pad(substr($i, 0, 34), 34) . cd_txt($cur ?: 'EUR', 3)];
}
// 3 morceaux de communication libre : 53 (2.1) + 53 (2.2) + 43 (2.3)
function cd_split($t) { $t = cd_txt($t, 149); return [substr($t, 0, 53), substr($t, 53, 53), substr($t, 106, 43)]; }

function cd_selection($accountId, $from, $to) {
    $acc = get_doc('bankAccounts', $accountId);
    if (!$acc || $acc['deleted']) fail(404, 'Compte introuvable');
    $a = json_decode($acc['data'], true) ?: [];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $to) || $from > $to) fail(400, 'Période invalide');
    $tx = []; $after = 0.0;
    foreach (od_coll_docs('bankTx') as $id => $t) {
        if (($t['accountId'] ?? '') !== $accountId) continue;
        $d = (string) ($t['date'] ?? '');
        if ($d >= $from) $after += (float) ($t['amount'] ?? 0);              // tout ce qui suit le début de période
        if ($d >= $from && $d <= $to) $tx[$id] = $t;
    }
    uasort($tx, fn($x, $y) => strcmp($x['date'] ?? '', $y['date'] ?? '') ?: strcmp($x['execDate'] ?? '', $y['execDate'] ?? ''));
    $credit = 0; $debit = 0; foreach ($tx as $t) { if ($t['amount'] >= 0) $credit += $t['amount']; else $debit -= $t['amount']; }
    $balance = (float) ($a['balance'] ?? 0);
    $old = round($balance - $after, 2);
    $new = round($old + $credit - $debit, 2);
    $dup = []; foreach ($tx as $id => $t) if (!empty($t['coda']['fileId'])) $dup[$t['coda']['no'] ?? '?'] = ($dup[$t['coda']['no'] ?? '?'] ?? 0) + 1;
    return [$a, $tx, ['count' => count($tx), 'credit' => round($credit, 2), 'debit' => round($debit, 2), 'oldBalance' => $old, 'newBalance' => $new, 'duplicates' => $dup]];
}

function cd_build($a, $tx, $sum, $from, $to, $seq, $company) {
    $today = gmdate('Y-m-d');
    $kbo = '0' . cd_num(substr(preg_replace('/\D/', '', (string) ($company['vat'] ?? '')), -10), 10);
    [$struct, $acc37] = cd_acc37($a['iban'] ?? '', $a['currency'] ?? 'EUR');
    $s3 = str_pad((string) ($seq % 1000), 3, '0', STR_PAD_LEFT);
    $L = [];
    // 0 — en-tête
    $L[] = '0' . '0000' . cd_date($today) . '000' . '05' . ' ' . str_repeat(' ', 7) . cd_txt('WAYS' . $s3, 10) . cd_txt($company['name'] ?? 'W.A.Y.S. SRL', 26)
         . str_repeat(' ', 11) . $kbo . ' ' . '00000' . str_repeat(' ', 16) . str_repeat(' ', 16) . str_repeat(' ', 7) . '2';
    // 1 — ancien solde
    $oldDate = date('Y-m-d', strtotime($from . ' -1 day'));
    $L[] = '1' . $struct . $s3 . $acc37 . ($sum['oldBalance'] < 0 ? '1' : '0') . cd_amt($sum['oldBalance']) . cd_date($oldDate)
         . cd_txt($a['holder'] ?: ($company['name'] ?? ''), 26) . cd_txt(trim(($a['bank'] ?? '') . ' ' . ($a['name'] ?? '')), 35) . $s3;
    // 2.1 / 2.2 / 2.3 — mouvements
    $n = 0; $records = 1;
    foreach ($tx as $id => $t) {
        $n++; $sn = str_pad((string) ($n % 10000), 4, '0', STR_PAD_LEFT);
        $amt = (float) $t['amount']; $sign = $amt < 0 ? '1' : '0';
        $code = $amt < 0 ? '00101000' : '00150000';   // virement émis / virement reçu
        $rem = (string) ($t['remittance'] ?? ''); $digits = preg_replace('/\D/', '', $rem);
        $free = trim($rem !== '' ? $rem : (($t['description'] ?? '') ?: ($t['info'] ?? '')));
        if (!empty($t['structured']) && strlen($digits) === 12) { $c1 = '1' . '101' . $digits . str_repeat(' ', 38); $c2 = str_repeat(' ', 53); $c3 = str_repeat(' ', 43); }
        else { [$p1, $c2, $c3] = cd_split($free); $c1 = '0' . $p1; }
        $L[] = '21' . $sn . '0000' . cd_txt(substr($id, 3), 21) . $sign . cd_amt($amt) . cd_date($t['date'] ?? '') . $code . $c1
             . cd_date(($t['execDate'] ?? '') ?: ($t['date'] ?? '')) . $s3 . '0' . '1' . ' ' . '0';
        $L[] = '22' . $sn . '0000' . $c2 . str_repeat(' ', 35) . str_repeat(' ', 11) . str_repeat(' ', 3) . ' ' . str_repeat(' ', 4) . str_repeat(' ', 4) . str_repeat(' ', 4) . '1' . ' ' . '0';
        $L[] = '23' . $sn . '0000' . cd_txt(cd_iban($t['counterpartIban'] ?? ''), 37) . cd_txt($t['counterpart'] ?? '', 35) . $c3 . '0' . ' ' . '0';
        $records += 3;
    }
    // 8 — nouveau solde
    $L[] = '8' . $s3 . $acc37 . ($sum['newBalance'] < 0 ? '1' : '0') . cd_amt($sum['newBalance']) . cd_date($to) . str_repeat(' ', 64) . '0';
    $records++;
    // 9 — fin
    $L[] = '9' . str_repeat(' ', 15) . cd_num($records, 6) . cd_amt($sum['debit']) . cd_amt($sum['credit']) . str_repeat(' ', 75) . '2';
    return implode('', array_map('cd_line', $L));
}

function coda_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'coda') return;
    if (!is_office($role)) fail(403, 'Votre rôle ne permet pas cette action.');
    $act = $parts[1] ?? ''; $b = body_json();
    if ($act === 'preview' && $method === 'POST') { [, , $sum] = cd_selection((string) ($b['accountId'] ?? ''), $b['from'] ?? '', $b['to'] ?? ''); out(['ok' => true] + $sum); }
    if ($act === 'generate' && $method === 'POST') {
        $aid = (string) ($b['accountId'] ?? ''); $from = (string) ($b['from'] ?? ''); $to = (string) ($b['to'] ?? '');
        [$a, $tx, $sum] = cd_selection($aid, $from, $to);
        if ($sum['duplicates']) fail(409, 'Certains mouvements de cette période figurent déjà dans un fichier CODA (n° ' . implode(', ', array_keys($sum['duplicates'])) . '). Choisissez une autre période ou annulez d\'abord ce fichier.');
        if (!$tx) fail(400, 'Aucun mouvement sur cette période.');
        $company = od_coll_docs('settings')['company'] ?? [];
        // n° de relevé : suite par compte et par année
        $year = substr($to, 0, 4); $seq = 0;
        foreach (od_coll_docs('codaFiles') as $f) if (($f['accountId'] ?? '') === $aid && ($f['year'] ?? '') === $year) $seq = max($seq, (int) ($f['seq'] ?? 0));
        $seq++;
        $content = cd_build($a, $tx, $sum, $from, $to, $seq, $company);
        $dir = cfg('upload_dir'); if (!is_dir($dir)) mkdir($dir, 0750, true);
        $fid = bin2hex(random_bytes(16));
        $name = 'CODA_' . cd_iban($a['iban'] ?? 'compte') . '_' . $from . '_' . $to . '_' . $year . '-' . str_pad((string) $seq, 3, '0', STR_PAD_LEFT) . '.cod';
        if (file_put_contents("$dir/$fid", $content) === false) fail(500, 'Enregistrement impossible');
        $pdo = db();
        $pdo->beginTransaction();
        $pdo->prepare('INSERT INTO ways_files (id, name, mime, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')->execute([$fid, $name, 'text/plain', strlen($content), now_ms(), auth_who()['label']]);
        $no = $year . '-' . str_pad((string) $seq, 3, '0', STR_PAD_LEFT);
        $id = 'coda-' . substr($fid, 0, 12);
        $doc = ['accountId' => $aid, 'iban' => (string) ($a['iban'] ?? ''), 'bank' => (string) ($a['bank'] ?? ''), 'accountName' => (string) ($a['name'] ?? ''),
            'from' => $from, 'to' => $to, 'year' => $year, 'seq' => $seq, 'no' => $no, 'count' => $sum['count'], 'credit' => $sum['credit'], 'debit' => $sum['debit'],
            'oldBalance' => $sum['oldBalance'], 'newBalance' => $sum['newBalance'], 'fileId' => $fid, 'fileName' => $name,
            'createdAt' => gmdate('c'), 'createdBy' => (string) ($who['user']['name'] ?? 'API'), 'status' => 'generated'];
        write_doc('codaFiles', $id, $doc, auth_who()['label']);
        foreach ($tx as $tid => $t) { $t['coda'] = ['fileId' => $fid, 'id' => $id, 'no' => $no]; write_doc('bankTx', $tid, $t, 'coda'); }
        $pdo->commit();
        out(['ok' => true, 'id' => $id, 'doc' => $doc]);
    }
    if ($act === 'cancel' && $method === 'POST') {
        $id = (string) ($b['id'] ?? '');
        $r = get_doc('codaFiles', $id);
        if (!$r || $r['deleted']) fail(404, 'Fichier introuvable');
        $f = json_decode($r['data'], true) ?: [];
        $pdo = db(); $pdo->beginTransaction();
        foreach (od_coll_docs('bankTx') as $tid => $t) if (($t['coda']['id'] ?? '') === $id) { unset($t['coda']); write_doc('bankTx', $tid, $t, 'coda'); }
        $f['status'] = 'cancelled'; $f['cancelledAt'] = gmdate('c'); $f['cancelledBy'] = (string) ($who['user']['name'] ?? 'API');
        write_doc('codaFiles', $id, $f, auth_who()['label']);
        $pdo->commit();
        out(['ok' => true]);
    }
    fail(404, 'Route inconnue');
}
