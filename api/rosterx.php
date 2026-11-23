<?php
/* Roster officiel (Excel « TLV Roster OFFICIAL ») lu côté serveur, pour que Sindri mette à jour le roster de l'outil.
   Format : un onglet par année, les mois côte à côte (« January 2026 » au-dessus des jours 1..31), une ligne par personne,
   le nom dans une colonne à gauche des jours. Rien n'est écrit sans le « oui » de la personne (propose → confirm_action).
   Les changements ne sont pas gardés dans la proposition (trop gros) : on relit le fichier à la confirmation et on vérifie
   que le résultat est le même (signature). */

const RX_MONTHS = ['jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6, 'jul' => 7, 'aug' => 8, 'sep' => 9, 'oct' => 10, 'nov' => 11, 'dec' => 12,
    'janv' => 1, 'fév' => 2, 'fev' => 2, 'mars' => 3, 'avr' => 4, 'mai' => 5, 'juin' => 6, 'juil' => 7, 'aoû' => 8, 'aou' => 8, 'déc' => 12];

function rx_col($ref) { $c = 0; foreach (str_split(preg_replace('/\d+/', '', (string) $ref)) as $ch) $c = $c * 26 + (ord($ch) - 64); return $c; }

/* onglets d'un classeur : [[name, hidden, xmlPath]] (dans l'ordre du classeur) */
function rx_sheets(ZipArchive $z) {
    $rels = []; if (($x = $z->getFromName('xl/_rels/workbook.xml.rels')) !== false && ($d = @simplexml_load_string($x)))
        foreach ($d->Relationship as $r) $rels[(string) $r['Id']] = 'xl/' . ltrim(preg_replace('#^/?xl/#', '', (string) $r['Target']), '/');
    $out = []; if (($w = $z->getFromName('xl/workbook.xml')) !== false && ($d = @simplexml_load_string($w))) {
        $i = 0; foreach ($d->sheets->sheet ?? [] as $s) { $i++;
            $rid = (string) ($s->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'] ?? '');
            $out[] = [(string) $s['name'], in_array((string) $s['state'], ['hidden', 'veryHidden'], true), $rels[$rid] ?? "xl/worksheets/sheet$i.xml"]; }
    }
    return $out;
}
function rx_shared(ZipArchive $z) {
    $ss = []; if (($x = $z->getFromName('xl/sharedStrings.xml')) !== false && ($d = @simplexml_load_string($x)))
        foreach ($d->si as $si) $ss[] = trim(implode('', array_map('strval', $si->xpath('.//*[local-name()="t"]') ?: [])));
    return $ss;
}
/* grille d'un onglet : $g[ligne][colonne] = texte (cellules non vides) */
function rx_grid(ZipArchive $z, $path, $ss, $maxRows = 400, &$sty = null) {
    $x = $z->getFromName($path); if ($x === false) return [];
    $d = @simplexml_load_string($x); if (!$d) return [];
    $g = []; $sty = [];
    foreach ($d->sheetData->row ?? [] as $row) {
        $r = (int) $row['r']; if ($r > $maxRows) break;
        foreach ($row->c as $c) {
            $t = (string) $c['t']; $v = (string) $c->v;
            if ($t === 's') $v = $ss[(int) $v] ?? ''; elseif ($t === 'inlineStr') $v = trim(implode('', array_map('strval', $c->xpath('.//*[local-name()="t"]') ?: [])));
            elseif ($t === 'b') $v = $v === '1' ? 'TRUE' : 'FALSE';
            $v = trim(str_replace(["\r", "\n", "\t"], ' ', $v)); if ($v !== '') { $g[$r][rx_col((string) $c['r'])] = $v; if ((string) $c['s'] !== '') $sty[$r][rx_col((string) $c['r'])] = (int) $c['s']; }
        }
    }
    return $g;
}
function rx_month_label($v) {
    if (!preg_match('/^([A-Za-zéûÉ]+)\.?\s*[- ]?\s*(\d{4})$/u', trim($v), $m)) return null;
    $k = mb_strtolower($m[1]); $n = RX_MONTHS[$k] ?? RX_MONTHS[mb_substr($k, 0, 3)] ?? null;
    return $n ? sprintf('%04d-%02d', (int) $m[2], $n) : null;
}
function rx_clean_name($v) {
    $s = preg_replace('/^[A-Z]\s*:\s*/', '', trim($v));
    $s = preg_replace(['/\([^)]*\)/', '/\[[^\]]*\]/'], ' ', $s);
    $s = preg_replace('/\s+-\s.*$/', '', $s);
    $s = preg_replace('/[?!*]+/', ' ', $s);
    $s = trim(preg_replace('/\s+/', ' ', $s));
    while (preg_match('/^(.*\S)\s+([A-Z0-9\/+]{2,}|Only)$/u', $s, $m) && str_contains($m[1], ' ')) $s = $m[1];   // FAA, DL, FAA Only…
    return $s;
}
/* cadres épais du roster : noir = flight mech, bleu = détaché en outstation ; index de style → 'fm' | 'out' */
function rx_duty_styles(ZipArchive $z) {
    $x = $z->getFromName('xl/styles.xml'); if ($x === false) return [];
    $d = @simplexml_load_string($x); if (!$d) return [];
    $kind = function ($e) {
        if (!in_array((string) ($e['style'] ?? ''), ['thick', 'medium'], true)) return null;
        $c = $e->color; if (!$c) return 'fm';
        if ((string) $c['auto'] === '1' || (string) $c['indexed'] === '64' || (string) $c['indexed'] === '8') return 'fm';
        if ((string) $c['indexed'] === '12' || (string) $c['indexed'] === '30') return 'out';
        $rgb = (string) $c['rgb']; if (!preg_match('/^(?:[0-9A-F]{2})?([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i', $rgb, $m)) return null;
        [$r, $g, $b] = [hexdec($m[1]), hexdec($m[2]), hexdec($m[3])];
        if (max($r, $g, $b) < 0x50) return 'fm';
        if ($b >= 0x99 && $r < 0x60 && $b > $g) return 'out';
        return null;
    };
    $bd = []; foreach ($d->borders->border ?? [] as $b) { $t = $kind($b->top); $bo = $kind($b->bottom); $bd[] = ($t && $t === $bo) ? $t : null; }
    $out = []; $i = 0; foreach ($d->cellXfs->xf ?? [] as $xf) { $k = $bd[(int) $xf['borderId']] ?? null; if ($k) $out[$i] = $k; $i++; }
    return $out;
}
/* lit un onglet ; null si ce n'est pas un roster */
function rx_parse_grid($g, $sty = [], $dst = []) {
    $best = 0; $dayRow = 0;
    foreach (array_slice(array_keys($g), 0, 25) as $r) { $n = 0; foreach ($g[$r] as $v) if (preg_match('/^\d{1,2}$/', $v) && (int) $v >= 1 && (int) $v <= 31) $n++; if ($n > $best) { $best = $n; $dayRow = $r; } }
    if ($best < 28) return null;
    $labels = []; for ($r = max(1, $dayRow - 5); $r < $dayRow; $r++) foreach ($g[$r] ?? [] as $c => $v) if (($ym = rx_month_label($v))) $labels[$c] = $ym;
    if (!$labels) return null; ksort($labels);
    $cols = []; $first = PHP_INT_MAX;
    foreach ($g[$dayRow] as $c => $v) {
        if (!preg_match('/^\d{1,2}$/', $v)) continue; $ym = null; foreach ($labels as $lc => $l) if ($lc <= $c) $ym = $l;
        if (!$ym || (int) $v < 1 || (int) $v > cal_days_in_month(CAL_GREGORIAN, (int) substr($ym, 5), (int) substr($ym, 0, 4))) continue;
        $cols[$c] = sprintf('%s-%02d', $ym, (int) $v); $first = min($first, $c);
    }
    if (count($cols) < 28) return null;
    $rows = array_values(array_filter(array_keys($g), fn($r) => $r > $dayRow && $r <= $dayRow + 120));
    $score = []; foreach ($rows as $r) foreach ($g[$r] as $c => $v) if ($c < $first && preg_match('/\p{Ll}.*\s+\S/u', $v)) $score[$c] = ($score[$c] ?? 0) + 1;
    if (!$score) return null; arsort($score); $nc = array_key_first($score);
    $people = []; $seen = false;
    foreach ($rows as $r) {
        $v = $g[$r][$nc] ?? ''; if ($v === '') continue;
        if ($seen && !preg_match('/\p{Ll}/u', $v) && mb_strlen($v) >= 12) break;   // OPERATION / RESOURCES, ENGINEERS ON DUTY…
        $name = rx_clean_name($v);
        if (!preg_match('/\p{Ll}/u', $v) || str_starts_with(ltrim($v), '-') || !str_contains($name, ' ')) continue;
        $seen = true; $days = []; $duty = [];
        foreach ($cols as $c => $d) if (isset($g[$r][$c])) { $days[$d] = $g[$r][$c]; $k = $dst[$sty[$r][$c] ?? -1] ?? null; if ($k) $duty[$d] = $k; }
        $people[] = ['row' => $r, 'raw' => $v, 'name' => $name, 'days' => $days, 'duty' => $duty];
    }
    if (count($people) < 2) return null;
    $months = array_values(array_unique(array_map(fn($d) => substr($d, 0, 7), $cols)));
    return ['months' => $months, 'people' => $people];
}
/* le classeur : l'onglet demandé, sinon le meilleur onglet visible (OFFICIAL, année en cours) */
function rx_parse_file($path, $want = '') {
    if (!class_exists('ZipArchive')) return null;
    $z = new ZipArchive(); if ($z->open($path) !== true) return null;
    $ss = rx_shared($z); $dst = rx_duty_styles($z); $best = null; $bs = -1; $names = [];
    foreach (rx_sheets($z) as [$name, $hidden, $xml]) {
        $names[] = $name . ($hidden ? ' (hidden)' : '');
        if ($want !== '' ? mb_strtolower($name) !== mb_strtolower($want) : $hidden) continue;
        $grid = rx_grid($z, $xml, $ss, 400, $sty); $p = rx_parse_grid($grid, $sty, $dst); if (!$p) continue;
        $s = (stripos($name, 'official') !== false ? 2 : 0) + (in_array(gmdate('Y-m'), $p['months'], true) ? 4 : 0) + (int) substr(end($p['months']), 0, 4) / 10000;
        if ($s > $bs) { $bs = $s; $best = ['sheet' => $name] + $p; }
    }
    $z->close();
    if ($best) $best['sheets'] = $names;
    return $best;
}
/* code de l'Excel → case du roster de l'outil ; null = vide ; false = inconnu (signalé, pas importé) */
function rx_code($v) {
    $u = strtoupper(trim(preg_replace('/\s+/', ' ', $v)));
    if ($u === '') return null;
    if (preg_match('#^D\s*/\s*N\b#', $u)) return ['c' => 'D/N'] + ($u !== 'D/N' ? ['note' => $v] : []);
    if (in_array($u, ['D', 'N', 'T', 'TLV', 'OJT', 'TRNG', 'OFF'], true)) return ['c' => $u];
    if ($u === 'E') return ['c' => 'C', 'start' => '16:00', 'end' => '00:30', 'note' => 'E (evening 16:00-00:30)'];
    if (preg_match('/^(?:T|FLT)\s*\+\s*([DN])$/', $u, $m) || preg_match('/^([DN])\s*\+\s*(?:T|FLT)$/', $u, $m)) return ['c' => $m[1], 'note' => $v];
    if ($u === 'FLT') return ['c' => 'T', 'note' => 'FLT'];
    if (preg_match('/COURSE|TRAINING|\bTRNG\b/', $u)) return ['c' => 'TRNG', 'note' => $v];
    if (preg_match('/^[A-Z]{3}$/', $u) && !in_array($u, ['N/A'], true)) return ['c' => $u];
    return false;
}
function rx_norm($s) { $s = mb_strtolower(trim((string) $s)); $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s); return trim(preg_replace('/[^a-z ]+/', ' ', $t !== false ? $t : $s)); }
function rx_match_staff($name, $staff) {
    $n = rx_norm($name); $tok = array_values(array_filter(explode(' ', $n)));
    foreach ($staff as $id => $p) if (rx_norm($p['name'] ?? '') === $n) return (string) $id;
    $hits = [];
    foreach ($staff as $id => $p) { $pt = array_values(array_filter(explode(' ', rx_norm($p['name'] ?? '')))); if (!$pt || !$tok) continue;
        if ($pt[0] === $tok[0] && end($pt) === end($tok)) $hits[] = (string) $id; }
    return count($hits) === 1 ? $hits[0] : null;
}
/* plan des changements pour [from, to] (AAAA-MM) : par fiche roster/<staffId>_<AAAA-MM>, les jours remplacés */
function rx_plan($parsed, $from, $to) {
    $staff = array_filter(coll_docs('staff'), fn($p) => is_array($p) && ($p['active'] ?? true) !== false);
    $months = array_values(array_filter($parsed['months'], fn($m) => $m >= $from && $m <= $to));
    $docs = []; $people = []; $unmatched = []; $unknown = []; $used = [];
    foreach ($parsed['people'] as $pp) {
        $sid = rx_match_staff($pp['name'], $staff);
        if ($sid === null || isset($used[$sid])) { if (array_filter($pp['days'], fn($v, $d) => in_array(substr($d, 0, 7), $months, true), ARRAY_FILTER_USE_BOTH)) $unmatched[] = $pp['name']; continue; }
        $used[$sid] = 1; $chg = 0; $prev = [];
        foreach ($months as $ym) {
            $old = coll_docs('roster')["{$sid}_$ym"] ?? null; $oldDays = is_array($old['days'] ?? null) ? $old['days'] : [];
            $new = [];
            foreach ($pp['days'] as $d => $v) { if (substr($d, 0, 7) !== $ym) continue;
                $cell = rx_code($v); if ($cell === false) { $unknown[$v] = ($unknown[$v] ?? 0) + 1; continue; } if ($cell === null) continue;
                if (!empty($pp['duty'][$d]) && $cell['c'] !== 'T') $cell['duty'] = $pp['duty'][$d];   // cadre noir / bleu
                $k = (string) (int) substr($d, 8); $o = $oldDays[$k] ?? null;
                if (is_array($o) && ($o['c'] ?? '') === $cell['c'] && !isset($cell['note']) && isset($o['note'])) $cell['note'] = $o['note'];   // remarque du bureau gardée
                $new[$k] = $cell; }
            ksort($new, SORT_NUMERIC);
            $n = 0; foreach (array_unique(array_merge(array_keys($oldDays), array_keys($new))) as $k) if (json_encode($oldDays[$k] ?? null) !== json_encode($new[$k] ?? null)) $n++;
            if (!$n) continue;
            $docs["{$sid}_$ym"] = ['staffId' => $sid, 'month' => $ym, 'days' => (object) $new]; $chg += $n;
            if (count($prev) < 2) $prev[$ym] = rx_runs($new);
        }
        $people[] = ['fileName' => $pp['name'], 'staff' => (string) ($staff[$sid]['name'] ?? $sid), 'staffId' => $sid, 'changedDays' => $chg] + ($prev ? ['preview' => $prev] : []);
    }
    arsort($unknown);
    return ['months' => $months, 'docs' => $docs, 'people' => $people, 'unmatched' => array_values(array_unique($unmatched)), 'unknownCodes' => array_slice($unknown, 0, 20, true),
        'sig' => md5(json_encode($docs))];
}
/* « 1-10 D/N · 11 T · 12 TLV » */
function rx_runs($days) {
    $out = []; $cur = null; $a = $b = 0;
    foreach ($days as $k => $c) { $code = $c['c'] . (($c['c'] === 'C' && !empty($c['start'])) ? " {$c['start']}-{$c['end']}" : '') . (!empty($c['duty']) ? ($c['duty'] === 'fm' ? ' [flight mech]' : ' [outstation]') : '');
        if ($cur === $code && (int) $k === $b + 1) { $b = (int) $k; continue; }
        if ($cur !== null) $out[] = ($a === $b ? $a : "$a-$b") . " $cur"; $cur = $code; $a = $b = (int) $k; }
    if ($cur !== null) $out[] = ($a === $b ? $a : "$a-$b") . " $cur";
    return implode(' · ', $out);
}
function rx_file_path($fid) {
    $fid = preg_replace('/[^a-f0-9]/', '', (string) $fid);
    $st = db()->prepare('SELECT name FROM ways_files WHERE id = ?'); $st->execute([$fid]); $f = $st->fetch(PDO::FETCH_ASSOC);
    $p = cfg('upload_dir') . "/$fid";
    return $f && is_file($p) ? [$fid, $p, (string) $f['name']] : null;
}
/* résumé pour Sindri quand un Excel déposé est un roster (au lieu de tout le texte du classeur) */
function rx_summary($path, $name, $fid) {
    $p = rx_parse_file($path); if (!$p) return null;
    $staff = array_filter(coll_docs('staff'), fn($x) => is_array($x)); $ok = 0; $no = [];
    foreach ($p['people'] as $pp) if (rx_match_staff($pp['name'], $staff) !== null) $ok++; else $no[] = $pp['name'];
    return "[Fichier joint : $name · fileId $fid] C'est un ROSTER au format « TLV Roster OFFICIAL ». Onglet lu : « {$p['sheet']} » (onglets : " . implode(', ', $p['sheets']) . ").\n"
        . 'Mois : ' . $p['months'][0] . ' à ' . end($p['months']) . '. ' . count($p['people']) . " personnes, dont $ok reconnues dans Personnel"
        . ($no ? ' ; pas dans Personnel : ' . implode(', ', array_slice($no, 0, 30)) : '') . ".\n"
        . "Pour mettre à jour le roster de l'outil, utilise propose_roster_import (fileId $fid, from/to = mois AAAA-MM ; par défaut du mois en cours à la fin du fichier). L'outil lit et compare lui-même : ne recopie pas le classeur.";
}

