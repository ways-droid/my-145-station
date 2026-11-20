<?php
// Notion : écrit le handover d'un shift dans Notion, au format du handover approuvé (les 5 sections, chacune
// avec sa base de données intégrée). L'outil n'écrit QUE sous la page parente choisie dans Paramètres
// (au départ la page de test « TLV - ACTIVITY TEST ») et ne modifie jamais une page qu'il n'a pas créée lui-même.
// Le jeton d'intégration Notion est gardé dans ways_kv et n'est jamais renvoyé au navigateur.
//
//   GET  notion/status           { configured, parent, hint }
//   POST notion/config           { token?, parent? }   (administrateurs ; parent = lien ou identifiant de page)
//   POST notion/test             {}                    (administrateurs) → { ok, title } : titre de la page parente
//   POST notion/push             { ho, crew:[staffId], checks:[libellé] } → { ok, url, replaced }
//
// Renvoyer un shift remplace la page qu'il a déjà : l'ancienne page (créée par l'outil, sous la même page parente)
// part à la corbeille de Notion, d'où elle peut être restaurée.

const NOTION_API = 'https://api.notion.com/v1/';
const NOTION_VERSION = '2022-06-28';

function notion_token() { return (string) (kv_get('notion_token') ?? ''); }
function notion_parent() { return (string) (kv_get('notion_parent') ?? ''); }
function notion_base() { $b = (string) (kv_get('notion_base') ?? ''); return $b !== '' ? rtrim($b, '/') . '/' : NOTION_API; }   // faux Notion des tests
function notion_id($s) {   // identifiant de page depuis un lien Notion ou un identifiant (avec ou sans tirets)
    $s = strtolower(trim((string) $s));
    if (preg_match('/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})(?:[?#].*)?$/', $s, $m)) return str_replace('-', '', $m[1]);
    return '';
}
function notion_http($method, $path, $body = null) {
    for ($try = 0; ; $try++) {
        $ch = curl_init(notion_base() . $path);
        $h = ['Accept: application/json', 'Notion-Version: ' . NOTION_VERSION, 'Authorization: Bearer ' . notion_token()];
        if ($body !== null) { $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); }
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $h, CURLOPT_HEADER => true]);
        $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $hs = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE); $err = curl_error($ch); curl_close($ch);
        if ($res === false) throw new RuntimeException("Notion injoignable : $err");
        $head = substr($res, 0, $hs); $d = json_decode(substr($res, $hs), true);
        if ($st === 429 && $try < 3) { $w = preg_match('/^retry-after:\s*(\d+)/mi', $head, $m) ? (int) $m[1] : 1; sleep(max(1, min(3, $w))); continue; }
        if ($st === 401) throw new RuntimeException('Notion : jeton refusé (vérifiez le jeton d\'intégration dans Paramètres).');
        if ($st === 404 || $st === 403) throw new RuntimeException('Notion : page introuvable ou non partagée avec l\'intégration (dans Notion : ••• › Connexions › ajouter l\'intégration sur la page de test).');
        if ($st === 429) throw new RuntimeException('Notion : trop de demandes, réessayez dans un instant.');
        if ($st >= 400 || !is_array($d)) throw new RuntimeException('Notion : ' . (is_array($d) ? (string) ($d['message'] ?? "erreur HTTP $st") : "erreur HTTP $st"));
        return $d;
    }
}

/* ---- briques Notion ---- */
function nt_txt($s) {   // texte riche (Notion : 2000 caractères au plus par morceau)
    $s = (string) $s; if ($s === '') return [];
    $out = []; foreach (mb_str_split($s, 1900) as $p) $out[] = ['type' => 'text', 'text' => ['content' => $p]];
    return array_slice($out, 0, 50);
}
function nt_title($s) { return ['title' => nt_txt($s)]; }
function nt_rt($s) { return ['rich_text' => nt_txt($s)]; }
function nt_ms(array $names) { $o = []; foreach (array_unique(array_filter(array_map(fn($n) => str_replace(',', ' ', trim((string) $n)), $names))) as $n) $o[] = ['name' => mb_substr($n, 0, 100)]; return ['multi_select' => $o]; }
function nt_block($type, $text) { return ['object' => 'block', 'type' => $type, $type => ['rich_text' => nt_txt($text)]]; }
function nt_db($pageId, $title, array $props) {
    return notion_http('POST', 'databases', ['parent' => ['type' => 'page_id', 'page_id' => $pageId], 'is_inline' => true, 'title' => nt_txt($title), 'properties' => $props]);
}
function nt_row($dbId, array $props) { return notion_http('POST', 'pages', ['parent' => ['database_id' => $dbId], 'properties' => $props]); }
function nt_append($pageId, array $blocks) { if ($blocks) notion_http('PATCH', "blocks/$pageId/children", ['children' => array_slice($blocks, 0, 100)]); }

