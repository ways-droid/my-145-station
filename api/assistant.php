<?php
// Assistant IA (Claude, API Anthropic) — bureau et administrateurs uniquement, en lecture seule.
// Il consulte les données de l'outil avec des outils (recherche, fiche, totaux) et prépare des textes
// (emails, résumés…) ; il ne crée ni ne modifie rien. La clé API reste sur le serveur (ways_kv).
//
//  GET  assistant/status                         configuré ?, modèle, plafond, consommation du mois
//  POST assistant/config {key,model,cap}         administrateurs
//  POST assistant/test                           administrateurs
//  POST assistant/chat {messages}                → {messages, text, more?} ; le navigateur renvoie messages tels quels
//
// Boucle d'outils limitée dans le temps : si elle n'est pas finie, la réponse contient more:true et le navigateur
// rappelle avec les messages reçus (la conversation reste dans le navigateur, rien n'est conservé sur le serveur).

const AI_MODELS = [
    'claude-sonnet-5-5' => ['Claude Sonnet 5.5 (recommandé)', 2.0, 10.0],
    'claude-haiku-5-5'  => ['Claude Haiku 5.5 (économique)', 0.10, 0.50],
    'claude-opus-5-5'   => ['Claude Opus 5.5 (le plus capable)', 4.0, 20.0],
];
const AI_VDOC_TYPES = ['assurance' => 'Assurance', 'ct' => 'Contrôle technique', 'immat' => "Certificat d'immatriculation", 'coc' => 'Certificat de conformité',
    'badge' => 'Badge aéroport', 'leasing' => 'Contrat de leasing / location', 'autre' => 'Autre document'];
require_once __DIR__ . '/rosterx.php';
const AI_FILE_MAX = 15 * 1048576;
const AI_DEFAULT_MODEL = 'claude-sonnet-5-5';
const AI_BUDGET = 40;          // secondes de travail par appel avant de rendre la main au navigateur
const AI_MAX_STEPS = 30;       // tours d'outils par question (sur l'ensemble des reprises)
const AI_HIDDEN = ['settings', 'userPrefs'];
const AI_NAME = 'Sindri';
// collections que Sindri peut écrire (droits d'un employé Bureau, vérifiés par perm_write comme pour une personne)
const AI_WRITABLE = ['staff', 'roster', 'handovers', 'shiftItems', 'chargeLines', 'partMoves', 'needs', 'situations', 'expiries', 'forms', 'contacts', 'instructions', 'travel', 'hotels', 'aircraft', 'actypes', 'clients', 'products', 'vehicles', 'vehEvents', 'faults', 'driverLogs', 'tires', 'tools', 'labs', 'adminDocs', 'adminFolders', 'notes', 'links'];
const AI_MAX_WRITES = 25;   // jamais exposées telles quelles à l'assistant
const AI_LABELS = [
    'staff' => "personnel de la station (name, function, employer, email, phone, licences [{cat, number, expires}], typeRatings [{t: type (code de la base actypes), m: modèle ou vide = tous, e: moteur ou vide = tous, lic: E+I (E EASA, I approbation israélienne, F FAA), crs: true si autorisation compagnie de signer}] — approvals [{code, label, types: [] = tous les types}] = approvals généraux — ratings est recalculé, ne l'écris pas, docs [{type, number, expires}] = visas, permis de travail, badges, examens…)",
    'roster' => "roster de la station, un document par personne et par mois (id <staffId>_<AAAA-MM>, staffId, month, days {jour du mois: {c = code, start, end, note}}). Codes : D jour 08-20, N nuit 20-08, D/N jour ou nuit à affecter, C horaire libre (start-end), T jour de voyage, TLV à la station sans shift, OJT/TRNG formation, OFF repos, code de 3 lettres d'une autre station = détaché / flight mech ; duty = cadre fm (flight mech, noir) ou out (outstation, bleu) ; fiches des déplacements dans travel (kind duty : legs, hotels, taxis, out/back)",
    'handovers' => 'fiches de shift (id <date>-day|night : foreman, extra, checks Station Control, out/in = remise et reprise du shift)',
    'shiftItems' => 'lignes des shifts (ho = id du shift ; kind visit = avion : reg, acType, arr, dep UTC, crs, mech = staffIds, tasks = Tech Log [{text défaut/tâche, action, logPage, wo, techs [{id, h}], mhrs} ; sp = tâche spéciale non maintenance (ex. COMAT offload) : text + spDone ; chaque tâche que tu écris est marquée « encodée par Sindri – à vérifier » : une personne doit la valider avant la remise du shift, tu ne peux pas la valider toi-même], planned, done, mhrs = textes recalculés depuis tasks, atl = LogBook n° arrivée, open ; kind todo = travail non terminé ; kind equip = matériel : user, item, qty)',
    'travel' => 'voyages du personnel (kind flight|hotel, staffId, status booked|cancel ; vol : date, from, to, airline, flightNo, dep, arr, pnr ; hôtel : hotelId, checkIn, checkOut, room, conf ; cost, currency)',
    'aircraft' => 'avions servis par la station (reg = immatriculation, clientId = compagnie, acType, variant = modèle, engines = moteur, modeS = code Mode S hex (choisis dans actypes), licRule = conditions pour signer, arbre {op: "and"|"or", items: [code | sous-arbre]} avec les codes des catégories de settings.condCats (par défaut E, I, F sur le Type Rating ; B1, B2, A, C sur la licence), licences = codes « Type Rating » de licRule, amosRef, active, notes) — la maintenance et la navigabilité restent dans AMOS',
    'actypes' => "types d'appareils, base en arbre (maker = fabricant, code ex. B747, name, models [{name ex. -400, engines [..]}])",
    'hotels' => 'hôtels du personnel (name, address, contact, phone, email, rate, currency)',
    'partMoves' => 'mouvements de pièces de la station (dir in|out, kind, status prep|sent|received|cancel, aog, pn, desc, serial, qty, cond, cert, certNo, amosRef, from, to, reg, carrier, awb, eta) ; le stock reste dans AMOS',
    'needs' => 'Station Needs, besoins de la station (title, cat tooling|consumable|equipment|it|ppe|office|other, qty, unit, prio low|normal|urgent|aog, reason, by = staffId demandeur, neededBy, toolId, supplier, ref, cost, currency, status asked|approved|ordered|received|refused, history [{at, by, status, note}]) ; approuver/refuser/commander = Station Lead ou bureau',
    'situations' => "situations anormales à ramener à la normale (kind toolLoan|toolBorrow|equipment|facility|vehicle|staff|other, title, toolId, party = à qui / de qui, contact, by = staffId, since, dueBack, status open|closed, showInShift = affichée dans la page Shift, history [{at, by, text}], closedAt, closeNote)",
    'expiries' => 'échéances de la station hors personnel, outillage et véhicules (title, cat approval|airport|insurance|gse|safety|contract|training|other, expires, ref, issuer, owner = staffId responsable du renouvellement, notes)',
    'contacts' => 'contacts de la station (cat emergency|company|airport|authority|customers|suppliers|other, org, role, name, phone, phone2, email, hours, notes, order) ; id "form" = en-tête du formulaire (kind form, no, rev, revDate, approval, title)',
    'forms' => 'formulaires approuvés par l\'autorité (no = n° du formulaire, title, rev, revDate, cat moe|maint|quality|hr|tools|stores|station|other, approval, url = lien OneDrive, file, notes = quand l\'utiliser, active)',
    'instructions' => 'consignes du Station Lead (title, body, fns = fonctions visées, vide = tout le monde, important, due, at, by, archived, acks {staffId: {at, name}} = signatures « lu et compris » ; ne jamais signer à la place de quelqu\'un)',
    'chargeLines' => 'lignes de Charge Sheet (date, company, reg, rotation, type, workType, description, qty, unit, price, currency, reviewed, invoiced) ; montant = qty × price',
    'clients' => 'clients (compagnies aériennes servies par la station : name, code court, icao = code compagnie OACI ex. CHG, iata = code IATA ex. 5C (FIDS), fidsAll = tous ses vols au FIDS, regPrefixes…)', 'products' => 'articles et prix (tarifs des Charge Sheets)',
    'vehicles' => 'véhicules', 'vehEvents' => 'entretiens et événements véhicules', 'faults' => 'pannes signalées sur les véhicules', 'driverLogs' => 'prises en charge de véhicules', 'tires' => 'pneus',
    'tools' => 'outillage de la station (étalonnage)', 'labs' => "laboratoires d'étalonnage", 'adminDocs' => 'documents administratifs', 'adminFolders' => 'dossiers administratifs',
    'links' => 'liens utiles',
    'notes' => "notes (title, body, labels, color, team = note d'équipe sinon note personnelle de la personne qui te parle, links = liens vers des fiches {coll, id, label}, files = pièces jointes)",
];

function aik($k, $d = '') { $v = kv_get($k); return $v === null ? $d : $v; }
function ai_model() { $m = aik('ai_model', AI_DEFAULT_MODEL); return isset(AI_MODELS[$m]) ? $m : AI_DEFAULT_MODEL; }
function ai_base() { return rtrim(aik('ai_base', 'https://api.anthropic.com'), '/'); }
function ai_usage() { return json_decode(aik('ai_usage_' . gmdate('Y-m'), '{}'), true) ?: ['in' => 0, 'out' => 0, 'usd' => 0, 'q' => 0]; }
function ai_cap() { $c = (float) aik('ai_cap', '30'); return $c > 0 ? $c : 30.0; }

function ai_request($body) {
    $ch = curl_init(ai_base() . '/v1/messages');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_TIMEOUT => 90, CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-api-key: ' . aik('ai_key'), 'anthropic-version: 2023-06-01']]);
    $res = curl_exec($ch); $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) throw new RuntimeException("Assistant injoignable : $err");
    $d = json_decode($res, true);
    if ($st >= 400 || !is_array($d)) {
        $m = is_array($d) ? (string) ($d['error']['message'] ?? '') : '';
        $hint = $st === 401 ? ' — vérifiez la clé API dans Paramètres.' : ($st === 429 ? ' — trop de demandes, réessayez dans un instant.' : ($st === 529 || $st === 503 ? ' — service momentanément surchargé, réessayez.' : ''));
        throw new RuntimeException("Assistant : " . ($m ?: "erreur HTTP $st") . $hint, $st);
    }
    $u = $d['usage'] ?? [];
    [, $pin, $pout] = AI_MODELS[ai_model()];
    $in = (int) ($u['input_tokens'] ?? 0) + (int) ($u['cache_creation_input_tokens'] ?? 0) * 1.25 + (int) ($u['cache_read_input_tokens'] ?? 0) * 0.1;
    $out = (int) ($u['output_tokens'] ?? 0);
    $us = ai_usage();
    $us['in'] += (int) $in; $us['out'] += $out; $us['usd'] = round($us['usd'] + $in / 1e6 * $pin + $out / 1e6 * $pout, 4);
    kv_set('ai_usage_' . gmdate('Y-m'), json_encode($us));
    return $d;
}

/* ---------- données exposées à l'assistant (vue du rôle, champs utiles, valeurs calculées) ---------- */
function ai_colls($role) {
    $out = [];
    foreach (array_keys(AI_LABELS) as $c) {
        if (in_array($c, AI_HIDDEN, true) || !in_array($c, collections(), true)) continue;
        if ($role === 'terrain' && in_array($c, TERRAIN_HIDDEN, true)) continue;
        $out[] = $c;
    }
    return $out;
}
function ai_ctx() {
    static $c = null; if ($c !== null) return $c;
    $c = ['clients' => [], 'vehicles' => []];
    foreach (coll_docs('clients') as $id => $d) $c['clients'][$id] = (string) ($d['name'] ?? '');
    foreach (coll_docs('vehicles') as $id => $d) $c['vehicles'][$id] = trim(($d['plate'] ?? '') . ' ' . ($d['model'] ?? ''));
    return $c;
}
/* enregistrement allégé + champs calculés (noms liés) */
function ai_record($coll, $id, $d, $full = false) {
    $c = ai_ctx();
    $nf = $coll === 'notes' ? array_map(fn($f) => ['fileId' => $f['id'] ?? '', 'name' => $f['name'] ?? ''], (array) ($d['files'] ?? [])) : null;
    unset($d['_rev'], $d['pdfFileId'], $d['files'], $d['raw']);
    if ($nf) $d['files'] = $nf;   // pièces jointes d'une note : noms et fileId (pas le contenu)
    $r = ['id' => $id] + $d;
    if (!empty($d['clientId'])) $r['clientName'] = $c['clients'][$d['clientId']] ?? null;
    if (!empty($d['vehicleId'])) $r['vehicle'] = $c['vehicles'][$d['vehicleId']] ?? null;
    $j = json_encode($r, JSON_UNESCAPED_UNICODE);
    if (!$full && strlen($j) > 2500) { foreach ($r as $k => $v) if (is_array($v) && strlen(json_encode($v)) > 600) $r[$k] = '(…)'; }
    return $r;
}
function ai_rows($role, $coll) {
    if (!in_array($coll, ai_colls($role), true)) throw new RuntimeException("Collection inconnue ou non autorisée : $coll");
    $rows = [];
    foreach (coll_docs($coll) as $id => $d) { $v = perm_view($role, $coll, $d, (string) $id); if ($v !== null) $rows[$id] = $v; }
    return $rows;
}
function ai_date($d) { foreach (['date', 'start', 'at', 'receivedAt', 'dueDate', 'createdAt'] as $k) if (!empty($d[$k]) && is_string($d[$k])) return substr($d[$k], 0, 10); return ''; }
function ai_filter($role, $in) {
    $coll = (string) ($in['collection'] ?? '');
    $rows = ai_rows($role, $coll);
    $q = mb_strtolower(trim((string) ($in['query'] ?? '')));
    $words = $q === '' ? [] : preg_split('/\s+/u', $q);
    $from = (string) ($in['date_from'] ?? ''); $to = (string) ($in['date_to'] ?? '');
    $eq = (array) ($in['where'] ?? []);
    $out = [];
    foreach ($rows as $id => $d) {
        $dt = ai_date($d);
        if ($from !== '' && ($dt === '' || $dt < $from)) continue;
        if ($to !== '' && ($dt === '' || $dt > $to)) continue;
        $ok = true;
        foreach ($eq as $k => $v) { $x = $d[$k] ?? null; if (is_bool($v) ? (bool) $x !== $v : (string) $x !== (string) $v) { $ok = false; break; } }
        if (!$ok) continue;
        if ($words) {
            $hay = mb_strtolower(json_encode(ai_record($coll, $id, $d), JSON_UNESCAPED_UNICODE));
            foreach ($words as $w) if (mb_strpos($hay, $w) === false) { $ok = false; break; }
            if (!$ok) continue;
        }
        $out[$id] = $d;
    }
    uasort($out, fn($a, $b) => strcmp(ai_date($b), ai_date($a)));
    return [$coll, $out];
}
function ai_num($coll, $id, $d, $field) {
    $v = $d; foreach (explode('.', $field) as $p) { if (!is_array($v) || !array_key_exists($p, $v)) return 0; $v = $v[$p]; }
    return is_numeric($v) ? (float) $v : 0;
}

