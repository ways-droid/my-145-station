<?php
// Faux API Anthropic (Messages) pour les tests : un tour d'outil puis une réponse qui reprend le résultat.
header('Content-Type: application/json');
$b = json_decode(file_get_contents('php://input'), true) ?: [];
if (($_SERVER['HTTP_X_API_KEY'] ?? '') !== 'sk-ant-test') { http_response_code(401); echo json_encode(['type' => 'error', 'error' => ['type' => 'authentication_error', 'message' => 'invalid x-api-key']]); exit; }
if (($_SERVER['HTTP_ANTHROPIC_VERSION'] ?? '') === '') { http_response_code(400); echo json_encode(['error' => ['message' => 'anthropic-version header is required']]); exit; }
if (getenv('AI_MOCK_LOG')) file_put_contents(getenv('AI_MOCK_LOG'), json_encode($b, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);
$msgs = $b['messages'] ?? []; $last = end($msgs);
// mêmes contrôles que l'API réelle : commence par l'utilisateur, tour à tour, chaque tool_result suit son tool_use
$bad = function ($m) { http_response_code(400); echo json_encode(['type' => 'error', 'error' => ['type' => 'invalid_request_error', 'message' => $m]]); exit; };
if (($msgs[0]['role'] ?? '') !== 'user') $bad('messages: first message must use the "user" role');
foreach ($msgs as $i => $m) {
    if ($i && $msgs[$i - 1]['role'] === $m['role']) $bad("messages.$i: roles must alternate");
    $prevUse = []; if ($i && is_array($msgs[$i - 1]['content'] ?? null)) foreach ($msgs[$i - 1]['content'] as $x) if (($x['type'] ?? '') === 'tool_use') $prevUse[$x['id']] = 1;
    $res = []; if (is_array($m['content'] ?? null)) foreach ($m['content'] as $x) if (($x['type'] ?? '') === 'tool_result') { if (!isset($prevUse[$x['tool_use_id']])) $bad("messages.$i.content.0: unexpected `tool_use_id` found in `tool_result` blocks: {$x['tool_use_id']}"); $res[$x['tool_use_id']] = 1; }
    if ($i && $m['role'] === 'user') foreach ($prevUse as $id => $_) if (!isset($res[$id])) $bad("messages.$i: tool_use ids were found without tool_result blocks: $id");
}
// blocs de réflexion : signature liée à la consigne (comme l'API réelle, liée au début de la conversation)
$sig = md5(json_encode($b['system'] ?? ''));
foreach ($msgs as $i => $m) if (($m['role'] ?? '') === 'assistant' && is_array($m['content'] ?? null)) foreach ($m['content'] as $k => $x)
    if (($x['type'] ?? '') === 'thinking' && ($x['signature'] ?? '') !== $sig) $bad("messages.$i.content.$k: Invalid `signature` in `thinking` block. The block is bound to a different conversation.");
$question = ''; foreach ($msgs as $m) if ($m['role'] === 'user' && is_string($m['content'])) $question = $m['content'];
if (str_contains($question, 'shift handover summary')) { echo json_encode(['id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => $b['model'], 'stop_reason' => 'end_turn', 'usage' => ['input_tokens' => 10, 'output_tokens' => 5],
    'content' => [['type' => 'text', 'text' => "- 9H-ABC : transit done" . (str_contains($question, '9H-ABC') ? ' (data seen)' : '')]]]); exit; }
$nAsk = 0; $seen = false; foreach ($msgs as $m) { if ($m['role'] === 'user' && is_string($m['content'])) { $seen = true; $nAsk = 0; } elseif ($m['role'] === 'assistant') $nAsk++; }
$tu = fn($id, $name, $in) => print(json_encode(['id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => $b['model'], 'stop_reason' => 'tool_use', 'usage' => ['input_tokens' => 10, 'output_tokens' => 5], 'content' => [['type' => 'thinking', 'thinking' => '…', 'signature' => $sig], ['type' => 'tool_use', 'id' => $id, 'name' => $name, 'input' => $in]]]));
// longue recherche : 35 tours d'outils d'affilée (vérifie que le contexte reste valide)
if (str_contains($question, 'Longue') && is_array($last['content'] ?? null) && $nAsk < 35) { $tu('tu_l' . $nAsk . '_' . mt_rand(), 'search_records', ['collection' => 'vehicles']); exit; }
// Dropbox : recherche puis lecture du premier fichier trouvé
if (str_contains($question, 'Dropbox') && is_array($last['content'] ?? null)) {
    $c = $last['content'][0]['content'] ?? '';
    if (is_string($c) && ($r = json_decode($c, true)) && !empty($r['entries'])) { foreach ($r['entries'] as $e) if (!$e['folder']) { $tu('tu_dr', 'dropbox_read', ['path' => $e['path']]); exit; } }
    if (is_array($c)) { $types = array_column($c, 'type'); $text = fn($t) => print(json_encode(['id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => $b['model'], 'stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => $t]], 'usage' => ['input_tokens' => 1, 'output_tokens' => 1]])); $text('Lu : ' . implode(',', $types)); exit; }
}
// suppression confirmée dans la conversation
$say = fn($t) => print(json_encode(['id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => $b['model'], 'stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => $t]], 'usage' => ['input_tokens' => 1, 'output_tokens' => 1]]));
$lastRes = is_array($last['content'] ?? null) ? (string) (is_string($last['content'][0]['content'] ?? null) ? $last['content'][0]['content'] : '') : null;
if (str_contains($question, 'Supprime la panne')) { if ($lastRes !== null) { $say('Proposé : ' . $lastRes); exit; } $tu('tu_pd', 'propose_delete', ['collection' => 'faults', 'id' => 'f-ax', 'summary' => 'test']); exit; }
if (str_contains($question, 'Supprime vite')) {
    if ($lastRes !== null && preg_match('/"token":"([a-f0-9]+)"/', $lastRes, $tk)) { $tu('tu_cd0', 'confirm_delete', ['token' => $tk[1]]); exit; }
    if ($lastRes !== null) { $say('Résultat : ' . $lastRes); exit; }
    $tu('tu_pd2', 'propose_delete', ['collection' => 'faults', 'id' => 'f-ax2', 'summary' => 'test']); exit;
}
if ($question === 'oui' || $question === 'Supprime-la') {
    if ($lastRes !== null) { $say('Fait : ' . $lastRes); exit; }
    preg_match_all('/token ([a-f0-9]{8})/', json_encode($b['system'] ?? '', JSON_UNESCAPED_UNICODE), $tk); $tu('tu_cd', 'confirm_delete', ['token' => end($tk[1]) ?: 'x']); exit;
}
if (str_contains($question, 'Note sindri')) { if ($lastRes !== null) { $say('Créée : ' . $lastRes); exit; } $tu('tu_nc', 'create_record', ['collection' => 'notes', 'data' => ['id' => 'nax', 'title' => 'Idée Sindri', 'body' => 'x', 'team' => true]]); exit; }
if (preg_match('/Roster sindri (\d{4}-\d{2})/', $question, $rm)) { if ($lastRes !== null) { $say('Roster : ' . $lastRes); exit; } $tu('tu_rc', 'create_record', ['collection' => 'roster', 'data' => ['staffId' => 's1', 'month' => $rm[1], 'days' => ['1' => ['c' => 'D/N']]]]); exit; }
if (str_contains($question, 'Dis à Bea')) { if ($lastRes !== null) { $say('Proposé : ' . $lastRes); exit; } $tu('tu_wm', 'propose_whatsapp_message', ['to' => 'bea', 'text' => 'Passe au garage avant 16 h, merci']); exit; }
if (str_contains($question, 'Partage la note')) { if ($lastRes !== null) { $say('Proposé : ' . $lastRes); exit; } preg_match('/note=(\w+)/', $question, $nm); $tu('tu_ns', 'propose_share_note', ['id' => $nm[1] ?? '']); exit; }
if (str_contains($question, 'Joins fichier')) { if ($lastRes !== null) { $say('Joint : ' . $lastRes); exit; } preg_match('/note=(\w+) file=(\w+)/', $question, $jm); $tu('tu_nf', 'add_note_file', ['noteId' => $jm[1] ?? '', 'fileId' => $jm[2] ?? '']); exit; }
if (str_contains($question, 'Montre la note')) { if ($lastRes !== null) { $say('Vu : ' . $lastRes); exit; } $tu('tu_ng', 'get_record', ['collection' => 'notes', 'id' => 'n0']); exit; }
// envoi d'un fichier sur WhatsApp : reprend le dernier fileId vu dans la conversation
if (str_contains($question, 'Envoie-moi')) {
    if (is_array($last['content'] ?? null)) { echo json_encode(['id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => $b['model'], 'stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => 'Envoi : ' . ($last['content'][0]['content'] ?? '')]], 'usage' => ['input_tokens' => 1, 'output_tokens' => 1]]); exit; }
    preg_match_all('/fileId ([a-f0-9]{32})/', json_encode($msgs, JSON_UNESCAPED_UNICODE), $mm); $tu('tu_ws', 'whatsapp_send_file', ['fileId' => end($mm[1]) ?: '', 'caption' => 'Voici']); exit;
}
// question avec fichier joint : propose l'ajout au véhicule veh-t
if (is_array($last['content'] ?? null) && ($last['role'] ?? '') === 'user') {
    $hasDoc = false; $fid = '';
    foreach ($last['content'] as $blk) { if (($blk['type'] ?? '') === 'document') $hasDoc = true; if (($blk['type'] ?? '') === 'text' && preg_match('/fileId ([a-f0-9]+)/', $blk['text'], $mm)) $fid = $mm[1]; }
    if ($hasDoc) { echo json_encode(['id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => $b['model'], 'stop_reason' => 'tool_use', 'usage' => ['input_tokens' => 10, 'output_tokens' => 5],
        'content' => [['type' => 'tool_use', 'id' => 'tu_doc', 'name' => 'add_vehicle_document', 'input' => ['vehicleId' => 'veh-t', 'fileId' => $fid, 'docType' => 'ct', 'issued' => '2026-11-12', 'expires' => '2027-11-12', 'name' => 'Autosécurité']]]]); exit; }
}
$usage = ['input_tokens' => 1000, 'output_tokens' => 200];
$text = fn($t) => print(json_encode(['id' => 'msg_x', 'type' => 'message', 'role' => 'assistant', 'model' => $b['model'], 'stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => $t]], 'usage' => $usage]));
if (is_string($last['content'] ?? null)) {
    $q = $last['content'];
    if (str_contains($q, 'OK')) { $text('OK'); exit; }
    if (str_contains($q, 'Longue')) { $tu('tu_l0', 'search_records', ['collection' => 'vehicles']); exit; }
    if (str_contains($q, 'Dropbox')) { $tu('tu_dx', 'dropbox_search', ['query' => 'Autos']); exit; }
    if (str_contains($q, 'Retiens')) { echo json_encode(['id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => $b['model'], 'stop_reason' => 'tool_use', 'usage' => $usage,
        'content' => [['type' => 'tool_use', 'id' => 'tu_r', 'name' => 'remember', 'input' => ['note' => 'Les transports Airside se facturent avec l article EXP']]]]); exit; }
    if (str_contains($q, 'Crée')) { echo json_encode(['id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => $b['model'], 'stop_reason' => 'tool_use', 'usage' => $usage,
        'content' => [['type' => 'tool_use', 'id' => 'tu_c', 'name' => 'create_record', 'input' => ['collection' => 'clients', 'data' => ['name' => 'Cargo Test', 'code' => 'CT']]]]]); exit; }
    $tool = str_contains($q, 'achat') ? ['name' => 'search_records', 'input' => ['collection' => 'products', 'query' => 'pfsc']]
          : ['name' => 'aggregate', 'input' => ['collection' => 'products', 'sum_field' => 'price', 'group_by' => 'kind']];
    echo json_encode(['id' => 'msg_t', 'type' => 'message', 'role' => 'assistant', 'model' => $b['model'], 'stop_reason' => 'tool_use',
        'content' => [['type' => 'text', 'text' => 'Je regarde.'], ['type' => 'tool_use', 'id' => 'tu_1', 'name' => $tool['name'], 'input' => $tool['input']]], 'usage' => $usage]);
    exit;
}
$res = '';
foreach ((array) $last['content'] as $blk) if (($blk['type'] ?? '') === 'tool_result') $res .= $blk['content'];
$text('Résultat : ' . $res);
