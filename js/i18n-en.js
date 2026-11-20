"use strict";
/* Dictionnaire français → anglais de l'interface my-145-station */
Object.assign(EN, {
  // ---- navigation & général
  "Tableau de bord": "Dashboard", "Opérations": "Operations", "Ventes": "Sales", "Gaz": "Gas", "Flotte": "Fleet", "Étalonnage": "Calibration",
  "Signaler une panne": "Report a fault", "Factures": "Invoices", "Devis": "Quotes", "Clients": "Customers", "Produits & prix": "Products & prices",
  "Paramètres": "Settings", "Données partagées et enregistrées": "Shared and saved data", "Lecture seule": "Read-only", "Connexion…": "Connecting…",
  "Aperçu : rien n'est enregistré": "Preview: nothing is saved", "Logo my-145-station": "my-145-station logo",
  "Aperçu hors ligne : la base de données n'est pas disponible ici, les modifications ne seront pas enregistrées.": "Offline preview: the database is not available here, changes will not be saved.",
  "L'accès aux données a été retiré pour cette session.": "Access to the data has been withdrawn for this session.",
  "Les données ne sont pas encore joignables. Ce qui s'affiche peut être incomplet.": "The data cannot be reached yet. What is shown may be incomplete.",
  "Accès en lecture seule : demandez au propriétaire un accès « Contributeur » pour modifier.": "Read-only access: ask the owner for “Contributor” access to make changes.",
  "Accès en lecture seule : la modification n'a pas été enregistrée.": "Read-only access: the change was not saved.",
  "La base est pleine : supprimez d'anciens documents pour continuer.": "The database is full: delete old records to continue.",
  "Enregistrement impossible pour l'instant. Réessayez dans un instant.": "Could not save right now. Try again in a moment.",
  "Annuler": "Cancel", "Enregistrer": "Save", "Supprimer": "Delete", "Modifier": "Edit", "Fermer": "Close", "Confirmer": "Confirm", "Ajouter": "Add",
  "Appliquer": "Apply", "Retour": "Back", "Renommer": "Rename", "Retirer": "Remove", "Remettre": "Restore", "Rechercher": "Search", "Rechercher…": "Search…",
  "Filtrer": "Filter", "Tous": "All", "Toutes": "All", "Tout": "All", "Aucun": "None", "Aucune": "None", "C'est fait": "Done", "Enregistré": "Saved",
  "Enregistrement…": "Saving…", "Envoi…": "Sending…", "Choisir…": "Choose…", "Choisir un client…": "Choose a customer…", "Choisir un véhicule…": "Choose a vehicle…",
  "Ouvrir le module →": "Open module →", "Rien ici.": "Nothing here.", "Rien ne correspond à ce filtre.": "Nothing matches this filter.",
  "Statut": "Status", "Statut :": "Status:", "Date": "Date", "Date :": "Date:", "Type": "Type", "Description": "Description", "Notes": "Notes", "Remarque": "Note",
  "Client": "Customer", "Client *": "Customer *", "Numéro": "Number", "Numéro *": "Number *", "Quantité": "Quantity", "Quantité *": "Quantity *", "Qté": "Qty",
  "Total": "Total", "Total :": "Total:", "Total HT": "Total excl. VAT", "Total TVAC": "Total incl. VAT", "HT": "excl. VAT", "TTC": "incl. VAT", "TVAC": "incl. VAT", "TVA": "VAT",
  "Prix HT": "Price excl. VAT", "Prix TVAC": "Price incl. VAT", "Coût": "Cost", "Coût HT": "Cost excl. VAT", "Coût HT (€)": "Cost excl. VAT (€)", "Marge": "Margin",
  "Article": "Item", "Service": "Service", "Services": "Services", "Produit": "Product", "Produits": "Products", "Produit (stocké)": "Product (stocked)",
  "Origine": "Origin", "Validité": "Valid until", "Échéance": "Due date", "Échéance :": "Due date:", "Valable jusqu'au": "Valid until", "Valable jusqu'au :": "Valid until:",
  "Photo": "Photo", "Photos": "Photos", "Historique": "History", "Contact": "Contact", "Message": "Message", "Objet": "Subject", "Destinataire": "Recipient",
  "Langue": "Language", "Langue de communication": "Communication language", "Langue du client :": "Customer language:", "(par défaut)": "(default)",
  "Oui": "Yes", "Non": "No", "Où": "Where", "Par": "By", "Mouvement": "Movement", "Unité": "Unit", "unité": "unit", "Catégorie": "Category", "Sans catégorie": "No category",
  "Aujourd'hui": "Today", "Autre": "Other", "Autres": "Others", "Actif": "Active", "Zoom": "Zoom", "Recentrer": "Re-centre",
  // ---- tableau de bord
  "Finances": "Finance", "Factures impayées": "Unpaid invoices", "Dont en retard": "Of which overdue", "Solde du compte": "Account balance",
  "Cliquez pour saisir le solde": "Click to enter the balance", "Brouillons à valider": "Drafts to approve", "CA facturé ·": "Invoiced revenue ·",
  "Chiffre d'affaires HT par mois": "Monthly revenue excl. VAT", "Chiffre d'affaires HT des 12 derniers mois": "Revenue excl. VAT, last 12 months",
  "Services & étalonnage": "Services & calibration", "Gaz & produits": "Gas & products", "Factures à encaisser": "Invoices to collect", "Tout est payé.": "Everything is paid.",
  "aucun retard": "nothing overdue", "· à mettre à jour": "· needs updating", "Stock de gaz": "Gas stock", "Pleines en stock": "Full in stock", "Vides en stock": "Empty in stock",
  "Chez les clients": "At customers", "Par type de gaz": "By gas type", "Pleines": "Full", "Vides": "Empty", "Chez clients": "At customers", "Fournisseur": "Supplier",
  "Par emplacement": "By location", "Emplacement": "Location", "Disponibles": "Available", "Panne / atelier": "Fault / workshop", "Immobilisés": "Immobilised",
  "À venir": "Coming up", "Rien dans les 45 prochains jours.": "Nothing in the next 45 days.", "Derniers chauffeurs": "Latest drivers", "Aucun véhicule.": "No vehicles.",
  "Réceptionnés": "Received", "En cours": "In progress", "Étalonnés à livrer": "Calibrated, to deliver", "Échéances dépassées": "Overdue",
  "Échéances des 30 prochains jours": "Due in the next 30 days", "Aucune échéance proche.": "Nothing due soon.", "Prêts à livrer": "Ready to deliver",
  "Aucun outil en attente de livraison.": "No tools awaiting delivery.", "Livrer du gaz": "Deliver gas", "Réceptionner des outils": "Receive tools", "Nouvelle facture": "New invoice",
  "Solde du compte bancaire": "Bank account balance", "Solde (€) *": "Balance (€) *", "Date du solde": "Balance date", "Solde enregistré": "Balance saved",
  "Relevé depuis votre banque en ligne. Une connexion bancaire automatique pourra être ajoutée plus tard.": "Taken from your online banking. An automatic bank connection can be added later.",
  "€0 TVAC (livraisons, étalonnages…)": "€0 incl. VAT (deliveries, calibrations…)",
  // ---- clients
  "Ajouter un client": "Add a customer", "Nouveau client": "New customer", "Raison sociale": "Company name", "Raison sociale *": "Company name *", "N° TVA": "VAT no.",
  "Personne de contact": "Contact person", "E-mail": "Email", "Téléphone": "Phone", "Adresse": "Address", "Code postal et ville": "Postcode and city",
  "Bouteilles chez lui": "Cylinders on site", "Outils": "Tools", "À encaisser": "To collect", "Client enregistré": "Customer saved",
  "Rechercher un nom, une ville, un n° de TVA…": "Search a name, city, VAT no.…", "Aucun client ne correspond.": "No matching customer.", "Aucun client pour l'instant.": "No customers yet.",
  "Supprimer ce client ?": "Delete this customer?", "Ajoutez d'abord un client.": "Add a customer first.",
  // ---- devis & factures
  "Nouveau devis": "New quote", "Facture": "Invoice", "Devis ": "Quote ", "Brouillon": "Draft", "Brouillons": "Drafts", "Envoyé": "Sent", "Envoyés": "Sent",
  "Accepté": "Accepted", "Acceptés": "Accepted", "Refusé": "Declined", "Refusés": "Declined", "Envoyée": "Sent", "Envoyées": "Sent", "Payée": "Paid", "Payées": "Paid",
  "En retard": "Overdue", "Rechercher un numéro ou un client…": "Search a number or customer…", "Aucun document pour l'instant.": "No documents yet.",
  "Livraison gaz": "Gas delivery", "Valable jusqu'au": "Valid until", "Ligne libre": "Free line", "+ Ajouter une ligne": "+ Add a line", "Retirer la ligne": "Remove line",
  "Prix unitaire HT": "Unit price excl. VAT", "Notes (visibles sur le document)": "Notes (shown on the document)",
  "Ajoutez au moins une ligne avec une description et un prix.": "Add at least one line with a description and a price.",
  "Marquer envoyé": "Mark as sent", "Convertir en facture": "Convert to invoice", "Valider et envoyer": "Approve and send", "Marquer payée": "Mark as paid",
  "Annuler le paiement": "Cancel payment", "Télécharger le PDF": "Download PDF", "Préparer l'e-mail": "Prepare email", "Facturé à": "Billed to",
  "Paiement avec la communication structurée": "Payment with structured reference", "Facture brouillon créée": "Draft invoice created",
  "Cette facture a été émise. En Belgique, une facture émise ne se supprime pas : établissez plutôt une note de crédit. Supprimer quand même ?": "This invoice has been issued. In Belgium an issued invoice is not deleted: issue a credit note instead. Delete anyway?",
  "Le générateur PDF n'a pas pu se charger. Réessayez.": "The PDF generator could not load. Try again.",
  "DEVIS": "QUOTE", "FACTURE": "INVOICE", "Facture ": "Invoice ",
  // ---- e-mails
  "Ouvrir dans la messagerie": "Open in email app", "Copier l'objet et le message": "Copy subject and message",
  "Joignez le PDF téléchargé à votre e-mail. Si le bouton « Ouvrir dans la messagerie » ne fonctionne pas sur cet appareil, utilisez « Copier ».": "Attach the downloaded PDF to your email. If “Open in email app” does not work on this device, use “Copy”.",
  "Copié : collez-le dans votre messagerie": "Copied: paste it into your email", "Sélectionnez le texte et copiez-le.": "Select the text and copy it.",
  // ---- produits & prix
  "Modifiez un prix directement dans le tableau : il est enregistré dès que vous quittez la case. Les nouveaux prix s'appliquent aux prochains documents ; les factures existantes ne changent pas.": "Edit a price directly in the table: it is saved as soon as you leave the field. New prices apply to future documents; existing invoices do not change.",
  "Bouteilles de gaz": "Gas cylinders", "Frais de livraison (EXP)": "Delivery fee (EXP)", "Articles & services": "Items & services",
  "Prix facturé par bouteille livrée.": "Price charged per cylinder delivered.", "Ajouter un type de bouteille": "Add a cylinder type", "Format": "Size", "Format *": "Size *",
  "Volume": "Volume", "Pression": "Pressure", "Contenu": "Content", "Prix HT / bouteille": "Price excl. VAT / cylinder", "Frais de transfert Airside (EXP)": "Airside transfer fee (EXP)",
  "Forfait ajouté une fois sur la facture brouillon de chaque livraison de gaz. Le montant reste modifiable au moment de la livraison (0 = pas de frais).": "Flat fee added once to the draft invoice of each gas delivery. The amount can still be changed at delivery (0 = no fee).",
  "Montant HT par livraison (€)": "Amount excl. VAT per delivery (€)", "Libellé sur la facture": "Label on the invoice", "Facturer les frais EXP sur les livraisons de gaz": "Charge the EXP fee on gas deliveries",
  "Frais EXP activés": "EXP fee enabled", "Frais EXP désactivés": "EXP fee disabled", "Libellé enregistré": "Label saved",
  "Outil, n° de série, client, catégorie…": "Tool, serial no., customer, category…", "Appliquer un prix à toute une catégorie :": "Apply a price to a whole category:",
  "Prix HT pour la catégorie": "Price excl. VAT for the category", "Outil": "Tool", "N° de série": "Serial no.", "N° de série *": "Serial no. *", "Prix étalonnage HT": "Calibration price excl. VAT",
  "Indiquez un prix.": "Enter a price.", "Ajouter un article": "Add an item", "Nouvel article": "New item", "Réf.": "Ref.", "Référence *": "Reference *", "Nom *": "Name *",
  "Prix de vente HT *": "Selling price excl. VAT *", "Coût d'achat HT": "Purchase cost excl. VAT", "Stock actuel": "Current stock", "Stock minimum": "Minimum stock", "Stock bas": "Low stock",
  "Article enregistré": "Item saved", "Mouvement de stock": "Stock movement", "Entrée (réception fournisseur)": "In (supplier delivery)", "Sortie (casse, usage interne)": "Out (breakage, internal use)",
  "Inventaire (fixer la quantité)": "Stock count (set the quantity)", "heure, jour, pièce…": "hour, day, piece…", "Rechercher une référence ou un nom…": "Search a reference or name…",
  "Supprimer cet article ? Les documents existants gardent leurs lignes.": "Delete this item? Existing documents keep their lines.",
  "par heure": "per hour", "par jour": "per day", "par pièce": "per piece", "par mois": "per month", "par session": "per session", "par forfait": "flat rate", "par carton": "per box",
  "prix non défini": "price not set",
  // ---- paramètres
  "Coordonnées affichées sur vos devis, factures, bons de livraison et certificats": "Details shown on your quotes, invoices, delivery notes and certificates",
  "Entreprise": "Company", "N° d'entreprise / TVA": "Company / VAT no.", "IBAN": "IBAN", "Adresse du siège": "Registered address", "Délai de paiement (jours)": "Payment term (days)",
  "Validité des devis (jours)": "Quote validity (days)", "Trésorerie": "Cash", "Solde du compte bancaire (€)": "Bank account balance (€)", "Solde au": "Balance as of",
  "Saisie manuelle pour l'instant. Une connexion bancaire automatique pourra être ajoutée plus tard.": "Entered manually for now. An automatic bank connection can be added later.",
  "Fournisseur des bouteilles": "Cylinder supplier", "Chauffeurs": "Drivers", "Un nom par ligne (proposés pour les prises de véhicule et les signalements)": "One name per line (offered for vehicle check-outs and fault reports)",
  "Enregistrer les paramètres": "Save settings", "Paramètres enregistrés": "Settings saved", "Données d'exemple": "Sample data",
  "Supprimer toutes les données d'exemple": "Delete all sample data", "Tout supprimer": "Delete all", "Aucune donnée d'exemple : tout ce qui est ici est à vous.": "No sample data: everything here is yours.",
  "Supprimer définitivement toutes les données d'exemple ? Vos propres saisies sont conservées.": "Permanently delete all sample data? Your own entries are kept.",
  "Les prix (articles, bouteilles de gaz, frais EXP, étalonnage) se gèrent dans": "Prices (items, gas cylinders, EXP fee, calibration) are managed in",
  // ---- gaz
  "Réception": "Receipt", "Livraison client": "Customer delivery", "Retour client": "Customer return", "Retour fournisseur": "Supplier return",
  "Sortie de bouteilles pleines + facture automatique": "Full cylinders out + automatic invoice", "Bouteilles vides récupérées chez un client": "Empty cylinders collected from a customer",
  "Vides renvoyées pour remplissage": "Empties sent back for refilling", "Bouteilles pleines reçues de": "Full cylinders received from",
  "Stock": "Stock", "Bouteilles": "Cylinders", "Livraisons": "Deliveries", "Types & emplacements": "Types & locations", "prêtes à livrer": "ready to deliver",
  "à renvoyer au fournisseur": "to return to the supplier", "en remplissage": "being refilled", "Chez le fournisseur": "At the supplier", "Stock par type et par emplacement": "Stock by type and location",
  "Type de bouteille": "Cylinder type", "Total en stock": "Total in stock", "Chaque case :": "Each cell:", "/ vides.": "/ empty.", "pleines": "full",
  "Créez d'abord vos types de bouteilles dans l'onglet « Types & emplacements ».": "First create your cylinder types in the “Types & locations” tab.",
  "Numéro de série, type, client, lot…": "Serial no., type, customer, batch…", "Dernier mouvement": "Last movement", "Lot": "Batch",
  "Aucune bouteille ne correspond.": "No matching cylinder.", "Aucune bouteille connue. Faites une première réception.": "No known cylinders. Record a first receipt.",
  "Aucune bouteille chez les clients.": "No cylinders at customers.", "N° de livraison, client ou n° de série…": "Delivery no., customer or serial no.…",
  "Livraison": "Delivery", "Certificat": "Certificate", "COC émis": "COC issued", "Aucune livraison pour l'instant.": "No deliveries yet.",
  "Types de bouteilles": "Cylinder types", "Ajouter un type": "Add a type", "Emplacements de stockage": "Storage locations", "Emplacement de stockage": "Storage location",
  "Aucun type. Ajoutez par exemple « Azote 5.0 · B50 ».": "No types. Add for example “Nitrogen 5.0 · B50”.",
  "Les prix des bouteilles et des frais EXP se modifient dans": "Cylinder prices and the EXP fee are edited in",
  "Nouveau type de bouteille": "New cylinder type", "Gaz *": "Gas *", "Azote, Argon, CO2, Hélium…": "Nitrogen, Argon, CO2, Helium…", "Qualité / pureté": "Grade / purity",
  "5.0, ALPHAGAZ 1…": "5.0, ALPHAGAZ 1…", "B50, B20, B10…": "B50, B20, B10…", "Volume en eau (L) *": "Water volume (L) *", "Pression de remplissage (bar)": "Filling pressure (bar)",
  "10,7 m³ ou 37,5 kg": "10.7 m³ or 37.5 kg", "Prix de vente HT par bouteille *": "Selling price excl. VAT per cylinder *", "Stock minimum de pleines": "Minimum full stock",
  "Type enregistré": "Type saved", "Supprimer ce type de bouteille ?": "Delete this cylinder type?", "Nouvel emplacement": "New location", "Renommer l'emplacement": "Rename location",
  "Cage A, Camionnette 1…": "Cage A, Van 1…", "Emplacement enregistré": "Location saved", "Créez d'abord un type de bouteille.": "Create a cylinder type first.",
  "Réception de bouteilles pleines": "Receipt of full cylinders", "Livraison chez un client": "Delivery to a customer", "Retour de bouteilles vides d'un client": "Return of empty cylinders from a customer",
  "Retour de vides au fournisseur": "Return of empties to the supplier", "Réceptionner": "Receive", "Valider la livraison": "Confirm delivery", "Enregistrer le retour": "Record return",
  "Date de réception": "Receipt date", "N° bon de livraison": "Delivery note no.", "N° de lot": "Batch no.", "Date de remplissage": "Filling date",
  "Type pour les nouvelles bouteilles": "Type for new cylinders", "Date de livraison": "Delivery date", "Référence client / bon de commande": "Customer reference / purchase order",
  "Frais EXP HT (forfait livraison)": "EXP fee excl. VAT (per delivery)", "Date du retour": "Return date", "Client (facultatif, sinon repris de la bouteille)": "Customer (optional, otherwise taken from the cylinder)",
  "Repris automatiquement": "Filled in automatically", "N° bon de retour": "Return note no.", "Scanner ou saisir un numéro de série": "Scan or type a serial number",
  "Scannez le code-barres puis Entrée": "Scan the barcode, then Enter", "Photographier le code-barres": "Photograph the barcode",
  "Douchette : visez et scannez, la bouteille s'ajoute. Sur téléphone : « Photo » pour lire le code-barres.": "Scanner: aim and scan, the cylinder is added. On a phone: “Photo” reads the barcode.",
  "Aucune bouteille scannée.": "No cylinders scanned.", "Scannez au moins une bouteille.": "Scan at least one cylinder.", "Retirez ou corrigez les lignes en rouge avant de valider.": "Remove or fix the red lines before confirming.",
  "Choisissez le client livré.": "Choose the customer delivered.", "Lecture du code-barres…": "Reading barcode…", "Aucun code-barres lisible sur la photo. Rapprochez-vous et réessayez.": "No readable barcode in the photo. Move closer and try again.",
  "Inconnue : faites d'abord sa réception": "Unknown: record its receipt first", "Nouvelle : choisissez le type pour les nouvelles bouteilles": "New: choose the type for new cylinders",
  "Pleine · en stock": "Full · in stock", "Vide · en stock": "Empty · in stock", "Chez le client": "At the customer", "Hors service": "Out of service",
  "Réception fournisseur": "Supplier receipt", "Correction manuelle": "Manual correction", "Type inconnu": "Unknown type", "Connue depuis": "Known since", "Remplie le": "Filled on",
  "Rotations": "Rotations", "Aucun mouvement enregistré.": "No movement recorded.", "Corriger cette bouteille": "Correct this cylinder", "Enregistrer la correction": "Save correction",
  "Bouteille corrigée": "Cylinder corrected", "Bouteilles livrées": "Cylinders delivered", "Bon de livraison PDF": "Delivery note PDF", "Certificat de conformité (COC)": "Certificate of conformity (COC)",
  "Signataire": "Signatory", "Nom et fonction": "Name and position", "Date du certificat": "Certificate date", "Mention complémentaire": "Additional statement",
  "Générer le certificat PDF": "Generate certificate PDF", "Gardez au moins une bouteille cochée.": "Keep at least one cylinder ticked.", "Bouteille": "Cylinder",
  "Pas livrable :": "Cannot be delivered:", "Déjà pleine en stock ·": "Already full in stock ·", "Reconnue ·": "Recognised ·", "Attention :": "Warning:", "Nouvelle ·": "New ·",
  "N'était pas chez un client": "Was not at a customer",
  // ---- PDF gaz
  "BON DE LIVRAISON": "DELIVERY NOTE", "CERTIFICAT DE CONFORMITE": "CERTIFICATE OF CONFORMITY", "Livré à": "Delivered to", "Signature du client :": "Customer signature:",
  "Signature": "Signature", "Nom, fonction": "Name, position", "Gaz / qualité": "Gas / grade", "Volume / pression": "Volume / pressure", "Type de bouteille ": "Cylinder type ",
  // ---- flotte
  "Véhicules": "Vehicles", "À faire": "To do", "Pannes": "Faults", "Documents": "Documents", "Pneus en stock": "Tyres in stock", "Entretiens & travaux": "Maintenance & work", "Coûts": "Costs",
  "Ajouter un véhicule": "Add a vehicle", "Disponible": "Available", "Immobilisé": "Immobilised", "À l'atelier": "In the workshop", "Hors service ": "Out of service ",
  "Position en temps réel : la liaison WebFleet n'est pas encore active. Le dernier chauffeur et le kilométrage viennent des prises en charge enregistrées ici. Renseignez l'identifiant WebFleet de chaque véhicule pour préparer la connexion.": "Real-time position: the WebFleet link is not active yet. Last driver and mileage come from the check-outs recorded here. Enter each vehicle's WebFleet ID to prepare the connection.",
  "Dernier chauffeur": "Last driver", "Kilométrage": "Mileage", "Pneus": "Tyres", "Prochaine échéance": "Next due", "Coûts 2026": "Costs 2026", "Position": "Position",
  "non relié": "not linked", "Prise en charge": "Check-out", "Ajouter une intervention": "Add a job", "Modifier la fiche": "Edit record", "Échéances": "Deadlines", "Entretien": "Service",
  "Contrôle technique": "Roadworthiness test", "Assurance": "Insurance", "Pneus montés": "Fitted tyres", "+ Renseigner les pneus": "+ Enter tyres", "Modifier les pneus": "Edit tyres",
  "Taille des pneus non renseignée.": "Tyre size not entered.", "Documents du véhicule": "Vehicle documents", "+ Ajouter un document": "+ Add a document",
  "Interventions": "Jobs", "Aucune intervention.": "No jobs.", "Aucune panne signalée.": "No faults reported.", "Dernières prises en charge": "Latest check-outs", "Aucune.": "None.",
  "Carburant": "Fuel", "Année": "Year", "VIN": "VIN", "Ajouter une photo": "Add a photo", "Changer la photo": "Change photo", "Photo du véhicule": "Vehicle photo",
  "Retirer de la flotte…": "Remove from fleet…", "Retirer de la flotte": "Remove from fleet", "Remettre en service": "Return to service",
  "Nouveau véhicule": "New vehicle", "Identifiant interne *": "Internal ID *", "Identifiant interne": "Internal ID", "Immatriculation *": "Registration *",
  "Marque et modèle *": "Make and model *", "Marque et modèle": "Make and model", "Renault Master": "Renault Master", "N° de châssis (VIN)": "Chassis no. (VIN)",
  "Kilométrage actuel": "Current mileage", "État": "Condition", "En service": "In service", "Identifiant WebFleet (pour la future liaison)": "WebFleet ID (for the future link)",
  "Prochain entretien (date)": "Next service (date)", "Prochain entretien (km)": "Next service (km)", "Contrôle technique avant le": "Roadworthiness test before",
  "Échéance assurance": "Insurance renewal", "Diesel": "Diesel", "Essence": "Petrol", "Hybride": "Hybrid", "Électrique": "Electric", "CNG": "CNG",
  "Chaque identifiant ne peut servir qu'une seule fois, même après la vente, le retrait ou la suppression d'un véhicule.": "Each ID can only be used once, even after a vehicle is sold, retired or deleted.",
  "Chaque identifiant ne peut servir qu'une seule fois, même après la vente, le retrait ou la suppression d'un véhicule. Le prochain numéro libre est proposé.": "Each ID can only be used once, even after a vehicle is sold, retired or deleted. The next free number is suggested.",
  "Véhicule enregistré": "Vehicle saved", "Chauffeur *": "Driver *", "Kilométrage au compteur": "Odometer reading", "Prise en charge enregistrée": "Check-out saved",
  "Nouvelle intervention": "New job", "Intervention": "Job", "Véhicule *": "Vehicle *", "Véhicule": "Vehicle", "Réalisée": "Done", "Planifiée": "Planned", "Planifié": "Planned",
  "Date (réalisée ou prévue) *": "Date (done or planned) *", "Garage / fournisseur": "Garage / supplier", "N° de facture fournisseur": "Supplier invoice no.",
  "Travaux effectués / à effectuer *": "Work done / to do *", "Cette intervention répare la panne…": "This job fixes the fault…",
  "Après un entretien réalisé : reporter la prochaine échéance (+12 mois, +30 000 km)": "After a completed service: move the next due date (+12 months, +30,000 km)",
  "Intervention enregistrée": "Job saved", "Supprimer cette intervention ?": "Delete this job?",
  "Entretien périodique": "Periodic service", "Réparation": "Repair", "Recherche de panne": "Fault finding", "Remplacement de pièce": "Part replacement", "Carrosserie": "Bodywork",
  "Entretien prévu": "Scheduled service", "Échéance assurance ": "Insurance renewal ",
  "Mineure": "Minor", "Importante": "Major", "Bloquante": "Blocking", "Bloquante · véhicule immobilisé": "Blocking · vehicle immobilised", "Ouverte": "Open",
  "Réparation planifiée": "Repair scheduled", "Réparée": "Repaired", "Réparées": "Repaired", "À planifier": "To schedule", "Signalée le": "Reported on", "Gravité": "Severity",
  "Réparation estimée": "Estimated repair", "Votre nom *": "Your name *", "Qu'avez-vous constaté ? *": "What did you notice? *", "Photo (facultatif)": "Photo (optional)",
  "Bruit au freinage, voyant moteur allumé, pneu avant droit usé…": "Noise when braking, engine light on, front right tyre worn…", "Envoyer le signalement": "Send report",
  "Panne signalée, merci": "Fault reported, thank you", "Merci, votre signalement a été enregistré.": "Thank you, your report has been recorded.",
  "Décrivez ce que vous avez constaté : l'atelier est prévenu immédiatement.": "Describe what you noticed: the workshop is notified immediately.",
  "Vos derniers signalements": "Your latest reports", "Les pannes ouvertes et leur date de réparation prévue sont visibles dans Flotte → Pannes.": "Open faults and their planned repair dates are shown in Fleet → Faults.",
  "Aucun véhicule enregistré.": "No vehicles recorded.", "Voir le véhicule": "View vehicle", "Date de réparation estimée": "Estimated repair date", "Diagnostic / commentaire atelier": "Diagnosis / workshop comment",
  "Panne mise à jour": "Fault updated", "Photo jointe au signalement": "Photo attached to the report", "Aucune panne ici.": "No faults here.",
  "Photo non envoyée : l'ajout de fichiers n'est pas autorisé pour votre accès.": "Photo not sent: your access does not allow file uploads.",
  "La photo n'a pas pu être envoyée ; le signalement part sans elle.": "The photo could not be sent; the report is sent without it.",
  "Tâches des 60 prochains jours": "Tasks for the next 60 days", "Rien de prévu.": "Nothing scheduled.", "Véhicule, garage, description…": "Vehicle, garage, description…",
  "Garage": "Garage", "Km": "Km", "Aucune intervention enregistrée.": "No jobs recorded.", "Coûts de maintenance": "Maintenance costs",
  "Moyenne par véhicule en service": "Average per vehicle in service", "Travaux planifiés": "Planned work", "estimation HT": "estimate excl. VAT",
  "Coûts de maintenance par mois": "Maintenance costs per month", "Coûts de maintenance HT des 12 derniers mois": "Maintenance costs excl. VAT, last 12 months",
  "Par type d'intervention": "By job type", "Aucune dépense cette année.": "No spending this year.", "Par véhicule": "By vehicle", "Coût total enregistré": "Total recorded cost",
  "Coût / km": "Cost / km", "réparation non planifiée": "repair not scheduled", "Entretien dans": "Service in",
  "Valide": "Valid", "Moins de 3 mois": "Less than 3 months", "Moins de 30 jours": "Less than 30 days", "Expiré": "Expired", "Sans échéance": "No expiry",
  "Installation / réservoir LPG": "LPG installation / tank", "Badge aéroport LGG": "LGG airport badge", "Essence / LPG": "Petrol / LPG", "Cylindrée (cc)": "Engine (cc)", "Puissance (kW)": "Power (kW)", "Norme EURO": "EURO standard", "Garage habituel": "Usual garage", "Distribution à remplacer (date)": "Timing belt due (date)", "Distribution à remplacer (km)": "Timing belt due (km)", "Réparations à prévoir": "Repairs to perform", "Commentaires": "Comments", "Distribution": "Timing belt", "Cylindrée": "Engine", "Puissance": "Power", "Norme": "Standard", "Garage": "Garage",
  "Véhicules routiers": "Road vehicles", "Véhicules routiers autres": "Other road vehicles", "Véhicules de chantier": "Site vehicles", "Voitures, camionnettes, utilitaires immatriculés": "Registered cars, vans and utility vehicles", "Remorques, semi-remorques et autres engins immatriculés": "Trailers, semi-trailers and other registered equipment", "Chariots élévateurs, engins et matériel non immatriculés": "Forklifts, machines and unregistered equipment", "Véhicules ou équipements retirés de la flotte ou vendus": "Vehicles or equipment retired from the fleet or sold", "Archives": "Archives", "Catégorie": "Category", "Sortie de flotte": "Left the fleet", "Archivé le": "Archived on", "Ouvrir": "Open", "Archiver…": "Archive…", "Archiver": "Archive", "Désarchiver": "Unarchive", "Supprimer…": "Delete…", "Supprimer définitivement": "Delete permanently", "Archiver le véhicule": "Archive vehicle", "Véhicule archivé": "Vehicle archived", "Véhicule supprimé définitivement": "Vehicle permanently deleted", "L'immatriculation est obligatoire pour un véhicule routier.": "A registration plate is required for a road vehicle.", "1-ABC-123 (vide pour un engin non immatriculé)": "1-ABC-123 (empty for unregistered equipment)",
  "Le véhicule quitte la liste des véhicules retirés et passe dans les Archives. Sa fiche, ses documents, ses interventions et ses coûts restent consultables, et vous pourrez le désarchiver à tout moment.": "The vehicle leaves the retired list and moves to the Archives. Its record, documents, work and costs stay available, and you can unarchive it at any time.",
  "Vous allez archiver": "You are about to archive", "Je confirme l'archivage de": "I confirm archiving", "Pour confirmer, tapez": "To confirm, type", "Action irréversible.": "This cannot be undone.", "La fiche de": "The record of",
  "Versions précédentes": "Previous versions", "Dossier en ligne (lien du QR code à bord)": "Online folder (on-board QR code link)", "Dossier en ligne ↗": "Online folder ↗", "Pour l'assurance et le contrôle technique, la date d'expiration met aussi à jour les échéances du véhicule. Remplacer le fichier garde l'ancien dans les versions précédentes.": "For insurance and roadworthiness tests, the expiry date also updates the vehicle's due dates. Replacing the file keeps the old one under previous versions.",
  "Dossier Dropbox": "Dropbox folder", "Dropbox ↗": "Dropbox ↗", "DOC": "DOC",
  "⇪ Importer documents (Dropbox)": "⇪ Import documents (Dropbox)", "Importer les documents des véhicules (Dropbox)": "Import vehicle documents (Dropbox)", "Choisir le ZIP": "Choose the ZIP", "ou le déposer ici · un dossier entier est aussi accepté": "or drop it here · a whole folder also works", "Choisir un dossier plutôt qu'un ZIP": "Choose a folder instead of a ZIP", "Inclure les documents expirés (rangés dans « Anciens documents »)": "Include expired documents (filed under “Old documents”)", "Utiliser une photo du dossier « Photo » si la fiche n'en a pas": "Use a picture from the “Photo” folder if the record has none", "Expirés": "Expired", "Photos": "Photos", "Lecture du contenu…": "Reading content…", "Import terminé": "Import finished", "rien de nouveau": "nothing new", "Car-Pass": "Car-Pass", "Car Kit (équipement de bord)": "Car Kit (on-board equipment)", "Importé de Dropbox": "Imported from Dropbox",
  "Saisissez la clé d'accès de ce serveur (fournie par la page d'installation). Elle reste enregistrée dans ce navigateur.": "Enter this server's access key (given by the installation page). It stays saved in this browser.", "Clé d'accès": "Access key", "Se connecter": "Sign in", "Clé d'accès refusée.": "Access key refused.", "Le serveur ne répond pas. Vérifiez la connexion puis réessayez.": "The server is not responding. Check the connection and try again.", "Se déconnecter": "Sign out", "Se déconnecter de ce navigateur": "Sign out of this browser", "Serveur": "Server", "1 · Données": "1 · Data", "2 · Fichiers joints": "2 · Attached files", "Données enregistrées sur le serveur": "Data stored on the server", "Serveur injoignable · nouvel essai…": "Server unreachable · retrying…", "Données importées": "Data imported", "Fichiers importés": "Files imported", "Import des données…": "Importing data…", "Envoi des fichiers…": "Uploading files…", "importés": "imported", "envoyés": "uploaded", "déjà présents": "already there", "échecs": "failed", "Étape suivante : le ZIP des fichiers joints.": "Next step: the attached-files ZIP.", "Ce fichier n'est pas un export JSON de l'ERP.": "This file is not an ERP JSON export.", "Aucun fichier reconnu dans ce ZIP.": "No file recognised in this ZIP.", "Le ZIP n'a pas pu être lu.": "The ZIP could not be read.", "Connexion au serveur impossible.": "Cannot connect to the server.",
  "Pour reprendre les données de l'ancienne version (claude.ai), déposez dans l'ordre les deux fichiers exportés depuis celle-ci. Un import peut être relancé sans créer de doublons.": "To bring over the data from the previous version (claude.ai), drop the two files exported from it, in order. An import can be rerun without creating duplicates.",
  "Supprimer la bouteille": "Delete cylinder", "Bouteille supprimée": "Cylinder deleted",
  "Supprimer l'emplacement": "Delete location", "Modifier l'emplacement": "Edit location", "En attente de redistribution": "Awaiting redistribution", "En attente": "Pending", "Redistribuer": "Redistribute", "Redistribuer le stock en attente": "Redistribute pending stock", "Nouvel emplacement": "New location", "Tout cocher": "Select all", "Tout décocher": "Clear all", "Déplacer la sélection": "Move selection", "Cochez au moins une bouteille.": "Tick at least one cylinder.", "Le stock en attente est vide.": "Pending stock is empty.", "Créez d'abord un emplacement de destination.": "Create a destination location first.", "Emplacement supprimé": "Location deleted", "Supprimer la livraison": "Delete delivery", "Changement d'emplacement": "Location change", "Annulation de livraison": "Delivery cancelled", "Aucune bouteille n'y est stockée.": "No cylinders are stored there.",
  "Cochez les bouteilles à déplacer puis choisissez leur nouvel emplacement. Vous pouvez répartir en plusieurs fois.": "Tick the cylinders to move, then choose their new location. You can split them over several moves.",
  "Les bouteilles de cette livraison ont déjà bougé depuis (retour, nouvelle livraison) : leur état actuel n'est pas modifié.": "The cylinders of this delivery have moved since (return, new delivery): their current state is not changed.",
  "Note de crédit": "Credit note", "Notes de crédit": "Credit notes", "Nouvelle note de crédit": "New credit note", "NOTE DE CRÉDIT": "CREDIT NOTE", "Marquer remboursée": "Mark refunded", "Annuler le remboursement": "Cancel refund", "Titre de la note de crédit (facultatif)": "Credit note title (optional)",
  "Chauffeurs": "Drivers", "Ajouter un chauffeur": "Add driver", "Nouveau chauffeur": "New driver", "Renommer le chauffeur": "Rename driver", "Supprimer le chauffeur": "Delete driver", "Nom et prénom": "Full name", "Ce chauffeur existe déjà.": "This driver already exists.", "Chauffeur ajouté": "Driver added", "Chauffeur renommé": "Driver renamed", "Chauffeur supprimé": "Driver deleted", "Les ajouter": "Add them", "Aucun chauffeur enregistré.": "No drivers yet.",
  "Proposés pour les prises de véhicule, les amendes et les signalements de panne.": "Offered for vehicle handovers, fines and fault reports.",
  "L'historique est conservé : ses prises en charge, amendes et signalements gardent son nom.": "History is kept: their handovers, fines and reports keep their name.",
  "Exemple": "Sample", "Créer les données d'exemple sélectionnées": "Create selected sample data", "Données d'exemple créées": "Sample data created", "Cochez au moins un type de données.": "Tick at least one data type.",
  "Clients & articles": "Customers & items", "Factures & devis": "Invoices & quotes",
  "Tapez votre nom et prénom : un code de connexion vous est envoyé par e-mail.": "Type your full name: a sign-in code will be e-mailed to you.", "Nom et prénom": "Full name", "Recevoir mon code": "Send my code", "Code à 8 chiffres": "8-digit code", "Changer de nom": "Change name", "Renvoyer le code": "Resend code", "Code envoyé à": "Code sent to", "valable": "valid for",
  "Nom inconnu. Vérifiez l'orthographe ou demandez à l'administrateur de vous ajouter.": "Unknown name. Check the spelling or ask the administrator to add you.", "Code incorrect ou expiré.": "Wrong or expired code.", "Trop de demandes. Réessayez dans quelques minutes.": "Too many requests. Try again in a few minutes.", "L'e-mail n'a pas pu être envoyé. Utilisez le code maître ou prévenez l'administrateur.": "The e-mail could not be sent. Use the master code or tell the administrator.",
  "Administrateur": "Administrator", "Bureau": "Office", "Terrain": "Field", "Utilisateurs": "Users", "Ajouter un utilisateur": "Add user", "Nouvel utilisateur": "New user", "Modifier l'utilisateur": "Edit user", "Supprimer l'utilisateur": "Delete user", "Utilisateur ajouté": "User added", "Utilisateur modifié": "User updated", "Utilisateur supprimé": "User deleted", "E-mail et code maître": "E-mail & master code", "Compte actif": "Active account", "Connexion par code": "Code sign-in", "Configurer la connexion": "Set up sign-in", "Envoyer un e-mail de test à mon adresse": "Send a test e-mail to my address", "Se déconnecter de l'ERP sur cet appareil ?": "Sign out of the ERP on this device?", "Il doit rester au moins un administrateur actif.": "At least one active administrator must remain.", "Un utilisateur porte déjà ce nom.": "A user already has this name.", "Adresse e-mail invalide.": "Invalid e-mail address.",
  "+ ajouter": "+ add", "Assurance (carte verte)": "Insurance (green card)", "Certificat d'immatriculation": "Registration certificate", "Certificat de conformité": "Certificate of conformity",
  "Contrat de leasing / location": "Lease / rental contract", "Tachygraphe": "Tachograph", "Certificat ADR": "ADR certificate", "Carnet d'entretien": "Service book", "Vignette / Viapass": "Road tax / Viapass",
  "Aucun document. Ajoutez la carte verte, le contrôle technique, le certificat d'immatriculation…": "No documents. Add the green card, roadworthiness test, registration certificate…",
  "Validité restante": "Remaining validity", "Ouvrir": "Open", "Ouvrir le fichier actuel": "Open current file", "Anciens documents": "Previous documents",
  "Type de document": "Document type", "Intitulé / organisme": "Title / issuer", "AG Insurance, Autosécurité Mons…": "AG Insurance, Autosécurité Mons…", "N° de document / police": "Document / policy no.",
  "Date d'émission / de début": "Issue / start date", "Date d'expiration (si applicable)": "Expiry date (if any)", "Fichier (PDF ou photo)": "File (PDF or photo)", "Remplacer le fichier": "Replace file",
  "Pour l'assurance et le contrôle technique, la date d'expiration met aussi à jour les échéances du véhicule.": "For insurance and the roadworthiness test, the expiry date also updates the vehicle's deadlines.",
  "Document enregistré": "Document saved", "Supprimer ce document de la fiche du véhicule ?": "Delete this document from the vehicle record?",
  "L'ajout de fichiers est réservé aux éditeurs de l'application.": "Adding files is reserved for the app's editors.", "Document :": "Document:",
  "Véhicules retirés de la flotte ou vendus": "Vehicles removed from the fleet or sold", "Vendu": "Sold", "Retiré de la flotte": "Removed from fleet", "Retiré le": "Removed on",
  "Motif": "Reason", "Acheteur": "Buyer", "Prix de vente": "Sale price", "Kilométrage final": "Final mileage", "Repris (fin de leasing / reprise)": "Returned (end of lease / trade-in)",
  "Hors d'usage / épave": "End of life / scrapped", "Volé": "Stolen", "Autre motif": "Other reason", "Date de sortie *": "Exit date *", "Prix de vente HT (€)": "Sale price excl. VAT (€)",
  "Le véhicule disparaîtra des véhicules actifs, des tâches, des signalements de panne et du tableau de bord. Sa fiche et tout son historique restent consultables dans « Véhicules retirés ».": "The vehicle will disappear from active vehicles, tasks, fault reports and the dashboard. Its record and full history remain available under “Removed vehicles”.",
  "Je confirme le retrait de": "I confirm the removal of", "de la flotte": "from the fleet", "Cochez la case de confirmation.": "Tick the confirmation box.", "Véhicule vendu": "Vehicle sold",
  "Véhicule retiré de la flotte": "Vehicle removed from the fleet", "Véhicule supprimé": "Vehicle deleted",
  "La fiche est conservée pour l'historique (documents, interventions, coûts). Le véhicule n'apparaît plus dans les tâches, les signalements ni le tableau de bord.": "The record is kept for history (documents, jobs, costs). The vehicle no longer appears in tasks, reports or the dashboard.",
  "Supprimer définitivement ce véhicule ? Pour un véhicule vendu ou hors service, préférez « Retirer de la flotte » qui garde la fiche.": "Permanently delete this vehicle? For a sold or out-of-service vehicle, prefer “Remove from fleet”, which keeps the record.",
  "Cadrer la photo ·": "Crop photo ·", "Valider la photo": "Confirm photo", "Photo enregistrée": "Photo saved", "Envoi de la photo…": "Uploading photo…",
  "Faites glisser la photo pour la positionner dans le cadre. Molette ou pincement pour zoomer.": "Drag the photo to position it in the frame. Scroll or pinch to zoom.",
  "Cette image ne peut pas être lue. Essayez une photo JPEG ou PNG.": "This image cannot be read. Try a JPEG or PNG photo.", "La photo n'a pas pu être envoyée. Réessayez.": "The photo could not be uploaded. Try again.",
  "Photo trop lourde.": "Photo too large.", "Format d'image non accepté (JPEG, PNG ou WebP).": "Image format not accepted (JPEG, PNG or WebP).",
  // ---- pneus
  "Largeur": "Width", "Largeur (mm) *": "Width (mm) *", "Hauteur %": "Profile %", "Hauteur (%) *": "Profile (%) *", "Jante (pouces)": "Rim (inches)", "Jante (pouces) *": "Rim (inches) *",
  "Indice de charge": "Load index", "Indice de vitesse": "Speed rating", "Été": "Summer", "Hiver": "Winter", "4 saisons": "All-season", "Marque": "Brand", "Modèle": "Model",
  "Neuf": "New", "Moyen": "Average", "À la limite": "Near limit", "Aperçu :": "Preview:", "4 roues": "All 4 wheels", "Essieu avant": "Front axle", "Essieu arrière": "Rear axle",
  "Pneus (4 roues)": "Tyres (4 wheels)", "Taille différente à l'arrière": "Different size at the rear", "Date de montage": "Fitting date", "Kilométrage au montage": "Mileage at fitting",
  "Retirer ces pneus du stock (4 pneus, ou 2 + 2 si l'arrière diffère)": "Take these tyres out of stock (4 tyres, or 2 + 2 if the rear differs)", "Pneus enregistrés": "Tyres saved",
  "Aucun en stock": "None in stock", "Ajouter des pneus au stock": "Add tyres to stock", "Taille d'un véhicule": "Size of a vehicle", "Afficher aussi les références épuisées": "Also show out-of-stock items",
  "Effacer les filtres": "Clear filters", "Dimension": "Size", "Indices": "Indices", "Aucun pneu en stock": "No tyres in stock", "Aucun pneu en stock ne correspond à ces critères.": "No tyres in stock match these criteria.",
  "Aucun pneu en stock pour l'instant.": "No tyres in stock yet.", "Retirer un pneu": "Remove one tyre", "Ajouter un pneu": "Add one tyre", "DOT (semaine/année)": "DOT (week/year)",
  "Rack A, garage…": "Rack A, garage…", "Supprimer cette référence de pneus du stock ?": "Delete this tyre item from stock?", "pas assez pour un train complet": "not enough for a full set",
  // ---- étalonnage
  "Ajouter un outil": "Add a tool", "Réceptionné · en attente": "Received · waiting", "En étalonnage": "Being calibrated", "Étalonné · à livrer": "Calibrated · to deliver",
  "Échéance dépassée chez les clients": "Overdue at customers", "En atelier": "In the workshop", "Tous les outils": "All tools", "Rappels d'échéance": "Due-date reminders",
  "Certificat ": "Certificate ", "Prochain étalonnage": "Next calibration", "Aucun actif": "None active", "Conforme": "Compliant", "Conforme après ajustage": "Compliant after adjustment",
  "Non conforme": "Non-compliant", "Numéro de série, outil, marque, client…": "Serial no., tool, brand, customer…", "Réceptionnés ": "Received ", "À livrer": "To deliver",
  "Chez le client ": "At the customer ", "Aucun outil ne correspond.": "No matching tool.", "Aucun outil n'arrive à échéance dans les 60 prochains jours.": "No tools fall due in the next 60 days.",
  "Préparer l'e-mail de rappel": "Prepare reminder email", "Marquer comme relancé": "Mark as reminded", "Dernière relance :": "Last reminder:", "Relance notée": "Reminder recorded",
  "Réception d'outils à étalonner": "Receipt of tools to calibrate", "Client (pour les nouveaux outils)": "Customer (for new tools)", "Date de collecte": "Collection date",
  "Scanner ou saisir le numéro de série de l'outil": "Scan or type the tool's serial number", "Aucun outil scanné.": "No tools scanned.", "Désignation *": "Description *",
  "Nouvel outil : complétez sa désignation": "New tool: enter its description", "Scannez au moins un outil.": "Scan at least one tool.", "Choisissez le client pour les nouveaux outils.": "Choose the customer for the new tools.",
  "Indiquez la désignation de chaque nouvel outil.": "Enter the description of each new tool.", "Réceptionner pour étalonnage": "Receive for calibration", "Démarrer l'étalonnage": "Start calibration",
  "Terminer l'étalonnage": "Finish calibration", "Livrer au client": "Deliver to customer", "Marque / modèle": "Brand / model", "Périodicité": "Interval", "Dernier étalonnage": "Last calibration",
  "Prix de l'étalonnage": "Calibration price", "En atelier depuis": "In the workshop since", "Certificats": "Certificates", "Aucun certificat.": "No certificates.",
  "Joindre un certificat existant (PDF)": "Attach an existing certificate (PDF)", "Aucun étalonnage enregistré.": "No calibration recorded.", "+ Photo": "+ Photo", "Photo de l'outil": "Tool photo",
  "Envoi du fichier…": "Uploading file…", "Fichier ajouté": "File added", "Envoi impossible pour l'instant.": "Upload not possible right now.",
  "Fichier trop lourd (20 Mo maximum).": "File too large (20 MB maximum).", "Format non accepté : utilisez une photo ou un PDF.": "Format not accepted: use a photo or a PDF.",
  "Format non accepté : utilisez un PDF ou une photo.": "Format not accepted: use a PDF or a photo.", "Date d'étalonnage": "Calibration date", "Résultat": "Result",
  "N° de certificat": "Certificate no.", "Réalisé par": "Done by", "Atelier interne": "In-house workshop", "Atelier interne ou laboratoire externe": "In-house workshop or external lab",
  "Périodicité (mois)": "Interval (months)", "Certificat (PDF ou photo)": "Certificate (PDF or photo)", "Remarques (valeurs relevées, ajustages…)": "Remarks (readings, adjustments…)",
  "L'ajout de fichiers est réservé aux éditeurs : le certificat pourra être joint plus tard.": "Adding files is reserved for editors: the certificate can be attached later.",
  "Le fichier n'a pas pu être envoyé. Réessayez ou enregistrez sans fichier.": "The file could not be uploaded. Try again or save without a file.",
  "Étalonnage enregistré : outil prêt à livrer": "Calibration saved: tool ready to deliver", "Créer une facture brouillon pour les outils cochés": "Create a draft invoice for the ticked tools",
  "Cochez au moins un outil.": "Tick at least one tool.", "Nouvel outil": "New tool", "Désignation": "Description", "Client propriétaire *": "Owner customer *",
  "Prix de l'étalonnage HT": "Calibration price excl. VAT", "Où est l'outil ?": "Where is the tool?", "Réceptionné à l'atelier": "Received at the workshop",
  "Outil enregistré": "Tool saved", "Couple, Pression, Électrique": "Torque, Pressure, Electrical", "Clé dynamométrique 20-100 Nm": "Torque wrench 20-100 Nm",
  "Supprimer ce dossier outil ? Ses photos et certificats ne seront plus accessibles depuis l'application.": "Delete this tool record? Its photos and certificates will no longer be accessible from the app.",
  "Rien ici. ": "Nothing here. ",
  // ---- divers
  "Données d'exemple ": "Sample data ", "élément": "item", "Le téléchargement n'est pas disponible dans cette vue.": "Download is not available in this view.",
  "Un téléchargement est déjà en attente.": "A download is already pending.", "Téléchargement impossible ici.": "Download not possible here.",
  "Prix enregistré :": "Price saved:", "Stock mis à jour :": "Stock updated:", "Stock actuel :": "Current stock:", "Stock insuffisant pour": "Not enough stock for",
  "Dépôt principal": "Main depot", "Air Liquide Belgium": "Air Liquide Belgium", "Azote": "Nitrogen", "Hélium": "Helium", "Oxygène": "Oxygen",
  "Validité des devis": "Quote validity", "Tâches": "Tasks", "Ventes ": "Sales ",
  "Brouillon ": "Draft ", "Langue / Language": "Langue / Language",
  // ---- PDF
  "Destinataire ": "Recipient ", "Paiement avant le": "Payment before", "Client ": "Customer ",
  "Les bouteilles restent la propriété du fournisseur et doivent être restituées vides.": "The cylinders remain the property of the supplier and must be returned empty."
});