function ai_tool($role, $name, $in) {
    switch ($name) {
        case 'search_records': {
            [$coll, $rows] = ai_filter($role, $in);
            $lim = max(1, min(60, (int) ($in['limit'] ?? 25)));
            $list = []; foreach (array_slice($rows, 0, $lim, true) as $id => $d) $list[] = ai_record($coll, $id, $d);
            return ['collection' => $coll, 'total_matches' => count($rows), 'returned' => count($list), 'records' => $list];
        }
        case 'get_record': {
            $coll = (string) ($in['collection'] ?? '');
            $rows = ai_rows($role, $coll); $id = (string) ($in['id'] ?? '');
            if (!isset($rows[$id])) return ['error' => 'Introuvable'];
            return ai_record($coll, $id, $rows[$id], true);
        }
        case 'aggregate': {
            [$coll, $rows] = ai_filter($role, $in);
            $sum = (string) ($in['sum_field'] ?? ''); $by = (string) ($in['group_by'] ?? '');
            $g = [];
            foreach ($rows as $id => $d) {
                $r = ai_record($coll, $id, $d);
                $key = $by === '' ? 'total' : ($by === 'month' ? substr(ai_date($d), 0, 7) : ($by === 'year' ? substr(ai_date($d), 0, 4) : (is_scalar($r[$by] ?? null) ? (string) $r[$by] : '(vide)')));
                $g[$key] = $g[$key] ?? ['count' => 0, 'sum' => 0];
                $g[$key]['count']++;
                if ($sum !== '') $g[$key]['sum'] = round($g[$key]['sum'] + ai_num($coll, $id, $d, $sum), 2);
            }
            if ($by !== '') uasort($g, fn($a, $b) => $sum !== '' ? abs($b['sum']) <=> abs($a['sum']) : $b['count'] <=> $a['count']);
            if ($sum === '') foreach ($g as &$x) unset($x['sum']); unset($x);
            return ['collection' => $coll, 'matches' => count($rows), 'groups' => array_slice($g, 0, 80, true)];
        }
    }
    return ['error' => "Outil inconnu : $name"];
}

function ai_tools($role) {
    $colls = ai_colls($role);
    $filters = [
        'collection' => ['type' => 'string', 'enum' => $colls],
        'query' => ['type' => 'string', 'description' => 'Mots à retrouver (tous) dans la fiche, y compris les noms de client et de véhicule. Vide = tout.'],
        'date_from' => ['type' => 'string', 'description' => 'AAAA-MM-JJ inclus (date principale de la fiche)'],
        'date_to' => ['type' => 'string', 'description' => 'AAAA-MM-JJ inclus'],
        'where' => ['type' => 'object', 'description' => 'Égalités exactes sur des champs, ex. {"status":"in_service"}'],
    ];
    return [
        ['name' => 'search_records', 'description' => "Cherche des fiches de l'outil, les plus récentes d'abord. Renvoie aussi le nombre total de correspondances.",
         'input_schema' => ['type' => 'object', 'properties' => $filters + ['limit' => ['type' => 'integer', 'description' => 'max 60, défaut 25']], 'required' => ['collection']]],
        ['name' => 'get_record', 'description' => "Fiche complète (toutes les lignes, tous les champs).",
         'input_schema' => ['type' => 'object', 'properties' => ['collection' => ['type' => 'string', 'enum' => $colls], 'id' => ['type' => 'string']], 'required' => ['collection', 'id']]],
        ['name' => 'create_record', 'description' => "Crée une fiche dans l'outil (droits d'un employé Bureau). Regarde d'abord une fiche existante de la même collection avec get_record pour reprendre exactement sa structure (noms de champs, identifiants liés comme clientId ou vehicleId). Roster : une fiche par personne et par mois, l'identifiant <staffId>_<AAAA-MM> est donné automatiquement à partir de staffId et month ; si elle existe déjà, utilise update_record.",
         'input_schema' => ['type' => 'object', 'properties' => ['collection' => ['type' => 'string', 'enum' => array_values(array_intersect(AI_WRITABLE, $colls))], 'data' => ['type' => 'object']], 'required' => ['collection', 'data']]],
        ['name' => 'update_record', 'description' => "Modifie une fiche : seuls les champs donnés dans changes sont remplacés (valeur null = champ retiré). Pour un tableau (lignes, documents…), renvoie le tableau complet.",
         'input_schema' => ['type' => 'object', 'properties' => ['collection' => ['type' => 'string', 'enum' => array_values(array_intersect(AI_WRITABLE, $colls))], 'id' => ['type' => 'string'], 'changes' => ['type' => 'object']], 'required' => ['collection', 'id', 'changes']]],
        ['name' => 'add_vehicle_document', 'description' => "Range un fichier joint (fileId) dans la fiche d'un véhicule. Le document précédent du même type passe automatiquement dans « Anciens documents » ; pour l'assurance et le contrôle technique, l'échéance du véhicule est mise à jour.",
         'input_schema' => ['type' => 'object', 'properties' => [
            'vehicleId' => ['type' => 'string'], 'fileId' => ['type' => 'string'], 'docType' => ['type' => 'string', 'enum' => array_keys(AI_VDOC_TYPES)],
            'name' => ['type' => 'string'], 'number' => ['type' => 'string'], 'issued' => ['type' => 'string', 'description' => 'AAAA-MM-JJ'], 'expires' => ['type' => 'string', 'description' => 'AAAA-MM-JJ'], 'note' => ['type' => 'string']],
          'required' => ['vehicleId', 'fileId', 'docType']]],
        ['name' => 'add_note_file', 'description' => "Joint un fichier (fileId, par exemple celui d'une photo ou d'un PDF reçu : « Fichier joint : … · fileId … ») à une note. Utilise-le pour toute pièce jointe de note (pas update_record).",
         'input_schema' => ['type' => 'object', 'properties' => ['noteId' => ['type' => 'string'], 'fileId' => ['type' => 'string']], 'required' => ['noteId', 'fileId']]],
        ...(is_office($role) && function_exists('dbx_connected') && dbx_connected() ? [
        ['name' => 'dropbox_search', 'description' => "Cherche des fichiers et dossiers dans le Dropbox de l'entreprise (nom de fichier et contenu indexé par Dropbox). path facultatif pour limiter à un dossier.",
         'input_schema' => ['type' => 'object', 'properties' => ['query' => ['type' => 'string'], 'path' => ['type' => 'string']], 'required' => ['query']]],
        ['name' => 'dropbox_list', 'description' => "Liste le contenu d'un dossier Dropbox (chemin comme dans l'adresse dropbox.com/home/…, \"\" = racine). Le dossier d'un véhicule est dans le lien dropboxLink de sa fiche. Seuls les dossiers autorisés sont accessibles (\"\" liste ces dossiers).",
         'input_schema' => ['type' => 'object', 'properties' => ['path' => ['type' => 'string']], 'required' => ['path']]],
        ['name' => 'dropbox_import', 'description' => "Copie un fichier Dropbox dans l'outil et renvoie son fileId, par exemple pour le ranger dans la fiche d'un véhicule avec add_vehicle_document (le fichier reste aussi dans Dropbox).",
         'input_schema' => ['type' => 'object', 'properties' => ['path' => ['type' => 'string']], 'required' => ['path']]],
        ['name' => 'dropbox_read', 'description' => "Lit un fichier Dropbox (PDF, photo, texte, CSV ; 10 Mo maximum) pour en connaître le contenu. Lecture seule.",
         'input_schema' => ['type' => 'object', 'properties' => ['path' => ['type' => 'string']], 'required' => ['path']]],
        ] : []),
        ...(function_exists('wa_configured') && wa_configured() ? [
        ['name' => 'whatsapp_send_file', 'description' => "Envoie un fichier sur le WhatsApp de la personne qui te parle (à elle seulement, jamais à quelqu'un d'autre) : un fichier de l'outil (fileId, ex. le champ file d'un document de véhicule) ou un fichier Dropbox (dropboxPath). PDF, photos, documents Office ; 100 Mo maximum. WhatsApp ne l'accepte que dans les 24 h qui suivent son dernier message au numéro de la station",
         'input_schema' => ['type' => 'object', 'properties' => ['fileId' => ['type' => 'string'], 'dropboxPath' => ['type' => 'string'], 'caption' => ['type' => 'string', 'description' => 'légende courte (facultatif)']]]],
                ...(is_office($role) || $role === 'terrain' ? [['name' => 'propose_whatsapp_message', 'description' => "Prépare un message WhatsApp à envoyer de la part de la personne qui te parle à un membre de l'équipe (compte de l'outil dont le numéro est connu). Rien n'est envoyé : montre le destinataire et le texte exact, demande « oui » pour confirmer, puis confirm_action avec le token. Texte rédigé comme la personne l'a demandé, sans rien inventer.",
         'input_schema' => ['type' => 'object', 'properties' => ['to' => ['type' => 'string', 'description' => 'nom du destinataire'], 'text' => ['type' => 'string', 'description' => 'texte exact du message (1000 caractères maximum)']], 'required' => ['to', 'text']]]] : []),
] : []),
        ['name' => 'remember', 'description' => "Retiens une connaissance utile à toute l'équipe pour les prochaines fois : une façon de faire de l'entreprise, une convention, une préférence de travail, une correction qu'on t'a faite (ex. « Les transports Airside se facturent avec l'article EXP »). Jamais d'information personnelle ni le contenu privé d'une conversation : seulement une règle de travail générale, en une phrase.",
         'input_schema' => ['type' => 'object', 'properties' => ['note' => ['type' => 'string']], 'required' => ['note']]],
        ['name' => 'confirm_action', 'description' => "Exécute une action proposée plus tôt (propose_delete, propose_share_note, propose_rotations, propose_roster_import, propose_roster_changes ou message WhatsApp), UNIQUEMENT après que la personne a répondu « oui » dans un message ultérieur. token = celui renvoyé par la proposition. Refusé par le serveur dans la même réponse que la proposition.",
         'input_schema' => ['type' => 'object', 'properties' => ['token' => ['type' => 'string']], 'required' => ['token']]],
        ['name' => 'propose_share_note', 'description' => "Prépare le passage d'une note personnelle de la personne qui te parle en note d'équipe (visible de tous). Rien n'est changé : demande-lui de confirmer (oui / non), puis confirm_action. Seul l'auteur peut partager sa note.",
         'input_schema' => ['type' => 'object', 'properties' => ['id' => ['type' => 'string']], 'required' => ['id']]],
        ['name' => 'propose_roster_import', 'description' => "Met à jour le roster de l'outil depuis le roster officiel Excel déposé (format « TLV Roster OFFICIAL » : mois côte à côte, une ligne par personne). L'outil lit le fichier lui-même, reconnaît les personnes de Personnel, convertit les codes et compare avec le roster actuel. Rien n'est écrit : montre le résumé et demande la permission d'activer ton mode édition (« oui »), puis confirm_action.",
         'input_schema' => ['type' => 'object', 'properties' => ['fileId' => ['type' => 'string'], 'sheet' => ['type' => 'string', 'description' => "Nom exact de l'onglet (facultatif : sinon l'onglet OFFICIAL de l'année en cours)"],
            'from' => ['type' => 'string', 'description' => 'Premier mois AAAA-MM (défaut : mois en cours)'], 'to' => ['type' => 'string', 'description' => 'Dernier mois AAAA-MM (défaut : fin du fichier)']], 'required' => ['fileId']]],
        ['name' => 'propose_roster_changes', 'description' => "Seule façon de changer le roster depuis le chat (create_record / update_record ne peuvent pas l'écrire). Une ligne par personne et par jour ou période : staffId, date AAAA-MM-JJ, to (facultatif, dernier jour), code (D, N, D/N, C, T, TLV, OJT, TRNG, OFF, code de 3 lettres d'une autre station ; vide = effacer), start/end pour C, note. Rien n'est écrit : montre le tableau et demande la permission d'activer ton mode édition (« oui »), puis confirm_action.",
         'input_schema' => ['type' => 'object', 'properties' => ['changes' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
            'staffId' => ['type' => 'string'], 'date' => ['type' => 'string'], 'to' => ['type' => 'string'], 'code' => ['type' => 'string'], 'start' => ['type' => 'string'], 'end' => ['type' => 'string'], 'note' => ['type' => 'string'], 'duty' => ['type' => 'string', 'enum' => ['', 'fm', 'out'], 'description' => 'Cadre : fm = flight mech (noir), out = détaché en outstation (bleu)']], 'required' => ['staffId', 'date', 'code']]]], 'required' => ['changes']]],
        ['name' => 'propose_rotations', 'description' => "Prépare les avions (rotations) à créer dans les shifts de la station à partir d'un planning (capture Oracle « Aircraft and Crew Management », tableau, PDF…). Donne une ligne par passage à la station : immatriculation, vol et heure d'arrivée à la station, vol et heure de départ de la station (heures UTC / GMT, date complète). Rien n'est créé : l'outil renvoie le tableau converti (heure locale, shift) et un token ; montre-le à la personne, demande « oui », puis confirm_action. 60 rotations au plus par proposition.",
         'input_schema' => ['type' => 'object', 'properties' => ['rotations' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
            'reg' => ['type' => 'string', 'description' => 'Immatriculation, ex. 4X-ICA'], 'arrUtc' => ['type' => 'string', 'description' => "Arrivée à la station, UTC, AAAA-MM-JJ HH:MM (vide si l'avion est déjà là au début du planning)"],
            'from' => ['type' => 'string', 'description' => 'Escale de provenance (IATA)'], 'flightIn' => ['type' => 'string', 'description' => "N° du vol d'arrivée, ex. 5C981"],
            'depUtc' => ['type' => 'string', 'description' => 'Départ de la station, UTC, AAAA-MM-JJ HH:MM (vide si inconnu)'], 'to' => ['type' => 'string', 'description' => 'Destination (IATA)'], 'flightOut' => ['type' => 'string'],
            'note' => ['type' => 'string', 'description' => 'Ex. WEEKLY MAINTENANCE prévue, AOG…']], 'required' => ['reg']]]], 'required' => ['rotations']]],
        ['name' => 'propose_delete', 'description' => "Prépare la suppression d'une fiche (une panne, une intervention…). Rien n'est supprimé : demande ensuite à la personne de confirmer (oui / non) en lui rappelant ce qui sera supprimé ; si elle répond oui, appelle confirm_action avec le token. Dans l'outil, elle peut aussi confirmer d'un clic.",
         'input_schema' => ['type' => 'object', 'properties' => ['collection' => ['type' => 'string', 'enum' => array_values(array_intersect(AI_WRITABLE, $colls))], 'id' => ['type' => 'string'], 'summary' => ['type' => 'string']], 'required' => ['collection', 'id', 'summary']]],
        ['name' => 'aggregate', 'description' => "Compte et additionne sur toutes les fiches filtrées (pas de limite) : à utiliser pour tout total, comptage ou classement.",
         'input_schema' => ['type' => 'object', 'properties' => $filters + ['sum_field' => ['type' => 'string'], 'group_by' => ['type' => 'string', 'description' => 'month, year ou un champ (clientName, status, type…)']], 'required' => ['collection']]],
    ];
}

