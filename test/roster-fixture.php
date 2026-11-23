<?php
// petit classeur au format « TLV Roster OFFICIAL » (onglet caché + onglet OFFICIAL, deux mois côte à côte)
$cell = function ($c, $r, $v) { $ref = ''; for ($n = $c; $n > 0; $n = intdiv($n - 1, 26)) $ref = chr(65 + ($n - 1) % 26) . $ref; $ref .= $r;
    $st = ''; if (is_string($v) && preg_match('/^(.*)\|(\d)$/', $v, $m)) { $v = $m[1]; $st = " s=\"$m[2]\""; }
    return is_int($v) ? "<c r=\"$ref\"><v>$v</v></c>" : "<c r=\"$ref\"$st t=\"inlineStr\"><is><t>" . htmlspecialchars($v) . "</t></is></c>"; };
$rows = [3 => [5 => 'BASE: TLV Station', 6 => 'November 2026', 37 => 'December 2026'], 4 => [], 7 => [5 => 'STAFF / ROSTER'],
    8 => [1 => 'Station Lead', 5 => 'Marc Terrain (B1) (767) - DL'], 9 => [5 => 'A:      Unknown Guy (747)'], 10 => [5 => 'Autre Personne FAA'], 12 => [5 => 'OPERATION / RESOURCES']];
for ($d = 1; $d <= 30; $d++) $rows[4][5 + $d] = $d; for ($d = 1; $d <= 31; $d++) $rows[4][36 + $d] = $d;
$rows[8] += [6 => 'D/N', 7 => 'D/N', 8 => 'D/N', 9 => 'T', 10 => 'E', 11 => 'CGN|1', 14 => 'BOM|2', 12 => 'D/N !!', 13 => 'XYZQ'];
$rows[9] += [6 => 'D'];
$rows[10] += [37 => 'N', 38 => 'T+D'];
$rows[12] += [6 => 'ENGINEERS'];
$x = '<worksheet><sheetData>'; foreach ($rows as $r => $cs) { ksort($cs); $x .= "<row r=\"$r\">" . implode('', array_map(fn($c, $v) => $cell($c, $r, $v), array_keys($cs), $cs)) . '</row>'; } $x .= '</sheetData></worksheet>';
$z = new ZipArchive(); $z->open($argv[1], ZipArchive::CREATE | ZipArchive::OVERWRITE);
$z->addFromString('xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="OLD" state="hidden" r:id="rId1"/><sheet name="TLV-2026 OFFICIAL-Bis" r:id="rId2"/></sheets></workbook>');
$z->addFromString('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>');
$tb = fn($col) => "<border><left/><right/><top style=\"thick\"><color rgb=\"$col\"/></top><bottom style=\"thick\"><color rgb=\"$col\"/></bottom></border>";
$z->addFromString('xl/styles.xml', '<styleSheet><borders count="3"><border/>' . $tb('FF000000') . $tb('FF0070C0') . '</borders><cellXfs count="3"><xf borderId="0"/><xf borderId="1"/><xf borderId="2"/></cellXfs></styleSheet>');
$z->addFromString('xl/worksheets/sheet1.xml', '<worksheet><sheetData/></worksheet>');
$z->addFromString('xl/worksheets/sheet2.xml', $x);
$z->close();
