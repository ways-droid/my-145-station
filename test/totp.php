<?php // Code TOTP pour les tests : php totp.php SECRET [décalage en pas de 30 s]
require __DIR__ . '/../api/security.php';
echo totp_at($argv[1], intdiv(time(), 30) + (int) ($argv[2] ?? 0));