function ai_system($who, $role) {
    $set = [];
    $r = get_doc('settings', 'company'); if ($r && !$r['deleted']) $set = json_decode($r['data'], true) ?: [];
    $lines = []; foreach (ai_colls($role) as $c) $lines[] = "- $c : " . AI_LABELS[$c];
    return "Tu es " . AI_NAME . ", collègue de l'équipe de " . ($set['name'] ?? 'la station') . " (station de maintenance en ligne, organisme Part 145), et tu travailles dans son outil de gestion de station avec les droits de la personne qui te parle (au plus ceux d'un employé du bureau). Tu parles à " . (isset($who['label']) ? preg_replace('/^(user|token):/', '', $who['label']) : 'un membre de l\'équipe') . " (rôle : $role).\n"
        . "Nous sommes le " . date('Y-m-d') . " (heure locale de la station ; les horaires des vols sont en UTC). Chaque heure que tu écris porte son repère : « Z » pour UTC (ex. 20:30Z), « LT » pour l'heure locale de la station (ex. 22:30 LT) ; ne donne jamais une heure sans repère. Réponds dans la langue de la question (toujours celle de la personne, quelle qu'elle soit), en anglais par défaut ; l'interface de l'outil est en anglais, comme un collègue : bref, concret, tutoiement si on te tutoie.\n\n"
        . (($GLOBALS['AI_VIA'] ?? '') === 'whatsapp' ? "Cette conversation passe par WhatsApp : réponses courtes, sans tableau ni titre (listes simples, *gras* WhatsApp). Pour une suppression, demande la confirmation ici (réponds « oui » pour confirmer) ; tout reste annulable depuis le panneau Sindri de l'outil. Tu ne peux pas écouter les messages vocaux.\n\n" : '')
        . "Données consultables avec tes outils :\n" . implode("\n", $lines) . "\n\n"
        . "Repères : les données avion et maintenance (CRS, cartes de travail, traçabilité des pièces) sont dans AMOS, pas ici : si on te les demande, dis-le. Tu ne signes ni ne valides aucune maintenance.

"
        . "Règles :\n- Vérifie toujours avec les outils avant d'affirmer un chiffre ; pour un total ou un comptage, utilise aggregate (pas une addition de résultats partiels). Si total_matches dépasse ce qui est renvoyé, dis-le.\n"
        . "- Tu peux créer et modifier des fiches (create_record, update_record, add_vehicle_document) quand la demande est claire. Avant d'écrire, regarde une fiche existante de la même collection pour respecter sa structure, et vérifie les identifiants liés (client, véhicule, article) avec search_records. N'invente jamais un prix, un client ou une date : s'il manque une information ou s'il y a plusieurs possibilités, demande d'abord.\n"
        . "- Suppression : jamais sans confirmation. 1) propose_delete ; 2) pose la question à la personne (ce qui sera supprimé, et pour une panne non réparée, dis-le : « elle n'a pas été réparée ») ; 3) seulement si son message suivant est un « oui » explicite, confirm_action avec le token (une nouvelle demande comme « supprime-la » n'est pas une confirmation : repose la question). Si elle dit non ou autre chose, ne supprime pas. Jamais propose_delete et confirm_action dans la même réponse.\n"
        . "- Notes : tu vois les notes personnelles de la personne qui te parle et les notes d'équipe ; jamais celles des autres. Une note que tu crées est personnelle (à la personne qui te parle). Pour en faire une note d'équipe : propose_share_note puis confirmation (oui) puis confirm_action. Liens vers l'outil : links = [{coll, id, label}]. Pièce jointe (photo, PDF reçu) : add_note_file avec son fileId.\n"
        . (is_office($role) && function_exists('dbx_connected') && dbx_connected() ? "- Dropbox de l'entreprise : dropbox_search, dropbox_list, dropbox_read (lecture seule). Le dossier d'un véhicule est donné par son lien dropboxLink (dropbox.com/home/<chemin>) ; ses anciens documents sont dans le sous-dossier Expired. Pour des nouveaux fichiers Dropbox à analyser : lis chacun (dropbox_read), dis en une ligne ce que c'est, puis propose quoi en faire ; pour ranger un document de véhicule dans sa fiche, dropbox_import puis add_vehicle_document (demande d'abord en cas de doute sur le véhicule ou le type).\n" : '')
        . (function_exists('wa_configured') && wa_configured() ? "- Quand on te demande d'envoyer un document (« envoie-moi le CT du 038 »), retrouve le fichier (champ file des documents d'un véhicule, ou Dropbox) puis whatsapp_send_file ; tu ne l'envoies qu'à la personne qui te parle. Si l'outil refuse (numéro inconnu, plus de 24 h, véhicule non utilisé), transmets son explication telle quelle.\n"
            : '')
        . (function_exists('wa_configured') && wa_configured() ? "- Message WhatsApp à un collègue (« dis à Marc sur WhatsApp que… ») : propose_whatsapp_message (destinataire + texte exact), montre-le, attends « oui », puis confirm_action. Ne l'envoie jamais sans ce oui ; un seul destinataire par proposition.\n" : '')
        . (function_exists('wa_relay_for') && ($rl = wa_relay_for((string) ($who['user']['id'] ?? ''))) ? "- Pour contexte : le " . date('d/m H:i', $rl['at']) . ", tu as transmis à cette personne sur WhatsApp ce message de {$rl['from']} : « " . mb_substr($rl['text'], 0, 400) . " ». Si elle y répond, propose de transmettre sa réponse à {$rl['from']} (propose_whatsapp_message).\n" : '')
        . "- Si un résultat d'outil indique qu'il n'a pas été conservé ou a été raccourci, relance l'outil au lieu de supposer son contenu. N'affirme jamais avoir vérifié quelque chose que tu n'as pas vu.\n"
        . "- Après une écriture, dis en une phrase ce que tu as fait et cite la fiche ; l'utilisateur voit un bouton pour l'ouvrir ou l'annuler.\n"
        . "- Fichier joint (photo, capture d'écran, PDF, Excel, Word, CSV) : lis-le et utilise-le pour la question. Exemples station : page de Tech Log ou de LogBook (immatriculation, défauts, actions, LogPage n°, WO n°) → propose de remplir le Tech Log de l'avion dans le shift ; planning de vols ou liste de rotations → propose les avions du shift (ARR/DEP UTC) ; roster officiel Excel → propose_roster_import ; liste de formations → propose les mises à jour. Montre ce que tu as lu et demande avant d'écrire si ce n'est pas demandé clairement. Les données aviation restent en anglais.\n"
        . "- Planning de vols (capture d'écran Oracle « Aircraft and Crew Management » ou autre diagramme de Gantt) : une ligne par immatriculation (colonne de gauche), axe du temps en haut (jours puis heures ; « Profile time zone GMT » = heures en UTC). Chaque barre de vol porte « STN HH:MM » au départ, le n° de vol au milieu, « HH:MM STN » à l'arrivée, et sous la barre « HH:MM-HH:MM » et « DEP-ARR » (ex. 21:00-07:30 TLV-LGG). Les blocs gris ou colorés sans n° de vol (WEEKLY MAINTENANCE, AOG, BOROSCOPE INSPECTION, A/C NOT AVAILABLE, SPARE, FREIGHTER CONVERSION) ne sont pas des vols : mets-les en note de la rotation concernée. Lis les petits textes dans les tuiles en pleine résolution. Pour la station (" . ai_station_tz()->getName() . ") : une rotation = une barre qui ARRIVE à la station, puis la barre suivante de la même immatriculation qui en REPART (vol, heure). Date de chaque heure = jour de l'axe au-dessus ; un vol qui passe minuit arrive le lendemain. Fais propose_rotations avec toutes les rotations de la période (heures UTC), montre le tableau qu'il renvoie et attends « oui » avant confirm_action. Si un texte est illisible ou ambigu, dis-le plutôt que d'inventer.\n"
        . "- Fichier joint sans consigne et document de véhicule : identifie ce que c'est (contrôle technique, carte verte, certificat d'immatriculation, contrat de leasing…), lis les informations utiles (plaque, VIN, dates, organisme, n°, défauts), retrouve le véhicule avec search_records (collection vehicles, par plaque ou VIN) et range-le avec add_vehicle_document. "
        . "Si le véhicule n'est pas trouvé ou s'il y a plusieurs candidats, si le type est incertain, ou si ce n'est pas un document de véhicule, explique ce que tu as lu et demande quoi faire. Pour un contrôle technique, la date d'expiration est la date limite du prochain contrôle.\n"
        . "- Quand on te corrige ou qu'on t'explique une façon de faire de l'entreprise, retiens-la avec remember (règle générale, jamais de détail personnel). Ce qui se dit dans une conversation reste privé entre toi et cette personne.\n"
        . (($pc = array_filter(ai_confirm_list($who), fn($p) => time() - $p['at'] < AI_CONFIRM_TTL && !empty($p['shown']))) ? "\nActions proposées (suppressions, partages, messages), en attente de la réponse de la personne (confirm_action seulement si elle a dit oui) :\n" . implode("\n", array_map(fn($p) => "- token " . $p['token'] . " : " . $p['label'] . " ($p[coll])", $pc)) . "\n\n" : '')
        . (($mem = ai_memory()) ? "\nCe que l'équipe t'a appris (à appliquer) :\n" . implode("\n", array_map(fn($m) => '- ' . $m['text'], $mem)) . "\n\n" : '')
        . "- Cite les pièces sous la forme [numéro](erp:collection/id), ex. [Clé dynamométrique TW-012](erp:tools/abc123), pour qu'elles soient cliquables. N'invente rien : si la donnée n'existe pas dans l'outil, dis-le.\n"
        . "- Mise en forme : texte simple, listes courtes avec « - », **gras** avec parcimonie, tableaux seulement si utile.";
}

/* garde la conversation légère, sans jamais couper un échange outil ↔ résultat :
   - questions précédentes : on garde les ~24 derniers messages (en commençant sur une question), résultats d'outils résumés ;
   - question en cours : gardée en entier ; si elle a demandé beaucoup de recherches, les anciens résultats sont résumés. */
