#!/bin/bash
# Test local de l'API avec SQLite (aucune base MySQL nécessaire)
set -e
D=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
cat > $T/config.php <<EOF
<?php return ['dsn'=>'sqlite:$T/t.db','db_user'=>null,'db_pass'=>null,
'api_tokens'=>['0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'],
'upload_dir'=>'$T/up','max_upload_mb'=>5,'collections'=>['clients','vehicles','settings']];
EOF
php -r '$p=new PDO("sqlite:".$argv[2]);$p->exec(file_get_contents($argv[1]));' "$D/schema-sqlite.sql" $T/t.db
cat > $T/router.php <<'EOF'
<?php $u = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$_GET['p'] = preg_replace('#^/api/#', '', $u); require getenv('API_DIR') . '/index.php';
EOF
WAYS_CONFIG=$T/config.php API_DIR="$D/../api" php -S 127.0.0.1:8765 $T/router.php >$T/log 2>&1 &
PID=$!; trap "kill $PID; pkill -f \"php -S 127.0.0.1:8771 $D\" 2>/dev/null; rm -rf $T" EXIT; sleep 1
K='Authorization: Bearer 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
U=http://127.0.0.1:8765/api
c() { echo "> $*"; curl -s "$@"; echo; }
c $U/health
c $U/docs/clients
c -H "$K" -X PUT -d '{"name":"Liège Airport","lang":"FR","address":{"city":"Grâce-Hollogne","zip":"4460"}}' $U/docs/clients/c-001
c -H "$K" -X PATCH -d '{"lang":"EN","address":{"zip":"4460B"}}' $U/docs/clients/c-001
c -H "$K" $U/docs/clients/c-001
c -H "$K" -X PUT -d '{"plate":"1-VXT-482","wid":"012"}' $U/docs/vehicles/v-012
c -H "$K" "$U/changes?since=1&colls=clients,vehicles"
c -H "$K" -X DELETE $U/docs/vehicles/v-012
c -H "$K" "$U/changes?since=3"
c -H "$K" -X POST -d '{"clients":[{"id":"c-002","name":"Air Liquide"}],"settings":{"company":{"name":"Station Test"}}}' $U/import
c -H "$K" -X POST -H 'X-HTTP-Method-Override: PATCH' -d '{"vat":"BE0000000000"}' $U/docs/settings/company
c -H "$K" $U/docs/settings/company
c -H "$K" $U/docs/bottles
c -H "$K" -X PUT -d '{}' "$U/docs/clients/bad%20id"
echo '%PDF-1.4 test' > $T/cert.pdf
R=$(curl -s -H "$K" -F "file=@$T/cert.pdf" $U/files); echo "> upload: $R"
FID=$(echo $R | php -r 'echo json_decode(stream_get_contents(STDIN))->id;')
c -i "$U/files/$FID?token=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" | grep -E "HTTP|Content-Type|PDF"
# migration : un fichier garde son identifiant d'origine (2e envoi = déjà présent)
c -H "$K" -F "id=0123456789abcdef0123456789abcdef" -F "file=@$T/cert.pdf" $U/files
c -H "$K" -F "id=0123456789abcdef0123456789abcdef" -F "file=@$T/cert.pdf" $U/files
c -H "$K" -X PUT -d '{"lat":50.6,"lon":5.4}' $U/docs/vehPos/v-012
c -H "$K" -X POST -d '{"clients":["c-002","inconnu"]}' $U/delete
# --- connexion par code : configuration minimale puis code maître ---
c $U/auth/status
php -r '$p=new PDO("sqlite:".$argv[1]);
$p->exec("CREATE TABLE IF NOT EXISTS ways_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
$p->exec("CREATE TABLE IF NOT EXISTS ways_users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, active INTEGER, created_at INTEGER)");
foreach (["smtp_host"=>"127.0.0.1","smtp_port"=>"1","smtp_user"=>"noreply@example.test","smtp_pass"=>"x","master_hash"=>password_hash("12345678",PASSWORD_DEFAULT)] as $k=>$v) $p->prepare("INSERT INTO ways_kv VALUES (?,?)")->execute([$k,$v]);
$p->exec("INSERT INTO ways_users VALUES (\"u1\",\"Élise Dupont\",\"elise@example.test\",\"admin\",1,0)");' $T/t.db
c $U/auth/status
c -X POST -d '{"name":"elise dupont"}' $U/auth/request
c -X POST -d '{"name":"Inconnu"}' $U/auth/request
c -X POST -d '{"name":"Elise Dupont","code":"00000000"}' $U/auth/verify
# connexion complète : code (e-mail ou maître) puis second facteur (activé à la volée pour admin/bureau) ; secret gardé dans $T/tfa-<nom>
jget() { php -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d[$argv[1]] ?? "";' "$1"; }
login() { local R K2 SEC N; N=$(echo "$1" | tr 'A-Z ' 'a-z_'); R=$(curl -s -X POST -d "{\"name\":\"$1\",\"code\":\"${2:-12345678}\"}" $U/auth/verify)
  if [ -n "$(echo "$R" | jget token)" ]; then echo "$R" | jget token; return; fi
  K2=$(echo "$R" | jget ticket); SEC=$(echo "$R" | jget secret); [ -n "$SEC" ] && echo "$SEC" > $T/tfa-$N; SEC=$(cat $T/tfa-$N 2>/dev/null)
  curl -s -X POST -d "{\"ticket\":\"$K2\",\"code\":\"$(php $D/totp.php $SEC)\"}" $U/auth/2fa | jget token; }
R=$(curl -s -X POST -d '{"name":"elise  DUPONT","code":"1234 5678"}' $U/auth/verify)
echo "> étape 2 : $R" | cut -c1-160
echo "$R" | grep -q '"tfa":"enroll"' && echo "  ok : admin doit activer le second facteur" || { echo "ROLE ECHEC : pas d'activation 2FA"; exit 1; }
no2() { if echo "$2" | grep -q -- "$3"; then echo "ROLE ECHEC : $1 → $2"; exit 1; else echo "  ok : $1"; fi; }
no2 "pas de session avant le second facteur" "$R" '"token"'
SEC=$(echo "$R" | jget secret); TK=$(echo "$R" | jget ticket); echo "$SEC" > $T/tfa-elise_dupont
R2=$(curl -s -X POST -d "{\"ticket\":\"$TK\",\"code\":\"000000\"}" $U/auth/2fa); echo "$R2" | grep -q 'incorrect' && echo "  ok : mauvais code 2FA refusé" || { echo "ROLE ECHEC 2FA faux : $R2"; exit 1; }
R2=$(curl -s -X POST -d "{\"ticket\":\"$TK\",\"code\":\"$(php $D/totp.php $SEC)\"}" $U/auth/2fa)
echo "$R2" | grep -q '"recovery":\[' && echo "  ok : codes de secours donnés à l'activation" || { echo "ROLE ECHEC 2FA : $R2"; exit 1; }
REC=$(echo "$R2" | php -r 'echo json_decode(stream_get_contents(STDIN),true)["recovery"][0];')
S=$(echo "$R2" | jget token)
[ ${#S} -eq 64 ] && echo "> session ok" || { echo "SESSION ECHEC"; exit 1; }
c -H "Authorization: Bearer $S" $U/auth/me
c -H "Authorization: Bearer $S" -X PUT -d '{"name":"Marc Terrain","email":"marc@example.test","role":"terrain"}' $U/auth/users/u2
c -H "Authorization: Bearer $S" $U/auth/users
c -H "Authorization: Bearer $S" $U/docs/clients
# --- droits par rôle (appliqués par le serveur) ---
ok() { if echo "$2" | grep -q -- "$3"; then echo "  ok : $1"; else echo "ROLE ECHEC : $1 → $2"; grep -ai "fatal\|warning" $T/log | tail -3; exit 1; fi; }
no() { if echo "$2" | grep -q -- "$3"; then echo "ROLE ECHEC : $1 → $2"; exit 1; else echo "  ok : $1"; fi; }
curl -s -H "$K" -X PUT -d '{"name":"Azote B50","price":42}' $U/docs/products/p1 >/dev/null
curl -s -H "$K" -X PUT -d '{"name":"PFSC (Transit 767)","kind":"forfait","price":2735}' $U/docs/products/p2 >/dev/null
curl -s -H "$K" -X PUT -d '{"name":"Station Test","vat":"BE0000000000","stationCode":"TLV"}' $U/docs/settings/company >/dev/null
c -H "Authorization: Bearer $S" -X PUT -d '{"name":"Bea Bureau","email":"bea@example.test","role":"bureau"}' $U/auth/users/u3
TT=$(login "marc terrain")
BB=$(login "Bea Bureau")
[ ${#TT} -eq 64 ] && [ ${#BB} -eq 64 ] || { echo "SESSIONS ROLES ECHEC"; exit 1; }
HT="Authorization: Bearer $TT"; B="Authorization: Bearer $BB"
echo "> terrain"
ok "produits invisibles" "$(curl -s -H "$HT" $U/docs/products)" '"docs":\[\]'
ok "clients en lecture seule" "$(curl -s -H "$HT" -X PUT -d '{"name":"X"}' $U/docs/clients/c-009)" 'rôle'
ok "paramètres en lecture seule" "$(curl -s -H "$HT" -X PUT -d '{"name":"Pirate","stationCode":"XXX"}' $U/docs/settings/company)" 'rôle'
R=$(curl -s -H "$K" $U/docs/settings/company); ok "nom conservé" "$R" 'Station Test'; ok "code station conservé" "$R" '"stationCode":"TLV"'
ok "documents administratifs invisibles" "$(curl -s -H "$HT" $U/docs/adminDocs)" '"docs":\[\]'
ok "véhicules modifiables" "$(curl -s -H "$HT" -X PUT -d '{"plate":"1-TER-001"}' $U/docs/vehicles/v-t1)" '"ok":true'
ok "export refusé" "$(curl -s -H "$HT" $U/export)" 'rôle'
ok "import refusé" "$(curl -s -H "$HT" -X POST -d '{"clients":{}}' $U/import)" 'administrateur'
R=$(curl -s -H "$HT" "$U/changes?since=0"); no "changements sans produits" "$R" 'Azote B50'
curl -s -H "$K" -X PUT -d '{"plate":"1-ABC-123","km":180000}' $U/docs/vehicles/v-1 >/dev/null
curl -s -H "$K" -X PUT -d '{"plate":"2-XYZ-999"}' $U/docs/vehicles/v-2 >/dev/null
A="Authorization: Bearer $S"
ok "modules retirés : collection inconnue" "$(curl -s -H "$A" $U/docs/docs)" 'Collection inconnue'
ok "modules retirés : route inconnue" "$(curl -s -H "$A" $U/webfleet/status)" '404\|inconnu\|introuvable\|Not found\|not found'
echo "> dropbox"
ok "adresses Dropbox réelles" "$(cd "$D/../api" && php -r 'function kv_get($k){return null;} require "dropbox.php"; echo dbx_url("oauth2","token")," ",dbx_url("api","files/list_folder")," ",dbx_url("content","files/upload");')" 'https://api.dropboxapi.com/oauth2/token https://api.dropboxapi.com/2/files/list_folder https://content.dropboxapi.com/2/files/upload'
pkill -f "127.0.0.1:8771" || true
(DBX_MOCK_DIR=$T/dbx php -S 127.0.0.1:8771 "$D/dropbox-mock.php" >/dev/null 2>&1 &); sleep 0.5
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["dbx_base_url","http://127.0.0.1:8771"]);' $T/t.db
ok "Dropbox réservé au bureau" "$(curl -s -H "$HT" $U/dropbox/status)" 'bureau'
ok "config Dropbox réservée admin" "$(curl -s -H "$B" -X POST -d '{"appKey":"key123456"}' $U/dropbox/config)" 'administrateurs'
ok "couleur jaune refusée" "$(curl -s -H "$A" -X POST -d '{"color":"yellow"}' $U/dropbox/config)" 'jaune'
R=$(curl -s -H "$A" -X POST -d '{"appKey":"key123456","appSecret":"sec123456","vehPath":"/Station Docs/Vehicles","color":"violet"}' $U/dropbox/config)
ok "config Dropbox enregistrée" "$R" '"appSet":true'; ok "adresse de retour affichée" "$R" 'dropbox\/callback'; no "secret jamais renvoyé" "$R" 'sec123456'
ok "lien d'autorisation" "$(curl -s -H "$A" -X POST -d '{}' $U/dropbox/auth-url)" 'token_access_type=offline'
ST=$(php -r '$p=new PDO("sqlite:".$argv[1]); echo json_decode($p->query("SELECT v FROM ways_kv WHERE k=\"dbx_state\"")->fetchColumn(),true)["state"];' $T/t.db)
ok "retour : state invalide refusé" "$(curl -s "$U/dropbox/callback?code=good&state=faux")" 'expiré ou invalide'
ok "retour : compte relié" "$(curl -s "$U/dropbox/callback?code=good&state=$ST")" 'relié'
R=$(curl -s -H "$B" $U/dropbox/status); ok "statut : connecté" "$R" '"connected":true'; ok "espace d'équipe détecté" "$R" '"team":true'; ok "nom du compte" "$R" 'Station Bureau'
mkdir -p "$T/dbx/Station Docs/Vehicles" "$T/dbx/Privé"
ok "aucun dossier autorisé au départ" "$(curl -s -H "$B" -X POST -d '{"path":"/Privé"}' $U/dropbox/list)" 'non autorisé'
ok "choix des dossiers réservé admin" "$(curl -s -H "$B" -X POST -d '{"master":"12345678"}' $U/dropbox/unlock)" 'administrateurs'
ok "code maître faux refusé" "$(curl -s -H "$A" -X POST -d '{"master":"11112222"}' $U/dropbox/unlock)" 'incorrect'
ok "sans code maître, pas de navigation" "$(curl -s -H "$A" -X POST -d '{"token":"x","path":""}' $U/dropbox/browse)" 'code maître'
TK=$(curl -s -H "$A" -X POST -d '{"master":"12345678"}' $U/dropbox/unlock | php -r 'echo json_decode(stream_get_contents(STDIN),true)["token"]??"";')
ok "navigation complète avec le code maître" "$(curl -s -H "$A" -X POST -d "{\"token\":\"$TK\",\"path\":\"\"}" $U/dropbox/browse)" 'Privé'
R=$(curl -s -H "$A" -X POST -d "{\"token\":\"$TK\",\"paths\":[\"/Station Docs\",\"/Station Docs/Vehicles\"]}" $U/dropbox/folders); ok "dossiers autorisés enregistrés" "$R" '"folders":\["\/Station Docs"\]'
ok "jeton à usage unique" "$(curl -s -H "$A" -X POST -d "{\"token\":\"$TK\",\"paths\":[]}" $U/dropbox/folders)" 'code maître'
R=$(curl -s -H "$B" -X POST -d '{"path":""}' $U/dropbox/list); ok "racine = dossiers autorisés" "$R" 'Station Docs'; no "dossier privé invisible" "$R" 'Privé'
ok "dossier non autorisé refusé" "$(curl -s -H "$B" -X POST -d '{"path":"/Privé"}' $U/dropbox/list)" 'non autorisé'
ok "choix noté dans l'historique" "$(curl -s -H "$A" "$U/log?q=Dropbox")" 'Dossiers Dropbox autorisés'
mkdir -p $T/up; printf '%%PDF-1.4 ct' > $T/up/abc123def
curl -s -H "$K" -X PUT -d '{"plate":"2-JAW-708","fleetNo":"038","model":"Ford Fusion","docs":[{"id":"d1","type":"ct","name":"Autosécurité","issued":"2026-11-12","file":"abc123def","fileName":"ct.pdf","mime":"application/pdf"}]}' $U/docs/vehicles/v-dbx >/dev/null
ok "document en file d'attente" "$(curl -s -H "$B" $U/dropbox/status)" '"queue":1'
ok "copie dans Dropbox" "$(curl -s -H "$B" -X POST -d '{}' $U/dropbox/tick)" '"done":1'
R=$(curl -s -H "$K" $U/docs/vehicles/v-dbx); ok "chemin Dropbox noté" "$R" '"dbx":"\/Station Docs\/Vehicles\/038 - 2-JAW-708 - Ford Fusion\/2026-11-12 - Contr'; ok "dossier du véhicule créé et lié" "$R" 'dropbox.com\/home\/Station%20Docs'
ok "en-tête espace d'équipe" "$(tail -1 $T/dbx-mock-headers.log)" '"root":"111"'
ok "liste du dossier" "$(curl -s -H "$B" -X POST -d '{"path":"/Station Docs/Vehicles/038 - 2-JAW-708 - Ford Fusion"}' $U/dropbox/list)" 'Autos'
php -r '$p=new PDO("sqlite:".$argv[1]); $r=json_decode($p->query("SELECT data FROM ways_docs WHERE coll=\"vehicles\" AND id=\"v-dbx\"")->fetchColumn(),true); $r["docs"][]=["id"=>"d2","type"=>"ct","name"=>"Autosécurité","issued"=>"2027-11-10","expires"=>"2028-11-10","file"=>"abc123def","fileName"=>"ct2.pdf","mime"=>"application/pdf"]; file_put_contents($argv[2], json_encode($r));' $T/t.db $T/vdbx.json
curl -s -H "$K" -X PUT --data-binary @$T/vdbx.json $U/docs/vehicles/v-dbx >/dev/null
curl -s -H "$B" -X POST -d '{}' $U/dropbox/tick >/dev/null
R=$(curl -s -H "$K" $U/docs/vehicles/v-dbx); ok "CT remplacé : l'ancien passe dans Expired" "$R" 'Ford Fusion\/Expired\/2026-11-12'; ok "nouveau CT copié" "$R" 'Ford Fusion\/2027-11-10'
mkdir -p "$T/dbx/Station Docs/Scans"
ok "suivi : dossier non autorisé refusé" "$(curl -s -H "$B" -X POST -d '{"path":"/Privé","on":true}' $U/dropbox/watch)" 'non autorisé'
ok "suivi activé par le bureau" "$(curl -s -H "$B" -X POST -d '{"path":"/Station Docs/Scans","on":true}' $U/dropbox/watch)" '"path":"\/Station Docs\/Scans"'
printf 'scan' > "$T/dbx/Station Docs/Scans/CT 1-ABC-123.pdf"
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["dbx_watch_at","0"]);' $T/t.db
ok "nouveau fichier détecté" "$(curl -s -H "$B" -X POST -d '{}' $U/dropbox/tick)" '"found":1'
ok "compteur par personne" "$(curl -s -H "$A" $U/dropbox/status)" '"newCount":1'
R=$(curl -s -H "$B" $U/dropbox/new); ok "événement proposé" "$R" 'CT 1-ABC-123.pdf'
curl -s -H "$B" -X POST -d '{"upTo":1}' $U/dropbox/new-ack >/dev/null
ok "vu par la personne" "$(curl -s -H "$B" $U/dropbox/status)" '"newCount":0'; ok "toujours proposé aux autres" "$(curl -s -H "$A" $U/dropbox/status)" '"newCount":1'
ok "suivi arrêté" "$(curl -s -H "$B" -X POST -d '{"path":"/Station Docs/Scans","on":false}' $U/dropbox/watch)" '"watch":\[\]'
ok "recherche Dropbox" "$(curl -s -H "$B" -X POST -d '{"query":"Autos"}' $U/dropbox/search)" '"folder":false'
ok "lien temporaire" "$(curl -s -H "$B" -X POST -d '{"path":"/Station Docs/Vehicles/038 - 2-JAW-708 - Ford Fusion/Expired/2026-11-12 - Contrôle technique - Autosécurité.pdf"}' $U/dropbox/link)" 'dropboxusercontent'
pkill -f "127.0.0.1:8766" || true
echo "> bureau"
ok "articles complets" "$(curl -s -H "$B" $U/docs/products)" 'Azote'
curl -s -H "$B" -X PUT -d '{"name":"Pirate","vat":"X","stationCode":"TLV","stationName":"Tel Aviv"}' $U/docs/settings/company >/dev/null
R=$(curl -s -H "$K" $U/docs/settings/company); ok "coordonnées entreprise conservées" "$R" 'Station Test'; ok "réglages station modifiables" "$R" '"stationName":"Tel Aviv"'
ok "pas de gestion des utilisateurs" "$(curl -s -H "$B" $U/auth/users)" 'dministrateur'
echo "> assistant IA"
pkill -f "127.0.0.1:8770" || true
pkill -f "127.0.0.1:8771" || true
echo "> historique"
curl -s -H "$B" -X PUT -d '{"name":"Client H-1","code":"HH"}' $U/docs/clients/h-1 >/dev/null
curl -s -H "$B" -X PATCH -d '{"code":"HX"}' $U/docs/clients/h-1 >/dev/null
curl -s -H "$B" -X POST -d '{"coll":"clients","id":"h-1","action":"mail","to":"client@example.test"}' $U/log/event >/dev/null
curl -s -H "$B" -X DELETE $U/docs/clients/h-1 >/dev/null
R=$(curl -s -H "$A" "$U/log?coll=clients&id=h-1")
ok "création notée" "$R" '"action":"create"'; ok "modification notée" "$R" '"code","HH","HX"'
ok "e-mail préparé noté" "$R" '"action":"mail"'; ok "suppression notée" "$R" '"action":"delete"'; ok "libellé" "$R" 'Client H-1'
ok "auteur noté" "$R" '"by":"Bea Bureau"'
ok "historique interdit au terrain" "$(curl -s -H "$HT" $U/log)" 'réservé'
R=$(curl -s -H "$B" "$U/log?limit=300"); ok "vue générale" "$R" '"items"'
ok "connexion notée" "$(curl -s -H "$A" "$U/log?coll=auth")" '"action":"login"'
ok "personnes" "$(curl -s -H "$B" $U/log/people)" 'Bea Bureau'
curl -s -H "$B" -X PUT -d '{"vehicleId":"veh-h","type":"Entretien"}' $U/docs/vehEvents/ev-h >/dev/null
ok "intervention dans l'historique du véhicule" "$(curl -s -H "$B" "$U/log?coll=vehicles&id=veh-h&related=1")" '"coll":"vehEvents"'
ok "session dans le profil" "$(curl -s -H "Authorization: Bearer $S" $U/auth/me)" '"expires"'
curl -s -H "$K" -X PUT -d '{"name":"Main 1"}' $U/docs/clients/c-m1 >/dev/null
curl -s -H "$K" -X PUT -d '{"name":"Main 2"}' $U/docs/clients/c-m2 >/dev/null
echo "> environnement de test"
ok "test inactif" "$(curl -s -H "$B" $U/sandbox)" '"active":false'
ok "test refusé au terrain" "$(curl -s -H "$HT" -X POST -d '{}' $U/sandbox/start)" 'bureau'
ok "test activé" "$(curl -s -H "$B" -X POST -d '{}' $U/sandbox/start)" '"active":true'
ok "profil en test" "$(curl -s -H "$B" $U/auth/me)" '"sandbox":{'
curl -s -H "$B" -X PUT -d '{"name":"SBX-1"}' $U/docs/clients/sbx-1 >/dev/null
curl -s -H "$B" -X PATCH -d '{"name":"26/164-TEST"}' $U/docs/clients/c-m1 >/dev/null
curl -s -H "$B" -X DELETE $U/docs/clients/c-m2 >/dev/null
R=$(curl -s -H "$B" $U/docs/clients); ok "création visible en test" "$R" 'SBX-1'; ok "modification visible en test" "$R" '26/164-TEST'; no "suppression visible en test" "$R" '"id":"c-m2"'
R=$(curl -s -H "$A" $U/docs/clients); no "base principale sans création" "$R" 'SBX-1'; no "base principale non modifiée" "$R" '26/164-TEST'; ok "base principale sans suppression" "$R" '"id":"c-m2"'
ok "fiche lue dans le test" "$(curl -s -H "$B" $U/docs/clients/c-m1)" '26/164-TEST'
ok "changements du test" "$(curl -s -H "$B" "$U/changes?since=0&colls=clients")" 'SBX-1'
no "changements principaux propres" "$(curl -s -H "$A" "$U/changes?since=0&colls=clients")" 'SBX-1'
no "pas d'historique pour le test" "$(curl -s -H "$A" "$U/log?coll=clients&id=sbx-1")" 'SBX-1'
ok "nombre de changements" "$(curl -s -H "$B" $U/sandbox)" '"changes":3'
ok "test quitté" "$(curl -s -H "$B" -X POST -d '{}' $U/sandbox/stop)" '"active":false'
R=$(curl -s -H "$B" $U/docs/clients); no "création effacée" "$R" 'SBX-1'; no "modification effacée" "$R" '26/164-TEST'; ok "suppression annulée" "$R" '"id":"c-m2"'
(AI_MOCK_LOG=$T/ai.log php -S 127.0.0.1:8770 "$D/anthropic-mock.php" >/dev/null 2>&1 &); sleep 0.5
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["ai_base","http://127.0.0.1:8770"]);' $T/t.db
ok "réservé au bureau" "$(curl -s -H "$HT" $U/assistant/status)" 'réservé au bureau'
ok "non configuré" "$(curl -s -H "$B" -X POST -d '{"messages":[{"role":"user","content":"Bonjour"}]}' $U/assistant/chat)" 'pas encore configuré'
ok "réglage admin seulement" "$(curl -s -H "$B" -X POST -d '{"key":"sk-ant-test"}' $U/assistant/config)" 'administrateurs'
curl -s -H "$A" -X POST -d '{"key":"sk-ant-bad"}' $U/assistant/config >/dev/null
ok "mauvaise clé" "$(curl -s -H "$A" -X POST -d '{}' $U/assistant/test)" 'clé API'
curl -s -H "$A" -X POST -d '{"key":"sk-ant-test","model":"claude-haiku-5-5","cap":5}' $U/assistant/config >/dev/null
ok "test connexion" "$(curl -s -H "$A" -X POST -d '{}' $U/assistant/test)" '"ok":true'
R=$(curl -s -H "$B" $U/assistant/status); ok "état" "$R" '"configured":true'; ok "modèle choisi" "$R" 'claude-haiku-5-5'; no "clé jamais renvoyée" "$R" 'sk-ant-test'
R=$(curl -s -H "$B" -X POST -d '{"messages":[{"role":"user","content":"Total des factures par client ?"}]}' $U/assistant/chat)
ok "réponse avec outil" "$R" 'Résultat'; ok "agrégat calculé" "$R" 'groups'; ok "conversation renvoyée" "$R" '"tool_use_id":"tu_1"'
ok "système envoyé avec cache" "$(tail -1 $T/ai.log)" '"cache_control"'
R=$(curl -s -H "$B" -X POST -d '{"messages":[{"role":"user","content":"Un article achat PFSC ?"}]}' $U/assistant/chat); ok "articles consultables" "$R" 'PFSC'
curl -s -H "$B" -X PUT -d '{"plate":"1-ABC-123","fleetNo":"042","docs":[]}' $U/docs/vehicles/veh-t >/dev/null
printf '%%PDF-1.4 controle technique 1-ABC-123' > $T/ct.pdf
FID=$(curl -s -H "$B" -F "file=@$T/ct.pdf;type=application/pdf" $U/files | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["id"] ?? "";')
R=$(curl -s -H "$B" -X POST -d "{\"messages\":[{\"role\":\"user\",\"content\":\"\",\"files\":[{\"id\":\"$FID\",\"name\":\"ct.pdf\"}]}]}" $U/assistant/chat)
ok "fichier rangé par Axel" "$R" '"op":"update"'; ok "véhicule modifié" "$R" '"id":"veh-t"'
R2=$(curl -s -H "$K" $U/docs/vehicles/veh-t); ok "document ajouté au véhicule" "$R2" "\"file\":\"$FID\""; ok "échéance CT mise à jour" "$R2" '"ctDate":"2027-11-12"'
no "contenu du fichier pas renvoyé" "$R" '"base64"'; ok "fichier gardé dans la conversation" "$R" '"name":"ct.pdf"'
ok "document envoyé à Claude" "$(grep -c '"type":"document"' $T/ai.log)" '[12]'
R=$(curl -s -H "$B" -X POST -d '{"messages":[{"role":"user","content":"Crée une facture"}]}' $U/assistant/chat)
ok "fiche créée par Axel" "$R" '"op":"create"'; ok "client créé" "$R" 'Cargo Test'
ok "historique au nom d'Axel" "$(curl -s -H "$A" "$U/log?q=Axel")" 'Axel (pour Bea Bureau)'
R=$(curl -s -H "$B" -X POST -d '{"text":"Total des factures ?"}' $U/assistant/say); ok "fil : réponse enregistrée" "$R" '"role":"bot"'; ok "fil : sujet créé" "$R" '"title":"Total des factures ?"'
ok "fil retrouvé (autre appareil)" "$(curl -s -H "$B" $U/assistant/thread)" 'Total des factures ?'
no "fil privé" "$(curl -s -H "$A" $U/assistant/thread)" 'Total des factures ?'
curl -s -H "$B" -X POST -d '{}' $U/assistant/topic >/dev/null
R=$(curl -s -H "$B" -X POST -d '{"text":"Retiens : EXP pour Airside"}' $U/assistant/say); ok "nouveau sujet" "$R" '"title":"Retiens : EXP pour Airside"'
ok "Axel apprend" "$(curl -s -H "$A" $U/assistant/memory)" 'Airside'
curl -s -H "$A" -X POST -d '{"text":"Bonjour"}' $U/assistant/say >/dev/null
ok "appris partagé avec l'équipe" "$(tail -1 $T/ai.log)" "EXP"
ok "mémoire réservée aux admins" "$(curl -s -H "$B" $U/assistant/memory)" 'administrateurs'
R=$(curl -s -H "$B" -X POST -d '{"text":"Longue recherche"}' $U/assistant/say)
while echo "$R" | grep -q '"more":true'; do R=$(curl -s -H "$B" -X POST -d '{"resume":true}' $U/assistant/say); done
ok "longue recherche : pas d'erreur de contexte" "$R" 'Recherche interrompue'; no "longue recherche : contexte valide" "$R" 'tool_use_id'
R=$(curl -s -H "$B" -X POST -d '{"text":"Total après la longue recherche ?"}' $U/assistant/say); ok "question suivante : contexte valide" "$R" 'Résultat'; no "question suivante : pas d'erreur" "$R" '"err":true'
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["dbx_base_url","http://127.0.0.1:8771"]);' $T/t.db
(DBX_MOCK_DIR=$T/dbx php -S 127.0.0.1:8771 "$D/dropbox-mock.php" >/dev/null 2>&1 &); sleep 0.5
curl -s -H "$K" -X PUT -d '{"vehicleId":"v-1","description":"Bruit","status":"ouverte","date":"2026-11-01"}' $U/docs/faults/f-ax >/dev/null
curl -s -H "$K" -X PUT -d '{"vehicleId":"v-1","description":"Voyant","status":"ouverte","date":"2026-11-01"}' $U/docs/faults/f-ax2 >/dev/null
R=$(curl -s -H "$B" -X POST -d '{"text":"Supprime la panne Bruit"}' $U/assistant/say); ok "Axel propose et demande confirmation" "$R" 'Rien n.est supprim'; ok "Axel signale la panne non réparée" "$R" 'pas été réparée'
ok "rien supprimé avant la réponse" "$(curl -s -H "$K" $U/docs/faults/f-ax)" 'Bruit'
R=$(curl -s -H "$B" -X POST -d '{"text":"oui"}' $U/assistant/say); ok "après « oui » : supprimée" "$R" 'Fait : .*deleted'; ok "carte de proposition passée à Supprimé" "$R" '"op":"delete"[^}]*"state":"done"'
ok "panne supprimée" "$(curl -s -o /dev/null -w '%{http_code}' -H "$K" $U/docs/faults/f-ax)" '404'
R=$(curl -s -H "$B" -X POST -d '{"text":"Supprime vite la panne Voyant"}' $U/assistant/say); ok "confirmation dans la même réponse refusée" "$R" 'pas encore répondu'
ok "panne gardée" "$(curl -s -H "$K" $U/docs/faults/f-ax2)" 'Voyant'
R=$(curl -s -H "$B" -X POST -d '{"text":"Supprime-la"}' $U/assistant/say); ok "nouvelle demande ≠ confirmation" "$R" 'pas un « oui »'
ok "panne toujours gardée" "$(curl -s -H "$K" $U/docs/faults/f-ax2)" 'Voyant'
R=$(curl -s -H "$B" -X POST -d '{"text":"oui"}' $U/assistant/say); ok "« oui » explicite : supprimée" "$R" 'Fait : .*deleted'
R=$(curl -s -H "$B" -X POST -d '{"text":"Note axel"}' $U/assistant/say); ok "Axel crée une note personnelle (jamais d'équipe d'office)" "$R" 'propose_share_note'
NAX=$(echo "$R" | grep -o '\\"id\\":\\"ax[0-9a-f]*' | head -1 | grep -o 'ax[0-9a-f]*')
ok "note d'Axel : personnelle de Bea" "$(curl -s -H "$B" $U/docs/notes/$NAX)" '"team":false'; ok "note d'Axel : auteur Bea" "$(curl -s -H "$B" $U/docs/notes/$NAX)" '"owner":"u3"'
R=$(curl -s -H "$B" -X POST -d '{"text":"Partage la note='$NAX'"}' $U/assistant/say); ok "partage proposé, rien changé" "$R" 'Rien n.est chang'
ok "toujours personnelle avant le oui" "$(curl -s -H "$B" $U/docs/notes/$NAX)" '"team":false'
R=$(curl -s -H "$B" -X POST -d '{"text":"oui"}' $U/assistant/say); ok "après « oui » : note d'équipe" "$(curl -s -H "$A" $U/docs/notes/$NAX)" '"team":true'
R=$(curl -s -H "$B" -X POST -d '{"text":"Joins fichier note='$NAX' file='$FID'"}' $U/assistant/say); ok "Axel joint un fichier à une note" "$R" 'Joint : .*ok'
ok "pièce jointe dans la note" "$(curl -s -H "$B" $U/docs/notes/$NAX)" '"files":\[{"id":"'$FID'"'
curl -s -H "$B" -X PUT -d '{"title":"Perso Bea","body":"secret"}' $U/docs/notes/n0 >/dev/null
R=$(curl -s -H "$A" -X POST -d '{"text":"Montre la note"}' $U/assistant/say); ok "Axel ne voit pas la note personnelle d'un autre" "$R" 'Vu : .*Introuvable'
R=$(curl -s -H "$B" -X POST -d '{"text":"Cherche le CT dans Dropbox"}' $U/assistant/say); ok "Axel lit un PDF Dropbox" "$R" 'Lu : text,document'
no "fichier lu non gardé dans le fil" "$(php -r '$p=new PDO("sqlite:".$argv[1]); echo $p->query("SELECT data FROM ways_ai_thread")->fetchAll(PDO::FETCH_COLUMN) ? implode("", $p->query("SELECT data FROM ways_ai_thread")->fetchAll(PDO::FETCH_COLUMN)) : "";' $T/t.db)" 'JVBERi0'
ok "consommation suivie" "$(curl -s -H "$B" $U/assistant/status)" '"questions":20'
echo "> notes"
curl -s -H "$B" -X PUT -d '{"title":"Code portail","body":"1234","owner":"autre"}' $U/docs/notes/n1 >/dev/null
ok "note personnelle : auteur imposé" "$(curl -s -H "$B" $U/docs/notes/n1)" '"owner":"u3"'
no "note personnelle invisible des autres (liste)" "$(curl -s -H "$A" $U/docs/notes)" 'Code portail'
ok "note personnelle invisible des autres (fiche)" "$(curl -s -o /dev/null -w '%{http_code}' -H "$A" $U/docs/notes/n1)" '404'
ok "note personnelle non modifiable par un autre" "$(curl -s -H "$A" -X PUT -d '{"title":"x"}' $U/docs/notes/n1)" 'quelqu.un d.autre'
ok "sauvegarde (clé d'API) : toutes les notes" "$(curl -s -H "$K" $U/docs/notes)" 'Code portail'
curl -s -H "$B" -X PATCH -d '{"team":true}' $U/docs/notes/n1 >/dev/null
ok "note d'équipe visible de tous" "$(curl -s -H "$A" $U/docs/notes)" 'Code portail'
ok "note d'équipe : seul l'auteur la rend personnelle" "$(curl -s -H "$A" -X PATCH -d '{"team":false}' $U/docs/notes/n1)" 'Seul son auteur'
REVN=$(curl -s -H "$A" "$U/changes?since=0&colls=notes" | php -r 'echo json_decode(stream_get_contents(STDIN))->rev;')
curl -s -H "$B" -X PATCH -d '{"team":false}' $U/docs/notes/n1 >/dev/null
ok "redevenue personnelle : retirée chez les autres" "$(curl -s -H "$A" "$U/changes?since=$REVN&colls=notes")" '"id":"n1"[^}]*"deleted":true'
no "historique : contenu d'une note personnelle jamais montré" "$(curl -s -H "$A" "$U/log?coll=notes")" '1234'
echo "> préférences personnelles"
ok "préférences : les siennes" "$(curl -s -H "$B" -X PUT -d '{"dash":[{"id":"faults"}]}' $U/docs/userPrefs/p-u3)" '"ok":true'
ok "préférences : pas celles d'un autre" "$(curl -s -H "$A" -X PUT -d '{"dash":[]}' $U/docs/userPrefs/p-u3)" 'autre utilisateur'
no "préférences : invisibles des autres" "$(curl -s -H "$A" $U/docs/userPrefs)" 'faults'
ok "préférences : visibles de soi" "$(curl -s -H "$B" $U/docs/userPrefs)" 'faults'
echo "> whatsapp"
(META_MOCK_LOG=$T/meta.log php -S 127.0.0.1:8772 "$D/meta-mock.php" >/dev/null 2>&1 &); sleep 0.5
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["wa_base_url","http://127.0.0.1:8772"]);' $T/t.db
ok "WhatsApp réservé aux admins" "$(curl -s -H "$B" $U/whatsapp/status)" 'administrateurs'
R=$(curl -s -H "$A" $U/whatsapp/status); ok "adresse du webhook" "$R" 'whatsapp\/webhook'; ok "jeton de vérification créé" "$R" '"verify":"[0-9a-f]\{24\}"'
VT=$(echo "$R" | php -r 'echo json_decode(stream_get_contents(STDIN),true)["verify"];')
R=$(curl -s -H "$A" -X POST -d '{"token":"EAAtest","phoneId":"123","wabaId":"456","secret":"apps3cret"}' $U/whatsapp/config); ok "WhatsApp configuré" "$R" '"configured":true'; no "jeton jamais renvoyé" "$R" 'EAAtest'; no "secret jamais renvoyé" "$R" 'apps3cret'
ok "test du numéro" "$(curl -s -H "$A" -X POST -d '{}' $U/whatsapp/test)" '+32 470 99 88 77'
ok "enregistrement avec PIN" "$(curl -s -H "$A" -X POST -d '{}' $U/whatsapp/register)" '"registered":true'; ok "PIN à 6 chiffres envoyé" "$(cat $T/meta.log)" '"pin":"[0-9]\{6\}"'
ok "webhook : mauvais jeton refusé" "$(curl -s "$U/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=faux&hub.challenge=42")" 'forbidden'
ok "webhook : vérification Meta" "$(curl -s "$U/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=$VT&hub.challenge=4242")" '^4242$'
wa() { local body="$1"; local sig=$(printf '%s' "$body" | openssl dgst -sha256 -hmac apps3cret | sed 's/^.* //'); curl -s -X POST -H "X-Hub-Signature-256: sha256=$sig" -H 'Content-Type: application/json' --data-binary "$body" $U/whatsapp/webhook; }
wamsg() { echo '{"object":"whatsapp_business_account","entry":[{"id":"456","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"123"},"contacts":[{"wa_id":"'$1'","profile":{"name":"Test"}}],"messages":[{"from":"'$1'","id":"'$2'","timestamp":"1","type":"text","text":{"body":"'$3'"}}]}}]}]}'; }
ok "webhook : signature fausse refusée" "$(curl -s -X POST -H 'X-Hub-Signature-256: sha256=00' -d '{}' $U/webhook 2>/dev/null; curl -s -X POST -H 'X-Hub-Signature-256: sha256=00' -d '{}' $U/whatsapp/webhook)" 'bad signature'
: > $T/meta.log
ok "webhook accepté" "$(wa "$(wamsg 32499000111 wamid.U1 'Bonjour, prix ?')")" '"ok":true'; sleep 1
ok "inconnu : réponse automatique" "$(cat $T/meta.log)" 'réservé à l.équipe'; ok "inconnu : réponse au bon numéro" "$(cat $T/meta.log)" '"to":"32499000111"'
wa "$(wamsg 32499000111 wamid.U2 'Encore moi')" >/dev/null; sleep 1
ok "inconnu : une seule réponse par semaine" "$(grep -c 'réservé' $T/meta.log)" '^1$'
ok "inconnus visibles par l'admin" "$(curl -s -H "$A" $U/whatsapp/status)" 'Encore moi'
: > $T/meta.log
curl -s -H "$A" -X POST -d '{"contacts":[{"num":"0475 12 34 56","kind":"user","ref":"u3","name":"Bea Bureau"}]}' $U/whatsapp/contacts >/dev/null
ok "numéro de l'équipe normalisé" "$(curl -s -H "$A" $U/whatsapp/status)" '"num":"32475123456"'
: > $T/meta.log
wa "$(wamsg 32475123456 wamid.D1 'Combien de véhicules ?')" >/dev/null; sleep 2
R=$(cat $T/meta.log); ok "membre reconnu par son GSM : Axel répond" "$R" '"to":"32475123456"'; ok "« en train d'écrire »" "$R" 'typing_indicator'; no "pas de réponse « inconnu » au membre" "$R" 'réservé'
: > $T/meta.log
wa "$(wamsg 32475123456 wamid.D1 'Combien de véhicules ?')" >/dev/null; sleep 1
ok "message en double ignoré" "$(cat $T/meta.log | wc -l | tr -d ' ')" '^0$'
IMG='{"object":"whatsapp_business_account","entry":[{"id":"456","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"123"},"contacts":[{"wa_id":"32475123456","profile":{"name":"Bea"}}],"messages":[{"from":"32475123456","id":"wamid.B1","timestamp":"1","type":"image","image":{"id":"media-1","mime_type":"image/jpeg","caption":"Carte verte"}}]}}]}]}'
wa "$IMG" >/dev/null; sleep 2
ok "photo reçue et gardée dans l'ERP" "$(php -r '$p=new PDO("sqlite:".$argv[1]); echo $p->query("SELECT created_by FROM ways_files WHERE created_by=\"WhatsApp\"")->fetchColumn();' $T/t.db)" 'WhatsApp'
ok "même fil que dans l'ERP pour Bea" "$(curl -s -H "$B" $U/assistant/thread)" 'Carte verte'
ok "réponse envoyée à Bea" "$(cat $T/meta.log)" '"to":"32475123456"'
VO='{"object":"whatsapp_business_account","entry":[{"id":"456","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"123"},"messages":[{"from":"32475123456","id":"wamid.B2","timestamp":"1","type":"audio","audio":{"id":"media-2"}}]}}]}]}'
wa "$VO" >/dev/null; sleep 1; ok "message vocal : explication" "$(tail -1 $T/meta.log)" 'vocaux'
: > $T/meta.log
R=$(curl -s -H "$B" -X POST -d '{"text":"Envoie-moi la photo"}' $U/assistant/say); ok "Axel envoie un fichier sur WhatsApp" "$R" 'Envoi : .*\\"ok\\":true'
ok "fichier téléversé chez Meta" "$(cat $T/meta.log)" 'upload":"image'; ok "fichier envoyé à Bea seulement" "$(cat $T/meta.log)" '"to":"32475123456","type":"image"'
R=$(curl -s -H "$A" -X POST -d '{"text":"Envoie-moi la photo"}' $U/assistant/say); ok "sans numéro WhatsApp : explication" "$R" 'ne connais pas ton num'
php -r '$p=new PDO("sqlite:".$argv[1]); $p->exec("UPDATE ways_kv SET v=\"1\" WHERE k=\"wa_in:32475123456\"");' $T/t.db
R=$(curl -s -H "$B" -X POST -d '{"text":"Envoie-moi encore la photo"}' $U/assistant/say); ok "après 24 h : explication" "$R" '24 h'
# message à un collègue (demandé à Axel) : confirmation, fenêtre de 24 h, modèle
R=$(curl -s -H "$A" -X POST -d '{"text":"Dis à Bea de passer au garage"}' $U/assistant/say); ok "hors 24 h sans modèle : explication" "$R" 'doit cr'
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["wa_in:32475123456",(string)time()]);' $T/t.db
: > $T/meta.log
R=$(curl -s -H "$A" -X POST -d '{"text":"Dis à Bea de passer au garage"}' $U/assistant/say); ok "message préparé, rien envoyé" "$R" 'Rien n.est envoy'; no "rien parti avant le oui" "$(cat $T/meta.log)" 'Passe au garage'
R=$(curl -s -H "$A" -X POST -d '{"text":"oui"}' $U/assistant/say); ok "envoyé après oui" "$R" 'Message WhatsApp envoy'
ok "texte signé de l'expéditeur, au bon numéro" "$(cat $T/meta.log)" '"to":"32475123456","type":"text","text":{"preview_url":false,"body":"💬 \*Message de .*lise Dupont\* (via Axel) :'
ok "contexte gardé pour la réponse de Bea" "$(php -r '$p=new PDO("sqlite:".$argv[1]); echo $p->query("SELECT v FROM ways_kv WHERE k=\"wa_relay:32475123456\"")->fetchColumn();' $T/t.db)" 'Passe au garage'
R=$(curl -s -H "$A" -X POST -d '{"create":1}' $U/whatsapp/template); ok "modèle créé chez Meta" "$(cat $T/meta.log)" '"category":"UTILITY"'
R=$(curl -s -H "$A" -X POST -d '{}' $U/whatsapp/template); ok "modèle approuvé" "$R" '"status":"APPROVED"'
php -r '$p=new PDO("sqlite:".$argv[1]); $p->exec("UPDATE ways_kv SET v=\"1\" WHERE k=\"wa_in:32475123456\"");' $T/t.db
: > $T/meta.log
curl -s -H "$A" -X POST -d '{"text":"Dis à Bea de passer au garage"}' $U/assistant/say >/dev/null
R=$(curl -s -H "$A" -X POST -d '{"text":"oui"}' $U/assistant/say); ok "hors 24 h : envoyé par le modèle" "$R" 'par le mod'
ok "modèle avec nom et texte" "$(cat $T/meta.log)" '"type":"template","template":{"name":"message_equipe"'
pkill -f "127.0.0.1:8772" || true
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["ai_usage_".gmdate("Y-m"),json_encode(["in"=>0,"out"=>0,"usd"=>9,"q"=>3])]);' $T/t.db
ok "plafond mensuel" "$(curl -s -H "$B" -X POST -d '{"messages":[{"role":"user","content":"Encore ?"}]}' $U/assistant/chat)" 'Plafond mensuel'
pkill -f "127.0.0.1:8770" || true
echo "> liens"
ok "lien entre fiches" "$(curl -s -H "$B" -X PUT -d '{"a":{"coll":"vehicles","id":"v1"},"b":{"coll":"clients","id":"c-001"}}' $U/docs/links/lk-1)" '"ok":true'
echo "> sécurité de la connexion"
ok "état du second facteur" "$(curl -s -H "$A" $U/auth/tfa)" '"on":true'
ok "terrain : second facteur facultatif" "$(curl -s -H "$HT" $U/auth/tfa)" '"required":false'
R=$(curl -s -X POST -d '{"name":"Elise Dupont","code":"12345678"}' $U/auth/verify); ok "code maître : second facteur demandé" "$R" '"tfa":"verify"'; no "code maître : pas de session directe" "$R" '"token"'
TK=$(echo "$R" | jget ticket)
R=$(curl -s -X POST -d "{\"ticket\":\"$TK\",\"code\":\"$REC\"}" $U/auth/2fa); ok "connexion avec un code de secours" "$R" '"token"'
R=$(curl -s -X POST -d '{"name":"Elise Dupont","code":"12345678"}' $U/auth/verify); TK=$(echo "$R" | jget ticket)
ok "code de secours à usage unique" "$(curl -s -X POST -d "{\"ticket\":\"$TK\",\"code\":\"$REC\"}" $U/auth/2fa)" 'incorrect'
ok "réinitialisation du second facteur (admin)" "$(curl -s -H "$A" -X POST $U/auth/users/u3/tfa-reset)" '"ok":true'
ok "sessions fermées à la réinitialisation" "$(curl -s -H "$B" $U/auth/me)" 'Non autorisé'
R=$(curl -s -X POST -d '{"name":"Bea Bureau","code":"12345678"}' $U/auth/verify); ok "réactivation demandée" "$R" '"tfa":"enroll"'
ok "second facteur à réactiver" "$(curl -s -H "$A" $U/auth/users)" '"name":"Bea Bureau","email":"bea@example.test","role":"bureau","active":true,"tfa":false'
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["master_fail","[]"]); $p->prepare("DELETE FROM ways_kv WHERE k LIKE ?")->execute(["ipfail:%"]);' $T/t.db
for i in 1 2 3 4 5; do curl -s -X POST -d '{"name":"Elise Dupont","code":"99999999"}' $U/auth/verify >/dev/null; done
ok "code maître bloqué après 5 échecs" "$(curl -s -X POST -d '{"name":"Elise Dupont","code":"12345678"}' $U/auth/verify)" 'incorrect'
ok "alerte de blocage enregistrée" "$(php -r '$p=new PDO("sqlite:".$argv[1]); echo $p->query("SELECT v FROM ways_kv WHERE k=\"master_lock\"")->fetch()[0];' $T/t.db)" '[0-9]'
for i in 1 2 3 4; do curl -s -X POST -d '{"name":"Elise Dupont","code":"99999999"}' $U/auth/verify >/dev/null; done
ok "limite par adresse IP" "$(curl -s -X POST -d '{"name":"Elise Dupont","code":"99999999"}' $U/auth/verify)" 'Trop d'
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["tfa_epoch",(string)(round(microtime(true)*1000)+60000)]);' $T/t.db
ok "anciennes sessions admin fermées" "$(curl -s -H "$A" $U/auth/me)" 'Non autorisé'
ok "session terrain conservée" "$(curl -s -H "$HT" $U/auth/me)" '"role":"terrain"'
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["tfa_epoch","1"]);' $T/t.db
c -H "Authorization: Bearer $S" -X PUT -d '{"role":"bureau"}' $U/auth/users/u1
c -H "Authorization: Bearer $S" -X POST $U/auth/logout
c -H "Authorization: Bearer $S" $U/auth/me
c -H "$K" $U/export