/* heure de la station (fuseau des paramètres) */
function nt_when($iso, $tz) {
    if (!$iso) return '';
    try { $d = new DateTime((string) $iso); if ($tz) $d->setTimezone(new DateTimeZone($tz)); return $d->format('d/m/Y H:i') . ($tz ? ' LT' : 'Z'); } catch (Throwable $e) { return (string) $iso; }
}

/* écrit la page du handover sous la page parente ; renvoie [url, pageId] */
function notion_write_handover($hoId, array $h, array $items, array $crew, array $checks, array $set) {
    $parent = notion_parent(); if ($parent === '') throw new RuntimeException('Notion : aucune page parente choisie dans Paramètres.');
    $staff = coll_docs('staff'); $nm = fn($id) => (string) ($staff[$id]['name'] ?? '');
    $stn = (string) ($set['stationCode'] ?? ''); $tz = (string) ($set['timeZone'] ?? '') ?: (['TLV' => 'Asia/Jerusalem', 'LGG' => 'Europe/Brussels', 'BRU' => 'Europe/Brussels', 'MLA' => 'Europe/Malta'][strtoupper($stn ?: 'TLV')] ?? '');
    $date = (string) ($h['date'] ?? substr($hoId, 0, 10)); $sh = (string) ($h['shift'] ?? substr($hoId, 11));
    $dmy = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m) ? "$m[3]/$m[2]/$m[1]" : $date;
    $title = trim("$stn $dmy - " . ($sh === 'night' ? 'Night Shift' : 'Day Shift'));
    $kind = fn($k) => array_values(array_filter($items, fn($x) => ($x['kind'] ?? '') === $k));
    $byOrder = function ($a, $b) { return ((int) ($a['order'] ?? 0) <=> (int) ($b['order'] ?? 0)) ?: strcmp((string) ($a['arr'] ?? ''), (string) ($b['arr'] ?? '')); };

    $fm = $nm($h['foreman'] ?? '');
    $page = notion_http('POST', 'pages', ['parent' => ['type' => 'page_id', 'page_id' => $parent], 'properties' => ['title' => nt_title($title)],
        'children' => [nt_block('paragraph', 'Shift Foreman : ' . ($fm !== '' ? $fm : '—') . ' · écrit par my-145-station (la CRS reste dans AMOS)'),
            ...((string) ($h['summary']['text'] ?? '') !== '' ? [nt_block('paragraph', 'Shift summary : ' . mb_substr((string) $h['summary']['text'], 0, 1900))] : []), nt_block('heading_2', '1. Uncompleted work')]]);
    $pid = str_replace('-', '', (string) ($page['id'] ?? '')); if ($pid === '') throw new RuntimeException('Notion : page non créée.');

    // 1. travail non terminé (tâches + avions marqués « non terminé »)
    $db = nt_db($pid, 'Uncompleted work', ['Work' => ['title' => (object) []], 'A/C REG' => ['rich_text' => (object) []], 'Note' => ['rich_text' => (object) []], 'Done' => ['checkbox' => (object) []]]);
    $todo = $kind('todo'); usort($todo, $byOrder);
    foreach ($todo as $x) nt_row($db['id'], ['Work' => nt_title((string) ($x['text'] ?? '')), 'A/C REG' => nt_rt((string) ($x['reg'] ?? '')), 'Note' => nt_rt((string) ($x['note'] ?? '')), 'Done' => ['checkbox' => !empty($x['done'])]]);
    $visits = $kind('visit'); usort($visits, $byOrder);
    foreach ($visits as $v) if (!empty($v['open'])) nt_row($db['id'], ['Work' => nt_title(trim((string) ($v['planned'] ?? '')) ?: 'Travail non terminé'), 'A/C REG' => nt_rt((string) ($v['reg'] ?? '')), 'Note' => nt_rt((string) ($v['notes'] ?? '')), 'Done' => ['checkbox' => false]]);

    // 2. travail prévu / fait, un avion par ligne
    nt_append($pid, [nt_block('heading_2', '2. Shift Work Planned/Done')]);
    $rt = ['rich_text' => (object) []];
    $db = nt_db($pid, 'Shift Work Planned/Done', ['A/C REG' => ['title' => (object) []], 'A/C TYPE' => $rt, 'ARR UTC' => $rt, 'DEP UTC' => $rt, 'CRS' => ['multi_select' => (object) []], 'MECH' => ['multi_select' => (object) []],
        'MHRS' => $rt, 'LOG PAGE ATL' => $rt, 'Work Planned' => $rt, 'Work Done' => $rt, 'Notes' => $rt, 'CHT Covers' => $rt, 'Files' => ['files' => (object) []], 'Date' => ['date' => (object) []]]);
    foreach ($visits as $v) nt_row($db['id'], ['A/C REG' => nt_title((string) ($v['reg'] ?? '')), 'A/C TYPE' => nt_rt((string) ($v['acType'] ?? '')), 'ARR UTC' => nt_rt((string) ($v['arr'] ?? '')), 'DEP UTC' => nt_rt((string) ($v['dep'] ?? '')),
        'CRS' => nt_ms(array_map($nm, (array) ($v['crs'] ?? []))), 'MECH' => nt_ms(array_map($nm, (array) ($v['mech'] ?? []))), 'MHRS' => nt_rt((string) ($v['mhrs'] ?? '')), 'LOG PAGE ATL' => nt_rt((string) ($v['atl'] ?? '')),
        'Work Planned' => nt_rt((string) ($v['planned'] ?? '')), 'Work Done' => nt_rt((string) ($v['done'] ?? '')), 'Notes' => nt_rt((string) ($v['notes'] ?? '')), 'CHT Covers' => nt_rt((string) ($v['cht'] ?? '')),
        'Date' => ['date' => ['start' => $date]]]);

    // 3. équipement et matériel
    nt_append($pid, [nt_block('heading_2', '3. Equipment & Materials')]);
    $db = nt_db($pid, 'Equipment & Materials', ['Customer/User' => ['title' => (object) []], 'A/C REG' => $rt, 'Equipment / Material' => $rt, 'Qty' => ['number' => (object) []], 'Unit' => $rt, 'Remark' => $rt]);
    $eq = $kind('equip'); usort($eq, $byOrder);
    foreach ($eq as $x) nt_row($db['id'], ['Customer/User' => nt_title((string) ($x['user'] ?? '')), 'A/C REG' => nt_rt((string) ($x['reg'] ?? '')), 'Equipment / Material' => nt_rt((string) ($x['item'] ?? '')),
        'Qty' => ['number' => is_numeric($x['qty'] ?? null) ? +$x['qty'] : null], 'Unit' => nt_rt((string) ($x['unit'] ?? '')), 'Remark' => nt_rt((string) ($x['note'] ?? ''))]);

    // 4. Station Control : deux contrôles par ligne (Name / Done ✅ | Name. / Done ✅.), comme le modèle
    nt_append($pid, [nt_block('heading_2', '4. Station Control')]);
    $db = nt_db($pid, 'Station Control', ['Name' => ['title' => (object) []], 'Done ✅' => ['checkbox' => (object) []], 'Name.' => $rt, 'Done ✅.' => ['checkbox' => (object) []]]);
    $ck = (array) ($h['checks'] ?? []);
    for ($i = 0; $i < count($checks); $i += 2) {
        $a = $checks[$i]; $b = $checks[$i + 1] ?? null;
        nt_row($db['id'], ['Name' => nt_title($a), 'Done ✅' => ['checkbox' => isset($ck[$a])], 'Name.' => nt_rt((string) $b), 'Done ✅.' => ['checkbox' => $b !== null && isset($ck[$b])]]);
    }
    $note = trim((string) ($h['checkNote'] ?? ''));
    $done = []; foreach ($checks as $c) if (isset($ck[$c])) $done[] = "$c : " . ($ck[$c]['by'] ?? '') . ' ' . nt_when($ck[$c]['at'] ?? '', $tz);
    $after = []; if ($note !== '') $after[] = nt_block('paragraph', "Remarque : $note");
    foreach ($done as $d) $after[] = nt_block('bulleted_list_item', $d);

    // 5. manpower et signatures des chefs d'équipe
    $after[] = nt_block('heading_2', '5. Manpower & Foreman signatures');
    $after[] = nt_block('paragraph', 'Handed over by : ' . (!empty($h['out']['at']) ? ($h['out']['by'] ?? '') . ' · ' . nt_when($h['out']['at'], $tz) : '—'));
    $after[] = nt_block('paragraph', 'Taken over by : ' . (!empty($h['in']['at']) ? ($h['in']['by'] ?? '') . ' · ' . nt_when($h['in']['at'], $tz) : '—'));
    nt_append($pid, $after);
    $db = nt_db($pid, 'Manpower', ['Name' => ['title' => (object) []], 'Function' => $rt, 'Type ratings' => $rt]);
    $fnl = ['lead' => 'Station Lead', 'admin' => 'Admin', 'foreman' => 'Shift Foreman', 'engineer' => 'Engineer', 'mechanic' => 'Mechanic', 'storekeeper' => 'Store Keeper', 'helper' => 'Helper'];
    foreach ($crew as $sid) { $p = $staff[$sid] ?? null; if (!$p) continue; $r = []; foreach ((array) ($p['ratings'] ?? []) as $t => $l) if ($l) $r[] = "$t $l";
        nt_row($db['id'], ['Name' => nt_title((string) ($p['name'] ?? '')), 'Function' => nt_rt($fnl[$p['function'] ?? ''] ?? ''), 'Type ratings' => nt_rt(implode(', ', $r))]); }

    return [(string) ($page['url'] ?? ''), $pid];
}