/* contenu d'un tool_result : texte, ou blocs (fichier Dropbox lu : document/image) */
function ai_res_len($c) { return is_array($c) ? strlen(json_encode($c)) : strlen((string) $c); }
function ai_res_short($c, $txt) { return is_array($c) ? $txt . ' ' . implode(' ', array_map(fn($b) => ($b['type'] ?? '') === 'text' ? mb_substr((string) $b['text'], 0, 300) : '', $c)) : $txt; }
function ai_is_question($m) { return ($m['role'] ?? '') === 'user' && (is_string($m['content'] ?? null) || !empty($m['_files']) || !empty($m['files'])); }
function ai_compact($msgs) {
    $msgs = array_values($msgs); $q = -1;
    foreach ($msgs as $i => $m) if (ai_is_question($m)) $q = $i;
    if ($q < 0) return ai_fix_msgs($msgs);
    $before = array_slice($msgs, 0, $q); $cur = array_slice($msgs, $q);
    if (count($before) > 24) { $before = array_slice($before, -24); while ($before && !ai_is_question($before[0])) array_shift($before); }
    foreach ($before as &$m) { if (is_array($m['content'] ?? null)) foreach ($m['content'] as &$b) if (($b['type'] ?? '') === 'tool_result' && ai_res_len($b['content'] ?? '') > 400) $b['content'] = ai_res_short($b['content'] ?? '', "(résultat d'une question précédente, non conservé : relance l'outil si tu en as besoin)"); unset($b); }
    unset($m);
    $nRes = 0; for ($i = count($cur) - 1; $i > 0; $i--) {   // question en cours : les 8 derniers résultats restent entiers
        if (!is_array($cur[$i]['content'] ?? null) || ($cur[$i]['role'] ?? '') !== 'user') continue;
        if (++$nRes <= 8) continue;
        foreach ($cur[$i]['content'] as &$b) if (($b['type'] ?? '') === 'tool_result' && ai_res_len($b['content'] ?? '') > 1500) $b['content'] = is_array($b['content']) ? ai_res_short($b['content'], "(fichier déjà lu plus haut pendant cette question : relance dropbox_read si besoin)") : mb_substr((string) $b['content'], 0, 1200) . "… (résultat déjà exploité plus haut pendant cette question, raccourci : relance l'outil si tu as besoin du détail)";
        unset($b);
    }
    return ai_fix_msgs(array_merge($before, $cur));
}
/* conversation toujours valide pour l'API : commence par l'utilisateur, chaque tool_use a son tool_result juste après (et inversement) */
function ai_fix_msgs($msgs) {
    $msgs = array_values($msgs); $out = [];
    foreach ($msgs as $i => $m) {
        $c = $m['content'] ?? '';
        if (($m['role'] ?? '') === 'assistant' && is_array($c)) {   // tool_use sans résultat dans le message suivant → retiré
            $next = $msgs[$i + 1] ?? null; $ids = [];
            if ($next && is_array($next['content'] ?? null)) foreach ($next['content'] as $b) if (($b['type'] ?? '') === 'tool_result') $ids[$b['tool_use_id'] ?? ''] = 1;
            $c = array_values(array_filter($c, fn($b) => ($b['type'] ?? '') !== 'tool_use' || isset($ids[$b['id'] ?? ''])));
        }
        if (($m['role'] ?? '') === 'user' && is_array($c)) {         // tool_result sans tool_use dans le message précédent → retiré
            $prev = $out ? end($out) : null; $ids = [];
            if ($prev && $prev['role'] === 'assistant' && is_array($prev['content'])) foreach ($prev['content'] as $b) if (($b['type'] ?? '') === 'tool_use') $ids[$b['id'] ?? ''] = 1;
            $c = array_values(array_filter($c, fn($b) => ($b['type'] ?? '') !== 'tool_result' || isset($ids[$b['tool_use_id'] ?? ''])));
        }
        $empty = is_array($c) ? !$c : trim((string) $c) === '';
        if ($empty && empty($m['_files'])) continue;
        if (!$out && ($m['role'] ?? '') !== 'user') continue;
        $m['content'] = $c;
        if ($out && end($out)['role'] === $m['role']) {               // deux messages du même côté → fusionnés
            $k = count($out) - 1; $blocks = fn($x) => is_array($x) ? $x : [['type' => 'text', 'text' => (string) $x]];
            $res = fn($x) => array_values(array_filter($x, fn($b) => ($b['type'] ?? '') === 'tool_result'));
            $oth = fn($x) => array_values(array_filter($x, fn($b) => ($b['type'] ?? '') !== 'tool_result'));
            $all = array_merge($blocks($out[$k]['content']), $blocks($c));
            $out[$k]['content'] = array_merge($res($all), $oth($all));   // les résultats d'outils doivent venir en premier
            if (!empty($m['_files'])) $out[$k]['_files'] = $m['_files'];
            continue;
        }
        $out[] = $m;
    }
    return $out;
}
/* texte d'un fichier Excel / Word / CSV joint (lu côté serveur, Claude ne lit pas ces formats directement) */
function ai_office_text($path, $mime, $name) {
    $ext = strtolower(pathinfo((string) $name, PATHINFO_EXTENSION));
    if (str_starts_with($mime, 'text/') || in_array($ext, ['csv', 'txt', 'tsv'], true)) return (string) file_get_contents($path, false, null, 0, 300000);
    if (!class_exists('ZipArchive')) return null;
    $z = new ZipArchive(); if ($z->open($path) !== true) return null;
    $out = '';
    if ($ext === 'xlsx' || str_contains($mime, 'spreadsheetml')) {
        $ss = []; if (($x = $z->getFromName('xl/sharedStrings.xml')) !== false && ($d = @simplexml_load_string($x))) foreach ($d->si as $si) $ss[] = trim(implode('', array_map('strval', $si->xpath('.//*[local-name()="t"]') ?: [])));
        $names = []; if (($w = $z->getFromName('xl/workbook.xml')) !== false && ($d = @simplexml_load_string($w))) foreach ($d->sheets->sheet ?? [] as $s) $names[] = (string) $s['name'];
        for ($i = 1; $i <= 6 && ($x = $z->getFromName("xl/worksheets/sheet$i.xml")) !== false; $i++) {
            $d = @simplexml_load_string($x); if (!$d) continue;
            $out .= "## Sheet " . ($names[$i - 1] ?? $i) . "\n";
            foreach ($d->sheetData->row ?? [] as $row) {
                $cells = []; foreach ($row->c as $c) { $v = (string) $c->v; $t = (string) $c['t'];
                    if ($t === 's') $v = $ss[(int) $v] ?? ''; elseif ($t === 'inlineStr') $v = trim(implode('', array_map('strval', $c->xpath('.//*[local-name()="t"]') ?: [])));
                    $cells[preg_replace('/\d+/', '', (string) $c['r'])] = str_replace(["\t", "\n"], ' ', $v); }
                if (array_filter($cells, fn($v) => $v !== '')) $out .= implode("\t", array_map(fn($k, $v) => "$k=$v", array_keys($cells), $cells)) . "\n";
                if (strlen($out) > 300000) break 2;
            }
        }
    } elseif ($ext === 'docx' || str_contains($mime, 'wordprocessingml')) {
        if (($x = $z->getFromName('word/document.xml')) !== false) $out = trim(html_entity_decode(strip_tags(preg_replace(['/<\/w:p>/', '/<w:tab\/>/'], ["\n", "\t"], $x)), ENT_QUOTES | ENT_XML1, 'UTF-8'));
    } else { $z->close(); return null; }
    $z->close();
    return $out;
}

/* grande image (capture d'écran d'un planning, tableau…) : Claude la réduit à ~1,15 Mpx et les petits textes deviennent illisibles.
   On ajoute donc des tuiles en pleine résolution ; chaque tuile reprend la bande de gauche (immatriculations) et la bande du haut
   (axe des dates et heures) de l'image, pour qu'une barre lue dans une tuile garde sa ligne et son heure. */
function ai_image_tiles($path, $name) {
    if (!function_exists('imagecreatefromstring')) return [];
    $info = @getimagesize($path); if (!$info) return [];
    [$W, $H] = $info; if ($W * $H <= 1400000 && max($W, $H) <= 1600) return [];
    $src = @imagecreatefromstring((string) file_get_contents($path)); if (!$src) return [];
    $L = (int) max(60, min(170, round($W * 0.03))); $T = (int) max(50, min(200, round($H * 0.12)));
    $cw = 1000; $ch = 720; $ov = 80;
    $cols = (int) max(1, ceil(($W - $L - $ov) / ($cw - $ov))); $rows = (int) max(1, ceil(($H - $T - $ov) / ($ch - $ov)));
    while ($cols * $rows > 12) { $cw += 200; $ch += 120; $cols = (int) max(1, ceil(($W - $L - $ov) / ($cw - $ov))); $rows = (int) max(1, ceil(($H - $T - $ov) / ($ch - $ov))); }
    $out = [['type' => 'text', 'text' => "[Image « $name » ({$W}×{$H} px) : l'image entière est réduite ci-dessus ; voici {$cols}×{$rows} tuiles en pleine résolution (lis les petits textes ici). Chaque tuile reprend en haut la bande d'en-tête (axe des dates / heures) et à gauche la colonne des libellés de l'image, au-dessus et à côté de la zone zoomée.]"]];
    for ($r = 0; $r < $rows; $r++) for ($c = 0; $c < $cols; $c++) {
        $x0 = $L + $c * ($cw - $ov); $y0 = $T + $r * ($ch - $ov); if ($x0 >= $W || $y0 >= $H) continue;
        $w = min($cw, $W - $x0); $h = min($ch, $H - $y0);
        $im = imagecreatetruecolor($L + $w, $T + $h); imagefill($im, 0, 0, imagecolorallocate($im, 255, 255, 255));
        imagecopy($im, $src, 0, 0, 0, 0, $L, $T);            // coin
        imagecopy($im, $src, $L, 0, $x0, 0, $w, $T);         // axe du haut
        imagecopy($im, $src, 0, $T, 0, $y0, $L, $h);         // libellés de gauche
        imagecopy($im, $src, $L, $T, $x0, $y0, $w, $h);      // zone zoomée
        $red = imagecolorallocate($im, 255, 0, 0); imageline($im, $L - 1, 0, $L - 1, $T + $h, $red); imageline($im, 0, $T - 1, $L + $w, $T - 1, $red);
        ob_start(); imagepng($im, null, 6); $png = ob_get_clean(); imagedestroy($im);
        $out[] = ['type' => 'text', 'text' => 'Tuile ' . ($r + 1) . '/' . $rows . ' (ligne) · ' . ($c + 1) . '/' . $cols . " (colonne) : x {$x0}–" . ($x0 + $w) . ", y {$y0}–" . ($y0 + $h)];
        $out[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => 'image/png', 'data' => base64_encode($png)]];
    }
    imagedestroy($src);
    return $out;
}

