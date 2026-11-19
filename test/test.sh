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
c -H "$K" -X POST -d '{"clients":[{"id":"c-002","name":"Air Liquide"}],"settings":{"company":{"name":"W.A.Y.S. SRL"}}}' $U/import
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
curl -s -H "$K" -X PUT -d '{"kind":"facture","number":"F-2026-001","status":"emis","clientId":"c-001","lines":[{"label":"Azote","qty":2,"price":55}]}' $U/docs/docs/d1 >/dev/null
curl -s -H "$K" -X PUT -d '{"name":"Azote B50","price":42}' $U/docs/products/p1 >/dev/null
curl -s -H "$K" -X PUT -d '{"name":"W.A.Y.S. SRL","vat":"BE0000000000","bankBalance":12345,"gasLocations":[{"id":"L1","name":"Dépôt"}]}' $U/docs/settings/company >/dev/null
c -H "Authorization: Bearer $S" -X PUT -d '{"name":"Bea Bureau","email":"bea@example.test","role":"bureau"}' $U/auth/users/u3
TT=$(login "marc terrain")
BB=$(login "Bea Bureau")
[ ${#TT} -eq 64 ] && [ ${#BB} -eq 64 ] || { echo "SESSIONS ROLES ECHEC"; exit 1; }
HT="Authorization: Bearer $TT"; B="Authorization: Bearer $BB"
echo "> terrain"
ok "produits invisibles" "$(curl -s -H "$HT" $U/docs/products)" '"docs":\[\]'
R=$(curl -s -H "$HT" $U/docs/docs); ok "facture en résumé" "$R" 'F-2026-001'; no "sans les lignes" "$R" 'Azote'
no "solde bancaire masqué" "$(curl -s -H "$HT" $U/docs/settings/company)" '12345'
ok "clients en lecture seule" "$(curl -s -H "$HT" -X PUT -d '{"name":"X"}' $U/docs/clients/c-009)" 'rôle'
ok "brouillon de livraison permis" "$(curl -s -H "$HT" -X PUT -d '{"kind":"facture","status":"brouillon","source":"gaz","number":"F-2026-002","lines":[]}' $U/docs/docs/d2)" '"ok":true'
ok "facture émise refusée" "$(curl -s -H "$HT" -X PUT -d '{"kind":"facture","status":"emis","source":"gaz"}' $U/docs/docs/d3)" 'rôle'
ok "changement de statut refusé" "$(curl -s -H "$HT" -X PATCH -d '{"status":"paye"}' $U/docs/docs/d1)" 'rôle'
ok "déliaison permise" "$(curl -s -H "$HT" -X PATCH -d '{"deliveryId":null}' $U/docs/docs/d1)" '"ok":true'
ok "suppression facture émise refusée" "$(curl -s -H "$HT" -X DELETE $U/docs/docs/d1)" 'rôle'
ok "suppression en lot refusée" "$(curl -s -H "$HT" -X POST -d '{"docs":["d1"]}' $U/delete)" 'rôle'
ok "suppression du brouillon permise" "$(curl -s -H "$HT" -X DELETE $U/docs/docs/d2)" '"ok":true'
ok "paramètres : emplacements" "$(curl -s -H "$HT" -X PUT -d '{"name":"Pirate","bankBalance":0,"gasLocations":[{"id":"L1","name":"Dépôt"},{"id":"L2","name":"Camion"}]}' $U/docs/settings/company)" '"ok":true'
R=$(curl -s -H "$K" $U/docs/settings/company); ok "emplacement ajouté" "$R" 'Camion'; ok "nom conservé" "$R" 'W.A.Y.S. SRL'; ok "solde conservé" "$R" '12345'
ok "export refusé" "$(curl -s -H "$HT" $U/export)" 'rôle'
ok "import refusé" "$(curl -s -H "$HT" -X POST -d '{"clients":{}}' $U/import)" 'administrateur'
R=$(curl -s -H "$HT" "$U/changes?since=0"); no "changements sans produits" "$R" 'Azote B50'; no "changements sans lignes" "$R" '"price":55'
echo "> webfleet"
pkill -f "127.0.0.1:8766" || true
(php -S 127.0.0.1:8766 "$D/webfleet-mock.php" >/dev/null 2>&1 &); sleep 0.5
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("INSERT INTO ways_kv VALUES (?,?)")->execute(["wf_base","http://127.0.0.1:8766/extern"]);' $T/t.db
curl -s -H "$K" -X PUT -d '{"plate":"1-ABC-123","webfleetId":"012","km":180000}' $U/docs/vehicles/v-1 >/dev/null
curl -s -H "$K" -X PUT -d '{"plate":"2-XYZ-999"}' $U/docs/vehicles/v-2 >/dev/null
A="Authorization: Bearer $S"
ok "non configuré" "$(curl -s -H "$HT" $U/webfleet/status)" '"configured":false'
ok "config réservée admin" "$(curl -s -H "$HT" -X POST -d '{"account":"x","username":"y","password":"z"}' $U/webfleet/config)" 'administrateurs'
ok "config : mauvais mot de passe enregistré" "$(curl -s -H "$A" -X POST -d '{"account":"ways","username":"api-erp","password":"faux","apikey":"k"}' $U/webfleet/config)" '"ok":true'
ok "test : erreur Webfleet lisible" "$(curl -s -H "$A" -X POST $U/webfleet/test)" 'invalid credentials'
ok "config : bon mot de passe" "$(curl -s -H "$A" -X POST -d '{"account":"","username":"","password":"secret"}' $U/webfleet/config)" '"account":"ways"'
no "mot de passe jamais renvoyé" "$(curl -s -H "$A" $U/webfleet/status)" 'secret'
R=$(curl -s -H "$A" -X POST $U/webfleet/test); ok "test : 3 objets" "$R" '"objectno":"099"'; ok "test : correspondance plaque" "$R" '"vehicleId":"v-2"'
R=$(curl -s -H "$HT" -X POST -d '{}' $U/webfleet/sync); ok "synchro par un terrain" "$R" '"trips":1'
ok "synchro forcée (admin)" "$(curl -s -H "$A" -X POST -d '{"force":true}' $U/webfleet/sync)" '"positions":2'
R=$(curl -s -H "$K" $U/docs/vehPos/v-1); ok "position v-1" "$R" '"lat":50.637512'; ok "compteur en km" "$R" '"odometer":182345.6'; ok "contact coupé" "$R" '"state":"coupe"'
R=$(curl -s -H "$K" $U/docs/vehPos/v-2); ok "position v-2 (plaque)" "$R" '"state":"route"'; ok "compteur 100 m → km" "$R" '"odometer":51234'
R=$(curl -s -H "$K" $U/docs/trips/wf-7001); ok "trajet importé" "$R" '"km":18.4'; ok "durée en min" "$R" '"durationMin":42'; ok "trajet pro" "$R" '"mode":"business"'
ok "objet sans fiche signalé" "$(curl -s -H "$HT" $U/webfleet/status)" 'Remorque inconnue'
no "statut terrain sans compte" "$(curl -s -H "$HT" $U/webfleet/status)" '"account"'
ok "cadence respectée" "$(curl -s -H "$HT" -X POST -d '{}' $U/webfleet/sync)" '"skipped":true'
R=$(curl -s -H "$K" $U/docs/settings/company); ok "chauffeurs Webfleet ajoutés" "$R" 'Sophie Lambert'; ok "chauffeur des trajets" "$R" 'Marc Terrain'
php -r '$p=new PDO("sqlite:".$argv[1]); $r=$p->query("SELECT data FROM ways_docs WHERE coll=\"settings\" AND id=\"company\"")->fetchColumn(); $d=json_decode($r,true); $d["drivers"]=array_values(array_diff($d["drivers"],["Sophie Lambert"])); $p->prepare("UPDATE ways_docs SET data=? WHERE coll=\"settings\" AND id=\"company\"")->execute([json_encode($d)]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["wf_drv_at","0"]);' $T/t.db
curl -s -H "$HT" -X POST -d '{}' $U/webfleet/sync >/dev/null
no "chauffeur supprimé non réajouté" "$(curl -s -H "$K" $U/docs/settings/company)" '"drivers":\[[^]]*Sophie'
ok "clé carte réservée admin" "$(curl -s -H "$B" -X POST -d '{"key":"abcdefgh1234"}' $U/webfleet/mapkey)" 'administrateurs'
ok "clé carte invalide refusée" "$(curl -s -H "$A" -X POST -d '{"key":"a b"}' $U/webfleet/mapkey)" 'invalide'
curl -s -H "$A" -X POST -d '{"key":"cartoKEY_12345678"}' $U/webfleet/mapkey >/dev/null
ok "clé carte servie aux navigateurs" "$(curl -s -H "$HT" $U/webfleet/status)" '"mapKey":"cartoKEY_12345678"'
R=$(curl -s -H "$K" $U/docs/drivers/wf-D1); ok "fiche chauffeur créée depuis WebFleet" "$R" '"driveruid":"uid-d1"'; ok "téléphone/e-mail repris" "$R" 'marc@example.test'; ok "permis repris" "$R" '"licenseExpiry":"2027-03-01"'; ok "informations complémentaires reprises" "$R" '"info":"Chip ID : 00000119114301"'
no "fiches chauffeur cachées au terrain" "$(curl -s -H "$HT" "$U/changes?since=0")" 'uid-d1'
curl -s -H "$B" -X PUT -d '{"name":"Marc Terrain","email":"marc.t@ways.test","phone":"+32 470 11 22 33","info":"Chip ID : 00000119114301 / badge LGG","notes":"privé","wf":{"driverno":"D1","driveruid":"uid-d1"}}' $U/docs/drivers/wf-D1 >/dev/null
rm -f /tmp/wf-mock.log
ok "envoi chauffeur réservé au bureau" "$(curl -s -H "$HT" -X POST -d '{"id":"wf-D1"}' $U/webfleet/push-driver)" 'bureau'
ok "chauffeur envoyé à WebFleet" "$(curl -s -H "$B" -X POST -d '{"id":"wf-D1"}' $U/webfleet/push-driver)" '"action":"mis à jour"'
ok "WebFleet reçoit les données du chauffeur" "$(cat /tmp/wf-mock.log)" '"telmobile":"+32 470 11 22 33"'; ok "chauffeur identifié par uid" "$(cat /tmp/wf-mock.log)" '"driveruid":"uid-d1"'; ok "informations complémentaires envoyées" "$(cat /tmp/wf-mock.log)" 'badge LGG'; no "note interne jamais envoyée" "$(cat /tmp/wf-mock.log)" 'privé'
ok "saisie de l'ERP gardée à la synchro" "$(curl -s -H "$K" $U/docs/drivers/wf-D1)" 'marc.t@ways.test'
drvsync() { php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["wf_drv_at","0"]);' $T/t.db; curl -s -H "$HT" -X POST -d '{}' $U/webfleet/sync >/dev/null; }
D2=$(curl -s -H "$K" $U/docs/drivers | php -r 'foreach(json_decode(stream_get_contents(STDIN),true) as $id=>$d) if(($d["wf"]["driveruid"]??"")==="uid-d2") echo $id;')
touch /tmp/wf-mock-hide-d2; drvsync
ok "chauffeur désactivé dans WebFleet marqué" "$(curl -s -H "$K" $U/docs/drivers/$D2)" '"wfGone":"20'; no "chauffeur actif non marqué" "$(curl -s -H "$K" $U/docs/drivers/wf-D1)" 'wfGone'
rm -f /tmp/wf-mock-hide-d2; drvsync
no "chauffeur réactivé : marque retirée" "$(curl -s -H "$K" $U/docs/drivers/$D2)" 'wfGone'
ok "compteur corrigé dans WebFleet" "$(curl -s -H "$B" -X POST -d '{"id":"v-1","odometer":182000.4}' $U/webfleet/push-vehicle)" 'compteur'
ok "compteur envoyé en mètres" "$(tail -1 /tmp/wf-mock.log)" '"odometer":"182000400"'
ok "ERP repart du compteur corrigé" "$(curl -s -H "$K" $U/docs/vehPos/v-1)" '"odometer":182000.4'
curl -s -H "$K" -X PUT -d '{"plate":"1-ABC-123","webfleetId":"012","km":182000.4,"year":"2019","kw":75,"cc":1598,"fuel":"Diesel"}' $U/docs/vehicles/v-1 >/dev/null
curl -s -H "$B" -X POST -d '{"id":"v-1","details":true}' $U/webfleet/push-vehicle >/dev/null
R=$(tail -1 /tmp/wf-mock.log); ok "fiche véhicule envoyée" "$R" '"licenseplatenumber":"1-ABC-123"'; ok "carburant diesel" "$R" '"fueltype":"1"'; no "nom WebFleet jamais changé" "$R" 'denotation'
curl -s -H "$K" -X PUT -d '{"plate":"9-NOP-000","webfleetId":"099"}' $U/docs/vehicles/v-9 >/dev/null
ok "refus WebFleet expliqué" "$(curl -s -H "$B" -X POST -d '{"id":"v-9","odometer":1000}' $U/webfleet/push-vehicle)" 'droit de modifier'
curl -s -H "$K" -X PUT -d '{"plate":"1-LNK-555","fleetNo":"050","model":"Berlingo"}' $U/docs/vehicles/v-5 >/dev/null
curl -s -H "$K" -X PUT -d '{"plate":"1-OLD-045","fleetNo":"045","model":"Ancien"}' $U/docs/vehicles/v-6 >/dev/null
ok "import véhicules réservé admin" "$(curl -s -H "$B" -X POST -d '{}' $U/webfleet/import-vehicles)" 'administrateurs'
R=$(curl -s -H "$A" -X POST -d '{}' $U/webfleet/import-vehicles); ok "aperçu : même plaque et même n° → reliée" "$R" '"fleetNo":"050","action":"link","vehicleId":"v-5"'
ok "aperçu : n° WebFleet pris par une autre fiche → conflit" "$R" '"objectno":"045".*"action":"conflict"'; no "aperçu : 045 jamais attribué deux fois" "$R" '"fleetNo":"045","action":"create"'
ok "aperçu : création avec le n° WebFleet" "$R" '"plate":"2-TRA-061","fleetNo":"061","action":"create","model":"Ford Transit"'
ok "aperçu : identifiant aligné sur WebFleet" "$R" '"objectno":"012".*"action":"rename","vehicleId":"v-1"'
no "aperçu sans écriture" "$(curl -s -H "$K" $U/docs/vehicles/v-5)" '"webfleetId"'
R=$(curl -s -H "$A" -X POST -d '{"go":true}' $U/webfleet/import-vehicles); ok "import : fait" "$R" '"dry":false'
ok "fiche existante reliée" "$(curl -s -H "$K" $U/docs/vehicles/v-5)" '"webfleetId":"050"'
ok "identifiant de v-1 = n° WebFleet" "$(curl -s -H "$K" $U/docs/vehicles/v-1)" '"fleetNo":"012"'
R=$(curl -s -H "$K" $U/docs/vehicles); ok "fiche créée depuis WebFleet" "$R" '"fleetNo":"061","plate":"2-TRA-061"'; no "pas de fiche en conflit créée" "$R" '"plate":"1-NEW-045"'
R=$(curl -s -H "$A" -X POST -d '{}' $U/webfleet/import-vehicles); ok "ensuite : seul le conflit reste" "$R" '"items":\[{"objectno":"045"[^]]*"action":"conflict"[^]]*\]'
ok "envoi noté dans l'historique" "$(curl -s -H "$A" "$U/log?q=WebFleet")" 'Envoyé à WebFleet'
pkill -f "127.0.0.1:8766" || true
echo "> dropbox"
ok "adresses Dropbox réelles" "$(cd "$D/../api" && php -r 'function kv_get($k){return null;} require "dropbox.php"; echo dbx_url("oauth2","token")," ",dbx_url("api","files/list_folder")," ",dbx_url("content","files/upload");')" 'https://api.dropboxapi.com/oauth2/token https://api.dropboxapi.com/2/files/list_folder https://content.dropboxapi.com/2/files/upload'
pkill -f "127.0.0.1:8771" || true
(DBX_MOCK_DIR=$T/dbx php -S 127.0.0.1:8771 "$D/dropbox-mock.php" >/dev/null 2>&1 &); sleep 0.5
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["dbx_base_url","http://127.0.0.1:8771"]);' $T/t.db
ok "Dropbox réservé au bureau" "$(curl -s -H "$HT" $U/dropbox/status)" 'bureau'
ok "config Dropbox réservée admin" "$(curl -s -H "$B" -X POST -d '{"appKey":"key123456"}' $U/dropbox/config)" 'administrateurs'
ok "couleur jaune refusée" "$(curl -s -H "$A" -X POST -d '{"color":"yellow"}' $U/dropbox/config)" 'jaune'
R=$(curl -s -H "$A" -X POST -d '{"appKey":"key123456","appSecret":"sec123456","vehPath":"/WAYS SPRL Utility/Vehicles","color":"violet"}' $U/dropbox/config)
ok "config Dropbox enregistrée" "$R" '"appSet":true'; ok "adresse de retour affichée" "$R" 'dropbox\/callback'; no "secret jamais renvoyé" "$R" 'sec123456'
ok "lien d'autorisation" "$(curl -s -H "$A" -X POST -d '{}' $U/dropbox/auth-url)" 'token_access_type=offline'
ST=$(php -r '$p=new PDO("sqlite:".$argv[1]); echo json_decode($p->query("SELECT v FROM ways_kv WHERE k=\"dbx_state\"")->fetchColumn(),true)["state"];' $T/t.db)
ok "retour : state invalide refusé" "$(curl -s "$U/dropbox/callback?code=good&state=faux")" 'expiré ou invalide'
ok "retour : compte relié" "$(curl -s "$U/dropbox/callback?code=good&state=$ST")" 'relié'
R=$(curl -s -H "$B" $U/dropbox/status); ok "statut : connecté" "$R" '"connected":true'; ok "espace d'équipe détecté" "$R" '"team":true'; ok "nom du compte" "$R" 'W.A.Y.S. Bureau'
mkdir -p "$T/dbx/WAYS SPRL Utility/Vehicles" "$T/dbx/Privé"
ok "aucun dossier autorisé au départ" "$(curl -s -H "$B" -X POST -d '{"path":"/Privé"}' $U/dropbox/list)" 'non autorisé'
ok "choix des dossiers réservé admin" "$(curl -s -H "$B" -X POST -d '{"master":"12345678"}' $U/dropbox/unlock)" 'administrateurs'
ok "code maître faux refusé" "$(curl -s -H "$A" -X POST -d '{"master":"11112222"}' $U/dropbox/unlock)" 'incorrect'
ok "sans code maître, pas de navigation" "$(curl -s -H "$A" -X POST -d '{"token":"x","path":""}' $U/dropbox/browse)" 'code maître'
TK=$(curl -s -H "$A" -X POST -d '{"master":"12345678"}' $U/dropbox/unlock | php -r 'echo json_decode(stream_get_contents(STDIN),true)["token"]??"";')
ok "navigation complète avec le code maître" "$(curl -s -H "$A" -X POST -d "{\"token\":\"$TK\",\"path\":\"\"}" $U/dropbox/browse)" 'Privé'
R=$(curl -s -H "$A" -X POST -d "{\"token\":\"$TK\",\"paths\":[\"/WAYS SPRL Utility\",\"/WAYS SPRL Utility/Vehicles\"]}" $U/dropbox/folders); ok "dossiers autorisés enregistrés" "$R" '"folders":\["\/WAYS SPRL Utility"\]'
ok "jeton à usage unique" "$(curl -s -H "$A" -X POST -d "{\"token\":\"$TK\",\"paths\":[]}" $U/dropbox/folders)" 'code maître'
R=$(curl -s -H "$B" -X POST -d '{"path":""}' $U/dropbox/list); ok "racine = dossiers autorisés" "$R" 'WAYS SPRL Utility'; no "dossier privé invisible" "$R" 'Privé'
ok "dossier non autorisé refusé" "$(curl -s -H "$B" -X POST -d '{"path":"/Privé"}' $U/dropbox/list)" 'non autorisé'
ok "choix noté dans l'historique" "$(curl -s -H "$A" "$U/log?q=Dropbox")" 'Dossiers Dropbox autorisés'
mkdir -p $T/up; printf '%%PDF-1.4 ct' > $T/up/abc123def
curl -s -H "$K" -X PUT -d '{"plate":"2-JAW-708","fleetNo":"038","model":"Ford Fusion","docs":[{"id":"d1","type":"ct","name":"Autosécurité","issued":"2026-11-12","file":"abc123def","fileName":"ct.pdf","mime":"application/pdf"}]}' $U/docs/vehicles/v-dbx >/dev/null
ok "document en file d'attente" "$(curl -s -H "$B" $U/dropbox/status)" '"queue":1'
ok "copie dans Dropbox" "$(curl -s -H "$B" -X POST -d '{}' $U/dropbox/tick)" '"done":1'
R=$(curl -s -H "$K" $U/docs/vehicles/v-dbx); ok "chemin Dropbox noté" "$R" '"dbx":"\/WAYS SPRL Utility\/Vehicles\/038 - 2-JAW-708 - Ford Fusion\/2026-11-12 - Contr'; ok "dossier du véhicule créé et lié" "$R" 'dropbox.com\/home\/WAYS%20SPRL%20Utility'
ok "en-tête espace d'équipe" "$(tail -1 $T/dbx-mock-headers.log)" '"root":"111"'
ok "liste du dossier" "$(curl -s -H "$B" -X POST -d '{"path":"/WAYS SPRL Utility/Vehicles/038 - 2-JAW-708 - Ford Fusion"}' $U/dropbox/list)" 'Autos'
php -r '$p=new PDO("sqlite:".$argv[1]); $r=json_decode($p->query("SELECT data FROM ways_docs WHERE coll=\"vehicles\" AND id=\"v-dbx\"")->fetchColumn(),true); $r["docs"][]=["id"=>"d2","type"=>"ct","name"=>"Autosécurité","issued"=>"2027-11-10","expires"=>"2028-11-10","file"=>"abc123def","fileName"=>"ct2.pdf","mime"=>"application/pdf"]; file_put_contents($argv[2], json_encode($r));' $T/t.db $T/vdbx.json
curl -s -H "$K" -X PUT --data-binary @$T/vdbx.json $U/docs/vehicles/v-dbx >/dev/null
curl -s -H "$B" -X POST -d '{}' $U/dropbox/tick >/dev/null
R=$(curl -s -H "$K" $U/docs/vehicles/v-dbx); ok "CT remplacé : l'ancien passe dans Expired" "$R" 'Ford Fusion\/Expired\/2026-11-12'; ok "nouveau CT copié" "$R" 'Ford Fusion\/2027-11-10'
mkdir -p "$T/dbx/WAYS SPRL Utility/Scans"
ok "suivi : dossier non autorisé refusé" "$(curl -s -H "$B" -X POST -d '{"path":"/Privé","on":true}' $U/dropbox/watch)" 'non autorisé'
ok "suivi activé par le bureau" "$(curl -s -H "$B" -X POST -d '{"path":"/WAYS SPRL Utility/Scans","on":true}' $U/dropbox/watch)" '"path":"\/WAYS SPRL Utility\/Scans"'
printf 'scan' > "$T/dbx/WAYS SPRL Utility/Scans/CT 1-ABC-123.pdf"
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["dbx_watch_at","0"]);' $T/t.db
ok "nouveau fichier détecté" "$(curl -s -H "$B" -X POST -d '{}' $U/dropbox/tick)" '"found":1'
ok "compteur par personne" "$(curl -s -H "$A" $U/dropbox/status)" '"newCount":1'
R=$(curl -s -H "$B" $U/dropbox/new); ok "événement proposé" "$R" 'CT 1-ABC-123.pdf'
curl -s -H "$B" -X POST -d '{"upTo":1}' $U/dropbox/new-ack >/dev/null
ok "vu par la personne" "$(curl -s -H "$B" $U/dropbox/status)" '"newCount":0'; ok "toujours proposé aux autres" "$(curl -s -H "$A" $U/dropbox/status)" '"newCount":1'
ok "suivi arrêté" "$(curl -s -H "$B" -X POST -d '{"path":"/WAYS SPRL Utility/Scans","on":false}' $U/dropbox/watch)" '"watch":\[\]'
ok "recherche Dropbox" "$(curl -s -H "$B" -X POST -d '{"query":"Autos"}' $U/dropbox/search)" '"folder":false'
ok "lien temporaire" "$(curl -s -H "$B" -X POST -d '{"path":"/WAYS SPRL Utility/Vehicles/038 - 2-JAW-708 - Ford Fusion/Expired/2026-11-12 - Contrôle technique - Autosécurité.pdf"}' $U/dropbox/link)" 'dropboxusercontent'
pkill -f "127.0.0.1:8766" || true
echo "> odoo"
pkill -f "127.0.0.1:8767" || true
(ODOO_MOCK_DATA=$T/odoo.json php -S 127.0.0.1:8767 "$D/odoo-mock.php" >/dev/null 2>&1 &); sleep 0.5
curl -s -H "$K" -X PUT -d '{"name":"Liege Airport","vat":"BE 0123.456.749","notes":"client historique"}' $U/docs/clients/c-la >/dev/null
curl -s -H "$K" -X PUT -d '{"name":"Etalonnage cle","ref":"ETAL-01","kind":"etalonnage","price":40}' $U/docs/products/p-et >/dev/null
ok "odoo non configuré" "$(curl -s -H "$HT" $U/odoo/status)" '"configured":false'
ok "adresse vérifiée" "$(curl -s -H "$A" -X POST -d '{"url":"ftp://x","key":"k"}' $U/odoo/config)" 'invalide'
ok "config (mauvaise clé)" "$(curl -s -H "$A" -X POST -d '{"url":"http://127.0.0.1:8767","key":"faux"}' $U/odoo/config)" 'invalide'
php -r '$p=new PDO("sqlite:".$argv[1]); foreach (["od_url"=>"http://127.0.0.1:8767","od_key"=>"faux"] as $k=>$v) $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute([$k,$v]);' $T/t.db
ok "clé refusée lisible" "$(curl -s -H "$A" -X POST $U/odoo/test)" 'clé API refusée'
ok "config (bonne clé)" "$(curl -s -H "$A" -X POST -d '{"key":"odoo-test-key","keyExp":"2027-02-10"}' $U/odoo/config)" '"keyExp":"2027-02-10"'
no "clé jamais renvoyée" "$(curl -s -H "$A" $U/odoo/status)" 'odoo-test-key'
ok "test : comptes Odoo" "$(curl -s -H "$A" -X POST $U/odoo/test)" '"invoices":3'
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["od_url","http://localhost:8767/odoo/discuss"]);' $T/t.db
ok "redirection suivie" "$(curl -s -H "$A" -X POST $U/odoo/test)" '"invoices":3'
ok "adresse corrigée" "$(curl -s -H "$A" $U/odoo/status)" '"url":"http:\/\/127.0.0.1:8767"'
ok "site odoo.com refusé" "$(curl -s -H "$A" -X POST -d '{"url":"https://www.odoo.com/my/databases"}' $U/odoo/config)" 'votre base'
R=$(curl -s -H "$HT" -X POST -d '{}' $U/odoo/sync); ok "synchro initiale (terrain)" "$R" '"invoices":3'; ok "2 clients clients" "$R" '"clients":2'; ok "2 produits" "$R" '"products":2'
R=$(curl -s -H "$K" $U/docs/clients/c-la); ok "client relié par TVA" "$R" '"odooId":1'; ok "nom Odoo" "$R" 'Liège Airport SA'; ok "notes ERP gardées" "$R" 'client historique'
R=$(curl -s -H "$K" $U/docs/clients/odoo-p-2); ok "nouveau client" "$R" '"city":"1930 Zaventem"'; ok "adresse 2 lignes" "$R" 'Cargo 2 Bât. 7'; ok "langue" "$R" '"lang":"en"'
ok "client hors liste lu à la demande" "$(curl -s -H "$K" $U/docs/clients/odoo-p-3)" '"country":"France"'
R=$(curl -s -H "$K" $U/docs/products/p-et); ok "produit relié par réf." "$R" '"odooId":10'; ok "type ERP gardé" "$R" '"kind":"etalonnage"'; ok "prix Odoo" "$R" '"price":45.5'
ok "produit sans réf." "$(curl -s -H "$K" $U/docs/products/odoo-pr-11)" '"ref":"ODOO-11"'
R=$(curl -s -H "$K" $U/docs/docs/odoo-inv-100); ok "facture importée" "$R" 'INV\/2026\/00001'; ok "statut envoyée" "$R" '"status":"envoyee"'; ok "client relié" "$R" '"clientId":"c-la"'
ok "remise appliquée" "$R" '"price":45.5'; ok "section" "$R" '"kind":"section"'; ok "note en notes" "$R" 'Merci pour votre confiance'; ok "totaux Odoo" "$R" '"ttc":255.31'; ok "ligne produit reliée" "$R" '"productId":"p-et"'
R=$(curl -s -H "$K" $U/docs/docs/odoo-inv-101); ok "note de crédit" "$R" '"kind":"nc"'; ok "NC payée" "$R" '"status":"payee"'; ok "NC liée" "$R" '"creditFor":"odoo-inv-100"'
ok "brouillon Odoo" "$(curl -s -H "$K" $U/docs/docs/odoo-inv-102)" 'Brouillon Odoo 102'
ok "factures fournisseurs ignorées" "$(curl -s -H "$K" $U/docs/docs/odoo-inv-103)" 'introuvable'
ok "facture Odoo non modifiable" "$(curl -s -H "$A" -X PATCH -d '{"status":"payee"}' $U/docs/docs/odoo-inv-100)" "vient d'Odoo"
ok "facture Odoo non supprimable" "$(curl -s -H "$A" -X DELETE $U/docs/docs/odoo-inv-100)" "vient d'Odoo"
curl -s -H "$A" -X PUT -d '{"name":"Pirate","vat":"X","notes":"note ERP modifiée","odooId":1,"source":"odoo"}' $U/docs/clients/c-la >/dev/null
R=$(curl -s -H "$K" $U/docs/clients/c-la); ok "champs Odoo protégés" "$R" 'Liège Airport SA'; ok "notes modifiables" "$R" 'note ERP modifiée'
ok "client Odoo non supprimable" "$(curl -s -H "$A" -X DELETE $U/docs/clients/c-la)" 'archivez'
php -r '$f=$argv[1]; $d=json_decode(file_get_contents($f),true); foreach($d["account.move"] as &$m) if($m["id"]==100){$m["payment_state"]="paid";$m["amount_residual"]=0;} unset($m); $d["account.move"]=array_values(array_filter($d["account.move"],fn($m)=>$m["id"]!=102)); file_put_contents($f,json_encode($d));' $T/odoo.json
ok "synchro : paiements et suppressions" "$(curl -s -H "$A" -X POST -d '{"force":true}' $U/odoo/sync)" '"refreshed":2'
ok "paiement reçu" "$(curl -s -H "$K" $U/docs/docs/odoo-inv-100)" '"status":"payee"'
ok "brouillon supprimé dans Odoo" "$(curl -s -H "$K" $U/docs/docs/odoo-inv-102)" 'introuvable'
ok "cadence 15 min" "$(curl -s -H "$HT" -X POST -d '{}' $U/odoo/sync)" '"skipped":true'
R=$(curl -s -H "$HT" $U/odoo/status); no "statut terrain sans détails" "$R" '"db"'; ok "jours avant expiration" "$R" '"keyDays"'
echo "> odoo 18 (JSON-RPC)"
php -r '$f=$argv[1]; $d=json_decode(file_get_contents($f),true); $d["_serie"]="18.0"; file_put_contents($f,json_encode($d));' $T/odoo.json
curl -s -H "$A" -X POST -d '{"login":"","db":""}' $U/odoo/config >/dev/null
ok "odoo 18 : identifiant demandé" "$(curl -s -H "$A" -X POST $U/odoo/test)" 'identifiant de connexion'
curl -s -H "$A" -X POST -d '{"login":"autre@ways.test"}' $U/odoo/config >/dev/null
ok "odoo 18 : mauvais identifiant" "$(curl -s -H "$A" -X POST $U/odoo/test)" 'refusés'
curl -s -H "$A" -X POST -d '{"login":"api@ways.test"}' $U/odoo/config >/dev/null
ok "odoo 18 : connexion" "$(curl -s -H "$A" -X POST $U/odoo/test)" '"invoices":2'
R=$(curl -s -H "$A" $U/odoo/status); ok "base détectée" "$R" '"db":"ways-test"'; ok "API classique" "$R" '"api":"jsonrpc"'; ok "version" "$R" '"version":"18.0+e"'
ok "odoo 18 : synchro" "$(curl -s -H "$A" -X POST -d '{"force":true}' $U/odoo/sync)" '"ok":true'
echo "> falco"
pkill -f "127.0.0.1:8768" || true
(FALCO_MOCK_LOG=$T/falco.log php -S 127.0.0.1:8768 "$D/falco-mock.php" >/dev/null 2>&1 &); sleep 0.5
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["fa_base","http://127.0.0.1:8768"]);' $T/t.db
ok "falco non configuré" "$(curl -s -H "$HT" $U/falco/status)" '"configured":false'
ok "config réservée admin" "$(curl -s -H "$HT" -X POST -d '{"secret":"x","key":"y"}' $U/falco/config)" 'administrateurs'
ok "config (mauvaise clé)" "$(curl -s -H "$A" -X POST -d '{"secret":"as_test","key":"faux"}' $U/falco/config)" '"configured":true'
ok "clé refusée lisible" "$(curl -s -H "$A" -X POST $U/falco/test)" 'accès refusé'
curl -s -H "$A" -X POST -d '{"key":"sk_test"}' $U/falco/config >/dev/null
ok "organisation reconnue" "$(curl -s -H "$A" -X POST $U/falco/test)" '"vat":"BE0000000000"'
no "secret jamais renvoyé" "$(curl -s -H "$A" $U/falco/status)" 'sk_test'
curl -s -H "$K" -X PATCH -d '{"address":""}' $U/docs/settings/company >/dev/null
ok "adresse du siège exigée" "$(curl -s -H "$A" -X POST -d '{"ids":["odoo-inv-101"]}' $U/falco/push)" 'adresse du siège'
curl -s -H "$K" -X PATCH -d '{"address":"Rue de la Station 12, 4430 Ans"}' $U/docs/settings/company >/dev/null
ok "date de bascule exigée" "$(curl -s -H "$A" -X POST -d '{}' $U/falco/push)" 'date de bascule'
ok "bascule au 2/11" "$(curl -s -H "$A" -X POST -d '{"from":"2026-11-02"}' $U/falco/config)" '"pending":1'
ok "transmission" "$(curl -s -H "$A" -X POST -d '{}' $U/falco/push)" '"sent":1'
R=$(curl -s -H "$K" $U/docs/docs/odoo-inv-101); ok "NC marquée transmise" "$R" '"status":"sent"'; ok "id Falco" "$R" 'fd-RINV'
L=$(cat $T/falco.log); ok "type note de crédit" "$L" '"document_type":"sale_credit_note"'; ok "référence acheteur par défaut" "$L" '"buyer_reference":"N'; no "pas d'échéance sur une NC" "$(head -1 $T/falco.log)" '"due_date"'; ok "jamais via Peppol" "$L" '"send_peppol":false'; ok "vers la comptabilité" "$L" '"send_accounting":true'; ok "référence facture" "$L" '"billing_references":\[{"id":"INV'
ok "pas de double envoi" "$(curl -s -H "$A" -X POST -d '{}' $U/falco/push)" '"sent":0'
ok "avant bascule ignorée" "$(curl -s -H "$A" -X POST -d '{"ids":["odoo-inv-100"]}' $U/falco/push)" '"sent":0'
ok "envoi forcé" "$(curl -s -H "$A" -X POST -d '{"ids":["odoo-inv-100"],"override":true}' $U/falco/push)" '"sent":1'
L=$(tail -1 $T/falco.log); ok "section ignorée, 2 lignes" "$L" '"base_amount":"211.00"'; ok "total TTC" "$L" '"total_amount":"255.31"'; ok "client" "$L" '"vat_number":"BE0123456749"'; ok "communication" "$L" '"communication":"+++000'; ok "adresse expéditeur" "$L" '"zip":"4430","city":"Ans"'; ok "TVA standard" "$L" '"tax_regime":{"type":"standard"}'; ok "taux au format 21.0" "$L" '"tax_rate":"21.0"'; ok "prix à 2 décimales" "$L" '"unit_price":"45.50"'
ok "auto désactivé" "$(curl -s -H "$HT" -X POST -d '{}' $U/falco/sync)" '"skipped":true'
ok "envoi réservé admin" "$(curl -s -H "$HT" -X POST -d '{}' $U/falco/push)" 'administrateurs'
ok "compteurs" "$(curl -s -H "$A" $U/falco/status)" '"sent":2'
echo "> achats (Falco)"
ok "achats interdits au terrain" "$(curl -s -H "$HT" -X POST -d '{}' $U/achats/sync)" 'bureau'
R=$(curl -s -H "$B" -X POST -d '{"force":true}' $U/achats/sync); ok "synchro achats" "$R" '"created":3'
R=$(curl -s -H "$K" $U/docs/purchases/pi-in-2); ok "facture Peppol seule reprise" "$R" '"supplierName":"FedEx'; ok "montant Peppol" "$R" '"amount":55.93'; ok "date Peppol" "$R" '"date":"2026-11-10"'
no "pas de doublon Peppol / achat" "$(curl -s -H "$K" $U/docs/purchases)" 'pi-in-1'
R=$(curl -s -H "$B" -X POST -d '{"id":"pi-in-2"}' $U/achats/pdf); ok "PDF extrait de l'UBL" "$R" '"pdf":true'
PF2=$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["fileId"] ?? "";'); ok "PDF Peppol lisible" "$(curl -s -H "$K" "$U/files/$PF2")" '%PDF-1.4 fedex'
ok "statut suivi dans l'ERP" "$(curl -s -H "$B" -X POST -d '{"id":"pi-in-2","status":"paid"}' $U/achats/paid)" '"local":true'
R=$(curl -s -H "$K" $U/docs/purchases/fa-pd-1); ok "facture d'achat" "$R" '"amount":605'; ok "fournisseur" "$R" 'Air Liquide'; ok "communication Peppol" "$R" '"paymentRef":"+++123'; ok "IBAN fournisseur" "$R" '"supplierIban":"BE71096123456769"'; ok "id Peppol" "$R" '"inboundId":"in-1"'
ok "note de crédit d'achat" "$(curl -s -H "$K" $U/docs/purchases/fa-pd-2)" '"credit":true'
no "achats cachés au terrain" "$(curl -s -H "$HT" $U/docs/purchases)" 'Air Liquide'
R=$(curl -s -H "$B" -X POST -d '{"id":"fa-pd-1"}' $U/achats/pdf); ok "PDF rapatrié" "$R" '"fileId"'
PF=$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["fileId"] ?? "";')
ok "PDF lisible" "$(curl -s -H "$K" "$U/files/$PF")" '%PDF'
ok "PDF en cache" "$(curl -s -H "$B" -X POST -d '{"id":"fa-pd-1"}' $U/achats/pdf)" "$PF"
ok "statut payé dans Falco" "$(curl -s -H "$B" -X POST -d '{"id":"fa-pd-1","status":"paid"}' $U/achats/paid)" '"paymentStatus":"paid"'
ok "statut relu" "$(curl -s -H "$K" $U/docs/purchases/fa-pd-1)" '"paymentStatus":"paid"'
curl -s -H "$B" -X POST -d '{"id":"fa-pd-1","status":"not_paid"}' $U/achats/paid >/dev/null
ok "refus motivé exigé" "$(curl -s -H "$B" -X POST -d '{"id":"fa-pd-1","code":"rejected"}' $U/achats/response)" 'raison'
ok "réponse Peppol" "$(curl -s -H "$B" -X POST -d '{"id":"fa-pd-1","code":"accepted"}' $U/achats/response)" '"code":"accepted"'
ok "réponse transmise" "$(tail -1 $T/falco.log)" '"response_code":"accepted"'
ok "ordre Peppol expliqué" "$(curl -s -H "$B" -X POST -d '{"id":"fa-pd-1","code":"under_query","reason":"?"}' $U/achats/response)" 'ne peut pas revenir en arrière'
ok "pas de réponse Peppol hors Peppol" "$(curl -s -H "$B" -X POST -d '{"id":"fa-pd-2","code":"accepted"}' $U/achats/response)" 'pas arrivée par Peppol'
curl -s -H "$K" -X POST -d '{"purchases":{"fa-nap":{"source":"falco","number":"VFV/2026/8","amount":181.5,"supplierName":"CMA Service","inboundId":"in-nap"}}}' $U/import >/dev/null
ok "fournisseur sans réponse Peppol : message clair" "$(curl -s -H "$B" -X POST -d '{"id":"fa-nap","code":"accepted"}' $U/achats/response)" 'ne peut pas recevoir de réponse'
ok "fournisseur sans réponse Peppol : mémorisé" "$(curl -s -H "$K" $U/docs/purchases/fa-nap)" '"peppolNoResponse"'
curl -s -H "$B" -X PATCH -d '{"archived":true,"amount":1,"note":"vérifier"}' $U/docs/purchases/fa-pd-2 >/dev/null
R=$(curl -s -H "$K" $U/docs/purchases/fa-pd-2); ok "archivage" "$R" '"archived":true'; ok "montant Falco protégé" "$R" '"amount":50'; ok "note interne" "$R" 'vérifier'
ok "suppression refusée" "$(curl -s -H "$B" -X DELETE $U/docs/purchases/fa-pd-2)" 'Falco'
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["fp_at","0"]);' $T/t.db
R=$(curl -s -H "$B" -X POST -d '{"force":true}' $U/achats/sync); ok "pas de doublon" "$R" '"created":0'; ok "statut relu dans Falco" "$R" '"updated":'
ok "statut ERP gardé après synchro" "$(curl -s -H "$K" $U/docs/purchases/pi-in-2)" '"paymentStatus":"paid"'
ok "note gardée après synchro" "$(curl -s -H "$K" $U/docs/purchases/fa-pd-2)" 'vérifier'
pkill -f "127.0.0.1:8768" || true
pkill -f "127.0.0.1:8767" || true
echo "> ponto"
pkill -f "127.0.0.1:8769" || true
(PONTO_MOCK_EXTRA=$T/ponto-extra.json php -S 127.0.0.1:8769 "$D/ponto-mock.php" >/dev/null 2>&1 &); sleep 0.5
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["po_base","http://127.0.0.1:8769"]);' $T/t.db
curl -s -H "$K" -X PUT -d '{"kind":"facture","number":"F-2026-050","status":"envoyee","clientId":"c-la","date":"2026-11-01","lines":[{"label":"Azote","qty":1,"price":55,"vat":21}]}' $U/docs/docs/d-po1 >/dev/null
curl -s -H "$K" -X PUT -d '{"kind":"facture","number":"F-2026-051","status":"envoyee","clientId":"c-la","date":"2026-11-02","lines":[{"label":"Service","qty":1,"price":1000,"vat":21}]}' $U/docs/docs/d-po2 >/dev/null
ok "ponto interdit au terrain" "$(curl -s -H "$HT" $U/ponto/status)" 'rôle'
ok "ponto non configuré" "$(curl -s -H "$A" $U/ponto/status)" '"configured":false'
curl -s -H "$A" -X POST -d '{"clientId":"po-id","secret":"faux"}' $U/ponto/config >/dev/null
ok "secret refusé lisible" "$(curl -s -H "$A" -X POST $U/ponto/test)" 'identifiant ou secret refusé'
curl -s -H "$A" -X POST -d '{"secret":"po-secret"}' $U/ponto/config >/dev/null
R=$(curl -s -H "$A" -X POST $U/ponto/test); ok "2 comptes" "$R" 'LT123250013004017999'; ok "nom de banque" "$R" '"bank":"Beobank"'
no "secret jamais renvoyé" "$(curl -s -H "$A" $U/ponto/status)" 'po-secret'
R=$(curl -s -H "$A" -X POST -d '{"force":true}' $U/ponto/sync); ok "synchro" "$R" '"ok":true'; ok "2 comptes importés" "$R" '"accounts":2'
for i in 1 2 3; do curl -s -H "$A" -X POST -d '{}' $U/ponto/sync >/dev/null; done
N=$(curl -s -H "$K" "$U/docs/bankTx" | php -r 'echo count(json_decode(stream_get_contents(STDIN),true)["docs"]);'); ok "150 mouvements (le trop ancien exclu)" "n=$N" 'n=150'
R=$(curl -s -H "$K" $U/docs/bankAccounts/acc-beo); ok "solde du compte" "$R" '"balance":12345.67'; ok "fin d autorisation" "$R" '2027-02-10'
ok "relié par communication structurée" "$(curl -s -H "$K" $U/docs/bankTx/po-t-ogm)" '"docId":"d-po1"'
ok "relié par montant + n°" "$(curl -s -H "$K" $U/docs/bankTx/po-t-num)" '"docId":"d-po2"'
no "sortie non reliée" "$(curl -s -H "$K" $U/docs/bankTx/po-t-1)" '"match"'
ok "terrain ne voit pas les mouvements" "$(curl -s -H "$HT" $U/docs/bankTx)" '"docs":\[\]'
echo '[["t-new","2026-11-15",42.5,"Nouveau client","Nouvelle entrée"]]' > $T/ponto-extra.json
R=$(curl -s -H "$A" -X POST -d '{"force":true}' $U/ponto/sync); ok "incrémental : 1 nouveau" "$R" '"transactions":1'
ok "nouveau mouvement" "$(curl -s -H "$K" $U/docs/bankTx/po-t-new)" '"amount":42.5'
curl -s -H "$K" -X PUT -d '{"kind":"facture","number":"26/164","status":"envoyee","clientId":"c-la","date":"2026-10-01","lines":[{"label":"A","qty":1,"price":100,"vat":21}]}' $U/docs/docs/d-m1 >/dev/null
curl -s -H "$K" -X PUT -d '{"kind":"facture","number":"26/177","status":"envoyee","clientId":"c-la","date":"2026-10-05","lines":[{"label":"B","qty":1,"price":200,"vat":21}]}' $U/docs/docs/d-m2 >/dev/null
curl -s -H "$K" -X PUT -d '{"kind":"facture","number":"26/16","status":"envoyee","clientId":"c-la","date":"2026-01-05","lines":[{"label":"C","qty":1,"price":50,"vat":21}]}' $U/docs/docs/d-m3 >/dev/null
echo '[["t-out","2026-11-16",-605,"Air Liquide Belgium","+++123/4567/89012+++"],["t-multi","2026-11-16",363,"FLUGFELAGID ATLANTA","Virement 02911-29 26/164, 26/177"],["t-new","2026-11-15",42.5,"Nouveau client","Nouvelle entrée"]]' > $T/ponto-extra.json
curl -s -H "$A" -X POST -d '{"force":true}' $U/ponto/sync >/dev/null
R=$(curl -s -H "$K" $U/docs/bankTx/po-t-multi); ok "paiement multiple : 26/164" "$R" '"docId":"d-m1"'; ok "paiement multiple : 26/177" "$R" '"docId":"d-m2"'; no "26/16 non confondue" "$R" '"docId":"d-m3"'
R=$(curl -s -H "$K" $U/docs/bankTx/po-t-out); ok "sortie reliée à la facture d'achat" "$R" '"docId":"fa-pd-1"'; ok "lien vers les achats" "$R" '"coll":"purchases"'
touch $T/ponto-extra.json.norev
ok "compte retiré dans Ponto" "$(curl -s -H "$A" -X POST -d '{"force":true}' $U/ponto/sync)" '"removed":1'
ok "compte retiré de l'ERP" "$(curl -s -H "$K" $U/docs/bankAccounts/acc-rev)" 'introuvable'
rm -f $T/ponto-extra.json.norev
ok "compte de nouveau partagé" "$(curl -s -H "$A" -X POST -d '{"force":true}' $U/ponto/sync)" '"accounts":2'
echo "> paiements (Ponto)"
curl -s -H "$K" -X POST -d '{"purchases":{"fa-pay1":{"source":"falco","number":"FX-1","amount":121,"currency":"EUR","supplierName":"Air Liquide Belgium","supplierVat":"BE0400000001","supplierIban":"BE71096123456769","paymentRef":"+++090/9337/55493+++"},"fa-pay2":{"source":"falco","number":"FX-2","amount":80,"currency":"EUR","supplierName":"Air Liquide Belgium","supplierVat":"BE0400000001","supplierIban":"BE43068999999501"},"fa-pay3":{"source":"falco","number":"FX-3","amount":50,"currency":"EUR","supplierName":"Pirate","supplierIban":"BE00096123456769"},"fa-pay4":{"source":"falco","number":"FX-4","amount":99999,"currency":"EUR","supplierName":"Air Liquide Belgium","supplierVat":"BE0400000001","supplierIban":"BE71096123456769"}}}' $U/import >/dev/null
ok "paiement interdit au terrain" "$(curl -s -H "$HT" $U/pay/check/fa-pay1)" 'rôle'
R=$(curl -s -H "$B" $U/pay/check/fa-pay1); ok "contrôle : IBAN déjà payé" "$R" '"ibanStatus":"known"'; ok "communication structurée" "$R" '"structured":true'; ok "bureau sans droit" "$R" '"canPay":false'; ok "comptes Ponto proposés" "$R" 'acc-beo'
ok "création refusée sans droit" "$(curl -s -H "$B" -X POST -d '{"id":"fa-pay1","accountId":"acc-beo","code":"000000"}' $U/pay/create)" 'Initier des paiements'
ok "droit non donné par une clé d'accès" "$(curl -s -H "$K" -X PUT -d '{"name":"Bea Bureau","email":"bea@example.test","role":"bureau","canPay":true}' $U/auth/users/u3)" 'second facteur'
ok "droit accordé par l'admin (2FA)" "$(curl -s -H "$A" -X PUT -d '{"name":"Bea Bureau","email":"bea@example.test","role":"bureau","canPay":true}' $U/auth/users/u3)" '"canPay":true'
curl -s -H "$A" -X PUT -d '{"name":"Élise Dupont","email":"elise@example.test","role":"admin","canPay":true}' $U/auth/users/u1 >/dev/null
ok "jamais avec une clé d'accès" "$(curl -s -H "$K" -X POST -d '{"id":"fa-pay1","accountId":"acc-beo","code":"000000"}' $U/pay/create)" "clé d'accès"
ok "code 2FA exigé" "$(curl -s -H "$B" -X POST -d '{"id":"fa-pay1","accountId":"acc-beo","code":"000000"}' $U/pay/create)" 'incorrect'
ok "IBAN invalide bloqué" "$(curl -s -H "$B" $U/pay/check/fa-pay3)" 'clé de contrôle'
ok "plafond par paiement" "$(curl -s -H "$B" $U/pay/check/fa-pay4)" 'plafond'
R=$(curl -s -H "$B" -X POST -d "{\"id\":\"fa-pay1\",\"accountId\":\"acc-beo\",\"code\":\"$(php $D/totp.php $(cat $T/tfa-bea_bureau) 1)\"}" $U/pay/create)
ok "paiement préparé" "$R" '"status":"unsigned"'; ok "lien de signature Ponto" "$R" 'ponto.example/sign/pp-1'
PAYID=$(echo "$R" | jget id)
ok "montant et IBAN pris sur la facture" "$(cat $T/ponto-extra.json.pay)" '"amount":121'; ok "communication structurée transmise" "$(cat $T/ponto-extra.json.pay)" '"remittanceInformation":"090933755493"'
ok "un seul paiement en cours" "$(curl -s -H "$B" $U/pay/check/fa-pay1)" 'déjà en cours'
ok "paiement visible" "$(curl -s -H "$B" $U/docs/payments/$PAYID)" '"by":"Bea Bureau"'
no "paiements cachés au terrain" "$(curl -s -H "$HT" $U/docs/payments)" 'pp-1'
ok "paiement non modifiable par le navigateur" "$(curl -s -H "$A" -X PATCH -d '{"amount":1}' $U/docs/payments/$PAYID)" 'serveur'
curl -s -H "$A" -X PATCH -d '{"counterpartIban":"BE43068999999501","amount":-1,"note":"x"}' $U/docs/bankTx/po-t-2 >/dev/null
R=$(curl -s -H "$K" $U/docs/bankTx/po-t-2); ok "mouvement bancaire protégé" "$R" '"amount":-20'; ok "note permise" "$R" '"note":"x"'
R=$(curl -s -H "$B" $U/pay/check/fa-pay2); ok "IBAN changé détecté" "$R" '"ibanStatus":"changed"'
ok "confirmation exigée pour un IBAN changé" "$(curl -s -H "$A" -X POST -d '{"id":"fa-pay2","accountId":"acc-beo","code":"000000"}' $U/pay/create)" 'confirmez'
touch $T/ponto-extra.json.noredirect
R=$(curl -s -H "$A" -X POST -d "{\"id\":\"fa-pay2\",\"accountId\":\"acc-beo\",\"ibanAck\":true,\"code\":\"$(php $D/totp.php $(cat $T/tfa-elise_dupont) 1)\"}" $U/pay/create); rm -f $T/ponto-extra.json.noredirect
ok "paiement sans redirection (signature dans Ponto)" "$R" '"noRedirect":true'
P2=$(echo "$R" | jget id)
ok "annulation avant signature" "$(curl -s -H "$A" -X POST -d "{\"id\":\"$P2\"}" $U/pay/cancel)" '"ok":true'
ok "annulé chez Ponto" "$(curl -s -H "$K" $U/docs/payments/$P2)" '"status":"cancelled"'
php -r '$f=$argv[1]; $s=json_decode(file_get_contents($f),true); $s["pp-1"]["status"]="accepted-settlement-completed"; file_put_contents($f,json_encode($s));' $T/ponto-extra.json.pay
ok "statut relu : exécuté" "$(curl -s -H "$B" -X POST -d "{\"id\":\"$PAYID\"}" $U/pay/status)" 'exécuté'
ok "plus annulable une fois signé" "$(curl -s -H "$B" -X POST -d "{\"id\":\"$PAYID\"}" $U/pay/cancel)" 'déjà signé'
ok "plafonds : code exigé" "$(curl -s -H "$A" -X POST -d '{"one":5000,"day":9000,"code":"000000"}' $U/pay/limits)" 'incorrect'
ok "plafonds réservés à l'admin" "$(curl -s -H "$B" -X POST -d '{"one":5000,"day":9000,"code":"000000"}' $U/pay/limits)" 'administrateur'
pkill -f "127.0.0.1:8769" || true
echo "> coda"
ok "coda interdit au terrain" "$(curl -s -H "$HT" -X POST -d '{}' $U/coda/preview)" 'rôle'
R=$(curl -s -H "$A" -X POST -d '{"accountId":"acc-beo","from":"2026-11-01","to":"2026-11-14"}' $U/coda/preview); ok "aperçu" "$R" '"count":13'
R=$(curl -s -H "$A" -X POST -d '{"accountId":"acc-beo","from":"2026-11-01","to":"2026-11-14"}' $U/coda/generate); ok "génération" "$R" '"no":"2026-001"'
FID=$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["doc"]["fileId"] ?? "";')
curl -s -H "$K" "$U/files/$FID?download=1" > $T/c.cod
php -r '
$L = preg_split("/\r\n/", rtrim(file_get_contents($argv[1]), "\r\n"));
$bad = array_filter($L, fn($l) => strlen($l) !== 128); if ($bad) { echo "LONGUEUR KO\n"; exit(1); }
$types = array_map(fn($l) => $l[0] === "2" ? substr($l, 0, 2) : $l[0], $L);
if ($types[0] !== "0" || $types[1] !== "1" || end($types) !== "9" || $types[count($types) - 2] !== "8") { echo "ORDRE KO\n"; exit(1); }
$n21 = count(array_filter($types, fn($t) => $t === "21"));
$cnt = (int) substr(end($L), 16, 6); if ($cnt !== 1 + 3 * $n21 + 1) { echo "COMPTE KO $cnt\n"; exit(1); }
$credit = 0; $debit = 0; foreach ($L as $l) if (substr($l, 0, 2) === "21") { $a = (int) substr($l, 32, 15); if ($l[31] === "1") $debit += $a; else $credit += $a; }
if ((int) substr(end($L), 22, 15) !== $debit || (int) substr(end($L), 37, 15) !== $credit) { echo "TOTAUX KO\n"; exit(1); }
$old = (int) substr($L[1], 43, 15) * ($L[1][42] === "1" ? -1 : 1); $new = (int) substr($L[count($L) - 2], 42, 15) * ($L[count($L) - 2][41] === "1" ? -1 : 1);
if ($old + $credit - $debit !== $new) { echo "SOLDES KO\n"; exit(1); }
$ogm = array_filter($L, fn($l) => substr($l, 0, 2) === "21" && substr($l, 61, 16) === "1101202600005044"); if (!$ogm) { echo "OGM KO\n"; exit(1); }
if (substr($L[1], 1, 1) !== "2" || substr($L[1], 5, 16) !== "BE68539007547034") { echo "COMPTE BE KO\n"; exit(1); }
echo "CODA OK ", count($L), " lignes\n";' $T/c.cod || exit 1
ok "chevauchement refusé" "$(curl -s -H "$A" -X POST -d '{"accountId":"acc-beo","from":"2026-11-10","to":"2026-11-15"}' $U/coda/generate)" 'déjà dans un fichier'
ok "suite acceptée" "$(curl -s -H "$A" -X POST -d '{"accountId":"acc-beo","from":"2026-11-15","to":"2026-11-15"}' $U/coda/generate)" '"no":"2026-002"'
ok "mouvement marqué" "$(curl -s -H "$K" $U/docs/bankTx/po-t-ogm)" '"no":"2026-001"'
ok "historique protégé" "$(curl -s -H "$A" -X DELETE $U/docs/codaFiles/x)" 'serveur'
CID=$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["id"] ?? "";')
ok "annulation" "$(curl -s -H "$A" -X POST -d "{\"id\":\"$CID\"}" $U/coda/cancel)" '"ok":true'
no "mouvement libéré" "$(curl -s -H "$K" $U/docs/bankTx/po-t-ogm)" '"coda"'
ok "régénération après annulation" "$(curl -s -H "$A" -X POST -d '{"accountId":"acc-beo","from":"2026-11-01","to":"2026-11-14"}' $U/coda/generate)" '"no":"2026-003"'
ok "compte étranger (structure 3)" "$(curl -s -H "$A" -X POST -d '{"accountId":"acc-rev","from":"2026-01-01","to":"2026-11-15"}' $U/coda/generate)" 'Aucun mouvement'
echo "> bureau"
ok "factures complètes" "$(curl -s -H "$B" $U/docs/docs)" 'Azote'
curl -s -H "$B" -X PUT -d '{"name":"Pirate","vat":"X","bankBalance":99,"gasLocations":[]}' $U/docs/settings/company >/dev/null
R=$(curl -s -H "$K" $U/docs/settings/company); ok "coordonnées entreprise conservées" "$R" 'W.A.Y.S. SRL'; ok "solde modifiable" "$R" '"bankBalance":99'
ok "pas de gestion des utilisateurs" "$(curl -s -H "$B" $U/auth/users)" 'dministrateur'
echo "> assistant IA"
pkill -f "127.0.0.1:8770" || true
pkill -f "127.0.0.1:8771" || true
echo "> historique"
curl -s -H "$B" -X PUT -d '{"kind":"facture","number":"H-1","status":"brouillon","lines":[]}' $U/docs/docs/h-1 >/dev/null
curl -s -H "$B" -X PATCH -d '{"status":"envoyee"}' $U/docs/docs/h-1 >/dev/null
curl -s -H "$B" -X POST -d '{"coll":"docs","id":"h-1","action":"mail","to":"client@example.test"}' $U/log/event >/dev/null
curl -s -H "$B" -X DELETE $U/docs/docs/h-1 >/dev/null
R=$(curl -s -H "$A" "$U/log?coll=docs&id=h-1")
ok "création notée" "$R" '"action":"create"'; ok "validation notée" "$R" '"action":"validate"'; ok "changement de statut" "$R" '"status","brouillon","envoyee"'
ok "e-mail préparé noté" "$R" '"action":"mail"'; ok "suppression notée" "$R" '"action":"delete"'; ok "libellé" "$R" 'Facture H-1'
ok "auteur noté" "$R" '"by":"Bea Bureau"'
ok "historique interdit au terrain" "$(curl -s -H "$HT" $U/log)" 'réservé'
R=$(curl -s -H "$B" "$U/log?limit=300"); ok "vue générale" "$R" '"items"'; ok "synchro Odoo notée" "$R" '"by":"Odoo"'; curl -s -H "$B" -X PATCH -d '{"matches":[{"docId":"d-m3","number":"26/16","amount":1}]}' $U/docs/bankTx/po-t-new >/dev/null
ok "rapprochement bancaire noté" "$(curl -s -H "$B" "$U/log?action=link")" '"coll":"bankTx"'
ok "connexion notée" "$(curl -s -H "$A" "$U/log?coll=auth")" '"action":"login"'
no "positions non notées" "$R" '"coll":"vehPos"'
ok "personnes" "$(curl -s -H "$B" $U/log/people)" 'Odoo'
curl -s -H "$B" -X PUT -d '{"vehicleId":"veh-h","type":"Entretien"}' $U/docs/vehEvents/ev-h >/dev/null
ok "intervention dans l'historique du véhicule" "$(curl -s -H "$B" "$U/log?coll=vehicles&id=veh-h&related=1")" '"coll":"vehEvents"'
ok "session dans le profil" "$(curl -s -H "Authorization: Bearer $S" $U/auth/me)" '"expires"'
echo "> environnement de test"
ok "test inactif" "$(curl -s -H "$B" $U/sandbox)" '"active":false'
ok "test refusé au terrain" "$(curl -s -H "$HT" -X POST -d '{}' $U/sandbox/start)" 'bureau'
ok "test activé" "$(curl -s -H "$B" -X POST -d '{}' $U/sandbox/start)" '"active":true'
ok "profil en test" "$(curl -s -H "$B" $U/auth/me)" '"sandbox":{'
curl -s -H "$B" -X PUT -d '{"kind":"facture","number":"SBX-1","status":"brouillon","lines":[]}' $U/docs/docs/sbx-1 >/dev/null
curl -s -H "$B" -X PATCH -d '{"number":"26/164-TEST"}' $U/docs/docs/d-m1 >/dev/null
curl -s -H "$B" -X DELETE $U/docs/docs/d-m2 >/dev/null
R=$(curl -s -H "$B" $U/docs/docs); ok "création visible en test" "$R" 'SBX-1'; ok "modification visible en test" "$R" '26/164-TEST'; no "suppression visible en test" "$R" '"id":"d-m2"'
R=$(curl -s -H "$A" $U/docs/docs); no "base principale sans création" "$R" 'SBX-1'; no "base principale non modifiée" "$R" '26/164-TEST'; ok "base principale sans suppression" "$R" '"id":"d-m2"'
ok "fiche lue dans le test" "$(curl -s -H "$B" $U/docs/docs/d-m1)" '26/164-TEST'
ok "changements du test" "$(curl -s -H "$B" "$U/changes?since=0&colls=docs")" 'SBX-1'
no "changements principaux propres" "$(curl -s -H "$A" "$U/changes?since=0&colls=docs")" 'SBX-1'
ok "envoi Falco bloqué en test" "$(curl -s -H "$B" -X POST -d '{}' $U/falco/push)" 'Environnement de test'
ok "synchro ignorée en test" "$(curl -s -H "$B" -X POST -d '{}' $U/odoo/sync)" '"sandbox":true'
no "pas d'historique pour le test" "$(curl -s -H "$A" "$U/log?coll=docs&id=sbx-1")" 'SBX-1'
ok "nombre de changements" "$(curl -s -H "$B" $U/sandbox)" '"changes":3'
ok "test quitté" "$(curl -s -H "$B" -X POST -d '{}' $U/sandbox/stop)" '"active":false'
R=$(curl -s -H "$B" $U/docs/docs); no "création effacée" "$R" 'SBX-1'; no "modification effacée" "$R" '26/164-TEST'; ok "suppression annulée" "$R" '"id":"d-m2"'
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
R=$(curl -s -H "$B" -X POST -d '{"messages":[{"role":"user","content":"Une facture d achat FedEx ?"}]}' $U/assistant/chat); ok "achats consultables" "$R" 'FedEx'
curl -s -H "$B" -X PUT -d '{"plate":"1-ABC-123","fleetNo":"042","docs":[]}' $U/docs/vehicles/veh-t >/dev/null
printf '%%PDF-1.4 controle technique 1-ABC-123' > $T/ct.pdf
FID=$(curl -s -H "$B" -F "file=@$T/ct.pdf;type=application/pdf" $U/files | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["id"] ?? "";')
R=$(curl -s -H "$B" -X POST -d "{\"messages\":[{\"role\":\"user\",\"content\":\"\",\"files\":[{\"id\":\"$FID\",\"name\":\"ct.pdf\"}]}]}" $U/assistant/chat)
ok "fichier rangé par Axel" "$R" '"op":"update"'; ok "véhicule modifié" "$R" '"id":"veh-t"'
R2=$(curl -s -H "$K" $U/docs/vehicles/veh-t); ok "document ajouté au véhicule" "$R2" "\"file\":\"$FID\""; ok "échéance CT mise à jour" "$R2" '"ctDate":"2027-11-12"'
no "contenu du fichier pas renvoyé" "$R" '"base64"'; ok "fichier gardé dans la conversation" "$R" '"name":"ct.pdf"'
ok "document envoyé à Claude" "$(grep -c '"type":"document"' $T/ai.log)" '[12]'
R=$(curl -s -H "$B" -X POST -d '{"messages":[{"role":"user","content":"Crée une facture"}]}' $U/assistant/chat)
ok "fiche créée par Axel" "$R" '"op":"create"'; ok "numéro attribué" "$R" 'Facture F-2026-0'; ok "créée en brouillon" "$R" 'status.....brouillon'
ok "historique au nom d'Axel" "$(curl -s -H "$A" "$U/log?q=Axel")" 'Axel (pour Bea Bureau)'
R=$(curl -s -H "$B" -X POST -d '{"messages":[{"role":"user","content":"Modifie la facture Odoo"}]}' $U/assistant/chat); ok "données Odoo protégées" "$R" 'Odoo'; no "pas d'écriture sur Odoo" "$R" '"op":"update"'
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
c -H "$K" -X PUT -d '{"kind":"facture","status":"envoyee","number":"F-AX-77","date":"2026-11-01","clientId":"c-001","lines":[{"label":"x","qty":1,"price":100,"vat":21}]}' $U/docs/docs/d-ax77
c -H "$K" -X PUT -d '{"accountId":"acc-beo","amount":121,"date":"2026-11-10","counterpart":"Liège Airport","remittance":"Paiement F-AX-77","structured":false}' $U/docs/bankTx/tx-ax77
R=$(curl -s -H "$B" -X POST -d '{"text":"Rapproche la banque"}' $U/assistant/say); ok "Axel relie un paiement certain" "$R" 'Paiement 121,00 € → F-AX-77'
ok "lien enregistré sur le mouvement" "$(curl -s -H "$K" $U/docs/bankTx/tx-ax77)" '"docId":"d-ax77"'
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
ok "consommation suivie" "$(curl -s -H "$B" $U/assistant/status)" '"questions":22'
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
echo "> garages et chauffeurs"
curl -s -H "Authorization: Bearer $S" -X PUT -d '{"name":"Gary Garage","email":"gary@example.test","role":"garage"}' $U/auth/users/u7 >/dev/null
curl -s -H "Authorization: Bearer $S" -X PUT -d '{"name":"Sophie Lambert","email":"sophie@example.test","role":"chauffeur"}' $U/auth/users/u8 >/dev/null
GT=$(login "Gary Garage")
CT=$(login "Sophie Lambert")
[ ${#GT} -eq 64 ] && [ ${#CT} -eq 64 ] || { echo "SESSIONS GARAGE/CHAUFFEUR ECHEC"; exit 1; }
G="Authorization: Bearer $GT"; CH="Authorization: Bearer $CT"
curl -s -H "$K" -X PUT -d '{"name":"Garage Dupont","lat":50.6375,"lon":5.4432,"radius":200,"userIds":["u7"],"supplierVat":"BE0123456789","notes":"interne"}' $U/docs/garages/g1 >/dev/null
curl -s -H "$K" -X PUT -d '{"name":"Autre garage","userIds":[]}' $U/docs/garages/g2 >/dev/null
R=$(curl -s -H "$G" $U/docs/garages); ok "garage : sa fiche" "$R" 'Garage Dupont'; no "garage : pas les autres garages" "$R" 'Autre garage'; no "garage : commentaires internes masqués" "$R" 'interne'
ok "garage : véhicule chez lui (GPS) en entier" "$(curl -s -H "$G" $U/docs/vehicles/v-1)" '"atMyGarage":"gps'
R=$(curl -s -H "$G" $U/docs/vehicles/v-2); ok "garage : autre véhicule en résumé" "$R" '"plate":"2-XYZ-999"'; no "garage : sans les documents" "$R" '"docs"'
ok "garage : factures invisibles" "$(curl -s -H "$G" $U/docs/docs)" '"docs":\[\]'
ok "garage : export refusé" "$(curl -s -H "$G" $U/export)" 'rôle'
curl -s -H "$G" -X PATCH -d '{"todo":"Freins arrière","plate":"PIRATE"}' $U/docs/vehicles/v-1 >/dev/null
R=$(curl -s -H "$K" $U/docs/vehicles/v-1); ok "garage : encode sur son véhicule" "$R" 'Freins arrière'; no "garage : plaque verrouillée" "$R" 'PIRATE'
ok "garage : véhicule absent non modifiable" "$(curl -s -H "$G" -X PATCH -d '{"todo":"x"}' $U/docs/vehicles/v-2)" 'pas dans votre garage'
curl -s -H "$G" -X PUT -d '{"vehicleId":"v-2","description":"Rétro cassé","status":"ouverte"}' $U/docs/faults/fg1 >/dev/null
ok "garage : panne hors garage « en attente »" "$(curl -s -H "$K" $U/docs/faults/fg1)" '"status":"attente"'
curl -s -H "$G" -X PATCH -d '{"status":"reparee"}' $U/docs/faults/fg1 >/dev/null
ok "garage : ne valide pas lui-même" "$(curl -s -H "$K" $U/docs/faults/fg1)" '"status":"attente"'
curl -s -H "$G" -X PUT -d '{"vehicleId":"v-1","description":"Plaquettes","status":"planifiee"}' $U/docs/faults/fg2 >/dev/null
R=$(curl -s -H "$K" $U/docs/faults/fg2); ok "garage : panne sur son véhicule" "$R" '"status":"planifiee"'; ok "garage : attribuée à lui" "$R" '"garageId":"g1"'
ok "garage : entretien sur son véhicule" "$(curl -s -H "$G" -X PUT -d '{"vehicleId":"v-1","type":"entretien","date":"2026-11-18","note":"Vidange"}' $U/docs/vehEvents/eg1)" '"ok":true'
ok "garage : entretien relié au garage" "$(curl -s -H "$K" $U/docs/vehEvents/eg1)" '"garageId":"g1"'
ok "garage : entretien sur un autre véhicule refusé" "$(curl -s -H "$G" -X PUT -d '{"vehicleId":"v-2","type":"entretien"}' $U/docs/vehEvents/eg2)" 'présents dans votre garage'
R=$(curl -s -H "$CH" $U/docs/trips); no "chauffeur : pas les trajets des autres" "$R" '7001'
ok "chauffeur : factures invisibles" "$(curl -s -H "$CH" $U/docs/docs)" '"docs":\[\]'
curl -s -H "$CH" -X PUT -d '{"vehicleId":"v-1","description":"Bruit","status":"reparee"}' $U/docs/faults/fc1 >/dev/null
ok "chauffeur : signale une panne (ouverte)" "$(curl -s -H "$K" $U/docs/faults/fc1)" '"status":"ouverte"'
ok "chauffeur : ne modifie pas une panne" "$(curl -s -H "$CH" -X PATCH -d '{"status":"reparee"}' $U/docs/faults/fc1)" 'pas de modifier'
ok "chauffeur : ne modifie pas un véhicule" "$(curl -s -H "$CH" -X PATCH -d '{"km":1}' $U/docs/vehicles/v-1)" 'rôle'
no "chauffeur : commentaires internes du véhicule masqués" "$(curl -s -H "$CH" $U/docs/vehicles/v-1)" 'Freins arrière'
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
wa "$(wamsg 32470112233 wamid.D1 'Combien de factures impayées ?')" >/dev/null; sleep 2
R=$(cat $T/meta.log); ok "chauffeur reconnu par son GSM : Axel répond" "$R" '"to":"32470112233"'; ok "« en train d'écrire »" "$R" 'typing_indicator'; no "pas de réponse « inconnu » au chauffeur" "$R" 'réservé'
ok "fil Axel du chauffeur, marqué WhatsApp" "$(php -r '$p=new PDO("sqlite:".$argv[1]); echo $p->query("SELECT data FROM ways_ai_thread WHERE user_key=\"u:drv:wf-D1\"")->fetchColumn();' $T/t.db)" '"via":"whatsapp"'
: > $T/meta.log
wa "$(wamsg 32470112233 wamid.D1 'Combien de factures impayées ?')" >/dev/null; sleep 1
ok "message en double ignoré" "$(cat $T/meta.log | wc -l | tr -d ' ')" '^0$'
curl -s -H "$A" -X POST -d '{"contacts":[{"num":"0475 12 34 56","kind":"user","ref":"u3","name":"Bea Bureau"}]}' $U/whatsapp/contacts >/dev/null
ok "numéro de l'équipe normalisé" "$(curl -s -H "$A" $U/whatsapp/status)" '"num":"32475123456"'
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
# chauffeur : seulement les documents de bord actuels d'un véhicule qu'il utilise (v-1 : Marc au volant d'après WebFleet)
up() { curl -s -H "$K" -F "file=@$T/cert.pdf" $U/files | php -r 'echo json_decode(stream_get_contents(STDIN))->id;'; }
F1=$(up); F2=$(up); F3=$(up); F4=$(up)
curl -s -H "$K" -X PUT -d '{"plate":"1-ABC-123","fleetNo":"001","webfleetId":"012","docs":[{"id":"d1","type":"ct","file":"'$F1'","expires":"2027-11-01"},{"id":"d3","type":"leasing","file":"'$F3'"},{"id":"d4","type":"ct","file":"'$F4'","expires":"2026-01-01"}]}' $U/docs/vehicles/v-1 >/dev/null
curl -s -H "$K" -X PUT -d '{"plate":"2-XYZ-999","fleetNo":"002","docs":[{"id":"d2","type":"ct","file":"'$F2'","expires":"2027-11-01"}]}' $U/docs/vehicles/v-2 >/dev/null
drvask() { : > $T/meta.log; wa "$(wamsg 32470112233 wamid.F$RANDOM "Envoie-moi fileId $1")" >/dev/null; sleep 2; cat $T/meta.log; }
R=$(drvask $F1); ok "chauffeur : CT du véhicule qu'il conduit envoyé" "$R" '"to":"32470112233","type":"document"'
R=$(drvask $F2); ok "chauffeur : véhicule non utilisé → refus avec identification" "$R" 'Identifie-toi'; no "chauffeur : rien envoyé" "$R" '"type":"document"'
R=$(drvask $F3); ok "chauffeur : contrat de leasing refusé" "$R" 'documents de bord'
R=$(drvask $F4); ok "chauffeur : ancien CT refusé" "$R" "plus en vigueur"
pkill -f "127.0.0.1:8772" || true
php -r '$p=new PDO("sqlite:".$argv[1]); $p->prepare("REPLACE INTO ways_kv VALUES (?,?)")->execute(["ai_usage_".gmdate("Y-m"),json_encode(["in"=>0,"out"=>0,"usd"=>9,"q"=>3])]);' $T/t.db
ok "plafond mensuel" "$(curl -s -H "$B" -X POST -d '{"messages":[{"role":"user","content":"Encore ?"}]}' $U/assistant/chat)" 'Plafond mensuel'
pkill -f "127.0.0.1:8770" || true
echo "> relances"
ok "relance notée" "$(curl -s -H "$B" -X PUT -d '{"kind":"client","key":"c1","type":"rappel","level":1,"date":"2026-11-18","items":[{"id":"d1","number":"F-1","amount":10}]}' $U/docs/reminders/rm-1)" '"ok":true'
no "relances cachées au terrain" "$(curl -s -H "$HT" $U/docs/reminders)" 'rm-1'
ok "lien entre fiches" "$(curl -s -H "$B" -X PUT -d '{"a":{"coll":"vehicles","id":"v1"},"b":{"coll":"purchases","id":"fa-pay1"}}' $U/docs/links/lk-1)" '"ok":true'
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
ok "droit de paiement retiré à la réinitialisation" "$(curl -s -H "$A" $U/auth/users)" '"name":"Bea Bureau","email":"bea@example.test","role":"bureau","active":true,"tfa":false,"tfaRequired":true,"canPay":false,"payRight":false'
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