/* ---- outils de Sindri ---- */
function rx_pending_add($who, $item) {
    $tok = bin2hex(random_bytes(4));
    $pend = array_values(array_filter(ai_confirm_list($who), fn($p) => time() - $p['at'] < AI_CONFIRM_TTL));
    $pend[] = ['token' => $tok, 'q' => (int) ($GLOBALS['AI_Q'] ?? 0), 'at' => time(), 'shown' => false] + $item;
    kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_slice($pend, -10), JSON_UNESCAPED_UNICODE));
    return $tok;
}
const RX_ASK = "Rien n'est changé : le roster ne se modifie qu'en mode édition. Montre le résumé (par personne : nom, jours changés, aperçu), signale les personnes absentes de Personnel et les codes inconnus, puis demande à la personne : « Puis-je activer le mode édition du roster pour appliquer ces changements ? Réponds oui. » Après son « oui », confirm_action avec le token.";
function rx_propose_import($who, $role, $in) {
    if (!in_array('roster', ai_colls($role), true)) return ['error' => 'Roster non modifiable par l\'assistant pour ce profil.'];
    $f = rx_file_path($in['fileId'] ?? ''); if (!$f) return ['error' => 'fileId inconnu : utilise celui indiqué dans « Fichier joint ».'];
    $p = rx_parse_file($f[1], trim((string) ($in['sheet'] ?? ''))); if (!$p) return ['error' => "Ce fichier (ou cet onglet) n'a pas le format du roster : mois en en-tête, jours 1..31, une ligne par personne."];
    $from = preg_match('/^\d{4}-\d{2}$/', (string) ($in['from'] ?? '')) ? $in['from'] : max($p['months'][0], gmdate('Y-m'));
    $to = preg_match('/^\d{4}-\d{2}$/', (string) ($in['to'] ?? '')) ? $in['to'] : end($p['months']);
    $plan = rx_plan($p, $from, $to);
    if (!$plan['months']) return ['error' => "Aucun mois du fichier entre $from et $to. Mois du fichier : " . $p['months'][0] . ' à ' . end($p['months'])];
    $base = ['sheet' => $p['sheet'], 'months' => $plan['months'][0] . ' → ' . end($plan['months']), 'people' => $plan['people'], 'notInStaff' => $plan['unmatched'], 'unknownCodesNotImported' => $plan['unknownCodes'],
        'codes' => 'thick black frame → flight mech duty, thick blue frame → outstation duty · D/N!!, D/N? → D/N (remark kept) · E → C 16:00-00:30 · T+D / D+T → D (remark) · FLT → T · 3-letter airport → detached at that station · empty cell → day cleared'];
    if (!$plan['docs']) return ['ok' => true, 'noChange' => true] + $base + ['todo' => "Le roster de l'outil est déjà identique au fichier pour ces mois : dis-le simplement."];
    $tok = rx_pending_add($who, ['kind' => 'roster', 'coll' => 'roster', 'id' => '', 'fileId' => $f[0], 'sheet' => $p['sheet'], 'from' => $from, 'to' => $to, 'sig' => $plan['sig'],
        'label' => 'Roster ' . $plan['months'][0] . ' → ' . end($plan['months'])]);
    return ['ok' => true, 'token' => $tok, 'rosterMonthsChanged' => count($plan['docs'])] + $base + ['todo' => RX_ASK];
}
/* petits changements demandés dans le chat : [{staffId, date, code, start, end, note}] (code vide = jour effacé) */
function rx_propose_changes($who, $role, $in) {
    if (!in_array('roster', ai_colls($role), true)) return ['error' => 'Roster non modifiable par l\'assistant pour ce profil.'];
    $staff = coll_docs('staff'); $ch = []; $err = [];
    foreach (array_slice((array) ($in['changes'] ?? []), 0, 400) as $x) {
        $sid = (string) ($x['staffId'] ?? ''); $d = (string) ($x['date'] ?? ''); $to = (string) ($x['to'] ?? '') ?: $d;
        if (!isset($staff[$sid])) { $err[] = "staffId inconnu : $sid"; continue; }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to) || $to < $d) { $err[] = "date invalide : $d"; continue; }
        $c = strtoupper(trim((string) ($x['code'] ?? '')));
        if ($c !== '' && !in_array($c, ['D', 'N', 'D/N', 'C', 'T', 'TLV', 'OJT', 'TRNG', 'OFF'], true) && !preg_match('/^[A-Z]{3}$/', $c)) { $err[] = "code inconnu : $c"; continue; }
        $cell = $c === '' ? null : ['c' => $c] + ($c === 'C' ? ['start' => (string) ($x['start'] ?? '06:00'), 'end' => (string) ($x['end'] ?? '18:00')] : []) + (trim((string) ($x['note'] ?? '')) !== '' ? ['note' => mb_substr(trim((string) $x['note']), 0, 300)] : []);
        if ($cell && in_array((string) ($x['duty'] ?? ''), ['fm', 'out'], true)) $cell['duty'] = (string) $x['duty'];
        for ($t = $d, $i = 0; $t <= $to && $i < 92; $t = gmdate('Y-m-d', strtotime("$t +1 day")), $i++) $ch[] = [$sid, $t, $cell];
    }
    if (!$ch) return ['error' => 'Aucun changement valable.' . ($err ? ' ' . implode(' ; ', $err) : '')];
    $rows = array_map(fn($c) => ['staff' => $staff[$c[0]]['name'] ?? $c[0], 'date' => $c[1], 'new' => $c[2] ? $c[2]['c'] : '(empty)', 'old' => (coll_docs('roster')[$c[0] . '_' . substr($c[1], 0, 7)]['days'][(string) (int) substr($c[1], 8)]['c'] ?? '(empty)')], array_slice($ch, 0, 60));
    $tok = rx_pending_add($who, ['kind' => 'roster', 'coll' => 'roster', 'id' => '', 'changes' => array_slice($ch, 0, 400), 'label' => count($ch) . ' jour(s) de roster']);
    return ['ok' => true, 'token' => $tok, 'days' => count($ch), 'rows' => $rows, 'problems' => $err, 'todo' => RX_ASK];
}
function rx_apply($who, $p, &$actions) {
    $by = ai_by($who); $docs = [];
    if (!empty($p['fileId'])) {
        $f = rx_file_path($p['fileId']); $parsed = $f ? rx_parse_file($f[1], (string) $p['sheet']) : null;
        if (!$parsed) return ['error' => 'Le fichier du roster n\'est plus lisible : redépose-le.'];
        $plan = rx_plan($parsed, $p['from'], $p['to']);
        if ($plan['sig'] !== $p['sig']) return ['error' => "Le roster a changé depuis la proposition : refais propose_roster_import et redemande l'accord."];
        $docs = $plan['docs'];
    } else {
        foreach ((array) ($p['changes'] ?? []) as [$sid, $d, $cell]) { $id = $sid . '_' . substr($d, 0, 7);
            if (!isset($docs[$id])) { $o = coll_docs('roster')[$id] ?? null; $docs[$id] = ['staffId' => $sid, 'month' => substr($d, 0, 7), 'days' => (array) (is_array($o['days'] ?? null) ? $o['days'] : [])]; }
            $k = (string) (int) substr($d, 8); if ($cell) $docs[$id]['days'][$k] = $cell; else unset($docs[$id]['days'][$k]); }
        foreach ($docs as &$x) { ksort($x['days'], SORT_NUMERIC); $x['days'] = (object) $x['days']; } unset($x);
    }
    $n = 0; $errs = [];
    foreach ($docs as $id => $data) {
        $r = get_doc('roster', $id); $old = ($r && !$r['deleted']) ? (json_decode($r['data'], true) ?: []) : null;
        $data = json_decode(json_encode($data), true); if (!$data['days']) $data['days'] = (object) [];
        try { $data = perm_write('bureau', 'roster', 'put', $old, $data, null, $id); } catch (Throwable $e) { $errs[] = "$id : " . $e->getMessage(); continue; }
        db()->beginTransaction(); write_doc('roster', $id, $data, $by); db()->commit(); $n++;
        $actions[] = ['op' => $old ? 'update' : 'create', 'coll' => 'roster', 'id' => $id, 'label' => log_label('roster', $data) ?: $id] + ($old ? ['before' => $old] : []);
    }
    return ['ok' => true, 'rosterMonthsWritten' => $n, 'problems' => $errs, 'note' => "Mode édition de Sindri refermé : les changements sont dans le roster."];
}