/* fichier joint → bloc document (PDF) ou image pour Claude ; seulement pour la question en cours */
function ai_file_blocks($files, $expand) {
    $blocks = []; $dir = cfg('upload_dir');
    foreach (array_slice((array) $files, 0, 5) as $f) {
        $id = preg_replace('/[^a-f0-9]/', '', (string) ($f['id'] ?? '')); if ($id === '') continue;
        $st = db()->prepare('SELECT name, mime, size FROM ways_files WHERE id = ?'); $st->execute([$id]); $meta = $st->fetch();
        if (!$meta || !is_file("$dir/$id")) { $blocks[] = ['type' => 'text', 'text' => "[Fichier joint introuvable : $id]"]; continue; }
        $label = "[Fichier joint : " . $meta['name'] . " · fileId " . $id . "]";
        $mime = strtolower((string) $meta['mime']);
        if ($expand) {
            if ($meta['size'] > AI_FILE_MAX) { $blocks[] = ['type' => 'text', 'text' => "$label (trop volumineux pour être lu : 15 Mo maximum)"]; continue; }
            $data = base64_encode(file_get_contents("$dir/$id"));
            if ($mime === 'application/pdf') $blocks[] = ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $data]];
            elseif (in_array($mime, ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], true)) { $blocks[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $mime, 'data' => $data]]; foreach (ai_image_tiles("$dir/$id", (string) $meta['name']) as $b) $blocks[] = $b; }
            elseif (preg_match('/\.xlsx$/i', (string) $meta['name']) && ($rs = rx_summary("$dir/$id", (string) $meta['name'], $id)) !== null) { $blocks[] = ['type' => 'text', 'text' => $rs]; continue; }
            elseif (($txt = ai_office_text("$dir/$id", $mime, (string) $meta['name'])) !== null && trim($txt) !== '') $blocks[] = ['type' => 'document', 'source' => ['type' => 'text', 'media_type' => 'text/plain', 'data' => mb_substr($txt, 0, 150000)], 'title' => mb_substr((string) $meta['name'], 0, 200)];
            else { $blocks[] = ['type' => 'text', 'text' => "$label (format non lisible : envoyez un PDF, une photo, un Excel, un Word ou un CSV)"]; continue; }
        }
        $blocks[] = ['type' => 'text', 'text' => $label . ($expand ? '' : ' (déjà lu plus haut)')];
    }
    return $blocks;
}
function ai_clean_in($msgs) {
    $out = []; $lastFiles = -1;
    foreach ((array) $msgs as $i => $m) if (($m['role'] ?? '') === 'user' && !empty($m['files'])) $lastFiles = $i;
    $lastUser = -1; foreach ((array) $msgs as $i => $m) if (($m['role'] ?? '') === 'user' && (is_string($m['content'] ?? null) || !empty($m['files']))) $lastUser = $i;
    foreach ((array) $msgs as $i => $m) {
        $role = ($m['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
        if ($role === 'user' && !empty($m['files'])) {   // question avec fichier(s) : lu en entier seulement pour la question en cours
            $txt = trim((string) ($m['content'] ?? '')) ?: "(Fichier déposé sans consigne : identifie-le et propose quoi en faire.)";
            $out[] = ['role' => 'user', 'content' => array_merge(ai_file_blocks($m['files'], $i === $lastUser), [['type' => 'text', 'text' => mb_substr($txt, 0, 8000)]]), '_files' => $m['files']];
            continue;
        }
        $c = $m['content'] ?? '';
        if (is_string($c)) { $c = mb_substr($c, 0, 8000); if (trim($c) === '') continue; }
        elseif (is_array($c)) {
            $c = array_values(array_filter(array_map(function ($b) {
                $t = $b['type'] ?? '';
                if ($t === 'text') return ['type' => 'text', 'text' => mb_substr((string) ($b['text'] ?? ''), 0, 20000)];
                if ($t === 'tool_use') return ['type' => 'tool_use', 'id' => (string) $b['id'], 'name' => (string) $b['name'], 'input' => (object) ($b['input'] ?? [])];
                if ($t === 'tool_result') return ['type' => 'tool_result', 'tool_use_id' => (string) $b['tool_use_id'], 'content' => is_array($b['content'] ?? null) ? array_values(array_filter($b['content'], fn($x) => in_array($x['type'] ?? '', ['text', 'image', 'document'], true))) : mb_substr((string) ($b['content'] ?? ''), 0, 60000)];
                return null;
            }, $c)));
            if (!$c) continue;
        } else continue;
        $out[] = ['role' => $role, 'content' => $c];
    }
    return $out;
}

function ai_no_thinking($msgs) {
    foreach ($msgs as &$m) if (($m['role'] ?? '') === 'assistant' && is_array($m['content'] ?? null)) {
        $m['content'] = array_values(array_filter($m['content'], fn($b) => !in_array($b['type'] ?? '', ['thinking', 'redacted_thinking'], true)));
        if (!$m['content']) $m['content'] = [['type' => 'text', 'text' => '…']];
    }
    unset($m); return $msgs;
}
function ai_chat($who, $role, $msgs) { out(['ok' => true] + ai_run($who, $role, $msgs)); }
function ai_run($who, $role, $msgs) {
    $t0 = microtime(true);
    $msgs = ai_compact(ai_clean_in($msgs));
    if (!$msgs || end($msgs)['role'] !== 'user') fail(400, 'Message manquant');
    $text = ''; $actions = [];
    $q = 0; foreach ($msgs as $i => $m) if (ai_is_question($m)) $q = $i;
    $steps = count(array_filter(array_slice($msgs, $q), fn($m) => $m['role'] === 'assistant'));
    /* consigne figée pour toute la question : les blocs de réflexion renvoyés à l'API sont liés au début exact de la conversation
       (une consigne qui change en cours de route — suppression proposée, règle retenue — les rendrait invalides) */
    $sys = ai_system($who, $role);
    while (true) {
        $us = ai_usage();
        if ($us['usd'] >= ai_cap()) fail(429, 'Plafond mensuel de l\'assistant atteint (' . number_format(ai_cap(), 0, ',', ' ') . ' $). Un administrateur peut le relever dans Paramètres.');
        $send = array_map(fn($m) => array_diff_key($m, ['_files' => 1]), $msgs);
        $req = ['model' => ai_model(), 'max_tokens' => 4000,
            'system' => [['type' => 'text', 'text' => $sys, 'cache_control' => ['type' => 'ephemeral']]],
            'tools' => ai_tools($role), 'messages' => $send];
        try { $d = ai_request($req); }
        catch (RuntimeException $e) {   // filet : bloc de réflexion refusé → on le retire et on relance une fois
            if (!preg_match('/thinking|signature/i', $e->getMessage())) throw $e;
            $msgs = ai_no_thinking($msgs); $req['messages'] = array_map(fn($m) => array_diff_key($m, ['_files' => 1]), $msgs);
            $d = ai_request($req);
        }
        $content = (array) ($d['content'] ?? []);
        if (($d['stop_reason'] ?? '') === 'max_tokens') {   // réponse coupée : un appel d'outil incomplet est retiré, Sindri continue plus brièvement
            $content = array_values(array_filter($content, fn($b) => ($b['type'] ?? '') !== 'tool_use'));
            if (!$content) $content = [['type' => 'text', 'text' => '…']];
            $msgs[] = ['role' => 'assistant', 'content' => $content];
            foreach ($content as $b) if (($b['type'] ?? '') === 'text' && $b['text'] !== '…') $text .= ($text !== '' ? "\n\n" : '') . $b['text'];
            $msgs[] = ['role' => 'user', 'content' => [['type' => 'text', 'text' => '(Ta réponse a été coupée car trop longue. Continue en plus court ; pour beaucoup de pièces, procède par lots.)']]];
            if (++$steps >= AI_MAX_STEPS) break;
            continue;
        }
        $msgs[] = ['role' => 'assistant', 'content' => $content];
        $uses = array_values(array_filter($content, fn($b) => ($b['type'] ?? '') === 'tool_use'));
        foreach ($content as $b) if (($b['type'] ?? '') === 'text') $text .= ($text !== '' ? "\n\n" : '') . $b['text'];
        if (($d['stop_reason'] ?? '') !== 'tool_use' || !$uses) break;
        $results = [];
        foreach ($uses as $u) {
            if ($u['name'] === 'remember') $r = ai_remember($who, (array) ($u['input'] ?? []));
            elseif ($u['name'] === 'propose_roster_import') $r = rx_propose_import($who, $role, (array) ($u['input'] ?? []));
            elseif ($u['name'] === 'propose_roster_changes') $r = rx_propose_changes($who, $role, (array) ($u['input'] ?? []));
            elseif ($u['name'] === 'propose_rotations') $r = ai_rot_propose($who, $role, (array) ($u['input'] ?? []));
            elseif (in_array($u['name'], ['create_record', 'update_record', 'add_vehicle_document', 'propose_delete', 'confirm_delete', 'confirm_action', 'propose_share_note', 'add_note_file'], true)) $r = ai_write($who, $role, (string) $u['name'], (array) ($u['input'] ?? []), $actions);
            elseif ($u['name'] === 'propose_whatsapp_message') $r = ai_wa_propose($who, $role, (array) ($u['input'] ?? []));
            elseif ($u['name'] === 'whatsapp_send_file') { try { $r = wa_send_file_to_me($who, (array) ($u['input'] ?? [])); } catch (Throwable $e) { $r = ['error' => $e->getMessage()]; } }
            elseif (str_starts_with($u['name'], 'dropbox_') && !is_office($role)) $r = ['error' => "Le Dropbox de l'entreprise n'est pas accessible avec le rôle Terrain."];
            elseif (str_starts_with($u['name'], 'dropbox_')) { try { $r = ai_dropbox((string) $u['name'], (array) ($u['input'] ?? [])); } catch (Throwable $e) { $r = ['error' => $e->getMessage()]; } }
            else { try { $r = ai_tool($role, (string) $u['name'], (array) ($u['input'] ?? [])); } catch (Throwable $e) { $r = ['error' => $e->getMessage()]; } }
            if (is_array($r) && isset($r['_blocks'])) { $results[] = ['type' => 'tool_result', 'tool_use_id' => $u['id'], 'content' => $r['_blocks']]; continue; }
            $j = json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (strlen($j) > 60000) $j = mb_substr($j, 0, 60000) . '… (tronqué : affinez la recherche)';
            $results[] = ['type' => 'tool_result', 'tool_use_id' => $u['id'], 'content' => $j];
        }
        $msgs[] = ['role' => 'user', 'content' => $results];
        $steps++;
        if ($steps >= AI_MAX_STEPS) { $text .= "\n\n(Recherche interrompue : question trop large, précisez-la.)"; break; }
        if (microtime(true) - $t0 > AI_BUDGET) {
            $us = ai_usage(); $us['q']++; kv_set('ai_usage_' . gmdate('Y-m'), json_encode($us));
            return ['more' => true, 'messages' => ai_out_msgs($msgs), 'text' => $text, 'actions' => $actions];
        }
    }
    $us = ai_usage(); $us['q']++; kv_set('ai_usage_' . gmdate('Y-m'), json_encode($us));
    if (trim($text) === '' && !$actions) $text = "(Je n'ai pas réussi à formuler de réponse. Peux-tu reformuler ou découper la demande ?)";
    return ['messages' => ai_out_msgs($msgs), 'text' => $text, 'actions' => $actions];
}

/* ---------- fil de conversation par utilisateur (privé, sur le serveur : retrouvé sur tous ses appareils) ---------- */
const AI_VIEW_MAX = 800;      // messages affichés conservés
const AI_CTX_MAX = 40;        // messages envoyés à Claude (le reste du fil n'est que lu par l'utilisateur)
function ai_tables() {
    if (kv_get('ai_schema') === '1') return;
    db()->exec('CREATE TABLE IF NOT EXISTS ways_ai_thread (user_key VARCHAR(191) NOT NULL PRIMARY KEY, data LONGTEXT NOT NULL, updated_at BIGINT NOT NULL)');
    kv_set('ai_schema', '1');
}
function ai_ukey($who) { return $who['kind'] === 'session' ? 'u:' . $who['user']['id'] : 'key'; }
function ai_thread_load($who) {
    $st = db()->prepare('SELECT data FROM ways_ai_thread WHERE user_key = ?'); $st->execute([ai_ukey($who)]);
    $t = json_decode((string) $st->fetchColumn(), true);
    return is_array($t) ? $t + ['view' => [], 'msgs' => [], 'topics' => []] : ['view' => [], 'msgs' => [], 'topics' => []];
}
function ai_thread_save($who, $t) {
    if (count($t['view']) > AI_VIEW_MAX) {   // on oublie le plus ancien, en gardant les sujets cohérents
        $cut = count($t['view']) - AI_VIEW_MAX; $t['view'] = array_slice($t['view'], $cut);
        $t['topics'] = array_values(array_filter(array_map(fn($x) => ['i' => $x['i'] - $cut] + $x, $t['topics']), fn($x) => $x['i'] >= 0));
    }
    $j = json_encode($t, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $up = db()->prepare('UPDATE ways_ai_thread SET data = ?, updated_at = ? WHERE user_key = ?'); $up->execute([$j, now_ms(), ai_ukey($who)]);
    if ($up->rowCount() === 0) db()->prepare('INSERT INTO ways_ai_thread (user_key, data, updated_at) VALUES (?, ?, ?)')->execute([ai_ukey($who), $j, now_ms()]);
}
/* contexte envoyé à Claude : les derniers échanges du sujet en cours, coupés sur une question de l'utilisateur */
function ai_ctx_trim($msgs) {
    if (count($msgs) <= AI_CTX_MAX) return $msgs;
    $msgs = array_slice($msgs, -AI_CTX_MAX);
    while ($msgs && !ai_is_question($msgs[0])) array_shift($msgs);
    return $msgs;
}
/* les fichiers lus (base64) ne sont pas gardés dans le fil : seul leur libellé reste */
function ai_strip_blobs($msgs) {
    foreach ($msgs as &$m) if (is_array($m['content'] ?? null)) foreach ($m['content'] as &$b) if (($b['type'] ?? '') === 'tool_result' && is_array($b['content'] ?? null)) $b['content'] = ai_res_short($b['content'], '(fichier lu, non conservé)');
    unset($m, $b);
    return $msgs;
}
function ai_view_out($t) { return ['view' => $t['view'], 'topics' => $t['topics'], 'pending' => !empty($t['pending'])]; }
function ai_say($who, $role, $b) { out(ai_say_core($who, $role, $b)); }
/* un tour de conversation (question ou reprise) ; renvoie ['ok', 'more'] ou le fil à jour. $via = « whatsapp » pour l'étiquette */
function ai_say_core($who, $role, $b, $via = null) {
    $GLOBALS['ME_UID'] = notes_uid($who); $GLOBALS['ME_NAME'] = (string) ($who['user']['name'] ?? ''); $GLOBALS['ME_EMAIL'] = mb_strtolower(trim((string) ($who['user']['email'] ?? '')));   // notes : celles de la personne + celles de l'équipe
    $t = ai_thread_load($who);
    if (!empty($b['resume'])) {
        if (empty($t['pending'])) return ['ok' => true] + ai_view_out($t);
        $msgs = $t['pending']['msgs'];
    } else {
        $text = mb_substr(trim((string) ($b['text'] ?? '')), 0, 8000);
        $files = array_values(array_filter(array_map(fn($f) => ['id' => preg_replace('/[^a-f0-9]/', '', (string) ($f['id'] ?? '')), 'name' => mb_substr((string) ($f['name'] ?? ''), 0, 200), 'mime' => (string) ($f['mime'] ?? '')], (array) ($b['files'] ?? [])), fn($f) => $f['id'] !== ''));
        if ($text === '' && !$files) fail(400, 'Message vide');
        $newTopic = !$t['topics'] || !empty($t['newTopic']);
        $t['view'][] = ['role' => 'user', 'text' => $text, 'files' => $files, 'at' => now_ms()] + ($via ? ['via' => $via] : []);
        if ($newTopic) { $t['topics'][] = ['i' => count($t['view']) - 1, 'title' => mb_substr($text !== '' ? preg_replace('/\s+/u', ' ', $text) : ('Fichier : ' . ($files[0]['name'] ?? '')), 0, 70), 'at' => now_ms()]; unset($t['newTopic']); }
        $msgs = ai_ctx_trim(array_merge($t['msgs'], [$files ? ['role' => 'user', 'content' => $text, 'files' => $files] : ['role' => 'user', 'content' => $text]]));
        ai_thread_save($who, $t);
    }
    $GLOBALS['AI_Q'] = 0; foreach ($t['view'] as $qi => $vm) if (($vm['role'] ?? '') === 'user') { $GLOBALS['AI_Q'] = $qi + 1; $GLOBALS['AI_QTEXT'] = (string) ($vm['text'] ?? ''); }   // question en cours (confirmations)
    try { $r = ai_run($who, $role, $msgs); }
    catch (Throwable $e) { $t['view'][] = ['role' => 'bot', 'err' => true, 'text' => $e->getMessage(), 'at' => now_ms()]; unset($t['pending']); ai_thread_save($who, $t); throw $e; }
    $acc = $t['pending'] ?? ['text' => '', 'actions' => []];
    $acc['text'] = trim($acc['text'] . "\n\n" . $r['text']); $acc['actions'] = array_merge($acc['actions'], $r['actions']);
    if (!empty($r['more'])) { $t['pending'] = ['msgs' => $r['messages']] + $acc; ai_thread_save($who, $t); return ['ok' => true, 'more' => true]; }
    unset($t['pending']);
    /* la réponse est remise : les suppressions proposées pendant cette question ont bien été montrées à la personne */
    $pc = ai_confirm_list($who); $ch = false;
    foreach ($pc as &$p) if (empty($p['shown']) && $p['q'] === (int) $GLOBALS['AI_Q']) { $p['shown'] = true; $ch = true; }
    unset($p); if ($ch) kv_set('ai_confirm:' . ai_ukey($who), json_encode($pc, JSON_UNESCAPED_UNICODE));
    foreach ($acc['actions'] as $a) if (($a['op'] ?? '') === 'deleted')   // la carte « Confirmer la suppression » d'avant passe à « Supprimé »
        foreach ($t['view'] as &$vm) foreach ((array) ($vm['actions'] ?? []) as $k => $pa) if (($pa['op'] ?? '') === 'delete' && $pa['coll'] === $a['coll'] && $pa['id'] === $a['id'] && empty($pa['state'])) $vm['actions'][$k]['state'] = 'done';
    unset($vm);
    $t['msgs'] = ai_strip_blobs(ai_ctx_trim($r['messages']));
    if (trim($acc['text']) === '' && !$acc['actions']) $acc['text'] = "(Je n'ai pas réussi à formuler de réponse. Peux-tu reformuler ou découper la demande ?)";
    $t['view'][] = ['role' => 'bot', 'text' => $acc['text'], 'actions' => $acc['actions'], 'at' => now_ms()] + ($via ? ['via' => $via] : []);
    ai_thread_save($who, $t);
    return ['ok' => true, 'reply' => $acc['text'], 'actions' => $acc['actions']] + ai_view_out($t);
}

/* ---------- ce que Sindri apprend de toute l'équipe (partagé, sans rien de personnel) ---------- */
const AI_MEM_MAX = 80;
function ai_memory() { return json_decode(aik('ai_memory', '[]'), true) ?: []; }
function ai_remember($who, $in) {
    if (function_exists('sbx_id') && sbx_id()) return ['ok' => true, 'note' => 'Environnement de test : rien n\'est retenu.'];
    $note = trim(preg_replace('/\s+/u', ' ', (string) ($in['note'] ?? '')));
    if ($note === '' || mb_strlen($note) > 300) return ['error' => 'Note vide ou trop longue (300 caractères maximum).'];
    $mem = ai_memory();
    foreach ($mem as $m) if (mb_strtolower($m['text']) === mb_strtolower($note)) return ['ok' => true, 'already' => true];
    $mem[] = ['id' => bin2hex(random_bytes(4)), 'text' => $note, 'at' => gmdate('Y-m-d'), 'by' => preg_replace('/^(user|token):/', '', (string) ($who['label'] ?? ''))];
    kv_set('ai_memory', json_encode(array_slice($mem, -AI_MEM_MAX), JSON_UNESCAPED_UNICODE));
    return ['ok' => true];
}
/* conversation renvoyée au navigateur : sans le contenu des fichiers (il garde la référence et le renverra) */
function ai_out_msgs($msgs) {
    return array_map(function ($m) {
        if (empty($m['_files'])) return $m;
        $txt = ''; foreach ($m['content'] as $b) if (($b['type'] ?? '') === 'text' && !str_starts_with($b['text'], '[Fichier')) $txt = $b['text'];
        return ['role' => 'user', 'content' => str_starts_with($txt, '(Fichier déposé sans consigne') ? '' : $txt, 'files' => $m['_files']];
    }, $msgs);
}
/* écritures de Sindri : mêmes contrôles que pour un employé Bureau (perm_write), notées dans l'historique au nom de Sindri */
/* collections dont l'identifiant est fixé par le contenu, comme dans l'outil :
   roster = <staffId>_<AAAA-MM> (une fiche par personne et par mois), handovers = <AAAA-MM-JJ>-day|night */
function ai_natural_id($coll, array $data) {
    if ($coll === 'roster') {
        $sid = (string) ($data['staffId'] ?? ''); $m = (string) ($data['month'] ?? '');
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $m)) return ['error' => 'Roster : month obligatoire au format AAAA-MM.'];
        $s = $sid !== '' && preg_match('/^[A-Za-z0-9_-]{1,80}$/', $sid) ? get_doc('staff', $sid) : null;
        if (!$s || $s['deleted']) return ['error' => 'Roster : staffId inconnu, vérifie-le avec search_records sur staff.'];
        return ['id' => $sid . '_' . $m];
    }
    if ($coll === 'handovers') {
        $d = (string) ($data['date'] ?? ''); $sh = (string) ($data['shift'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || !in_array($sh, ['day', 'night'], true)) return ['error' => 'Passation : date (AAAA-MM-JJ) et shift (day|night) obligatoires.'];
        return ['id' => "$d-$sh"];
    }
    return [];
}
function ai_by($who) { return AI_NAME . ' (pour ' . preg_replace('/^(user|token):/', '', (string) ($who['label'] ?? '?')) . ')'; }
/* ---------- Dropbox (lecture seule pour Sindri) ---------- */
function ai_dropbox($tool, $in) {
    if (!function_exists('dbx_connected') || !dbx_connected()) return ['error' => "Dropbox n'est pas relié à l'outil."];
    if ($tool === 'dropbox_search') { $r = dbx_search_scoped((string) ($in['query'] ?? ''), (string) ($in['path'] ?? ''), 40); return ['count' => count($r), 'entries' => $r]; }
    if ($tool === 'dropbox_list') { $r = dbx_list_scoped((string) ($in['path'] ?? ''), 400); return ['path' => dbx_norm_path($in['path'] ?? '') ?: '/', 'count' => count($r), 'entries' => array_slice($r, 0, 300)]; }
    if ($tool === 'dropbox_import' && function_exists('sbx_id') && sbx_id()) return ['error' => 'Environnement de test : copie depuis Dropbox désactivée.'];
    if ($tool === 'dropbox_import') { try { return ['ok' => true] + dbx_import_file((string) ($in['path'] ?? '')); } catch (RuntimeException $e) { return ['error' => $e->getMessage()]; } }
    if ($tool === 'dropbox_read') {
        $p = dbx_norm_path($in['path'] ?? ''); if ($p === '') return ['error' => 'Chemin manquant'];
        if (!dbx_in_scope($p)) return ['error' => "Ce fichier n'est pas dans les dossiers Dropbox autorisés."];
        $m = dbx_rpc('files/get_metadata', ['path' => $p]);
        if (($m['.tag'] ?? '') !== 'file') return ['error' => "Ce n'est pas un fichier (utilise dropbox_list pour un dossier)."];
        if ((int) ($m['size'] ?? 0) > DBX_READ_MAX) return ['error' => 'Fichier trop volumineux pour être lu (10 Mo maximum).'];
        [$bytes] = dbx_download($p);
        $ext = strtolower(pathinfo($p, PATHINFO_EXTENSION)); $label = ['type' => 'text', 'text' => "Fichier Dropbox : $p (" . round(strlen($bytes) / 1024) . " Ko)"];
        if ($ext === 'pdf') return ['_blocks' => [$label, ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => base64_encode($bytes)]]]];
        $img = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp'][$ext] ?? null;
        if ($img) return ['_blocks' => [$label, ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $img, 'data' => base64_encode($bytes)]]]];
        if (in_array($ext, ['txt', 'csv', 'md', 'json', 'xml', 'html', 'htm', 'log'], true) || mb_check_encoding($bytes, 'UTF-8')) return ['path' => $p, 'text' => mb_substr(mb_convert_encoding($bytes, 'UTF-8', 'UTF-8'), 0, 50000)];
        return ['error' => "Format non lisible par Sindri ($ext) : ouvrez-le depuis Administration → Dropbox."];
    }
    return ['error' => 'Outil inconnu'];
}
const AI_CONFIRM_TTL = 3600;
/* réponse explicitement affirmative (« oui », « oui vas-y », « confirme », « ok supprime »…) ; une nouvelle demande ne compte pas */
function ai_is_yes($t) {
    $t = mb_strtolower(trim(preg_replace('/[\s!.,…]+/u', ' ', $t)));
    return (bool) preg_match('/^(oui|ouais|yes|yep|ok|okay|d\'accord|dac|confirm[eé]?|je confirme|vas-y|go|ja|si|c\'est bon|bien s[uû]r|exact|affirmatif)( .*)?$/u', $t) && mb_strlen($t) <= 60 && !preg_match('/\b(non|pas|annule|attends)\b/u', $t);
}
/* message WhatsApp à un membre de l'équipe : préparation (confirmation obligatoire) */
function ai_wa_propose($who, $role, $in) {
    if (!function_exists('wa_configured') || !wa_configured()) return ['error' => "WhatsApp n'est pas relié à l'outil."];
    if (($who['kind'] ?? '') !== 'session') return ['error' => "Ton rôle ne permet pas d'envoyer des messages à l'équipe."];
    $text = trim((string) ($in['text'] ?? '')); if ($text === '' || mb_strlen($text) > 1000) return ['error' => 'Message vide ou trop long (1000 caractères maximum).'];
    $ts = wa_find_target((string) ($in['to'] ?? ''));
    if (!$ts) return ['error' => "Aucun membre de l'équipe avec un numéro WhatsApp ne correspond à « " . ($in['to'] ?? '') . " ». Les numéros se gèrent dans Paramètres → WhatsApp (liste de l'équipe).", 'joignables' => array_map(fn($t) => $t['name'], array_slice(wa_team_targets(), 0, 40))];
    if (count($ts) > 1) return ['error' => 'Plusieurs personnes correspondent : demande laquelle.', 'candidats' => array_map(fn($t) => $t['name'], $ts)];
    $t = $ts[0]; $me = wa_number_of((string) ($who['user']['id'] ?? ''));
    if ($me !== '' && $me === $t['num']) return ['error' => "C'est ton propre numéro."];
    $open = wa_window_open($t['num']); $tp = wa_tpl();
    if (!$open && $tp['status'] !== 'APPROVED') return ['error' => "{$t['name']} n'a pas écrit au numéro de la station depuis plus de 24 h : WhatsApp n'autorise alors qu'un modèle de message approuvé par Meta. Un administrateur doit créer le modèle « message d'équipe » dans Paramètres → WhatsApp (approbation en général en quelques minutes)" . ($tp['status'] ? " — état actuel : {$tp['status']}" : '') . ". En attendant, {$t['name']} peut écrire « bonjour » au numéro de la station pour ouvrir la fenêtre de 24 h."];
    $tok = bin2hex(random_bytes(4));
    $pend = array_values(array_filter(ai_confirm_list($who), fn($p) => time() - $p['at'] < AI_CONFIRM_TTL));
    $pend[] = ['token' => $tok, 'kind' => 'wa', 'coll' => 'whatsapp', 'id' => $t['num'], 'num' => $t['num'], 'text' => $text, 'label' => "WhatsApp à {$t['name']}", 'q' => (int) ($GLOBALS['AI_Q'] ?? 0), 'at' => time(), 'shown' => false];
    kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_slice($pend, -10), JSON_UNESCAPED_UNICODE));
    return ['ok' => true, 'token' => $tok, 'to' => $t['name'], 'mode' => $open ? 'texte libre' : "modèle « message d'équipe » (le texte sera mis sur une ligne)", 'todo' => "Rien n'est envoyé. Montre à la personne le destinataire ({$t['name']}) et le texte exact entre guillemets, signale qu'il partira signé de son nom, et demande-lui de répondre « oui » pour l'envoyer."];
}
/* ---------- rotations lues dans un planning : proposées, puis créées après « oui » ----------
   Une ligne « visit » par rotation, dans le shift de l'arrivée (heure de la station) ; les shifts suivants couverts par
   l'escale reçoivent leur ligne à l'ouverture de la page Shift (visitHeal). Doublon = même immatriculation déjà au planning
   à moins de 3 h de la même arrivée (ou du même départ). */