function notion_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'notion') return;
    $act = $parts[1] ?? ''; $b = $method === 'POST' ? body_json() : [];
    if ($act === 'status' && $method === 'GET') { $k = notion_token(); out(['configured' => $k !== '' && notion_parent() !== '', 'token' => $k !== '', 'parent' => notion_parent(), 'hint' => $k !== '' && $role === 'admin' ? '…' . substr($k, -4) : '']); }
    if ($act === 'config' && $method === 'POST') {
        if ($role !== 'admin') fail(403, 'Réservé aux administrateurs');
        if (array_key_exists('token', $b)) {
            $k = trim((string) $b['token']);
            if ($k !== '' && !preg_match('/^[A-Za-z0-9_\-]{20,200}$/', $k)) fail(400, 'Jeton Notion invalide');
            kv_set('notion_token', $k); log_event('settings', 'notion', 'update', $k === '' ? 'Notion déconnecté' : 'Jeton Notion enregistré');
        }
        if (array_key_exists('parent', $b)) {
            $p = trim((string) $b['parent']) === '' ? '' : notion_id($b['parent']);
            if (trim((string) $b['parent']) !== '' && $p === '') fail(400, 'Lien de page Notion invalide');
            kv_set('notion_parent', $p); log_event('settings', 'notion', 'update', 'Page Notion du handover : ' . ($p ?: 'aucune'));
        }
        out(['ok' => true, 'configured' => notion_token() !== '' && notion_parent() !== '', 'parent' => notion_parent()]);
    }
    if (notion_token() === '') fail(400, "Notion n'est pas configuré : ajoutez le jeton d'intégration Notion dans Paramètres.");
    if (notion_parent() === '') fail(400, 'Notion : choisissez la page parente du handover dans Paramètres.');
    try {
        if ($act === 'test' && $method === 'POST') {
            if ($role !== 'admin') fail(403, 'Réservé aux administrateurs');
            $p = notion_http('GET', 'pages/' . notion_parent()); $t = '';
            foreach ((array) ($p['properties'] ?? []) as $prop) if (($prop['type'] ?? '') === 'title') foreach ((array) ($prop['title'] ?? []) as $x) $t .= (string) ($x['plain_text'] ?? $x['text']['content'] ?? '');
            out(['ok' => true, 'title' => $t]);
        }
        if ($act === 'push' && $method === 'POST') {
            $hoId = (string) ($b['ho'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}-(day|night)$/', $hoId)) fail(400, 'Shift invalide');
            $r = get_doc('handovers', $hoId); if (!$r || $r['deleted']) fail(404, 'Ce shift n\'a pas encore de fiche.');
            $h = json_decode($r['data'], true) ?: [];
            $items = array_values(array_filter(coll_docs('shiftItems'), fn($x) => ($x['ho'] ?? '') === $hoId));
            $crew = array_slice(array_values(array_unique(array_map('strval', (array) ($b['crew'] ?? [])))), 0, 80);
            $checks = array_slice(array_values(array_filter(array_map(fn($c) => mb_substr(trim((string) $c), 0, 200), (array) ($b['checks'] ?? [])))), 0, 40);
            $sr = get_doc('settings', 'company'); $set = $sr && !$sr['deleted'] ? (json_decode($sr['data'], true) ?: []) : [];
            // l'ancienne page de ce shift part à la corbeille, seulement si l'outil l'a créée sous la même page parente
            $map = json_decode((string) (kv_get('notion_pages') ?? '{}'), true) ?: []; $replaced = false;
            if (!empty($map[$hoId])) {
                try { $old = notion_http('GET', 'pages/' . $map[$hoId]);
                    if (str_replace('-', '', (string) ($old['parent']['page_id'] ?? '')) === notion_parent() && empty($old['archived'])) { notion_http('PATCH', 'pages/' . $map[$hoId], ['archived' => true]); $replaced = true; }
                } catch (RuntimeException $e) { /* déjà supprimée dans Notion : on recrée simplement */ }
            }
            [$url, $pid] = notion_write_handover($hoId, $h, $items, $crew, $checks, $set);
            $map[$hoId] = $pid; kv_set('notion_pages', json_encode($map));
            $h['notion'] = ['url' => $url, 'at' => gmdate('c'), 'by' => (string) ($GLOBALS['ME_NAME'] ?: $who['label'])];
            write_doc('handovers', $hoId, $h, $who['label']);
            log_event('handovers', $hoId, 'update', 'Handover envoyé vers Notion');
            out(['ok' => true, 'url' => $url, 'replaced' => $replaced]);
        }
    } catch (RuntimeException $e) { fail(502, $e->getMessage()); }
    fail(404, 'Route inconnue');
}