/* ---------- règles pour les textes qui contiennent des valeurs ---------- */
const NOUNS = {
  "bouteille": "cylinder", "bouteilles": "cylinders", "client": "customer", "clients": "customers", "véhicule": "vehicle", "véhicules": "vehicles", "outil": "tool", "outils": "tools",
  "facture": "invoice", "factures": "invoices", "document": "document", "documents": "documents", "élément": "item", "éléments": "items", "intervention": "job", "interventions": "jobs",
  "pneu": "tyre", "pneus": "tyres", "référence": "item", "références": "items", "livraison": "delivery", "livraisons": "deliveries", "article": "item", "articles": "items",
  "devis": "quotes", "panne": "fault", "pannes": "faults", "jour": "day", "jours": "days", "affiché": "shown", "affichés": "shown", "pièce": "piece"
};
const nounEn = w => NOUNS[w] ?? null;
const g = s => trCore(s) ?? s;   // traduit si connu, sinon garde
const GAS = { "Azote": "Nitrogen", "Hélium": "Helium", "Oxygène": "Oxygen", "Argon": "Argon", "CO2": "CO2", "Acétylène": "Acetylene", "Propane": "Propane" };
rule(/^(Azote|Hélium|Oxygène|Argon|Acétylène)(\b.*)$/, (m, a, b) => GAS[a] + b, true);
rule(/^(.+?) — bouteille (.+)$/, (m, a, b) => `${g(a)} — cylinder ${b}`);
rule(/^sera effacée, avec (.+) et (.+) \(interventions, pannes, prises en charge, amendes, trajets\)\.$/, "will be erased, with $1 and $2 (work, faults, handovers, fines, trips).");
rule(/^L'identifiant (\S+) restera réservé et ne pourra pas être réattribué\.$/, "ID $1 stays reserved and cannot be reassigned.");
rule(/^Sortir (.+) des archives \? Il réapparaîtra parmi les véhicules retirés de la flotte\.$/, "Take $1 out of the archives? It will reappear among retired vehicles.");
rule(/^Elle est actuellement chez (.+) : elle n'apparaîtra plus dans son stock\.$/, "It is currently at $1: it will no longer appear in their stock.");
rule(/^Son historique \(livraisons, retours, certificats déjà émis\) est conservé\.$/, "Its history (deliveries, returns, certificates already issued) is kept.");
rule(/^Vous allez supprimer l'emplacement (.+)\.$/, "You are about to delete the location $1.");
rule(/^Je confirme la suppression de la livraison (.+)$/, "I confirm deleting delivery $1");
rule(/^Livraison (\S+) supprimée$/, "Delivery $1 deleted");
rule(/^Dans (\d+) j$/, "In $1 d"); rule(/^Expire dans (\d+) j$/, "Expires in $1 d"); rule(/^Expire aujourd'hui$/, "Expires today");
rule(/^Expiré depuis (\d+) j$/, "Expired $1 d ago"); rule(/^Dépassé$/, "Overdue"); rule(/^(\d+) j$/, "$1 d");
rule(/^Valide$/, "Valid"); rule(/^Expiré$/, "Expired");
rule(/^(\d+) expirés?$/, "$1 expired"); rule(/^(\d+) à renouveler$/, "$1 to renew"); rule(/^(\d+) à jour$/, "$1 up to date");
rule(/^(\d+) pannes? signalées?$/, (m, n) => `${n} fault${n > 1 ? "s" : ""} reported`);
rule(/^(\d+) en stock$/, "$1 in stock");
rule(/^(\d+) panne ouverte et (\d+) intervention planifiée seront conservées dans l'historique mais ne seront plus suivies\.$/, "$1 open fault and $2 planned job will be kept in the history but no longer tracked.");
rule(/^(.+) seront conservées dans l'historique mais ne seront plus suivies\.$/, (m, a) => `${g(a)} will be kept in the history but no longer tracked.`);
rule(/^Plus ancienne livrée il y a (\d+) jours?$/, "Oldest delivered $1 days ago");
rule(/^Montés le (.+) à (.+) km$/, "Fitted on $1 at $2 km"); rule(/^Montés le (.+)$/, "Fitted on $1");
rule(/^(\d+) pleines$/, "$1 full"); rule(/^(\d+) vides$/, "$1 empty"); rule(/^(\d+) clients$/, (m, n) => `${n} customer${+n === 1 ? "" : "s"}`); rule(/^(\d+) fournisseur$/, "$1 supplier");
rule(/^sous le min\. (\d+)$/, "below min. $1"); rule(/^stock bas$/, "low stock");
rule(/^TVA (\d+) % sur (.+)$/, "VAT $1% on $2"); rule(/^TVA (\d+) %$/, "VAT $1%"); rule(/^TVA (BE.*)$/, "VAT $1");
rule(/^E-mail à (.+)$/, "Email to $1");
rule(/^(.+) \(stock (-?\d+)\)$/, "$1 (stock $2)");
rule(/^ou à (.+) km$/, "or at $1 km");
rule(/^(.+) TVAC \(livraisons, étalonnages…\)$/, "$1 incl. VAT (deliveries, calibrations…)");
rule(/^(DEVIS|FACTURE) (.+)$/, (m, a, b) => `${a === "DEVIS" ? "QUOTE" : "INVOICE"} ${b}`);
rule(/^émis le (.+)$/, "issued $1"); rule(/^expire le (.+)$/, "expires $1"); rule(/^n° (.+)$/, "no. $1");
rule(/^(.+) par (.+)$/, (m, a, b) => /\d{4}$/.test(a) ? `${a} by ${b}` : m, true);
rule(/^prévue (.+)$/, "planned $1"); rule(/^le (\d.+)$/, "on $1", true); rule(/^date à fixer$/, "date to set");
rule(/^au (\d.+)$/, "as of $1"); rule(/^fournisseur (.+)$/, "supplier $1"); rule(/^Chez (.+)$/, (m, a) => EN[m] ?? `At ${a}`, true);
rule(/^lot (.+)$/, "batch $1"); rule(/^de (.+)$/, (m, a) => `from ${a}`, true);
rule(/^Livraison (BL-[\w-]+)$/, "Delivery $1"); rule(/^Livraison gaz (.+)$/, "Gas delivery $1");
rule(/^Livraison (BL-[\w-]+) · (.+)\. Décochez les bouteilles à exclure du certificat\.$/, "Delivery $1 · $2. Untick the cylinders to leave out of the certificate.");
rule(/^Livraison (.+) du (.+)$/, "Delivery $1 of $2", true);
rule(/^Ce client a (\d+) documents? \(devis ou factures\)\. Supprimer quand même \?$/, "This customer has $1 document(s) (quotes or invoices). Delete anyway?");
rule(/^(.+) (\d{4})( HT)?$/, (m, a, y, h) => { const t = trSeg(a); return t == null ? m : `${t} ${y}${h ? " excl. VAT" : ""}`; }, true);
rule(/^CA (\d{4}) HT$/, "Revenue $1 excl. VAT"); rule(/^(\d{4}) : (.+)$/, "$1: $2", true);
rule(/^(.+) \*$/, (m, a) => { const t = trSeg(a); return t == null ? m : t + " *"; }, true);
rule(/^(.+?) ?: (.+)$/, (m, a, b) => { const t = trSeg(a); return t == null ? m : `${t.replace(/:$/, "")}: ${g(b)}`; }, true);
rule(/^([\d][\d   ,.]*) (.+)$/, (m, n, rest) => {
  const t = trCore(rest) ?? EN_PARTS[rest]; if (t != null) return `${n} ${t}`;
  const w = rest.split(" "), first = nounEn(w[0]);
  if (first) { const tail = w.slice(1).join(" "); const tt = tail ? (trCore(tail) ?? EN_PARTS[tail] ?? null) : ""; if (tt != null) return `${n} ${first}${tt ? " " + tt : ""}`; }
  return m;
}, true);
const EN_PARTS = {
  "connue": "known", "connues": "known", "en service": "in service", "suivi": "tracked", "suivis": "tracked", "TVAC": "incl. VAT", "à relancer": "to chase", "HT": "excl. VAT",
  "réceptionnée": "received", "réceptionnées": "received", "réceptionné": "received", "réceptionnés": "received", "vide rentrée en stock": "empty back in stock", "vides rentrées en stock": "empty back in stock",
  "renvoyée au fournisseur": "returned to the supplier", "renvoyées au fournisseur": "returned to the supplier", "livré": "delivered", "livrés": "delivered",
  "dans les 30 jours": "within 30 days", "en stock": "in stock", "valeur du stock": "stock value", "d'exemple (clients, bouteilles, véhicules, outils, factures…) sont présents pour tester l'application. Quand vous êtes prêt à saisir vos vraies données, supprimez-les en un clic.": "of sample data (customers, cylinders, vehicles, tools, invoices…) are here to test the app. When you are ready to enter your real data, delete them in one click."
};
Object.assign(EN, {
  "Statut : envoyée": "Status: sent", "Statut : payée": "Status: paid", "Statut : envoyé": "Status: sent", "Statut : accepté": "Status: accepted", "Statut : refusé": "Status: declined",
  "Livraison :": "Delivery:", "Réf. :": "Ref.:", "Fait le": "Done on", "Nombre de bouteilles certifiées :": "Number of certified cylinders:",
  "Paiement avant le ": "Payment before "
});
rule(/^Paiement avant le (.+?)(, sur le compte (.+))?, communication structurée :$/, (m, d, x, iban) => `Payment before ${d}${iban ? " to account " + iban : ""}, structured reference:`);
rule(/^Paiement sur (.+) avec la communication structurée$/, "Payment to $1 with structured reference");
rule(/^Payée le (.+)$/, "Paid on $1");
rule(/^Nous certifions que les bouteilles de gaz énumérées ci-dessous, livrées le (.+), sont conformes aux spécifications du produit indiquées, telles que garanties par le producteur \((.+)\) pour les lots mentionnés\.$/,
  "We certify that the gas cylinders listed below, delivered on $1, comply with the stated product specifications, as guaranteed by the producer ($2) for the batches mentioned.");
rule(/^Nombre de bouteilles certifiées : (\d+)$/, "Number of certified cylinders: $1");
rule(/^Fait le (.+), pour (.+)$/, "Done on $1, for $2");
rule(/^Total : (\d+) bouteille\(s\)\. Les bouteilles restent la propriété du fournisseur et doivent être restituées vides\.$/, "Total: $1 cylinder(s). The cylinders remain the property of the supplier and must be returned empty.");
rule(/^Livraison : (.+) du (.+)$/, "Delivery: $1 of $2");
rule(/^Livraison (BL-[\w-]+) du ([^.]+)\.(.*)Bouteilles : (.+)$/, (m, a, b, c, d) => `Delivery ${a} of ${b}.${c.replace(/ · réf\. /, " · ref. ")}Cylinders: ${d}`);
rule(/^Étalonnage d'outils livrés le (.+)\.$/, "Calibration of tools delivered on $1.");
rule(/^Étalonnage (.+)$/, (m, a) => `Calibration ${a.replace(/ · certificat /, " · certificate ")}`);
rule(/^Frais de transfert Airside \(EXP\)$/, "Airside transfer fee (EXP)");
rule(/^Livraison (BL-[\w-]+) enregistrée, facture brouillon créée$/, "Delivery $1 recorded, draft invoice created");
rule(/^(.+) est déjà dans la liste$/, "$1 is already in the list");
rule(/^(.+) retiré de la flotte$/, "$1 removed from the fleet");
rule(/^Le numéro (.+) existe déjà\.$/, "Number $1 already exists.");
rule(/^L'identifiant (.+) est déjà utilisé par (.+)\. Un identifiant ne peut servir qu'une seule fois\. Prochain numéro libre : (.+)\.$/, "ID $1 is already used by $2. An ID can only be used once. Next free number: $3.");
rule(/^L'identifiant (.+) est déjà utilisé par un véhicule supprimé\. Un identifiant ne peut servir qu'une seule fois\. Prochain numéro libre : (.+)\.$/, "ID $1 is already used by a deleted vehicle. An ID can only be used once. Next free number: $2.");
rule(/^L'identifiant doit contenir de 1 à 6 lettres ou chiffres \(sans espace ni symbole\)\.$/, "The ID must have 1 to 6 letters or digits (no spaces or symbols).");
rule(/^La plaque (.+) est déjà attribuée au véhicule (.*) en service\.$/, "Registration $1 is already assigned to vehicle $2 in service.");
rule(/^Le compteur ne peut pas être inférieur au dernier relevé \((.+)\)\.$/, "The odometer cannot be lower than the last reading ($1).");
rule(/^Le n° de série (.+) existe déjà \((.+)\)\.$/, "Serial no. $1 already exists ($2).");
rule(/^Impossible : (\d+) bouteilles? utilisen?t ce type\.$/, "Not possible: $1 cylinder(s) use this type.");
rule(/^Stock insuffisant pour (.+) : (\d+) pneu\(s\) manquant\(s\)\.$/, "Not enough stock for $1: $2 tyre(s) missing.");
rule(/^Ajouté à la référence existante : (\d+) en stock$/, "Added to the existing item: $1 in stock");
rule(/^Mettre le prix d'étalonnage à (.+) HT pour (.+) de la catégorie « (.+) » \?$/, (m, p, n, c) => `Set the calibration price to ${p} excl. VAT for ${g(n)} in the “${c}” category?`);
rule(/^Supprimer (.+) \?$/, (m, a) => `Delete ${a}?`, true);
rule(/^Supprimer la photo de (.+) \?$/, "Delete the photo of $1?");
rule(/^Remettre (.+) en service \? Il réapparaîtra dans les véhicules actifs\.$/, "Return $1 to service? It will reappear among active vehicles.");
rule(/^Retirer (.+) de la flotte$/, "Remove $1 from the fleet");
rule(/^Je confirme le retrait de (.+) de la flotte$/, "I confirm the removal of $1 from the fleet");
rule(/^Pneus montés · (.+)$/, "Fitted tyres · $1"); rule(/^Prise en charge · (.+)$/, "Check-out · $1"); rule(/^Panne · (.+)$/, "Fault · $1");
rule(/^Nouveau document · (.+)$/, "New document · $1"); rule(/^Document · (.+)$/, "Document · $1"); rule(/^Modifier (.+)$/, (m, a) => `Edit ${a}`, true);
rule(/^Terminer l'étalonnage · (.+)$/, "Finish calibration · $1"); rule(/^Livraison au client · (.+)$/, "Delivery to customer · $1");
rule(/^Livrer au client \((\d+) outils prêts\)$/, "Deliver to customer ($1 tools ready)");
rule(/^Type (.+)$/, (m, a) => EN[m] ?? `Type ${g(a)}`, true);
rule(/^Bouteille (.+)$/, (m, a) => `Cylinder ${a}`);
rule(/^Retiré le (.+)$/, "Removed on $1");
rule(/^(Vendu|Repris \(fin de leasing \/ reprise\)|Hors d'usage \/ épave|Volé|Autre motif) le$/, (m, a) => `${g(a)} on`);
rule(/^(.+) · liaison à venir$/, "$1 · link coming soon"); rule(/^ID (.+)$/, "ID $1");
rule(/^Livré le (.+)$/, "Delivered on $1"); rule(/^livré le (.+)$/, "delivered on $1");
rule(/^Converti en facture (.+)$/, "Converted to invoice $1");
rule(/^par (\S+)$/, (m, u) => ({ "heure": "per hour", "jour": "per day", "pièce": "per piece", "mois": "per month", "session": "per session", "forfait": "flat rate", "carton": "per box", "unité": "per unit" }[u] || m));
rule(/^(\d+) × (.+)$/, (m, n, a) => `${n} × ${g(a)}`);
rule(/^(.+) · facture estimée (.+) HT( dont EXP (.+))?$/, (m, a, b, c, d) => `${g(a)} · estimated invoice ${b} excl. VAT${d ? " incl. EXP " + d : ""}`);
rule(/^facture estimée (.+) HT( dont EXP (.+))?$/, (m, b, c, d) => `estimated invoice ${b} excl. VAT${d ? " incl. EXP " + d : ""}`);
rule(/^(\d+) nouvelle\(s\)$/, "$1 new");
rule(/^(\d+) outils? livrés?(, facture brouillon créée)?$/, (m, n, f) => `${n} tool${n > 1 ? "s" : ""} delivered${f ? ", draft invoice created" : ""}`);
rule(/^Statut : (.+)$/, (m, a) => `Status: ${g(a[0].toUpperCase() + a.slice(1))}`);
rule(/^Prix enregistré : (.+)$/, "Price saved: $1"); rule(/^Stock mis à jour : (.+)$/, "Stock updated: $1");
rule(/^(.+) · déjà en atelier \((.+)\)$/, (m, a, b) => `${a} · already in the workshop (${g(b[0].toUpperCase() + b.slice(1)).toLowerCase()})`);
rule(/^(.+) · (.+) · échéance (.+)$/, (m, a, b, c) => `${a} · ${b} · due ${c}`);
rule(/^échéance (.+)$/, "due $1");
rule(/^Dans (\d+) j · (.+)$/, "In $1 d · $2");
rule(/^En atelier depuis$/, "In the workshop since");
rule(/^Document : (.+)$/, (m, a) => `Document: ${g(a)}`);
rule(/^Panne : (.+)$/, "Fault: $1");
rule(/^Réception d'outils à étalonner$/, "Receipt of tools to calibrate");
rule(/^Moyenne par véhicule en service$/, "Average per vehicle in service");
rule(/^Coûts de maintenance (\d{4})$/, "Maintenance costs $1");
rule(/^Par type d'intervention · (\d{4})$/, "By job type · $1");
rule(/^Meilleurs clients · (\d{4})$/, "Top customers · $1");

Object.assign(EN, { "Aucun type de bouteille.": "No cylinder types.", "CA facturé": "Invoiced revenue", "Nouveau document": "New document", "Échéance assurance": "Insurance renewal" });
rule(/^(€\s?[\d.,]+|[\d.,  ]+\s?€) (HT|TTC|TVAC)$/, (m, a, b) => `${a} ${b === "HT" ? "excl. VAT" : "incl. VAT"}`);
rule(/^valeur du stock (.+)$/, "stock value $1");
rule(/^Bouteilles pleines reçues de (.+)$/, "Full cylinders received from $1");
rule(/^N° bon de livraison (.+)$/, "$1 delivery note no.");
rule(/^Chez (.+)$/, (m, a) => EN[m] ?? `At ${a}`, true);
rule(/^(.+)\. Décochez les bouteilles à exclure du certificat\.$/, "$1. Untick the cylinders to leave out of the certificate.");
rule(/^Supprimer (le devis|la facture) (.+) \?$/, (m, a, b) => `Delete ${a === "le devis" ? "quote" : "invoice"} ${b}?`);
rule(/^Livraison (BL-\S+) du (\d{1,2} \S+ \d{4})( · réf\. (.+))?\. Bouteilles : (.+)$/, (m, a, d, x, r, b) => `Delivery ${a} of ${d}${r ? " · ref. " + r : ""}. Cylinders: ${b}`);
rule(/^Livraison (BL-\S+)\. Bouteilles : (.+)$/, "Delivery $1. Cylinders: $2");
Object.assign(EN, {
  "Titre de la facture (facultatif)": "Invoice title (optional)", "Titre du devis (facultatif)": "Quote title (optional)", "Ex. : Maintenance annuelle de la flotte 2026": "E.g.: Annual fleet maintenance 2026",
  "+ Ajouter une section": "+ Add a section", "Une section (ex. « Consumables », « Services ») regroupe les lignes placées sous elle, avec un sous-total.": "A section (e.g. “Consumables”, “Services”) groups the lines placed under it, with a subtotal.",
  "Titre de section (ex. Consumables, Services…)": "Section title (e.g. Consumables, Services…)", "Titre de section": "Section title", "Retirer la section": "Remove section",
  "Monter": "Move up", "Descendre": "Move down", "Sous-total": "Subtotal"
});
rule(/^Sous-total (.*)$/, "Subtotal $1");
Object.assign(EN, {
  "Type de tâche": "Task type", "Période": "Period", "Entretien (date)": "Service (date)", "Entretien (kilométrage)": "Service (mileage)", "Intervention planifiée": "Planned job",
  "Panne à réparer": "Fault to repair", "Document à renouveler": "Document to renew", "30 jours": "30 days", "60 jours": "60 days", "90 jours": "90 days", "1 an": "1 year",
  "Aucune tâche ne correspond à ces filtres.": "No task matches these filters.", "12 prochains mois": "next 12 months"
});
rule(/^(\d+) tâches?( sur (\d+))?$/, (m, n, x, t) => `${n} task${+n === 1 ? "" : "s"}${t ? " of " + t : ""}`);
rule(/^(\d+) prochains jours$/, "next $1 days"); rule(/^(\d+) en retard$/, "$1 overdue");
Object.assign(EN, {
  "Organisme, n° de police, plaque, remarque…": "Issuer, policy no., registration, note…", "Rechercher un document": "Search a document", "Affichage": "View", "Liste": "List",
  "Par véhicule": "By vehicle", "Inclure les anciens documents remplacés": "Include replaced older documents", "Remplacé": "Replaced", "Émis le": "Issued", "Expire le": "Expires",
  "Fichier": "File", "Pas de fichier": "No file", "Aucun document ne correspond à ces filtres.": "No document matches these filters.",
  "Aucun document enregistré. Ouvrez une fiche véhicule pour en ajouter.": "No documents recorded. Open a vehicle record to add some.", "+ Ajouter un document à…": "+ Add a document to…",
  "Ajouter un document à un véhicule": "Add a document to a vehicle"
});
rule(/^(\d+) documents?( sur (\d+))?$/, (m, n, x, t) => `${n} document${+n === 1 ? "" : "s"}${t ? " of " + t : ""}`);
rule(/^Remplacé · fin (.+)$/, "Replaced · ended $1");
/* flotte à grande échelle */
Object.assign(EN, {
  "Pannes / atelier": "Faults / workshop", "Effacer": "Clear", "Cartes": "Cards", "Liste": "List", "Modèle": "Model",
  "Plaque, identifiant, modèle, chauffeur, VIN…": "Plate, ID, model, driver, VIN…", "Panne, plaque, identifiant, chauffeur…": "Fault, plate, ID, driver…",
  "Rechercher un véhicule": "Search for a vehicle", "Rechercher une tâche": "Search for a task", "Trier": "Sort", "Affichage": "View",
  "Tri : urgence d'abord": "Sort: most urgent first", "Tri : prochaine échéance": "Sort: next due date", "Tri : identifiant": "Sort: ID", "Tri : plaque": "Sort: plate", "Tri : kilométrage": "Sort: mileage",
  "Aucun véhicule ne correspond à cette recherche.": "No vehicle matches this search.", "+ Ajouter un autre véhicule…": "+ Add another vehicle…", "Tous les véhicules · choisir…": "All vehicles · choose…",
  "Ajouter un véhicule au filtre": "Add a vehicle to the filter", "Retirer du filtre": "Remove from filter"
});
rule(/^Tri : coûts (\d{4})$/, "Sort: costs $1");
rule(/^(\d+) véhicules?( sur (\d+))?$/, (m, n, x, t) => `${n} vehicle${+n === 1 ? "" : "s"}${t ? " of " + t : ""}`);
rule(/^(\d+) retirés?$/, (m, n) => `${n} retired`);
/* étalonnage : devis SO/RO, atelier, laboratoires, envois */
Object.assign(EN, {
  "Ajouter au devis": "Add to quote", "Aucun outil choisi": "No tool selected", "Étalonnage d'outil (prix de la fiche outil)": "Tool calibration (price from tool record)",
  "Étalonnage (choix de l'outil)": "Calibration (choose the tool)", "Chaque RO devient une sous-section du devis, avec son sous-total. Un RO peut contenir plusieurs outils.": "Each RO becomes a sub-section of the quote, with its own subtotal. One RO can hold several tools.",
  "Choisir l'outil": "Choose the tool", "Changer d'outil / de RO": "Change tool / RO", "Nouveau numéro de RO": "New RO number", "N° de série (S/N)": "Serial number (S/N)",
  "N° de série, P/N, désignation…": "Serial number, P/N, description…", "Outil déjà connu": "Known tool", "Nouvel outil": "New tool", "Outil à étalonner": "Tool to calibrate",
  "Rechercher un outil": "Search for a tool", "Repair Order (RO)": "Repair Order (RO)", "+ Nouveau RO…": "+ New RO…", "RO existant": "Existing RO", "N° de RO (ex. R0867126)": "RO number (e.g. R0867126)",
  "Part number (P/N)": "Part number (P/N)", "déjà dans ce devis": "already in this quote", "autre client": "other customer", "Créer un nouvel outil": "Create a new tool",
  "Indiquez le numéro de RO.": "Enter the RO number.", "Choisissez un outil dans la liste, ou créez-en un nouveau.": "Pick a tool from the list, or create a new one.",
  "Le n° de série et la désignation sont obligatoires.": "Serial number and description are required.", "Pression, couple…": "Pressure, torque…",
  "Étalonnage (demande l'outil et le RO dans les devis)": "Calibration (asks for tool and RO in quotes)",
  "Afficher la colonne Done": "Show the Done column", "Replier la colonne Done": "Collapse the Done column", "Replier": "Collapse", "Réceptionner des outils": "Receive tools",
  "Glissez-déposez les cartes d'une colonne à l'autre. ": "Drag and drop cards between columns. ",
  "Dropped : rendu au client · Done : dossier clôturé (30 derniers jours affichés).": "Dropped: returned to customer · Done: job closed (last 30 days shown).",
  "Date d'envoi": "Shipping date", "Envoyer au labo": "Send to lab", "Envoyer au laboratoire · ": "Send to laboratory · ", "Pas d'envoi (déposé / enlevé)": "No shipment (dropped off / collected)",
  "N° de suivi": "Tracking number", "Numéro de suivi": "Tracking number", "Transporteur": "Carrier", "Laboratoire": "Laboratory", "Laboratoires": "Laboratories",
  "Choisissez le laboratoire.": "Choose the laboratory.", "+ Ajouter l'envoi": "+ Add shipment", "Aucun envoi enregistré.": "No shipment recorded.", "Suivi des envois": "Shipment tracking",
  "Depuis le client": "From customer", "Vers le client": "To customer", "Vers le labo": "To lab", "Retour du labo": "Back from lab", "Sens": "Direction", "Marquer livré": "Mark delivered", "En transit": "In transit",
  "Supprimer cet envoi": "Delete this shipment", "Indiquez le n° de suivi.": "Enter the tracking number.", "Envoi ajouté": "Shipment added",
  "Dossier en cours": "Current job", "Déplacer vers": "Move to", "Sales Order (devis)": "Sales Order (quote)", "Atelier interne / pas encore choisi": "In-house / not chosen yet",
  "Présélectionné : dernier labo utilisé pour cet outil.": "Preselected: last lab used for this tool.", "Labo habituel": "Usual lab", "En atelier depuis": "In workshop since",
  "Enregistrer le certificat (Calibrated)": "Record certificate (Calibrated)", "Étalonné en interne": "Calibrated in-house", "Clôturer (Done)": "Close (Done)", "Picked": "Picked",
  "Atelier interne": "In-house", "Rendu au client · Done": "Returned to customer · Done", "Outil réceptionné": "Tool received", "Dropped · rendu au client": "Dropped · returned to customer",
  "En étalonnage": "Being calibrated", "Chez le client": "At customer", "En atelier": "In workshop", "Lab": "Lab", "Calibrated": "Calibrated",
  "Ajouter un laboratoire": "Add a laboratory", "Nouveau laboratoire": "New laboratory", "Accréditation": "Accreditation", "Délai habituel": "Usual turnaround", "Délai habituel (jours)": "Usual turnaround (days)",
  "Outils chez eux": "Tools there", "Envoyé le": "Sent on", "Suivi": "Tracking", "SO · RO": "SO · RO", "Ville / pays": "City / country", "Personne de contact": "Contact person",
  "Notes (domaines couverts, conditions…)": "Notes (scope, terms…)", "BELAC ISO 17025 n° …": "BELAC ISO 17025 no. …", "Laboratoire enregistré": "Laboratory saved", "Supprimer ce laboratoire ?": "Delete this laboratory?",
  "Aucun outil chez ce laboratoire en ce moment.": "No tool at this laboratory right now.",
  "Aucun laboratoire. Ajoutez les labos avec qui vous travaillez : ils pourront être choisis dans la fiche de chaque outil.": "No laboratory yet. Add the labs you work with: you can then pick them on each tool record.",
  "Sélectionnez un laboratoire pour voir ses coordonnées et les outils qui s'y trouvent actuellement.": "Select a laboratory to see its details and the tools currently there.",
  "Aucun laboratoire enregistré. Ajoutez-en un dans l'onglet Laboratoires (vous pourrez le choisir ensuite).": "No laboratory saved. Add one in the Laboratories tab (you can then select it).",
  "NewTool · Picked": "NewTool · Picked", "Calibrated · à rendre": "Calibrated · to return"
});
rule(/^Depuis le (.+)$/, "Since $1");
rule(/^(\d+) outils? en atelier$/, (m, n) => `${n} tool${+n === 1 ? "" : "s"} in workshop`);
rule(/^(\d+) laboratoires?$/, (m, n) => `${n} laborator${+n === 1 ? "y" : "ies"}`);
rule(/^(\d+) outils? l'ont comme labo habituel$/, (m, n) => `${n} tool${+n === 1 ? " has" : "s have"} it as usual lab`);
rule(/^Outils actuellement chez (.+)$/, "Tools currently at $1");
rule(/^Envoyé chez (.+)$/, "Sent to $1");
rule(/^Labo : (.+)$/, "Lab: $1");
rule(/^Déplacé vers « (.+) »$/, "Moved to “$1”");
rule(/^Labo présélectionné : (.+) \(dernier labo utilisé pour cet outil\)\.$/, "Preselected lab: $1 (last lab used for this tool).");
rule(/^(\d+) lignes? d'étalonnage sans outil : choisissez l'outil \(et son RO\) pour chacune\.$/, (m, n) => `${n} calibration line${+n === 1 ? "" : "s"} without a tool: choose the tool (and its RO) for each.`);
rule(/^Aucun outil connu pour « (.+) »\.$/, "No known tool for “$1”.");
rule(/^(.+) existe déjà : outil connu utilisé$/, "$1 already exists: known tool used");
rule(/^Sous-total RO (.+)$/, "Subtotal RO $1");
rule(/^(\d+) outils? se trouvent? encore chez ce labo\. Supprimer quand même \?$/, (m, n) => `${n} tool${+n === 1 ? " is" : "s are"} still at this lab. Delete anyway?`);
EN["Glissez-déposez les cartes d'une colonne à l'autre. Dropped : rendu au client · Done : dossier clôturé (30 derniers jours affichés)."] = "Drag and drop cards between columns. Dropped: returned to customer · Done: job closed (last 30 days shown).";
/* amendes */
Object.assign(EN, {
  "Amendes": "Fines", "Amende": "Fine", "Excès de vitesse": "Speeding", "Stationnement": "Parking", "Feu rouge": "Red light", "GSM au volant": "Phone while driving", "Ceinture": "Seat belt",
  "Zone basse émission (LEZ)": "Low emission zone (LEZ)", "Péage / Viapass": "Toll / Viapass", "Autre infraction": "Other offence", "Police": "Police", "Communal": "Municipal",
  "Chauffeur (remboursement)": "Driver (reimbursement)", "Personne (classée / annulée)": "Nobody (dismissed / cancelled)",
  "Contestée": "Contested", "Conducteur à désigner": "Driver to be identified", "À payer": "To pay", "Remboursement attendu": "Reimbursement pending", "Réglée": "Settled",
  "désigner le conducteur": "identify the driver", "remboursement du chauffeur": "driver reimbursement", "suivre la contestation": "follow up the appeal", "l'amende": "the fine",
  "Reçue": "Received", "Conducteur désigné": "Driver identified", "Contestation": "Appeal", "Payée": "Paid", "Remboursée": "Reimbursed",
  "N° de PV, chauffeur, lieu, plaque…": "Ticket no., driver, place, plate…", "Rechercher une amende": "Search for a fine", "+ Encoder une amende": "+ Record a fine", "Encoder une amende": "Record a fine",
  "Émetteur": "Issuer", "Tous les chauffeurs": "All drivers", "Toutes les années": "All years", "Année": "Year", "Date": "Date", "Véhicule · chauffeur": "Vehicle · driver", "Infraction": "Offence",
  "PV · émetteur": "Ticket · issuer", "Montant": "Amount", "Étapes": "Milestones", "Prochaine action": "Next action", "Aucune amende ne correspond à ces filtres.": "No fine matches these filters.", "Aucune amende encodée.": "No fine recorded.",
  "Chauffeur": "Driver", "Nom du chauffeur": "Driver name", "Date de l'infraction": "Offence date", "Heure": "Time", "Lieu": "Place", "N° de PV / référence": "Ticket no. / reference",
  "Service émetteur": "Issuing body", "Zone de police, commune de…, Viapass…": "Police zone, municipality of…, Viapass…", "Montant (€)": "Amount (€)",
  "Détails (vitesse relevée, référence de paiement…)": "Details (recorded speed, payment reference…)", "Suivi & étapes": "Follow-up & milestones", "1. Réception": "1. Receipt", "Reçue le": "Received on",
  "2. Désignation du conducteur": "2. Driver identification", "Désignation requise (PV de police : 15 jours)": "Identification required (police ticket: 15 days)", "À faire avant le": "Due by", "Désigné le": "Identified on",
  "3. Paiement": "3. Payment", "À payer avant le": "Pay by", "Payée le": "Paid on", "Payée par": "Paid by", "Le chauffeur directement": "The driver directly",
  "4. À charge de": "4. Borne by", "Coût final supporté par": "Final cost borne by", "Montant à rembourser (€)": "Amount to reimburse (€)", "Remboursé le": "Reimbursed on", "Mode": "Method",
  "Retenue sur salaire": "Salary deduction", "Virement du chauffeur": "Transfer from driver", "Payée directement par le chauffeur": "Paid directly by the driver",
  "Contestation (facultatif)": "Appeal (optional)", "Amende contestée": "Fine contested", "Contestée le": "Contested on", "Suivi prévu le": "Follow-up on", "Clôturée le": "Closed on",
  "Amende annulée / classée sans suite": "Fine cancelled / dismissed", "Notes de suivi": "Follow-up notes", "Choisissez le véhicule.": "Choose the vehicle.", "Amende enregistrée": "Fine saved", "Supprimer cette amende ?": "Delete this fine?"
});
rule(/^(\d+) amendes?( sur (\d+))?$/, (m, n, x, t) => `${n} fine${+n === 1 ? "" : "s"}${t ? " of " + t : ""}`);
rule(/^payer (.+)$/, "pay $1");
rule(/^Amende (.*) · (.+)$/, (m, a, b) => `Fine ${a.replace(/^PV /, "ticket ")} · ${tr(b, "en")}`);
rule(/^à récupérer auprès des chauffeurs$/, "to recover from drivers");
rule(/^(\d{4}) :$/, "$1:");
/* administration */
Object.assign(EN, {
  "Administration": "Administration", "Gestion Documents": "Document management", "Documents et formulaires de l'entreprise, disponibles à tout moment": "Company documents and forms, available at any time",
  "Ajouter des documents": "Add documents", "Déposez vos fichiers ici": "Drop your files here", "ou cliquez pour les choisir · PDF, Word, Excel, images": "or click to choose them · PDF, Word, Excel, images",
  "Nom du document, organisme, catégorie…": "Document name, organisation, category…", "Rechercher un document": "Search for a document", "Toutes": "All", "Cartes": "Cards", "Liste": "List",
  "Télécharger": "Download", "Imprimer": "Print", "Modifier": "Edit", "Aperçu": "Preview", "Épinglé": "Pinned", "★ Épinglés": "★ Pinned", "Sans catégorie": "Uncategorised",
  "Document": "Document", "Catégorie": "Category", "Type": "Type", "Mis à jour": "Updated", "Fichier": "File", "Image": "Image",
  "Aucun document ne correspond à cette recherche.": "No document matches this search.", "Douane": "Customs", "Sécurité & badges": "Security & badges", "Ressources humaines": "Human resources",
  "Assurances": "Insurance", "Qualité": "Quality", "Modèles": "Templates", "Autorité (CAA)": "Authority (CAA)", "Aéroport": "Airport", "Autre": "Other",
  "Classer le document": "File the document", "Catégorie (pour tous)": "Category (for all)", "Organisme": "Organisation", "Nom de chaque document": "Name of each document",
  "Liege Airport, Douane…": "Liege Airport, Customs…", "Liege Airport, SPF Finances…": "Liege Airport, FPS Finance…", "Modifier le document": "Edit document", "Nom du document": "Document name",
  "Version / édition": "Version / edition", "2026-03, rév. 4…": "2026-03, rev. 4…", "Épingler en haut de la liste": "Pin to the top of the list",
  "Description (quand l'utiliser, à qui l'envoyer…)": "Description (when to use it, who to send it to…)", "Fichier actuel": "Current file", "Remplacer par une nouvelle version": "Replace with a new version",
  "Versions précédentes : ": "Previous versions: ", "Nouvelle version prête : enregistrez pour la publier": "New version ready: save to publish it", "Le fichier n'a pas pu être envoyé.": "The file could not be uploaded.",
  "Document enregistré": "Document saved", "Supprimer ce document de la bibliothèque ?": "Delete this document from the library?", "Ouvrir dans un onglet": "Open in a tab",
  "Préparation de l'impression…": "Preparing to print…", "Ouvert dans un onglet : imprimez depuis le lecteur PDF.": "Opened in a tab: print from the PDF viewer.",
  "L'ajout de fichiers n'est pas disponible dans cette vue.": "Adding files is not available in this view.",
  "Aucun document pour l'instant. Ajoutez vos formulaires vierges (par exemple ceux de Liege Airport) : ils seront ici, prêts à télécharger ou imprimer.": "No documents yet. Add your blank forms (for example Liege Airport's): they will be here, ready to download or print."
});
rule(/^(\d+) documents?$/, (m, n) => `${n} document${+n === 1 ? "" : "s"}`);
rule(/^(\d+) documents? ajoutés?$/, (m, n) => `${n} document${+n === 1 ? "" : "s"} added`);
rule(/^Classer (\d+) documents$/, "File $1 documents");
rule(/^Version (.+)$/, "Version $1");
rule(/^Envoi de (\d+) fichiers?…$/, (m, n) => `Uploading ${n} file${+n === 1 ? "" : "s"}…`);
rule(/^L'aperçu n'est pas disponible pour les fichiers (.+)\. Téléchargez-le pour l'ouvrir\.$/, "Preview is not available for $1 files. Download it to open it.");
rule(/^Les fichiers (.+) s'impriment depuis leur logiciel : téléchargement lancé\.$/, "$1 files print from their own software: download started.");
rule(/^Ouvrez le fichier dans (.+) pour l'imprimer$/, "Open the file in $1 to print it");
rule(/^« (.+) » n'a pas pu être envoyé\.$/, "“$1” could not be uploaded.");
rule(/^(\d+) Ko$/, "$1 KB"); rule(/^([\d.,]+) Mo$/, "$1 MB");
/* dossiers de documents */
Object.assign(EN, {
  "Nouveau dossier": "New folder", "Renommer le dossier": "Rename folder", "Renommer": "Rename", "Créer": "Create", "Nom du dossier": "Folder name", "Sans dossier": "No folder",
  "Tous les dossiers": "All folders", "Dossier": "Folder", "Supprimer le dossier": "Delete folder", "Dossier créé": "Folder created", "Dossier renommé": "Folder renamed",
  "Rechercher dans tous les documents…": "Search all documents…", "Créer un premier dossier": "Create a first folder", "+ Nouveau dossier…": "+ New folder…", "Nom du nouveau dossier": "New folder name",
  "Formulaires, procédures…": "Forms, procedures…", "Liege Airport, SPF Finances, Securitas…": "Liege Airport, FPS Finance, Securitas…", "Indiquez le nom du nouveau dossier.": "Enter the new folder name.",
  "Ce dossier est vide. Déposez-y vos premiers fichiers.": "This folder is empty. Drop your first files here.", "Supprimer ce dossier vide ?": "Delete this empty folder?",
  "Autres dossiers · glissez une carte dessus pour l'y déplacer :": "Other folders · drag a card onto one to move it:", "Autres dossiers :": "Other folders:",
  "Aucun document pour l'instant. Créez un dossier par organisme (par exemple « Liege Airport ») puis déposez-y vos formulaires vierges : ils seront ici, prêts à télécharger ou imprimer.": "No documents yet. Create one folder per organisation (for example “Liege Airport”) and drop your blank forms in it: they will be here, ready to download or print."
});
rule(/^(\d+) dossiers?$/, (m, n) => `${n} folder${+n === 1 ? "" : "s"}`);
rule(/^Ils seront rangés dans le dossier « (.+) »$/, "They will be filed in the “$1” folder");
rule(/^Recherche « (.+) »$/, "Search “$1”");
rule(/^Déplacé dans « (.+) »$/, "Moved to “$1”");
rule(/^Un dossier « (.+) » existe déjà\.$/, "A folder “$1” already exists.");
rule(/^Renommer le dossier (.+)$/, "Rename folder $1");
rule(/^(\d+) documents? ajoutés? dans « (.+) »$/, (m, n, f) => `${n} document${+n === 1 ? "" : "s"} added to “${f}”`);
rule(/^(\d+) documents? dans ce dossier : (ils restent|il reste) rangés? dedans sous le nouveau nom\.$/, (m, n) => `${n} document${+n === 1 ? "" : "s"} in this folder: ${+n === 1 ? "it stays" : "they stay"} in it under the new name.`);
rule(/^Supprimer ce dossier \? (\d+) documents? (seront déplacés|sera déplacé) dans « Sans dossier » \(aucun fichier n'est supprimé\)\.$/, (m, n) => `Delete this folder? ${n} document${+n === 1 ? " will be" : "s will be"} moved to “No folder” (no file is deleted).`);
/* dossier Véhicules (lié à la flotte) */
Object.assign(EN, {
  "Véhicules": "Vehicles", "Lié à la Flotte": "Linked to Fleet", "Ouvrir la fiche véhicule": "Open vehicle record", "+ Ajouter un document": "+ Add a document", "Fiche véhicule": "Vehicle record",
  "Ancienne version": "Previous version", "Anciennes versions": "Previous versions", "Aucun fichier joint": "No file attached", "Aucun fichier · ajouter": "No file · add", "Modifier dans la fiche véhicule": "Edit in vehicle record",
  "Retirés de la flotte": "Retired from fleet", "Aucun document pour ce véhicule.": "No document for this vehicle.", "Document": "Document",
  "Ces dossiers sont créés automatiquement à partir des fiches véhicules : les documents ne sont pas copiés, ce sont ceux de la Flotte. Ajouter, modifier ou supprimer un document ici ou dans la fiche véhicule est visible des deux côtés.": "These folders are created automatically from the vehicle records: documents are not copied, they are the Fleet's own. Adding, editing or deleting a document here or in the vehicle record shows on both sides.",
  "Le nom du dossier suit la fiche véhicule (identifiant, plaque, modèle) : modifiez-la dans la Flotte pour le changer.": "The folder name follows the vehicle record (ID, plate, model): edit it in Fleet to change it."
});
rule(/^(\d+) sous-dossiers?$/, (m, n) => `${n} subfolder${+n === 1 ? "" : "s"}`);
rule(/^(\d+) à renouveler$/, "$1 to renew");
rule(/^Émis le (.+)$/, "Issued $1");
rule(/^Véhicules › (.+)$/, "Vehicles › $1");
rule(/^(.+) \(retiré\)$/, "$1 (retired)");
rule(/^(\d+) factures? en retard de paiement$/, (m, n) => `${n} invoice${+n === 1 ? "" : "s"} overdue`);
rule(/^(\d+) pannes? en cours \(onglet Pannes\)$/, (m, n) => `${n} open fault${+n === 1 ? "" : "s"} (Faults tab)`);
rule(/^(\d+) pannes? en cours$/, (m, n) => `${n} open fault${+n === 1 ? "" : "s"}`);
rule(/^(\d+) outils? étalonnés?, à rendre \(colonne Calibrated\)$/, (m, n) => `${n} calibrated tool${+n === 1 ? "" : "s"} to return (Calibrated column)`);
Object.assign(EN, { "Achats": "Purchasing", "Management": "Management", "Fournisseurs, commandes et factures d'achat": "Suppliers, orders and purchase invoices",
  "Ce module est prêt à être construit. Dites-moi ce que vous souhaitez y suivre (fournisseurs, bons de commande, factures d'achat, réceptions…) et je l'ajoute ici.": "This module is ready to be built. Tell me what you want to track here (suppliers, purchase orders, purchase invoices, receipts…) and I will add it." });
Object.assign(EN, { "☀ Clair": "☀ Light", "☾ Sombre": "☾ Dark", "Thème": "Theme" });
Object.assign(EN, { "Compteur masqué pendant 8 heures": "Counter hidden for 8 hours", "Compteur réaffiché": "Counter shown again", "Réafficher le compteur": "Show the counter again", "Masquer ce compteur pendant 8 heures": "Hide this counter for 8 hours" });
rule(/^Compteur masqué jusqu'à (.+) · cliquer pour le réafficher$/, "Counter hidden until $1 · click to show it again");
rule(/^(.+) · cliquer pour masquer 8 h$/, (m, a) => `${tr(a, "en")} · click to hide for 8 h`);
/* WebFleet : positions, trajets, import CSV */
Object.assign(EN, {
  "Positions": "Positions", "Trajets": "Trips", "En route": "Driving", "À l'arrêt, contact mis": "Stopped, ignition on", "Contact coupé": "Ignition off", "Pas de signal depuis 24 h": "No signal for 24 h", "Aucune donnée": "No data",
  "à l'instant": "just now", "données d'exemple": "sample data", "import CSV Webfleet": "Webfleet CSV import", "liaison WebFleet": "WebFleet link", "Données d'exemple": "Sample data",
  "Mise à jour manuelle par import CSV en attendant la liaison automatique (serveur ONE.COM).": "Updated manually by CSV import until the automatic link (ONE.COM server).",
  "Aucune position pour l'instant. Importez un export Webfleet (CSV) pour afficher la dernière position et le compteur de chaque véhicule. La liaison automatique viendra avec le serveur ONE.COM.": "No positions yet. Import a Webfleet export (CSV) to show each vehicle's last position and odometer. The automatic link will come with the ONE.COM server.",
  "Plaque, identifiant, adresse, chauffeur…": "Plate, ID, address, driver…", "Importer un export Webfleet (CSV)": "Import a Webfleet export (CSV)", "Carte des positions des véhicules": "Map of vehicle positions",
  "Dernière position": "Last position", "Dernier signal": "Last signal", "Vitesse": "Speed", "Compteur": "Odometer", "Carte ↗": "Map ↗", "ID WebFleet manquant": "WebFleet ID missing",
  "Aucun véhicule ne correspond à ce filtre.": "No vehicle matches this filter.", "La carte n'a pas pu être chargée. Utilisez les liens « Carte ↗ » de la liste.": "The map could not be loaded. Use the “Map ↗” links in the list.",
  "Le fond de carte ne se charge pas ici. Utilisez les liens « Carte ↗ » de la liste.": "The base map does not load here. Use the “Map ↗” links in the list.", "Voir sur la carte": "View on map",
  "Période": "Period", "7 jours": "7 days", "30 jours": "30 days", "Ce mois": "This month", "Mois précédent": "Last month", "Cette année": "This year", "Tout": "All",
  "Pro + privé": "Business + private", "Professionnels": "Business", "Privés": "Private", "Type de trajet": "Trip type", "Lieu, chauffeur, plaque…": "Place, driver, plate…", "Rechercher un trajet": "Search for a trip",
  "Distance": "Distance", "Temps de conduite": "Driving time", "Dont privé": "Of which private", "Par véhicule": "By vehicle", "Par chauffeur": "By driver", "Départ": "Departure", "Trajet": "Trip", "Durée": "Duration",
  "Privé": "Private", "Pro": "Business", "Trajets": "Trips", "Jours roulés": "Days driven", "Temps": "Time", "Aucun trajet sur cette période avec ces filtres.": "No trip in this period with these filters.",
  "Aucun trajet pour l'instant. Exportez le rapport de trajets depuis Webfleet (CSV) puis importez-le ici. La liaison automatique viendra avec le serveur ONE.COM.": "No trips yet. Export the trip report from Webfleet (CSV) and import it here. The automatic link will come with the ONE.COM server.",
  "Derniers trajets": "Latest trips", "Tous les trajets": "All trips", "Position": "Position", "ID WebFleet à renseigner": "WebFleet ID to fill in",
  "Importer un export Webfleet (CSV)": "Import a Webfleet export (CSV)", "Choisir le fichier CSV": "Choose the CSV file", "ou le déposer ici": "or drop it here", "Importer": "Import", "Fermer": "Close",
  "Type de fichier": "File type", "Dernières positions / compteurs": "Last positions / odometers", "Rapport de trajets": "Trip report", "Colonnes reconnues (vérifier ou corriger)": "Detected columns (check or correct)",
  "— ignorée —": "— ignored —", "Véhicule (nom / plaque)": "Vehicle (name / plate)", "N° d'objet WebFleet": "WebFleet object no.", "Départ (date et heure)": "Departure (date and time)", "Arrivée (date et heure)": "Arrival (date and time)",
  "Adresse de départ": "Departure address", "Adresse d'arrivée": "Arrival address", "Type (pro / privé)": "Type (business / private)", "Compteur au départ": "Start odometer", "Compteur à l'arrivée": "End odometer",
  "Date et heure du signal": "Signal date and time", "Latitude": "Latitude", "Longitude": "Longitude", "Adresse": "Address", "Compteur kilométrique": "Odometer", "Contact": "Ignition",
  "Unité du compteur": "Odometer unit", "Automatique": "Automatic", "centaines de mètres (API WebFleet)": "hundreds of metres (WebFleet API)", "mètres": "metres", "centaines de mètres": "hundreds of metres",
  "Mettre à jour le kilométrage des fiches véhicules (seulement s'il est plus élevé)": "Update vehicle mileage (only if higher)", "Unité de la distance": "Distance unit", "Véhicule trouvé": "Matched vehicle",
  "Le fichier n'a pas pu être lu.": "The file could not be read.", "Le fichier est vide ou n'est pas un CSV.": "The file is empty or not a CSV.",
  "Aucune colonne de position ni de compteur reconnue : choisissez-les ci-dessus.": "No position or odometer column detected: choose them above.", "La colonne de départ (date et heure) est nécessaire.": "The departure (date and time) column is required.",
  "Identifiant WebFleet (n° d'objet)": "WebFleet ID (object no.)", "tabulation": "tab",
  "WebFleet : positions, compteurs et trajets sont visibles dans les onglets Positions et Trajets, mis à jour par import CSV en attendant la liaison automatique (serveur ONE.COM). Renseignez l'identifiant WebFleet (n° d'objet) de chaque véhicule pour une correspondance fiable.": "WebFleet: positions, odometers and trips are shown in the Positions and Trips tabs, updated by CSV import until the automatic link (ONE.COM server). Fill in each vehicle's WebFleet ID (object no.) for reliable matching."
});
rule(/^il y a (\d+) min$/, "$1 min ago"); rule(/^il y a (\d+) h$/, "$1 h ago"); rule(/^il y a (\d+) j$/, "$1 d ago");
rule(/^il y a (.+) · Carte ↗$/, (m, a) => `${tr("il y a " + a, "en")} · Map ↗`);
rule(/^Source : (.+?)( · dernier import le (.+?))?\. ?(.*)$/, (m, a, x, d, rest) => `Source: ${a.split(", ").map(z => tr(z, "en")).join(", ")}${d ? " · last import " + d : ""}. ${tr(rest, "en")}`);
rule(/^(\d+) h (\d+)$/, "$1 h $2");
rule(/^([\d  .,]+) km sur 30 jours$/, "$1 km over 30 days");
rule(/^compteur WebFleet · (.+)$/, (m, a) => `WebFleet odometer · ${tr(a, "en")}`);
rule(/^ID (.+) · pas encore de données$/, "ID $1 · no data yet");
rule(/^(\d+) lignes? → (\d+) véhicules?$/, (m, a, b) => `${a} row${+a === 1 ? "" : "s"} → ${b} vehicle${+b === 1 ? "" : "s"}`);
rule(/^(\d+) véhicules? non reconnus?$/, (m, a) => `${a} vehicle${+a === 1 ? "" : "s"} not recognised`);
rule(/^(\d+) lignes? · séparateur « (.+) »$/, (m, a, b) => `${a} row${+a === 1 ? "" : "s"} · separator “${b === "tabulation" ? "tab" : b}”`);
rule(/^Compteur : (.+)$/, (m, a) => `Odometer: ${tr(a, "en")}`); rule(/^Distance : (.+)$/, (m, a) => `Distance: ${tr(a, "en")}`);
rule(/^Non reconnus : (.+?)\. Renseignez leur « Identifiant WebFleet » \(n° d'objet\) dans la fiche du véhicule, ou vérifiez que la plaque figure dans le nom de l'objet\.$/, "Not recognised: $1. Fill in their “WebFleet ID” (object no.) on the vehicle record, or check the plate appears in the object name.");
rule(/^Import… (.+)$/, "Importing… $1");
rule(/^(\d+) positions? importées?( · (\d+) kilométrages? mis à jour)?$/, (m, a, x, b) => `${a} position${+a === 1 ? "" : "s"} imported${b ? ` · ${b} mileage${+b === 1 ? "" : "s"} updated` : ""}`);
rule(/^(\d+) (nouveau trajet|nouveaux trajets)( · (\d+) déjà connus? mis à jour)?$/, (m, a, x, y, b) => `${a} new trip${+a === 1 ? "" : "s"}${b ? ` · ${b} already known, updated` : ""}`);
rule(/^Afficher plus \((\d+) restants\)$/, "Show more ($1 left)");
rule(/^Source : ([^·]+)$/, (m, a) => `Source: ${a.split(", ").map(z => tr(z.trim(), "en")).join(", ")}`);
rule(/^dernier import le (.+?)\. (.+)$/, (m, a, b) => `last import ${a}. ${tr(b, "en")}`);
Object.assign(EN, { "Dans Webfleet, exportez en CSV soit la": "In Webfleet, export as CSV either the", "vue des véhicules / dernières positions": "vehicle view / last positions",
  "(position, compteur kilométrique), soit le": "(position, odometer), or the", "rapport de trajets": "trip report",
  "(départ, arrivée, distance, durée). L'application reconnaît le type de fichier et les colonnes, en français, anglais, néerlandais ou allemand.": "(departure, arrival, distance, duration). The app detects the file type and the columns, in French, English, Dutch or German." });
EN["⇪ Importer Webfleet (CSV)"] = "⇪ Import Webfleet (CSV)";
/* import de la liste des véhicules + suppression des véhicules d'exemple */
Object.assign(EN, { "Liste des véhicules (créer / compléter les fiches)": "Vehicle list (create / complete records)", "Nom de l'objet WebFleet": "WebFleet object name", "Immatriculation": "Registration",
  "Marque / modèle / description": "Make / model / description", "Carburant": "Fuel", "Créer une fiche pour chaque véhicule absent de l'ERP": "Create a record for each vehicle not yet in the ERP",
  "Choisissez au moins la colonne du nom de l'objet, du n° d'objet ou de l'immatriculation.": "Choose at least the object name, object number or registration column.",
  "Fiches existantes : l'identifiant WebFleet est ajouté et le kilométrage mis à jour s'il est plus élevé. Nouvelles fiches : un identifiant libre leur est attribué ; complétez ensuite les documents, pneus et échéances.": "Existing records: the WebFleet ID is added and mileage updated if higher. New records get a free internal ID; then complete documents, tyres and due dates.",
  "Action": "Action", "Identifiant": "ID", "Plaque": "Plate", "Modèle": "Model", "N° d'objet": "Object no.", "Compléter": "Complete", "Créer": "Create", "Ignorer": "Skip", "auto": "auto",
  "Supprimer seulement les véhicules d'exemple": "Delete only the sample vehicles", "Supprimer les véhicules d'exemple": "Delete the sample vehicles" });
rule(/^(\d+) véhicules? déjà dans l'ERP → fiche complétée$/, (m, n) => `${n} vehicle${+n === 1 ? "" : "s"} already in the ERP → record completed`);
rule(/^(\d+) (nouveau véhicule|nouveaux véhicules)( → fiche créée| \(ignorés\))$/, (m, n, x, y) => `${n} new vehicle${+n === 1 ? "" : "s"}${y.includes("créée") ? " → record created" : " (skipped)"}`);
rule(/^(\d+) (véhicule créé|véhicules créés)( · (\d+) fiches? complétées?)?$/, (m, n, x, y, k) => `${n} vehicle${+n === 1 ? "" : "s"} created${k ? ` · ${k} record${+k === 1 ? "" : "s"} completed` : ""}`);
rule(/^… et (\d+) autres$/, "… and $1 more");
rule(/^Suppression… (.+)$/, "Deleting… $1");
rule(/^(\d+) véhicules? d'exemple supprimés?$/, (m, n) => `${n} sample vehicle${+n === 1 ? "" : "s"} deleted`);
rule(/^Supprimer définitivement les (\d+) véhicules d'exemple, avec leurs pannes, entretiens, amendes, positions et trajets d'exemple \? .*$/, "Permanently delete the $1 sample vehicles, with their sample faults, services, fines, positions and trips? Your own vehicles and the other sample data (gas, customers, invoices, tools) are kept.");
Object.assign(EN, { "Importer un export Webfleet (CSV ou Excel)": "Import a Webfleet export (CSV or Excel)", "Choisir le fichier (CSV ou Excel)": "Choose the file (CSV or Excel)", "fichier Excel": "Excel file",
  "Dans Webfleet, exportez (CSV ou Excel) la": "In Webfleet, export (CSV or Excel) the", "liste des véhicules": "vehicle list", ", la": ", the", "vue des dernières positions": "last positions view", "ou le": "or the",
  "Reprendre l'identifiant WebFleet (004, 015… en tête du nom, sinon le n° d'objet) comme identifiant interne quand il est libre": "Use the WebFleet ID (004, 015… at the start of the name, otherwise the object no.) as internal ID when free",
  "Enregistrer aussi la dernière position (adresse, état, dernière mise à jour)": "Also save the last position (address, state, last update)", "Placer les adresses sur la carte (géocodage OpenStreetMap, ≈ 1 seconde par véhicule)": "Place addresses on the map (OpenStreetMap geocoding, ≈ 1 second per vehicle)",
  "Dernière position (adresse)": "Last position (address)", "Dernière mise à jour": "Last update", "Statut WebFleet": "WebFleet status", "à compléter": "to complete" });
rule(/^Localisation des adresses… (.+)$/, "Locating addresses… $1");
rule(/^(\d+) positions? enregistrées?( · (\d+) placées? sur la carte)?$/, (m, n, x, k) => `${n} position${+n === 1 ? "" : "s"} saved${k ? ` · ${k} placed on the map` : ""}`);
rule(/^Le fichier n'a pas pu être lu \(lecteur Excel indisponible : enregistrez-le en CSV depuis Excel\)\.$/, "The file could not be read (Excel reader unavailable: save it as CSV from Excel).");
EN["Une connexion reste valable 8 heures sur l'appareil."] = "A login stays valid for 8 hours on the device.";
EN["Votre session de 8 heures a expiré : reconnectez-vous."] = "Your 8-hour session has expired: please sign in again.";
Object.assign(EN, {
  "Liaison WEBFLEET": "WEBFLEET link", "Saisir les identifiants Webfleet": "Enter Webfleet credentials", "Identifiants Webfleet": "Webfleet credentials",
  "Compte Webfleet (account)": "Webfleet account", "Utilisateur WEBFLEET.connect": "WEBFLEET.connect user", "Mot de passe": "Password", "Clé API": "API key",
  "Enregistrer et tester": "Save and test", "Véhicules Webfleet": "Webfleet vehicles", "Connexion à Webfleet…": "Connecting to Webfleet…",
  "N° Webfleet": "Webfleet no.", "Nom dans Webfleet": "Name in Webfleet", "Fiche ERP": "ERP record", "Synchroniser maintenant": "Sync now",
  "Tester et voir les véhicules Webfleet": "Test and list Webfleet vehicles", "Modifier les identifiants": "Edit credentials", "Déconnecter": "Disconnect",
  "Synchronisation…": "Syncing…", "Déjà à jour": "Already up to date", "Compte": "Account", "Positions": "Positions", "Trajets": "Trips",
  "pas encore synchronisées": "not synced yet", "pas encore synchronisés": "not synced yet", "Dernière erreur :": "Last error:",
  "(toutes les 15 min, 30 derniers jours au premier passage)": "(every 15 min, last 30 days on first run)",
  "La synchronisation tourne tant qu'au moins une personne a l'ERP ouvert ; à la réouverture, les trajets manqués sont rattrapés.": "Sync runs while at least one person has the ERP open; missed trips are caught up when it is reopened.",
  "Aucun trajet reçu de Webfleet pour l'instant.": "No trips received from Webfleet yet.", "Le serveur ne répond pas.": "The server is not responding.",
  "Vérifiez le compte, l'utilisateur, son mot de passe, la clé API et que l'utilisateur a bien l'accès WEBFLEET.connect.": "Check the account, user, password, API key and that the user has WEBFLEET.connect access.",
  "inchangé": "unchanged", "inchangée": "unchanged"
});
rule(/^Liaison WebFleet automatique · positions (.+) · trajets (.+)\.$/, "Automatic WebFleet link · positions $1 · trips $2.");
Object.assign(EN, {
  "Liaison Odoo": "Odoo link", "Connecter Odoo": "Connect Odoo", "Connexion Odoo": "Odoo connection", "Adresse de votre Odoo": "Your Odoo address",
  "Base de données (si demandé)": "Database (if required)", "La clé expire le": "Key expires on", "Tester la connexion": "Test the connection",
  "Modifier / renouveler la clé": "Edit / renew the key", "Test de la connexion Odoo": "Odoo connection test", "Connexion à Odoo…": "Connecting to Odoo…",
  "Document Odoo, en lecture seule": "Odoo document, read-only", "Ouvrir dans Odoo": "Open in Odoo", "à facturer dans Odoo": "to invoice in Odoo",
  "Paiement partiel": "Partly paid", "Annulée": "Cancelled", "Annulées": "Cancelled", "Communication de paiement": "Payment reference",
  "Géré dans Odoo": "Managed in Odoo", "archivé": "archived", "Odoo": "Odoo", "Clé API": "API key", "Synchronisation": "Sync"
});
rule(/^Reste dû (.+)$/, "Amount due $1");
rule(/^Référence client : (.+)$/, "Customer reference: $1");
Object.assign(EN, { "Identifiant de connexion de l'utilisateur (e-mail)": "User login (e-mail)", "Base de données": "Database" });
Object.assign(EN, {
  "Année": "Year", "Période": "Period", "Client": "Customer", "Origine": "Origin", "Toutes": "All", "Toute l'année": "Whole year", "Tous les clients": "All customers",
  "Trimestres": "Quarters", "Mois": "Months", "1er trimestre": "Q1", "2e trimestre": "Q2", "3e trimestre": "Q3", "4e trimestre": "Q4",
  "Janvier": "January", "Février": "February", "Mars": "March", "Avril": "April", "Mai": "May", "Juin": "June", "Juillet": "July", "Août": "August", "Septembre": "September", "Octobre": "October", "Novembre": "November", "Décembre": "December",
  "Effacer les filtres": "Clear filters", "Exporter (Excel)": "Export (Excel)", "Désélectionner": "Deselect", "Supprimer des brouillons": "Delete drafts",
  "Je confirme la suppression": "I confirm the deletion", "Rechercher un numéro, un client, une référence…": "Search a number, customer, reference…", "Marquer payées": "Mark as paid"
});
rule(/^(\d+) sélectionnés?$/, "$1 selected");
rule(/^Total des (\d+) documents affichés$/, "Total of the $1 documents shown");
Object.assign(EN, { "Liaison Falco (comptabilité)": "Falco link (accounting)", "Connecter Falco": "Connect Falco", "Connexion Falco": "Falco connection", "Date de bascule": "Switch-over date",
  "Transmission": "Transfer", "Transmettre maintenant": "Send now", "Test de la connexion Falco": "Falco connection test", "Connexion à Falco…": "Connecting to Falco…", "Organisation": "Organisation", "Documents": "Documents", "Transmission…": "Sending…", "Transmettre": "Send" });
rule(/^Transmettre à Falco \((\d+)\)$/, "Send to Falco ($1)");
Object.assign(EN, { "Banque": "Bank", "Finances": "Finance", "Compte": "Account", "Tous les comptes": "All accounts", "Sens": "Direction", "Entrées et sorties": "In and out", "Entrées": "Incoming", "Sorties": "Outgoing",
  "Factures": "Invoices", "Reliés à une facture": "Linked to an invoice", "Entrées non reliées": "Unlinked incoming", "Contrepartie": "Counterparty", "Communication": "Reference", "Facture": "Invoice", "Montant": "Amount",
  "Relier…": "Link…", "Liaison Ponto (banques)": "Ponto link (banks)", "Connecter Ponto": "Connect Ponto", "Connexion Ponto": "Ponto connection", "Test de la connexion Ponto": "Ponto connection test",
  "Relier ce paiement à une facture": "Link this payment to an invoice", "Solde des comptes": "Account balance", "Total des comptes (EUR)": "Total of accounts (EUR)", "Rechercher une contrepartie, une communication, un n° de facture…": "Search a counterparty, reference, invoice number…" });
Object.assign(EN, { "Mouvements": "Transactions", "Fichiers CODA": "CODA files", "Générer un fichier CODA": "Generate a CODA file", "Générer": "Generate", "Du": "From", "Au (inclus)": "To (inclusive)",
  "État": "Status", "Valides": "Valid", "Annulés": "Cancelled", "Télécharger": "Download", "Annuler le fichier": "Cancel the file" });
Object.assign(EN, { "Nom et couleur du compte": "Account name and colour", "Nom affiché en grand (facultatif)": "Large display name (optional)", "Couleur": "Colour",
  "Rechercher une facture, un client ou un montant…": "Search an invoice, customer or amount…", "Rechercher une contrepartie, une communication, un n° de facture, un montant…": "Search a counterparty, reference, invoice number, amount…" });
/* ---- my-145-station ---- */
Object.assign(EN, {
  "Station": "Station", "Véhicules": "Vehicles", "Outillage": "Tooling", "Articles et prix": "Items and prices", "Management": "Management",
  "Nom de la compagnie": "Airline name", "Code court (Charge Sheet)": "Short code (Charge Sheet)", "Préfixes d'immatriculation": "Registration prefixes",
  "Immatriculations": "Registrations", "Code": "Code", "Tarifs": "Rates", "Rechercher un nom, un code, une immatriculation…": "Search a name, code or registration…",
  "Tarif général": "General rate", "Type d'avion": "Aircraft type", "Forfait": "Package", "Heures": "Hours", "Matériel / équipement": "Material / equipment",
  "Libellé (tel qu'il apparaît sur la Charge Sheet)": "Label (as shown on the Charge Sheet)", "Devise": "Currency", "Prix": "Price",
  "Rechercher une référence, un libellé, un type d'avion…": "Search a reference, label or aircraft type…",
  "Tarifs utilisés pour préparer les Charge Sheets. Modifiez un prix directement dans le tableau : il est enregistré dès que vous quittez la case.": "Rates used to prepare Charge Sheets. Edit a price directly in the table: it is saved as soon as you leave the field.",
  "Organisation, station, utilisateurs et services reliés": "Organisation, station, users and linked services", "Organisation": "Organisation",
  "Nom de l'organisation (Part 145)": "Organisation name (Part 145)", "N° d'agrément Part 145": "Part 145 approval no.",
  "Code de la station (IATA)": "Station code (IATA)", "Nom de la station": "Station name", "Fuseau horaire de la station": "Station time zone",
  "Pris par": "Taken by", "Import d'une sauvegarde": "Import a backup", "Sauvegarde": "Backup",
  "Quels véhicules ont une échéance ce mois-ci ?": "Which vehicles have a due date this month?", "Quels outils arrivent à échéance d'étalonnage ?": "Which tools are due for calibration?",
  "Quelles pannes de véhicules sont encore ouvertes ?": "Which vehicle faults are still open?", "Liste les tarifs du client MT": "List the rates for customer MT", "Résume mes notes de la semaine": "Summarise my notes from this week",
  "État des véhicules": "Vehicle status", "Voir les véhicules": "View vehicles", "Bon de commande": "Purchase order", "Continuer": "Continue"
});
/* ---- personnel et qualifications ---- */
Object.assign(EN, {
  "Personnel": "Staff", "Équipe": "Team", "Qualifications": "Qualifications", "Échéances": "Due dates", "Ajouter une personne": "Add a person", "Nouvelle personne": "New person",
  "Nom": "Name", "Fonction": "Function", "Licences": "Licences", "Prochaine échéance": "Next due date", "Tous": "All", "Anciens": "Former",
  "Rechercher un nom, une licence, un type d'avion…": "Search a name, licence or aircraft type…", "Personne ne correspond.": "No one matches.", "Aucune personne pour l'instant.": "No one yet.",
  "Personnes qualifiées": "Qualified people", "Employeur": "Employer", "Station de base": "Home station", "Nationalité": "Nationality", "Horaire habituel": "Usual shift",
  "Nom et prénom": "Full name", "E-mail (le même que son compte, pour qu'il voie sa fiche)": "E-mail (same as their account, so they can see their record)",
  "Ajouter une licence": "Add a licence", "N° de licence": "Licence no.", "Autorité": "Authority", "Expiration": "Expiry",
  "Qualifications par type d'avion": "Aircraft type qualifications", "Aucune licence enregistrée.": "No licence recorded.", "Aucune.": "None.", "Documents": "Documents",
  "Ajouter un document": "Add a document", "Aucun document.": "No documents.", "Documents visibles par le bureau et par la personne elle-même.": "Documents are visible to the office and to the person themselves.",
  "Fiche enregistrée": "Record saved", "Ne fait plus partie de la station": "No longer at the station", "(fiche gardée, sortie des listes et des échéances)": "(record kept, removed from lists and due dates)",
  "Passeport": "Passport", "Visa": "Visa", "Permis de travail": "Work permit", "Badge piste / aéroport": "Ramp / airport pass", "Examen (CAAI…)": "Exam (CAAI…)", "Autorisation run-up": "Run-up authorisation",
  "Formation (Human Factors, EWIS…)": "Training (Human Factors, EWIS…)", "Aptitude médicale": "Medical fitness", "Permis de conduire / piste": "Driving / airside licence", "Autre": "Other",
  "Jour (08-20)": "Day (08-20)", "Nuit (20-08)": "Night (20-08)", "Horaire libre": "Custom hours",
  "Intitulé / pays / aéroport": "Title / country / airport", "Type d'avion (si applicable)": "Aircraft type (if applicable)", "N° du document": "Document no.", "Date d'émission": "Issue date", "Date d'expiration": "Expiry date",
  "Échéances des 90 prochains jours (et dépassées) : licences et documents en cours.": "Due dates in the next 90 days (and overdue): current licences and documents.",
  "Rien dans les 90 prochains jours.": "Nothing in the next 90 days.", "Rien dans les 60 prochains jours.": "Nothing in the next 60 days.", "Échéances du personnel": "Staff due dates",
  "Licences, visas, permis, badges et examens qui expirent (60 jours).": "Licences, visas, permits, passes and exams expiring (60 days).", "Voir le personnel": "View staff",
  "Types d'avion suivis (séparés par des virgules)": "Aircraft types tracked (comma-separated)", "Approbation israélienne": "Israeli approval",
  "E = licence EASA · I = approbation israélienne (requise pour signer les avions 4X- en Israël) · F = licence FAA.": "E = EASA licence · I = Israeli approval (required to sign 4X- aircraft in Israel) · F = FAA licence.",
  "Ajoutez d'abord les types d'avion dans Paramètres (Station).": "First add the aircraft types in Settings (Station).", "Les autorisations de signer (CRS) restent gérées dans AMOS.": "Certifying authorisations (CRS) stay in AMOS."
});
rule(/^(\d+) personnes? · licences, qualifications et documents$/, "$1 people · licences, qualifications and documents");
/* ---- roster ---- */
Object.assign(EN, {
  "Roster": "Roster", "Planning de la station : une ligne par personne, un code par jour": "Station planning: one row per person, one code per day", "Exporter (Excel)": "Export (Excel)",
  "Reprendre le mois précédent": "Copy previous month", "Mois": "Month", "Aujourd'hui": "Today", "Codes": "Codes", "Pinceau :": "Brush:", "Effacer": "Clear",
  "Choisissez un code puis cliquez ou glissez sur les cases. Sans code choisi, un clic ouvre le détail de la case.": "Pick a code, then click or drag over the cells. With no code picked, a click opens the cell details.",
  "Cliquez ou glissez sur les cases pour appliquer. Cliquez à nouveau sur le code pour arrêter.": "Click or drag over the cells to apply. Click the code again to stop.",
  "Jour (08-20)": "Day (08-20)", "Nuit (20-08)": "Night (20-08)", "Jour ou nuit (à affecter)": "Day or night (to assign)", "Jour de voyage (aller ou retour)": "Travel day (to or from the station)",
  "À la station, sans shift précis": "At the station, no set shift", "Formation sur le terrain (OJT)": "On-the-job training (OJT)", "Formation": "Training", "Repos / congé": "Off / leave",
  "Autre station (détaché / flight mech)": "Other station (detached / flight mech)", "Équipe de jour": "Day shift", "Équipe de nuit": "Night shift", "Présent, équipe à affecter": "Present, shift to assign",
  "Présent, sans équipe": "Present, no shift", "Voyage": "Travel", "Repos": "Off", "Compte comme": "Counts as", "Libellé": "Label", "Enregistrer les libellés": "Save labels",
  "Code de 3 lettres d'une autre station": "3-letter code of another station", "Équipe de jour (08-20)": "Day shift (08-20)", "Équipe de nuit (20-08)": "Night shift (20-08)",
  "Personne de prévu.": "No one scheduled.", "Hors équipe aujourd'hui": "Not on shift today", "Jour": "Day", "Nuit": "Night", "Début": "Start", "Fin": "End",
  "Remarque (visible du bureau seulement)": "Note (office only)", "Code de la station": "Station code", "Roster enregistré": "Roster saved", "Autre station": "Other station",
  "Équipes du jour": "Today's shifts", "Ouvrir le roster": "Open the roster", "Qui est de jour et de nuit aujourd'hui, et les trous de couverture des 7 prochains jours.": "Who is on day and night shift today, and coverage gaps in the next 7 days.",
  "Couverture : nombre de personnes présentes qualifiées sur le type, par équipe. En rouge : personne de qualifié (ou personne avec I pour signer les 4X-). Les autorisations de signer restent dans AMOS.": "Coverage: number of qualified people present on the type, per shift. Red: nobody qualified (or nobody with I to sign 4X- aircraft). Certifying authorisations stay in AMOS."
});
/* ---- shifts et handover ---- */
Object.assign(EN, {
  "Shift": "Shift", "Planning des avions et handover : les 5 sections du handover de la station": "Aircraft planning and handover: the station's 5 handover sections", "Shift en cours": "Current shift",
  "Travail non terminé": "Uncompleted work", "Ce qui reste à faire, repris par le shift suivant.": "What is left to do, taken over by the next shift.", "Ajouter": "Add", "Rien en attente.": "Nothing pending.",
  "Avion": "Aircraft", "Travail": "Work", "Remarque": "Note", "Immatriculation": "Registration", "Travail à faire": "Work to do", "Nouveau travail non terminé": "New uncompleted work",
  "Travail du shift (prévu et fait)": "Shift work (planned and done)", "Un avion par ligne. Le client est retrouvé par l'immatriculation. La CRS se fait dans AMOS.": "One aircraft per row. The customer is found from the registration. CRS is done in AMOS.",
  "Ajouter un avion": "Add an aircraft", "Nouvel avion": "New aircraft", "Mécanos": "Mechanics", "Prévu": "Planned", "Fait": "Done", "Aucun avion pour ce shift.": "No aircraft for this shift.",
  "Vol / rotation": "Flight / rotation", "CRS (affectés à cet avion)": "CRS (assigned to this aircraft)", "Mécanos / aides": "Mechanics / helpers", "Ajouter quelqu'un qui n'est pas au roster de ce shift": "Add someone not on this shift's roster",
  "Travail prévu": "Planned work", "Travail fait": "Work done", "Travail non terminé : à reprendre par le shift suivant": "Uncompleted: to be taken over by the next shift", "Avion enregistré": "Aircraft saved", "Non terminé": "Uncompleted",
  "Aucun CRS affecté": "No CRS assigned", "Équipement et matériel": "Equipment and materials", "Équipements et consommables utilisés, par client ou utilisateur.": "Equipment and consumables used, by customer or user.",
  "Client / utilisateur": "Customer / user", "Équipement ou matériel": "Equipment or material", "Quantité": "Quantity", "Rien de noté.": "Nothing recorded.", "Avion (si applicable)": "Aircraft (if applicable)", "Nouvel équipement ou matériel": "New equipment or material",
  "Station Control": "Station Control", "Contrôles de fin de shift.": "End-of-shift checks", "Remarque Station Control": "Station Control note",
  "Manpower et signatures": "Manpower and signatures", "Personnel du shift d'après le roster. La signature confirme la remise du shift, pas un travail sur avion.": "Shift staff from the roster. Signing confirms the shift handover, not work on an aircraft.",
  "Shift Foreman": "Shift Foreman", "Ajouter au shift": "Add to the shift", "Ajouté": "Added", "Personne au roster pour ce shift.": "No one on the roster for this shift.", "Remis par": "Handed over by", "Repris par": "Taken over by", "Pas encore": "Not yet",
  "Je remets le shift": "I hand over the shift", "Je reprends le shift": "I take over the shift", "Annuler les signatures": "Cancel signatures", "Remettre": "Hand over", "Reprendre": "Take over",
  "Shift en cours": "Current shift", "Avions du shift en cours, travail non terminé, CRS manquants.": "Current shift aircraft, uncompleted work, missing CRS.", "Ouvrir le shift": "Open the shift", "avions": "aircraft", "non terminés": "uncompleted", "sans CRS qualifié": "without qualified CRS",
  "Flightradar24": "Flightradar24", "Enregistrer la clé": "Save key", "Retirer la clé": "Remove key", "Tester": "Test", "Non configuré": "Not configured", "Clé API Flightradar24": "Flightradar24 API key",
  "Positions Flightradar24 mises à jour": "Flightradar24 positions updated", "Pas de vol trouvé": "No flight found",
  "Notion (handover)": "Notion (handover)", "Page Notion ↗": "Notion page ↗", "Envoyer vers Notion": "Send to Notion", "Renvoyer vers Notion": "Send to Notion again", "Envoyer": "Send", "Renvoyer": "Send again", "Envoyé par": "Sent by",
  "Handover envoyé vers Notion": "Handover sent to Notion", "Page Notion remplacée": "Notion page replaced",
  "La page déjà envoyée pour ce shift sera remplacée (l'ancienne va dans la corbeille de Notion).": "The page already sent for this shift will be replaced (the old one goes to the Notion trash).",
  "Une page est créée sous la page Notion choisie dans Paramètres, avec les 5 sections.": "A page is created under the Notion page chosen in Settings, with the 5 sections.",
  "Le handover de chaque shift est écrit sous une seule page Notion, choisie ici. L'outil ne modifie jamais une autre page. Dans Notion : créez une intégration interne, copiez son jeton, puis ajoutez l'intégration à cette page (••• › Connexions).": "Each shift's handover is written under a single Notion page, chosen here. The tool never changes any other page. In Notion: create an internal integration, copy its token, then add the integration to that page (••• › Connections).",
  "Jeton enregistré": "Token saved", "Retirer le jeton": "Remove token", "Pas de jeton": "No token", "Jeton d'intégration Notion": "Notion integration token", "Enregistrer le jeton": "Save token",
  "Lien de la page Notion du handover": "Link of the Notion handover page", "Enregistrer la page": "Save page", "Jeton Notion enregistré": "Notion token saved", "Page Notion enregistrée": "Notion page saved",
  "Retirer le jeton Notion ?": "Remove the Notion token?", "Connexion Notion OK": "Notion connection OK",
  "Notion n'est pas configuré : ajoutez le jeton d'intégration Notion dans Paramètres.": "Notion is not set up: add the Notion integration token in Settings.",
  "Notion : choisissez la page parente du handover dans Paramètres.": "Notion: choose the handover parent page in Settings.",
  "Notion : jeton refusé (vérifiez le jeton d'intégration dans Paramètres).": "Notion: token refused (check the integration token in Settings).",
  "Notion : page introuvable ou non partagée avec l'intégration (dans Notion : ••• › Connexions › ajouter l'intégration sur la page de test).": "Notion: page not found or not shared with the integration (in Notion: ••• › Connections › add the integration on the test page).",
  "Notion : trop de demandes, réessayez dans un instant.": "Notion: too many requests, try again in a moment.", "Ce shift n'a pas encore de fiche.": "This shift has no handover yet.",
  "Lien de page Notion invalide": "Invalid Notion page link", "Jeton Notion invalide": "Invalid Notion token"
});
rule(/^(Envoyer|Renvoyer) le handover (.+) vers Notion \?(.*)$/s, (m, a, b, c) => `${a === "Envoyer" ? "Send" : "Send again"} the ${b} handover to Notion?${c}`);
rule(/^(\d+) avions? sans CRS qualifié affecté : voir la section 2\.$/, "$1 aircraft without a qualified CRS assigned: see section 2.");
rule(/^Aucun CRS qualifié (.+)$/, "No CRS qualified on $1"); rule(/^4X- : aucun CRS avec I sur (.+)$/, "4X-: no CRS with I on $1");
/* ---- charge sheet ---- */
Object.assign(EN, {
  "Charge Sheet": "Charge Sheet", "Prestations facturables du mois, préparées depuis les shifts et revues avant l'envoi à la finance": "Billable work of the month, prepared from the shifts and reviewed before sending to finance",
  "Ajouter une ligne": "Add a line", "Nouvelle ligne": "New line", "Préparer depuis les shifts": "Prepare from shifts", "À revoir": "To review", "Tout": "All", "Ligne enregistrée": "Line saved",
  "Rechercher une immatriculation, une rotation, une description…": "Search a registration, rotation or description…", "Rien ne correspond.": "Nothing matches.", "Aucune ligne pour ce mois.": "No lines for this month.",
  "Aucune ligne pour ce mois : cliquez sur « Préparer depuis les shifts ».": "No lines for this month: click “Prepare from shifts”.", "Créer les lignes cochées": "Create the ticked lines",
  "Lignes proposées d'après les avions et le matériel notés dans les shifts du mois. Décochez ce qui ne se facture pas. Tout reste « à revoir » jusqu'à votre contrôle.": "Lines proposed from the aircraft and materials recorded in this month's shifts. Untick what is not billed. Everything stays “to review” until you check it.",
  "Aucun forfait trouvé pour ce client et ce type": "No package found for this customer and type", "Article sans tarif": "Item without a rate", "— texte libre —": "— free text —",
  "Work Type (article)": "Work Type (item)", "Work Type (texte)": "Work Type (text)", "Description (n° de WO du client…)": "Description (customer WO no.…)",
  "Station Control : contrôles de fin de shift (un par ligne)": "Station Control: end-of-shift checks (one per line)"
});

/* ---- outillage de la station ---- */
Object.assign(EN, {
  "Outillage": "Tooling", "Sortie / retour d'outils": "Tool sign-out / return", "Ajouter un outil": "Add a tool", "Sortis": "Signed out", "Au labo": "At the lab", "Étalonnage dépassé": "Calibration overdue", "Hors service": "Unserviceable",
  "En service": "In service", "Perdu": "Lost", "Retiré": "Retired", "Retirés": "Retired", "Registre": "Register", "Étalonnage": "Calibration", "Laboratoires": "Laboratories", "Utilisables": "Usable", "Inutilisables": "Not usable",
  "N° outil": "Tool no.", "Outil": "Tool", "Emplacement": "Location", "Statut": "Status", "Prochain étalonnage": "Next calibration", "Sans étalonnage": "No calibration", "Sorti": "Signed out", "Rentré": "Returned",
  "N° d'outil, désignation, P/N, S/N, emplacement…": "Tool no., description, P/N, S/N, location…", "Aucun outil ne correspond.": "No tool matches.", "Aucun outil. Ajoutez les outils de la station avec leur n° d'étiquette.": "No tools. Add the station tools with their label number.",
  "Outils sortis de l'outillage et pas encore rentrés. À vérifier au Tool Check de fin de shift (MOE 2.6.5).": "Tools signed out and not returned yet. To check at the end-of-shift Tool Check (MOE 2.6.5).",
  "Sorti par": "Signed out by", "Sortis par": "Signed out by", "Avion": "Aircraft", "Depuis": "Since", "Rentrer": "Return", "Tous les outils sont rentrés.": "All tools are returned.",
  "Cochez les outils à envoyer ensemble au laboratoire.": "Tick the tools to send together to the lab.", "Échéance": "Due date", "Labo habituel": "Usual lab", "Aucun outil n'arrive à échéance dans les 60 prochains jours.": "No tool falls due in the next 60 days.",
  "Laboratoire": "Laboratory", "Référence": "Reference", "Envoyé le": "Sent on", "Retour prévu": "Expected back", "retour prévu": "expected back", "Retour du labo": "Back from lab", "Aucun outil au laboratoire.": "No tool at the lab.",
  "Outil sorti : à rentrer d'abord": "Tool signed out: return it first", "Avion (facultatif)": "Aircraft (optional)", "Scanner ou saisir le n° de l'outil : il sort s'il est rentré, il rentre s'il est sorti": "Scan or type the tool number: it is signed out if in, returned if out",
  "Terminer": "Done", "Outil inconnu : ajoutez-le au registre": "Unknown tool: add it to the register", "Étalonnage dépassé : ne pas utiliser": "Calibration overdue: do not use", "Choisissez qui sort l'outil": "Choose who signs the tool out",
  "Cet outil ne peut pas sortir": "This tool cannot be signed out", "Sortir": "Sign out", "Sortir l'outil": "Sign out the tool", "Outil sorti": "Tool signed out", "Outil rentré": "Tool returned",
  "Envoyer au laboratoire": "Send to the laboratory", "Aucun laboratoire enregistré : ajoutez-en un dans l'onglet Laboratoires.": "No laboratory recorded: add one in the Laboratories tab.", "Date d'envoi": "Shipping date",
  "Référence (bon d'envoi, commande…)": "Reference (delivery note, order…)", "Transporteur": "Carrier", "Pas d'envoi (déposé / enlevé)": "No shipment (dropped off / collected)", "N° de suivi": "Tracking no.", "Choisissez le laboratoire.": "Choose the laboratory.",
  "Envoyer au labo": "Send to lab", "Enregistrer un étalonnage": "Record a calibration", "Date d'étalonnage": "Calibration date", "Résultat": "Result", "N° de certificat": "Certificate no.", "Réalisé par": "Performed by", "Périodicité (mois)": "Interval (months)",
  "Certificat (PDF ou photo)": "Certificate (PDF or photo)", "Le certificat pourra être joint plus tard.": "The certificate can be attached later.", "Remarques (valeurs relevées, ajustages…)": "Remarks (readings, adjustments…)",
  "Non conforme : l'outil passe hors service.": "Not compliant: the tool becomes unserviceable.", "Étalonnage enregistré : outil hors service": "Calibration recorded: tool unserviceable", "Étalonnage enregistré : outil en service": "Calibration recorded: tool in service",
  "Conforme": "Compliant", "Conforme après ajustage": "Compliant after adjustment", "Non conforme": "Not compliant", "Raison": "Reason", "Confirmer": "Confirm",
  "Mettez une étiquette « Unserviceable » sur l'outil et rangez-le en quarantaine.": "Put an “Unserviceable” tag on the tool and store it in quarantine.",
  "Mettre hors service": "Mark unserviceable", "Déclarer perdu": "Declare lost", "Remettre en service": "Return to service", "Ne plus utiliser": "Retire", "Désignation": "Description", "Part number (P/N)": "Part number (P/N)", "N° de série (S/N)": "Serial no. (S/N)",
  "Marque / modèle": "Make / model", "Catégorie": "Category", "Propriétaire": "Owner", "Pas d'étalonnage pour cet outil": "No calibration for this tool", "Périodicité": "Interval", "Dernier étalonnage": "Last calibration",
  "Certificats": "Certificates", "Valide jusqu'au": "Valid until", "Labo": "Lab", "Ouvrir": "Open", "pas de fichier": "no file", "Aucun certificat enregistré.": "No certificate recorded.", "Suivi des envois": "Shipment tracking",
  "Photos": "Photos", "Aucune photo.": "No photo.", "Historique": "History", "Rien pour l'instant.": "Nothing yet.", "Modifier la fiche": "Edit", "Nouvel outil": "New tool", "N° d'outil (étiquette)": "Tool no. (label)",
  "Caisse 1, étagère B…": "Box 1, shelf B…", "Outil à étalonner": "Tool requires calibration", "Outil enregistré": "Tool saved", "Le n° d'outil": "Tool no.", "existe déjà": "already exists",
  "Supprimer cet outil du registre ? Pour un outil qui n'est plus utilisé, préférez « Retirer » : son historique reste consultable.": "Delete this tool from the register? For a tool no longer used, prefer “Retire”: its history stays available.",
  "Envoyé au labo": "Sent to lab", "Étalonné": "Calibrated", "Remis en service": "Returned to service", "Note": "Note", "Vers le labo": "To the lab", "Aucun envoi enregistré.": "No shipment recorded.",
  "Outils sortis, au labo, étalonnages dépassés ou proches.": "Tools signed out, at the lab, calibrations overdue or due soon.", "sortis": "signed out", "au labo": "at the lab", "étalonnages dépassés": "calibrations overdue",
  "Aucune échéance dans les 30 jours.": "No due date in the next 30 days.", "Retour du labo · ": "Back from lab · ", "Enregistrer un étalonnage · ": "Record a calibration · ",
  "Ajoutez les labos où la station envoie ses outils (par exemple WAYS) : ils pourront être choisis à chaque envoi.": "Add the labs where the station sends its tools (for example WAYS): they can be chosen for each shipment.",
  "Historique de l'outil non modifiable.": "The tool history cannot be changed.", "Outil hors service, au labo ou étalonnage dépassé : il ne peut pas sortir.": "Tool unserviceable, at the lab or calibration overdue: it cannot be signed out."
});
rule(/^(\d+) outils? de la station$/, n => `${n.split(" ")[0]} station tool${+n.split(" ")[0] > 1 ? "s" : ""}`);
rule(/^(\d+) depuis plus de 12 h$/, "$1 for more than 12 h"); rule(/^(\d+) dans les 30 jours$/, "$1 within 30 days");
rule(/^À étalonner \(60 prochains jours\)$/, "To calibrate (next 60 days)"); rule(/^Envoyer au labo \((\d+)\)$/, "Send to lab ($1)"); rule(/^Envoyer (\d+) outils?$/, "Send $1 tool(s)");
rule(/^(.+) : étalonnage dépassé \(onglet Étalonnage\)$/, "$1: calibration overdue (Calibration tab)");
rule(/^(\d+) mois$/, "$1 months");

/* ---- pièces ---- */
Object.assign(EN, {
  "Pièces": "Parts", "Envois et réceptions de pièces de la station. Le stock et les commandes restent dans AMOS.": "Station parts shipments and receipts. Stock and orders stay in AMOS.",
  "Réception attendue": "Expected receipt", "Nouvel envoi": "New shipment", "À envoyer": "To ship", "Expédié": "Shipped", "Expédiés": "Shipped", "État de la pièce": "Part condition", "en retard": "late", "AOG": "AOG", "En cours": "In progress", "Reçus et annulés": "Received and cancelled",
  "P/N, désignation, S/N, réf. AMOS, AWB, station…": "P/N, description, S/N, AMOS ref., AWB, station…", "Envois": "Shipments", "Réceptions": "Receipts", "Réception": "Receipt", "Envoi": "Shipment",
  "Pièce": "Part", "Qté": "Qty", "De → vers": "From → to", "Réf. AMOS": "AMOS ref.", "Transport": "Transport", "Reçu": "Received", "Annulé": "Cancelled", "Certificat à vérifier": "Certificate to check", "Certificat vérifié": "Certificate checked",
  "Aucun envoi ni réception en cours.": "No shipment or receipt in progress.", "Rien ici pour l'instant.": "Nothing here yet.", "Réceptionné": "Received", "Reçu à destination": "Received at destination",
  "Mouvement": "Movement", "Transfert entre stations": "Transfer between stations", "Fournisseur": "Supplier", "Réparation": "Repair", "Prêt / emprunt": "Loan", "Autre": "Other", "Core / pour réparation": "Core / for repair",
  "Certificat": "Certificate", "Arrivée prévue": "Expected arrival", "Reçu le": "Received on", "Documents": "Documents", "Aucun document (Form 1, bon de livraison…).": "No documents (Form 1, delivery note…).", "+ Joindre": "+ Attach",
  "Marqué envoyé": "Marked shipped", "Annuler ce mouvement de pièce ?": "Cancel this part movement?", "Annuler le mouvement": "Cancel the movement", "Date de réception": "Receipt date", "Reçu par": "Received by",
  "La réception dans le stock se fait dans AMOS.": "Booking into stock is done in AMOS.", "Confirmer la réception": "Confirm receipt", "Réception enregistrée": "Receipt recorded", "Modifier le mouvement": "Edit the movement",
  "Type": "Type", "N° de série / lot": "Serial / batch no.", "Unité": "Unit", "N° de certificat": "Certificate no.", "Réf. AMOS (commande, transfert…)": "AMOS ref. (order, transfer…)", "De": "From", "Vers": "To",
  "Avion (si la pièce est pour un avion)": "Aircraft (if the part is for an aircraft)", "AWB / n° de suivi": "AWB / tracking no.", "AOG : avion bloqué au sol en attente de cette pièce": "AOG: aircraft on ground waiting for this part",
  "Mouvement enregistré": "Movement saved", "Supprimer ce mouvement de pièce ?": "Delete this part movement?", "Pièces en cours": "Parts in progress", "Envois et réceptions de pièces en cours, AOG, retards.": "Parts shipments and receipts in progress, AOG, delays.",
  "en cours": "in progress", "Aucun mouvement en cours.": "No movement in progress."
});
rule(/^Réception · (.+)$/, "Receipt · $1"); rule(/^Pièce et certificat vérifiés \(P\/N, S\/N, état, (.+)\)$/, "Part and certificate checked (P/N, S/N, condition, $1)");

/* ---- voyages ---- */
Object.assign(EN, {
  "Voyages": "Travel", "Vols et hôtels du personnel": "Staff flights and hotels", "Mes vols et mes nuits d'hôtel": "My flights and hotel nights", "Réserver un hôtel": "Book a hotel", "Ajouter un vol": "Add a flight",
  "Vols à venir": "Upcoming flights", "À l'hôtel cette nuit": "At the hotel tonight", "Voyages à organiser": "Travel to arrange", "Jours T du roster sans vol": "Roster T days without a flight",
  "Vols": "Flights", "Nom, hôtel, chambre, confirmation…": "Name, hotel, room, confirmation…", "Hôtel": "Hotel", "À organiser": "To arrange", "Hôtels": "Hotels", "Nom, aéroport, n° de vol, PNR…": "Name, airport, flight no., PNR…", "Passés": "Past",
  "Personne": "Person", "Vol": "Flight", "Horaires": "Times", "PNR": "PNR", "Aucun vol passé.": "No past flights.", "Aucun vol à venir.": "No upcoming flights.",
  "Chambres occupées par nuit": "Rooms occupied per night", "Nuits": "Nights", "En cours et à venir": "Current and upcoming", "Arrivée (check-in)": "Check-in", "Départ (check-out)": "Check-out", "Check-in": "Check-in", "Check-out": "Check-out", "Chambre": "Room", "Confirmation": "Confirmation",
  "Aucune nuit d'hôtel prévue.": "No hotel nights planned.", "Aucune nuit d'hôtel passée.": "No past hotel nights.",
  "Jours T (voyage) des 60 prochains jours dans le roster, sans vol enregistré pour la personne ce jour-là, la veille ou le lendemain.": "Roster T (travel) days in the next 60 days without a flight recorded for the person that day, the day before or the day after.",
  "Ajouter le vol": "Add the flight", "Tous les jours de voyage du roster ont un vol.": "All roster travel days have a flight.", "Adresse": "Address", "Tarif": "Rate", "Ce soir": "Tonight",
  "Aucun hôtel. Ajoutez les hôtels où loge le personnel de la station.": "No hotels. Add the hotels where the station staff stay.", "Nouveau vol": "New flight", "Nuits d'hôtel": "Hotel nights",
  "De (aéroport)": "From (airport)", "Vers (aéroport)": "To (airport)", "Compagnie": "Airline", "N° de vol": "Flight no.", "Départ (heure locale)": "Departure (local time)", "Arrivée (heure locale)": "Arrival (local time)",
  "PNR / réservation": "PNR / booking", "Ajoutez d'abord un hôtel (onglet Hôtels)": "Add a hotel first (Hotels tab)", "N° de confirmation": "Confirmation no.", "Coût": "Cost", "Devise": "Currency",
  "Le départ doit être après l'arrivée.": "Check-out must be after check-in.", "Vol enregistré": "Flight saved", "Nuits d'hôtel enregistrées": "Hotel nights saved",
  "Marquer cette réservation comme annulée ?": "Mark this booking as cancelled?", "Annulée": "Cancelled", "Supprimer cette réservation ?": "Delete this booking?", "Nouvel hôtel": "New hotel",
  "Tarif par nuit": "Rate per night", "Notes (contrat, petit-déjeuner, navette…)": "Notes (contract, breakfast, shuttle…)", "Hôtel enregistré": "Hotel saved", "Supprimer cet hôtel ?": "Delete this hotel?",
  "Prochains vols du personnel, nuits d'hôtel, jours de voyage sans vol.": "Next staff flights, hotel nights, travel days without a flight.", "vols dans 7 j": "flights in 7 days", "à l'hôtel ce soir": "at the hotel tonight", "à organiser": "to arrange"
});
rule(/^(\d+) dans les 7 jours$/, "$1 within 7 days");

/* ---- OneDrive ---- */
Object.assign(EN, {
  "Scans (OneDrive)": "Scans (OneDrive)", "Aucun scan.": "No scans.", "+ Scanner / joindre": "+ Scan / attach", "Envoi vers OneDrive…": "Uploading to OneDrive…", "Scans rangés dans OneDrive": "Scans filed in OneDrive", "Scan rangé dans OneDrive": "Scan filed in OneDrive",
  "Scans dans OneDrive": "Scans in OneDrive", "OneDrive (scans)": "OneDrive (scans)",
  "Les scans du shift sont rangés dans le OneDrive Microsoft 365 de la station, sous un seul dossier racine. Dans Entra ID : inscription d'application, permission Files.ReadWrite.All (application) avec consentement administrateur, puis un secret client.": "Shift scans are filed in the station's Microsoft 365 OneDrive, under a single root folder. In Entra ID: app registration, Files.ReadWrite.All (application) permission with admin consent, then a client secret.",
  "Relié": "Connected", "Secret enregistré": "Secret saved", "Locataire (tenant ID ou domaine)": "Tenant (tenant ID or domain)", "ID d'application (client)": "Application (client) ID", "Secret client": "Client secret",
  "Laisser vide pour garder le secret actuel": "Leave empty to keep the current secret", "Compte OneDrive (adresse)": "OneDrive account (address)", "Dossier racine des scans": "Scans root folder",
  "Réglages OneDrive enregistrés": "OneDrive settings saved", "Connexion OneDrive OK": "OneDrive connection OK",
  "OneDrive n'est pas configuré : un administrateur doit le relier dans Paramètres.": "OneDrive is not set up: an administrator must connect it in Settings.",
  "OneDrive : accès refusé, reconnectez OneDrive dans Paramètres.": "OneDrive: access denied, reconnect OneDrive in Settings.", "OneDrive : permission manquante (Files.ReadWrite.All avec consentement administrateur).": "OneDrive: missing permission (Files.ReadWrite.All with admin consent).",
  "OneDrive : dossier ou compte introuvable (vérifiez l'adresse du compte OneDrive et le dossier racine).": "OneDrive: folder or account not found (check the OneDrive account address and the root folder).",
  "Les scans se rangent par avion du shift.": "Scans are filed per shift aircraft.", "Fichier trop lourd (20 Mo maximum).": "File too large (20 MB maximum).", "Avion du shift introuvable": "Shift aircraft not found"
});
Object.assign(EN, {
  "2 mois": "2 months", "Afficher ce mois et le suivant, pour voir le passage d'un mois à l'autre": "Show this month and the next, to see the schedule across the month change",
  "Le vendredi est un jour de repos à la station (Shabbat) : vendredi moucheté dans le roster": "Friday is a day off at the station (Shabbat): Friday shown speckled in the roster"
});
/* ---- avions ---- */
Object.assign(EN, {
  "Avions": "Aircraft",
  "Avions servis par la station : immatriculation, compagnie, type et licences exigées pour signer. La maintenance reste dans AMOS.": "Aircraft served by the station: registration, airline, type and licences required to sign. Maintenance stays in AMOS.",
  "Immatriculation, compagnie, type, MSN…": "Registration, airline, type, MSN…",
  "MSN": "MSN",
  "Licences exigées": "Required licences",
  "CRS qualifiés": "Qualified CRS",
  "Aucun avion ne correspond.": "No aircraft match.",
  "Aucun avion pour l'instant. Ajoutez les immatriculations servies par la station.": "No aircraft yet. Add the registrations the station serves.",
  "CRS qualifiés : personnes actives du Personnel qualifiées sur le type, avec toutes les licences exigées (ex. E+I pour un 4X-). Les autorisations de signer restent dans AMOS.": "Qualified CRS: active staff rated on the type with all required licences (e.g. E+I for a 4X-). Certification authorisations stay in AMOS.",
  "Compagnie aérienne": "Airline",
  "Version": "Variant",
  "MSN (n° de série)": "MSN (serial number)",
  "Moteurs": "Engines",
  "Référence AMOS": "AMOS reference",
  "Licences exigées pour signer cet avion": "Licences required to sign this aircraft",
  "EASA": "EASA",
  "Approbation israélienne (4X-)": "Israeli approval (4X-)",
  "FAA": "FAA",
  "Par défaut : E (EASA), et I en plus pour un 4X-. Le shift vérifie que les CRS affectés ont ces licences sur le type.": "Default: E (EASA), plus I for a 4X-. The shift checks that assigned CRS hold these licences on the type.",
  "aucun": "none",
  "Immatriculation invalide (ex. 4X-EKA, 9H-ABC, N123AB).": "Invalid registration (e.g. 4X-EKA, 9H-ABC, N123AB).",
  "Cet avion existe déjà.": "This aircraft already exists.",
  "Supprimer cet avion du référentiel ? Les shifts passés ne changent pas.": "Remove this aircraft from the list? Past shifts are not changed.",
  "Avion supprimé": "Aircraft deleted",
  "Plus servi": "No longer served",
  "Servi par la station": "Served by the station"
});
rule(/^(\S+) : aucun CRS avec ([EIF]) sur (.+)$/, "$1: no CRS with $2 on $3");
/* ---- Flightradar24 : heures remplies ---- */
Object.assign(EN, { "Aucun vol depuis 72 h (FR24 ne donne pas les vols prévus)": "No flight in the last 72 h (FR24 does not provide scheduled flights)" });
rule(/^Flightradar24 : (\d+) avions? sur (\d+) avec un vol récent(?:, heures connues pour (\d+))?\.(?: Ajouté\(s\) au shift, en vol vers la station : (.+)| Avions suivis vérifiés : (\d+), aucun en route vers la station ni posé\.)?$/, (m, a, b, c, d, e) => `Flightradar24: ${a} of ${b} aircraft with a recent flight${c ? `, times known for ${c}` : ""}.${d ? ` Added to the shift, flying to the station: ${d}` : ""}${e ? ` Tracked aircraft checked: ${e}, none inbound or on ground at the station.` : ""}`);
/* ---- roster : affichage ; FR24 : diagnostic ---- */
Object.assign(EN, {
  "Griser toute la colonne des week-ends": "Shade the whole weekend column", " et vendredis": " and Fridays", "Intensité du moucheté du vendredi": "Friday speckle intensity",
  "Diagnostic : ce que Flightradar24 répond pour une immatriculation": "Diagnostics: what Flightradar24 returns for a registration",
  "Interrogation de Flightradar24…": "Querying Flightradar24…", "résultat(s)": "result(s)", "Vendredi": "Friday", "erreur": "error", "champs": "fields", "Diagnostiquer": "Run diagnostics"
});
rule(/^Vols en cours : (.+)$/, (m, a) => "Live flights: " + tr(a)); rule(/^Vols récents : (.+)$/, (m, a) => "Recent flights: " + tr(a));
Object.assign(EN, { "Flightradar24 renvoie des données de démonstration : la clé enregistrée est une clé de test (sandbox). Créez une clé de production sur fr24api.flightradar24.com et remplacez-la dans Paramètres.": "Flightradar24 returns demo data: the saved key is a test (sandbox) key. Create a production key on fr24api.flightradar24.com and replace it in Settings." });

Object.assign(EN, {
  "Données de shift précédent": "Previous shift data", "Données de shift suivant": "Next shift data", "Escale": "Stay",
  "Date de départ (UTC)": "Departure date (UTC)", "L'avion apparaîtra sur": "The aircraft will appear on",
  "Heure invalide : format HH:MM (UTC).": "Invalid time: HH:MM format (UTC).", "Heures Flightradar24 (réelles, ou estimée en vol)": "Flightradar24 times (actual, or estimate while airborne)",
});
Object.assign(EN, { "Supprimer cet avion de ce shift ? Ses lignes vides des autres shifts sont aussi retirées ; celles où du travail est encodé restent.": "Remove this aircraft from this shift? Its empty rows on other shifts are removed too; rows with work entered stay." });
Object.assign(EN, {
  "Tech Log : défaut / tâche → action": "Tech Log: defect / task → action", "LogBook n° d'arrivée": "Arrival LogBook no.", "Tech Log : défauts / tâches et actions": "Tech Log: defects / tasks and actions",
  "Défaut / tâche": "Defect / task", "Action / travail fait": "Action taken", "Vide = à faire": "Empty = to do", "Techniciens et MHRS": "Technicians and MHRS", "technicien": "technician",
  "ou total": "or total", "Ligne": "Line", "Total MHRS": "Total MHRS", "À faire": "To do", "Tâches ouvertes des shifts précédents": "Open tasks from previous shifts", "Reprendre": "Take over",
  "Cet avion est déjà dans ce shift. Enregistrer quand même ? (cliquez encore sur Enregistrer)": "This aircraft is already on this shift. Save anyway? (click Save again)",
  "Tech Log : tâches pré-encodées (une par ligne)": "Tech Log: preset tasks (one per line)",
});
Object.assign(EN, { "Reprise par un shift suivant": "Taken over by a later shift" });
Object.assign(EN, {
  "Ajouté(s) au shift, en vol vers la station": "Added to the shift, flying to the station", "ETA prévue (UTC)": "Planned ETA (UTC)", "ETD prévue (UTC)": "Planned ETD (UTC)",
  "Rempli par Flightradar24, vos champs ne sont pas modifiés.": "Filled by Flightradar24; your fields are not changed.", "N° de vol / rotation (prévu)": "Flight no. / rotation (planned)",
  "Cet avion est déjà dans ce shift. Est-ce une erreur, ou un autre vol ?": "This aircraft is already on this shift. Is it a mistake, or another flight?", "C'est une erreur": "It's a mistake", "Autre vol : enregistrer": "Another flight: save",
});
Object.assign(EN, { "Non trouvé chez Flightradar24": "Not found at Flightradar24", "non trouvé": "not found", "vol ?": "flight ?" });
Object.assign(EN, { "Masquer les données des autres shifts": "Hide other shifts' data", "Afficher les données des autres shifts": "Show other shifts' data" });
rule(/^(\d+) autres? shifts?$/, (m, n) => `${n} other shift${n > 1 ? "s" : ""}`);
Object.assign(EN, {
  "Êtes-vous sûr de vouloir retirer cette ligne ?": "Are you sure you want to remove this line?", "Oui, retirer": "Yes, remove",
  "Êtes-vous sûr de vouloir supprimer l'avion": "Are you sure you want to delete aircraft", "de ce shift ?": "from this shift?",
  "Ses lignes vides des autres shifts sont aussi retirées ; celles où du travail est encodé restent.": "Its empty rows on other shifts are removed too; rows with work entered stay.",
  "Le Tech Log de ce shift sera perdu.": "This shift's Tech Log will be lost.", "Êtes-vous sûr de vouloir supprimer cette ligne ?": "Are you sure you want to delete this line?",
});
Object.assign(EN, { "Oui, supprimer": "Yes, delete" });