function ai_station_tz() {
    $set = (array) (coll_docs('settings')['company'] ?? []); $stn = strtoupper((string) ($set['stationCode'] ?? '') ?: 'TLV');
    $tz = (string) ($set['timeZone'] ?? '') ?: (['TLV' => 'Asia/Jerusalem', 'LGG' => 'Europe/Brussels', 'BRU' => 'Europe/Brussels', 'MLA' => 'Europe/Malta'][$stn] ?? 'UTC');
    try { return new DateTimeZone($tz); } catch (Throwable $e) { return new DateTimeZone('UTC'); }
}
function ai_utc($s) { $s = trim((string) $s); if (!preg_match('/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):?(\d{2})/', $s, $m)) return null; return new DateTimeImmutable(sprintf('%s %02d:%s:00', $m[1], (int) $m[2], $m[3]), new DateTimeZone('UTC')); }
function ai_shift_of(DateTimeImmutable $t, DateTimeZone $tz) {
    $l = $t->setTimezone($tz); $h = (int) $l->format('G'); $d = $l->format('Y-m-d');
    if ($h >= 20) return "$d-night"; if ($h < 8) return $l->modify('-1 day')->format('Y-m-d') . '-night'; return "$d-day";
}
function ai_rot_rows($in) {
    $tz = ai_station_tz(); $rows = []; $err = [];
    foreach (array_slice((array) ($in['rotations'] ?? []), 0, 60) as $i => $r) {
        $reg = strtoupper(preg_replace('/\s+/', '', (string) ($r['reg'] ?? ''))); if ($reg === '') { $err[] = 'ligne ' . ($i + 1) . ' : immatriculation manquante'; continue; }
        $a = ai_utc($r['arrUtc'] ?? ''); $d = ai_utc($r['depUtc'] ?? '');
        if (!$a && !$d) { $err[] = "$reg : ni arrivée ni départ"; continue; }
        if ($a && $d && $d <= $a) { $err[] = "$reg : départ avant l'arrivée"; continue; }
        $ho = ai_shift_of($a ?: $d, $tz);
        $dup = '';
        foreach (coll_docs('shiftItems') as $id => $x) {
            if (!is_array($x) || ($x['kind'] ?? '') !== 'visit' || strtoupper(preg_replace('/\s+/', '', (string) ($x['reg'] ?? ''))) !== $reg) continue;
            foreach ([[$a, 'arr', 'arrDate'], [$d, 'dep', 'depDate']] as [$t, $k, $kd]) if ($t && !empty($x[$kd]) && preg_match('/^\d{1,2}:\d{2}$/', (string) ($x[$k] ?? ''))) {
                $o = ai_utc($x[$kd] . ' ' . $x[$k]); if ($o && abs($o->getTimestamp() - $t->getTimestamp()) <= 3 * 3600) $dup = (string) $id;
            }
            if (!$dup && $a && ($x['ho'] ?? '') === $ho && empty($x['arrDate'])) $dup = (string) $id;
        }
        $rows[] = ['reg' => $reg, 'ho' => $ho, 'arr' => $a ? $a->format('H:i') : '', 'arrDate' => $a ? $a->format('Y-m-d') : '', 'dep' => $d ? $d->format('H:i') : '', 'depDate' => $d ? $d->format('Y-m-d') : '',
            'from' => strtoupper(mb_substr((string) ($r['from'] ?? ''), 0, 4)), 'to' => strtoupper(mb_substr((string) ($r['to'] ?? ''), 0, 4)), 'flightIn' => strtoupper(mb_substr(preg_replace('/\s+/', '', (string) ($r['flightIn'] ?? '')), 0, 10)),
            'flightOut' => strtoupper(mb_substr(preg_replace('/\s+/', '', (string) ($r['flightOut'] ?? '')), 0, 10)), 'note' => mb_substr((string) ($r['note'] ?? ''), 0, 200),
            'arrLT' => $a ? $a->setTimezone($tz)->format('d M H:i') . ' LT' : '', 'depLT' => $d ? $d->setTimezone($tz)->format('d M H:i') . ' LT' : '', 'duplicateOf' => $dup];
    }
    return [$rows, $err];
}
function ai_rot_propose($who, $role, $in) {
    if (!in_array('shiftItems', ai_colls($role), true)) return ['error' => 'Collection non modifiable par l\'assistant : shiftItems'];
    [$rows, $err] = ai_rot_rows($in);
    if (!$rows) return ['error' => 'Aucune rotation valable.' . ($err ? ' ' . implode(' ; ', $err) : '')];
    $new = array_values(array_filter($rows, fn($r) => $r['duplicateOf'] === ''));
    $tok = bin2hex(random_bytes(4));
    $pend = array_values(array_filter(ai_confirm_list($who), fn($p) => time() - $p['at'] < AI_CONFIRM_TTL));
    $pend[] = ['token' => $tok, 'kind' => 'rot', 'coll' => 'shiftItems', 'id' => '', 'rows' => $new, 'label' => count($new) . ' rotation(s) à créer', 'q' => (int) ($GLOBALS['AI_Q'] ?? 0), 'at' => time(), 'shown' => false];
    kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_slice($pend, -10), JSON_UNESCAPED_UNICODE));
    $tz = ai_station_tz()->getName();
    return ['ok' => true, 'token' => $tok, 'stationTimeZone' => $tz, 'toCreate' => count($new), 'alreadyPlanned' => count($rows) - count($new), 'rows' => $rows, 'problems' => $err,
        'todo' => "Rien n'est créé. Montre un tableau (Reg · ARR flight / from / heure Z et LT · DEP flight / to / heure Z et LT · shift), signale les lignes déjà au planning (duplicateOf) et les problèmes, puis demande « oui » pour créer les " . count($new) . " rotation(s)."];
}
function ai_rot_create($who, $p, &$actions) {
    $by = ai_by($who); $made = []; $ac = [];
    foreach (coll_docs('aircraft') as $x) if (is_array($x) && !empty($x['reg'])) $ac[strtoupper(preg_replace('/\s+/', '', (string) $x['reg']))] = $x;
    foreach ((array) ($p['rows'] ?? []) as $i => $r) {
        $a = $ac[$r['reg']] ?? []; $id = 'rot' . bin2hex(random_bytes(5));
        $dep = trim($r['flightOut'] . ($r['to'] !== '' ? ' to ' . $r['to'] : ''));
        $note = implode(' · ', array_filter([$r['from'] !== '' ? 'ARR from ' . $r['from'] : '', $dep !== '' ? 'DEP ' . $dep : '', $r['note'], 'planned by Sindri from the schedule']));
        $data = ['kind' => 'visit', 'ho' => $r['ho'], 'reg' => $r['reg'], 'acType' => (string) ($a['acType'] ?? ''), 'clientId' => (string) ($a['clientId'] ?? ''), 'arr' => $r['arr'], 'arrDate' => $r['arrDate'], 'dep' => $r['dep'], 'depDate' => $r['depDate'],
            'flight' => $r['flightIn'], 'crs' => [], 'mech' => [], 'tasks' => [], 'notes' => $note, 'order' => now_ms() + $i];
        try { $data = perm_write('bureau', 'shiftItems', 'put', null, $data, null, $id); } catch (Throwable $e) { $made[] = $r['reg'] . ' ' . $r['ho'] . ' : ' . $e->getMessage(); continue; }
        db()->beginTransaction(); write_doc('shiftItems', $id, $data, $by); db()->commit();
        $actions[] = ['op' => 'create', 'coll' => 'shiftItems', 'id' => $id, 'label' => log_label('shiftItems', $data) ?: $r['reg']];
        $made[] = $r['reg'] . ' ' . $r['ho'];
    }
    return ['ok' => true, 'created' => $made, 'note' => 'Les shifts suivants couverts par chaque escale reçoivent leur ligne automatiquement.'];
}
function ai_confirm_list($who) { return json_decode(aik('ai_confirm:' . ai_ukey($who), '[]'), true) ?: []; }
/* tâches du Tech Log écrites par Sindri (scan d'une log page, chat) : marquées « encodée par Sindri – à vérifier » (ai).
   Seule une personne les valide (ok = {by, at}) ; tant qu'il en reste, le shift ne peut pas être remis (api/perm.php).
   Une tâche que Sindri ne change pas garde son état ; une tâche qu'il crée ou modifie repart « à vérifier ». */
function ai_mark_tasks($coll, $old, $new) {
    if ($coll !== 'shiftItems' || !is_array($new) || !isset($new['tasks']) || !is_array($new['tasks'])) return $new;
    $prev = []; foreach ((array) (($old ?? [])['tasks'] ?? []) as $t) if (is_array($t) && isset($t['id'])) $prev[(string) $t['id']] = $t;
    $core = function ($t) { unset($t['ai'], $t['ok']); return json_encode($t); };
    foreach ($new['tasks'] as $i => $t) {
        if (!is_array($t)) { unset($new['tasks'][$i]); continue; }
        if (empty($t['id'])) $t['id'] = 'ai' . bin2hex(random_bytes(5));
        $o = $prev[(string) $t['id']] ?? null;
        if ($o !== null && $core($o) === $core($t)) { unset($t['ai'], $t['ok']); if (isset($o['ai'])) $t['ai'] = $o['ai']; if (isset($o['ok'])) $t['ok'] = $o['ok']; }
        else { unset($t['ok']); $t['ai'] = ['by' => AI_NAME, 'at' => gmdate('c')]; }
        $new['tasks'][$i] = $t;
    }
    $new['tasks'] = array_values($new['tasks']);
    return $new;
}
function ai_write($who, $role, $tool, $in, &$actions) {
    if (!in_array($tool, ['confirm_delete', 'confirm_action'], true) && count(array_filter($actions, fn($a) => !in_array($a['op'] ?? '', ['delete', 'deleted'], true))) >= AI_MAX_WRITES) return ['error' => 'Trop de modifications pour une seule demande : fais une pause et demande à l\'utilisateur de continuer.'];
    $wrole = $role === 'admin' ? 'bureau' : $role;                 // Sindri a les droits d'un employé Bureau
    $coll = $tool === 'add_vehicle_document' ? 'vehicles' : (string) ($in['collection'] ?? '');
    if ($tool === 'propose_share_note') $coll = 'notes';
    if ($coll === 'roster' && in_array($tool, ['create_record', 'update_record'], true)) return ['error' => "Le roster ne se modifie qu'en mode édition : utilise propose_roster_changes (ou propose_roster_import pour un fichier) et demande la permission."];
    if ($tool === 'add_note_file') {   // pièce jointe ajoutée à une note (même contrôle qu'une modification)
        $fid = preg_replace('/[^a-f0-9]/', '', (string) ($in['fileId'] ?? ''));
        $st = db()->prepare('SELECT name, mime, size FROM ways_files WHERE id = ?'); $st->execute([$fid]); $f = $st->fetch(PDO::FETCH_ASSOC);
        if (!$f) return ['error' => 'fileId inconnu : utilise celui indiqué dans « Fichier joint ».'];
        $r = get_doc('notes', (string) ($in['noteId'] ?? '')); $old = ($r && !$r['deleted']) ? (json_decode($r['data'], true) ?: []) : null;
        if (!$old || perm_view($role, 'notes', $old) === null) return ['error' => 'Note introuvable'];
        $files = array_values((array) ($old['files'] ?? []));
        if (array_filter($files, fn($x) => ($x['id'] ?? '') === $fid)) return ['ok' => true, 'already' => 'Ce fichier est déjà joint à la note.'];
        $files[] = ['id' => $fid, 'name' => (string) $f['name'], 'mime' => (string) $f['mime'], 'size' => (int) $f['size']];
        return ai_write($who, $role, 'update_record', ['collection' => 'notes', 'id' => (string) $in['noteId'], 'changes' => ['files' => $files]], $actions);
    }
    if (!in_array($tool, ['confirm_delete', 'confirm_action'], true) && (!in_array($coll, AI_WRITABLE, true) || !in_array($coll, ai_colls($role), true))) return ['error' => "Collection non modifiable par l'assistant : $coll"];
    $by = ai_by($who);
    $GLOBALS['PERM_THROW'] = true;
    try {
        if ($tool === 'propose_delete') {
            $r = get_doc($coll, (string) $in['id']); if (!$r || $r['deleted']) return ['error' => 'Fiche introuvable'];
            $old = json_decode($r['data'], true) ?: [];
            perm_write($wrole, $coll, 'delete', $old, null, null, (string) $in['id']);
            $label = log_label($coll, $old) ?: $in['id'];
            $tok = bin2hex(random_bytes(4));
            $pend = array_values(array_filter(ai_confirm_list($who), fn($p) => time() - $p['at'] < AI_CONFIRM_TTL && !($p['coll'] === $coll && $p['id'] === (string) $in['id'])));
            $pend[] = ['token' => $tok, 'coll' => $coll, 'id' => (string) $in['id'], 'label' => $label, 'q' => (int) ($GLOBALS['AI_Q'] ?? 0), 'at' => time(), 'shown' => false];
            kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_slice($pend, -10), JSON_UNESCAPED_UNICODE));
            $actions[] = ['op' => 'delete', 'coll' => $coll, 'id' => (string) $in['id'], 'label' => $label, 'summary' => mb_substr((string) ($in['summary'] ?? ''), 0, 300)];
            $warn = $coll === 'faults' && ($old['status'] ?? '') !== 'reparee' ? " Attention : cette panne n'a pas été réparée (statut « " . ($old['status'] ?? '?') . " »), dis-le dans ta question." : '';
            return ['ok' => true, 'token' => $tok, 'todo' => "Rien n'est supprimé. Demande maintenant à la personne de confirmer la suppression de « $label » (oui / non).$warn"];
        }
        if ($tool === 'propose_share_note') {
            $r = get_doc('notes', (string) ($in['id'] ?? '')); $old = ($r && !$r['deleted']) ? (json_decode($r['data'], true) ?: []) : null;
            if (!$old || perm_view($role, 'notes', $old) === null) return ['error' => 'Note introuvable'];
            if (!empty($old['team'])) return ['ok' => true, 'already' => "C'est déjà une note d'équipe."];
            if (!notes_mine($old)) return ['error' => "Seul l'auteur de la note peut la partager."];
            $label = 'Note « ' . mb_substr((string) ($old['title'] ?? '') ?: mb_substr((string) ($old['body'] ?? ''), 0, 40), 0, 60) . ' »';
            $tok = bin2hex(random_bytes(4));
            $pend = array_values(array_filter(ai_confirm_list($who), fn($p) => time() - $p['at'] < AI_CONFIRM_TTL));
            $pend[] = ['token' => $tok, 'kind' => 'share', 'coll' => 'notes', 'id' => (string) $in['id'], 'label' => $label, 'q' => (int) ($GLOBALS['AI_Q'] ?? 0), 'at' => time(), 'shown' => false];
            kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_slice($pend, -10), JSON_UNESCAPED_UNICODE));
            return ['ok' => true, 'token' => $tok, 'todo' => "Rien n'est changé. Demande à la personne de confirmer que « $label » devient une note d'équipe, visible de toute l'équipe (oui / non)."];
        }
        if ($tool === 'confirm_delete' || $tool === 'confirm_action') {
            $pend = ai_confirm_list($who); $p = null;
            foreach ($pend as $x) if ($x['token'] === (string) ($in['token'] ?? '')) $p = $x;
            if (!$p || time() - $p['at'] > AI_CONFIRM_TTL) return ['error' => 'Proposition inconnue ou expirée (1 h) : refais propose_delete.'];
            if ((int) ($GLOBALS['AI_Q'] ?? 0) <= $p['q']) return ['error' => "Refusé : la personne n'a pas encore répondu. Pose-lui la question et attends sa réponse."];
            if (empty($p['shown'])) return ['error' => "Refusé : la question de confirmation n'a jamais été affichée à la personne (réponse interrompue). Refais propose_delete et pose-lui la question."];
            if (!ai_is_yes((string) ($GLOBALS['AI_QTEXT'] ?? ''))) return ['error' => "Refusé : son dernier message n'est pas un « oui » explicite. Rappelle-lui ce qui sera supprimé et demande-lui de répondre « oui » pour confirmer."];
            if (($p['kind'] ?? '') === 'roster') {   // roster : mode édition de Sindri, le temps d'appliquer
                kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_values(array_filter($pend, fn($x) => $x['token'] !== $p['token'])), JSON_UNESCAPED_UNICODE));
                return rx_apply($who, $p, $actions);
            }
            if (($p['kind'] ?? '') === 'rot') {   // rotations lues dans un planning
                kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_values(array_filter($pend, fn($x) => $x['token'] !== $p['token'])), JSON_UNESCAPED_UNICODE));
                return ai_rot_create($who, $p, $actions);
            }
            if (($p['kind'] ?? '') === 'wa') {   // message WhatsApp à un membre de l'équipe
                kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_values(array_filter($pend, fn($x) => $x['token'] !== $p['token'])), JSON_UNESCAPED_UNICODE));
                $t = null; foreach (wa_team_targets() as $x) if ($x['num'] === $p['num']) $t = $x;
                if (!$t) return ['error' => "Ce destinataire n'est plus dans la liste de l'équipe."];
                try { $how = wa_send_team((string) ($who['user']['name'] ?? 'Sindri'), $t, (string) $p['text']); } catch (Throwable $e) { return ['error' => $e->getMessage()]; }
                $actions[] = ['op' => 'whatsapp', 'coll' => 'settings', 'id' => 'company', 'label' => 'WhatsApp envoyé à ' . $t['name']];
                return ['ok' => true, 'sent' => 'Message WhatsApp envoyé à ' . $t['name'] . ($how === 'modèle' ? " (par le modèle « message d'équipe », car elle n'a pas écrit au numéro de la station depuis plus de 24 h)" : '')];
            }
            $coll = $p['coll'];
            if (!in_array($coll, AI_WRITABLE, true) || !in_array($coll, ai_colls($role), true)) return ['error' => "Collection non modifiable par l'assistant : $coll"];
            if (($p['kind'] ?? 'delete') === 'share') {
                $r = get_doc('notes', $p['id']); $old = ($r && !$r['deleted']) ? (json_decode($r['data'], true) ?: []) : null;
                if (!$old) return ['error' => 'Note introuvable'];
                $new = perm_write($wrole, 'notes', 'patch', $old, ['team' => true] + $old);
                db()->beginTransaction(); write_doc('notes', $p['id'], $new, $by); db()->commit();
                kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_values(array_filter($pend, fn($x) => $x['token'] !== $p['token'])), JSON_UNESCAPED_UNICODE));
                $actions[] = ['op' => 'update', 'coll' => 'notes', 'id' => $p['id'], 'label' => $p['label'] . " → note d'équipe", 'fields' => ['team'], 'before' => $old];
                return ['ok' => true, 'shared' => $p['label']];
            }
            $r = get_doc($coll, $p['id']); if (!$r || $r['deleted']) { kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_values(array_filter($pend, fn($x) => $x['token'] !== $p['token'])))); return ['ok' => true, 'already' => 'Cette fiche était déjà supprimée.']; }
            $old = json_decode($r['data'], true) ?: [];
            perm_write($wrole, $coll, 'delete', $old, [], null, $p['id']);
            db()->beginTransaction();
            write_doc($coll, $p['id'], [], $by, 1);
            if ($coll === 'vehicles' && trim((string) ($old['fleetNo'] ?? '')) !== '') {   // identifiant réservé, comme dans l'outil
                $c = get_doc('settings', 'company'); $set = $c ? (json_decode($c['data'], true) ?: []) : [];
                $set['usedFleetNos'] = array_values(array_unique(array_merge((array) ($set['usedFleetNos'] ?? []), [(string) $old['fleetNo']]))); write_doc('settings', 'company', $set, $by);
            }
            db()->commit();
            kv_set('ai_confirm:' . ai_ukey($who), json_encode(array_values(array_filter($pend, fn($x) => $x['token'] !== $p['token'])), JSON_UNESCAPED_UNICODE));
            $actions[] = ['op' => 'deleted', 'coll' => $coll, 'id' => $p['id'], 'label' => $p['label'], 'before' => $old];
            return ['ok' => true, 'deleted' => $p['label']];
        }
        db()->beginTransaction();
        if ($tool === 'create_record') {
            $data = (array) ($in['data'] ?? []); unset($data['id'], $data['_rev']);
            $nat = ai_natural_id($coll, $data);
            if (isset($nat['error'])) { db()->rollBack(); return $nat; }
            $id = $nat['id'] ?? 'ax' . bin2hex(random_bytes(6));
            if (isset($nat['id']) && ($ex = get_doc($coll, $id)) && !$ex['deleted']) { db()->rollBack(); return ['error' => "Cette fiche existe déjà (id $id) : relis-la avec get_record puis modifie-la avec update_record."]; }
            $forced = $coll === 'notes' && !empty($data['team']);
            if ($coll === 'notes') { $data['team'] = false; $data['createdAt'] = $data['createdAt'] ?? gmdate('c'); $data['order'] = $data['order'] ?? -now_ms(); }
            $data = ai_mark_tasks($coll, null, $data);
            $data = perm_write($wrole, $coll, 'put', null, $data, null, $id);
            write_doc($coll, $id, $data, $by);
            db()->commit();
            $actions[] = ['op' => 'create', 'coll' => $coll, 'id' => $id, 'label' => log_label($coll, $data) ?: $id];
            return ['ok' => true, 'id' => $id, 'record' => ai_record($coll, $id, $data)] + ($forced ? ['note' => "Créée en note personnelle : pour la partager avec l'équipe, propose_share_note puis confirmation."] : []);
        }
        if ($tool === 'update_record' || $tool === 'add_vehicle_document') {
            $id = (string) ($tool === 'add_vehicle_document' ? ($in['vehicleId'] ?? '') : ($in['id'] ?? ''));
            $r = get_doc($coll, $id); if (!$r || $r['deleted']) { db()->rollBack(); return ['error' => 'Fiche introuvable : vérifie l\'identifiant avec search_records.']; }
            $old = json_decode($r['data'], true) ?: [];
            if ($tool === 'add_vehicle_document') {
                $fid = preg_replace('/[^a-f0-9]/', '', (string) ($in['fileId'] ?? ''));
                $st = db()->prepare('SELECT name, mime FROM ways_files WHERE id = ?'); $st->execute([$fid]); $f = $st->fetch();
                if (!$f) { db()->rollBack(); return ['error' => 'fileId inconnu : utilise celui indiqué dans « Fichier joint ».']; }
                if (!isset(AI_VDOC_TYPES[$in['docType'] ?? ''])) { db()->rollBack(); return ['error' => 'docType invalide']; }
                $date = fn($x) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $x) ? (string) $x : '';
                $doc = ['id' => bin2hex(random_bytes(5)), 'type' => $in['docType'], 'name' => mb_substr((string) ($in['name'] ?? ''), 0, 120), 'number' => mb_substr((string) ($in['number'] ?? ''), 0, 60),
                    'issued' => $date($in['issued'] ?? ''), 'expires' => $date($in['expires'] ?? ''), 'note' => mb_substr((string) ($in['note'] ?? ''), 0, 600),
                    'file' => $fid, 'mime' => (string) $f['mime'], 'fileName' => (string) $f['name'], 'by' => AI_NAME];
                $docs = array_values((array) ($old['docs'] ?? [])); $docs[] = $doc;
                $changes = ['docs' => $docs];
                $latest = function ($t) use ($docs) { $c = array_filter($docs, fn($x) => ($x['type'] ?? '') === $t && !empty($x['expires']) && empty($x['old'])); usort($c, fn($a, $b) => strcmp($b['expires'], $a['expires'])); return $c[0]['expires'] ?? null; };
                if ($doc['type'] === 'assurance' && $latest('assurance')) $changes['insuranceDate'] = $latest('assurance');
                if ($doc['type'] === 'ct' && $latest('ct')) $changes['ctDate'] = $latest('ct');
            } else $changes = (array) ($in['changes'] ?? []);
            unset($changes['id'], $changes['_rev']);
            if ($coll === 'notes' && !empty($changes['team']) && empty($old['team'])) { db()->rollBack(); return ['error' => "Partage d'une note personnelle : utilise propose_share_note puis demande confirmation."]; }
            if ($coll === 'notes' && perm_view($role, 'notes', $old) === null) { db()->rollBack(); return ['error' => 'Fiche introuvable : vérifie l\'identifiant avec search_records.']; }
            $new = $old; foreach ($changes as $k => $v) { if ($v === null) unset($new[$k]); else $new[$k] = $v; }
            $new = ai_mark_tasks($coll, $old, $new);
            $new = perm_write($wrole, $coll, 'patch', $old, $new, $changes, $id);
            write_doc($coll, $id, $new, $by);
            db()->commit();
            $actions[] = ['op' => 'update', 'coll' => $coll, 'id' => $id, 'label' => log_label($coll, $new) ?: $id, 'before' => $old, 'fields' => array_keys($changes)];
            return ['ok' => true, 'id' => $id, 'record' => ai_record($coll, $id, $new)];
        }
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        return ['error' => $e->getMessage()];
    } finally { $GLOBALS['PERM_THROW'] = false; }
    return ['error' => 'Outil inconnu'];
}

/* résumé du shift rédigé par Sindri pour le handover (toute l'équipe) : un brouillon, relu et corrigé par la personne
   avant d'être enregistré sur la fiche du shift et envoyé avec la page Notion. Rien n'est écrit ici. */
function ai_shift_summary($who, $role, $b) {
    if (aik('ai_key') === '') fail(400, "Sindri n'est pas encore configuré : un administrateur doit saisir la clé API dans Paramètres.");
    $ho = (string) ($b['ho'] ?? ''); if (!preg_match('/^\d{4}-\d{2}-\d{2}-(day|night)$/', $ho)) fail(400, 'Shift inconnu');
    $us = ai_usage(); if ($us['usd'] >= ai_cap()) fail(429, 'Plafond mensuel de l\'assistant atteint.');
    $staff = coll_docs('staff'); $nm = fn($id) => (string) ($staff[$id]['name'] ?? '');
    $h = (array) (coll_docs('handovers')[$ho] ?? []); $lines = [];
    foreach (coll_docs('shiftItems') as $x) {
        if (($x['ho'] ?? '') !== $ho) continue;
        $k = $x['kind'] ?? '';
        if ($k === 'visit') {
            $t = []; foreach ((array) ($x['tasks'] ?? []) as $tk) $t[] = !empty($tk['sp']) ? '  - SPECIAL TASK (not maintenance): ' . ($tk['text'] ?? '') . ' => ' . (!empty($tk['spDone']) ? 'done' : 'NOT DONE') : '  - ' . ($tk['text'] ?? '') . ' => ' . (($tk['action'] ?? '') !== '' ? $tk['action'] : 'NOT DONE') . (!empty($tk['unc']) ? ' [UNCOMPLETED, handed over]' : '');
            $lines[] = 'Aircraft ' . ($x['reg'] ?? '') . ' ' . ($x['acType'] ?? '') . ' ARR ' . ($x['arr'] ?? '-') . ' DEP ' . ($x['dep'] ?? '-') . ' CRS: ' . implode(', ', array_map($nm, (array) ($x['crs'] ?? []))) . "\n" . implode("\n", $t) . (($x['notes'] ?? '') !== '' ? "\n  notes: " . $x['notes'] : '');
        } elseif ($k === 'todo') $lines[] = 'Uncompleted work: ' . ($x['reg'] ?? '') . ' ' . ($x['text'] ?? '') . (!empty($x['done']) ? ' (done)' : '') . (($x['note'] ?? '') !== '' ? ' — ' . $x['note'] : '');
        elseif ($k === 'equip') $lines[] = 'Equipment: ' . ($x['user'] ?? '') . ' ' . ($x['reg'] ?? '') . ' ' . ($x['item'] ?? '') . ' ' . ($x['qty'] ?? '') . ' ' . ($x['unit'] ?? '');
    }
    foreach (coll_docs('situations') as $s) if (($s['status'] ?? 'open') === 'open') $lines[] = 'Open situation: ' . ($s['title'] ?? '') . ' ' . ($s['party'] ?? '') . (($s['dueBack'] ?? '') !== '' ? ' due back ' . $s['dueBack'] : '');
    if (($h['checkNote'] ?? '') !== '') $lines[] = 'Station Control remark: ' . $h['checkNote'];
    $lang = ($b['lang'] ?? 'en') === 'fr' ? 'French' : 'English';
    $prompt = "You write the short shift handover summary of an aviation line maintenance station (EASA Part-145). Shift: $ho. Shift Foreman: " . $nm($h['foreman'] ?? '') . ".\n"
        . "Write in $lang, 3 to 8 short bullet lines, factual, no invention, no greeting: aircraft handled, defects or tasks still open and what the next shift must do first, open situations, anything unusual. "
        . "Every time you write must carry its reference: Z for UTC (e.g. 20:30Z) or LT for station local time. Never state that an aircraft is airworthy or released: the CRS is done in AMOS.\n\nShift data:\n" . (implode("\n", $lines) ?: '(nothing entered)');
    try { $d = ai_request(['model' => ai_model(), 'max_tokens' => 600, 'messages' => [['role' => 'user', 'content' => $prompt]]]); }
    catch (Throwable $e) { fail($e->getCode() === 429 ? 429 : 502, $e->getMessage()); }
    $txt = trim(implode('', array_map(fn($c) => ($c['type'] ?? '') === 'text' ? (string) $c['text'] : '', (array) ($d['content'] ?? []))));
    log_event('handovers', $ho, 'update', 'Résumé du shift proposé par ' . AI_NAME);
    out(['ok' => true, 'text' => $txt]);
}
function assistant_routes($route, $parts, $method, $who, $role) {
    if ($route !== 'assistant') return;
    auth_tables();
    if (($parts[1] ?? '') === 'shift-summary' && $method === 'POST') ai_shift_summary($who, $role, body_json());
    if ($role === 'terrain') fail(403, "Dans l'outil, l'assistant est réservé au bureau et aux administrateurs (l'équipe terrain l'utilise sur WhatsApp).");
    @set_time_limit(150);
    $act = $parts[1] ?? '';
    if ($act === 'status' && $method === 'GET') {
        $us = ai_usage();
        out(['configured' => aik('ai_key') !== '', 'model' => ai_model(), 'models' => array_map(fn($m) => $m[0], AI_MODELS), 'cap' => ai_cap(),
             'usage' => ['usd' => round($us['usd'], 2), 'questions' => (int) $us['q']], 'keyHint' => aik('ai_key') !== '' ? '…' . substr(aik('ai_key'), -4) : null]);
    }
    $b = $method === 'POST' ? body_json() : [];
    if ($act === 'config' && $method === 'POST') {
        if ($role !== 'admin') fail(403, 'Réservé aux administrateurs');
        if (!empty($b['disconnect'])) { kv_set('ai_key', ''); out(['ok' => true]); }
        if (($v = trim((string) ($b['key'] ?? ''))) !== '') kv_set('ai_key', mb_substr($v, 0, 300));
        if (isset($b['model']) && isset(AI_MODELS[$b['model']])) kv_set('ai_model', $b['model']);
        if (isset($b['cap']) && (float) $b['cap'] > 0) kv_set('ai_cap', (string) min(5000, round((float) $b['cap'], 2)));
        out(['ok' => true]);
    }
    if (aik('ai_key') === '') fail(400, "L'assistant n'est pas encore configuré : un administrateur doit saisir la clé API dans Paramètres.");
    if ($act === 'test' && $method === 'POST') {
        if ($role !== 'admin') fail(403, 'Réservé aux administrateurs');
        try { $d = ai_request(['model' => ai_model(), 'max_tokens' => 20, 'messages' => [['role' => 'user', 'content' => 'Réponds juste : OK']]]); }
        catch (Throwable $e) { fail(502, $e->getMessage()); }
        out(['ok' => true, 'model' => $d['model'] ?? ai_model()]);
    }
    if ($act === 'thread' && $method === 'GET') { ai_tables(); out(ai_view_out(ai_thread_load($who))); }
    if ($act === 'topic' && $method === 'POST') { ai_tables(); $t = ai_thread_load($who); $t['msgs'] = []; $t['newTopic'] = true; ai_thread_save($who, $t); out(['ok' => true]); }
    if ($act === 'mark' && $method === 'POST') {   // état d'une action affichée (annulée, supprimée…) + note de contexte pour Sindri
        ai_tables(); $t = ai_thread_load($who); $i = (int) ($b['i'] ?? -1); $k = (int) ($b['a'] ?? -1);
        if (isset($t['view'][$i]['actions'][$k]) && in_array($b['state'] ?? '', ['done', 'undone', 'skip'], true)) $t['view'][$i]['actions'][$k]['state'] = $b['state'];
        if (($n = trim((string) ($b['note'] ?? ''))) !== '') { $t['msgs'][] = ['role' => 'user', 'content' => mb_substr($n, 0, 500)]; $t['msgs'][] = ['role' => 'assistant', 'content' => [['type' => 'text', 'text' => "C'est noté."]]]; }
        ai_thread_save($who, $t); out(['ok' => true]);
    }
    if ($act === 'say' && $method === 'POST') {
        ai_tables();
        try { ai_say($who, $role, $b); }
        catch (Throwable $e) { fail($e->getCode() === 429 ? 429 : 502, $e->getMessage()); }
    }
    if ($act === 'memory' && $method === 'GET') { if ($role !== 'admin') fail(403, 'Réservé aux administrateurs'); out(['notes' => ai_memory()]); }
    if ($act === 'memory' && $method === 'POST') {
        if ($role !== 'admin') fail(403, 'Réservé aux administrateurs');
        $id = (string) ($b['delete'] ?? ''); kv_set('ai_memory', json_encode(array_values(array_filter(ai_memory(), fn($m) => $m['id'] !== $id)), JSON_UNESCAPED_UNICODE));
        out(['ok' => true]);
    }
    if ($act === 'chat' && $method === 'POST') {
        try { ai_chat($who, $role, $b['messages'] ?? []); }
        catch (Throwable $e) { fail($e->getCode() === 429 ? 429 : 502, $e->getMessage()); }
    }
    fail(404, 'Route inconnue');
}
