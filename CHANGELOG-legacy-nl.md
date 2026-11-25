# CAD Vue 3 — 1.17

Linux, Node.js >=22.12. Stop de dienst en maak een consistente databaseback-up. Behoud data/ bij het vervangen van bestanden.

```sh
npm install
npm run build
npm start
```

LAN: http://192.168.1.51:3000. Bij systemd: sudo systemctl restart cad.

Opslaan verwerkt melding en optionele logtekst atomair. Nieuwe meldingen krijgen een aanmaaklog. Wijzigingen krijgen een auditlog met oude en nieuwe waarden; handmatige tekst wordt afzonderlijk opgeslagen. Geen wijziging en geen tekst betekent geen nieuwe log. Statusacties worden eveneens gelogd. Logregels blijven onveranderlijk. Versie 1.9 voegt MasterID toe aan Logregel. PATCH vereist Basis (oorspronkelijke formulierwaarden), zodat conflicterende wijzigingen worden geweigerd. De oude afzonderlijke POST-logroute is verwijderd. Alleen voor vertrouwde test-LANs; geen authenticatie of HTTPS.

## Versie 1.6
Status wijzigen via Melding bewerken en Opslaan. Gekoppelde meldingen blijven gesloten. Het logtekstveld is leeg en over de volledige breedte. Geen aparte statusknoppen in het overzicht.

## Versie 1.7
Handmatige logtekst wordt vóór automatische logging opgeslagen, ook bij aanmaken of sluiten. Logboek toont nieuwste LogID eerst. Gesloten meldingen zijn alleen-lezen, ook via de API; heropenen is niet mogelijk. Geen nieuwe databasevelden.

## Versie 1.8
Koppel melding opent een apart venster. Sla niet-opgeslagen wijzigingen eerst op. POST /api/meldingen/:id/koppel met MasterID koppelt en sluit atomair, met een auditlog op de gekoppelde melding. De hoofdmelding blijft ongewijzigd. Geen migratie nodig.

## Versie 1.9
Nieuwe meldingen zijn altijd Open; Opslaan vereist adres en plaats. Niet gekozen classificatie en prioriteit krijgen Dienstverlening en 2. Logregel.MasterID wordt automatisch toegevoegd en gevuld voor bestaande gekoppelde meldingen. Koppelen vult MasterID van alle eigen logregels, inclusief de koppellog, atomair. Alleen deze metadata mag eenmaal worden aangepast; tekst en tijd blijven onveranderlijk. Logboeken tonen eigen en gekoppelde logregels, met bron-ID.

## Versie 1.10 (basis 1.9)
- Enter in logtekst slaat op indien Opslaan beschikbaar is; Shift+Enter voegt een regel toe.
- Editor: links 2/3 adres/contact, rechts 1/3 prioriteit/classificatie/status. Op smalle schermen onder elkaar.
- Geen wijziging backend of database.

## Versie 1.11
- Verticale scheidingslijn tussen de editorkolommen; horizontaal op smalle schermen.
- Links staan labels en invoervelden naast elkaar.
- Bij wijzigen, sluiten en koppelen blijven het actieve overzichtsfilter en de zoektekst behouden. Een gesloten melding verdwijnt uit het Open-overzicht, maar blijft geselecteerd in de editor.
- Backend en database ongewijzigd.

## Versie 1.12 – inloggen
Bij een lege Gebruiker-tabel wordt Superuser met wachtwoord 4321 aangemaakt. Wachtwoord is een scrypt-hash met willekeurige salt. Gebruiker-ID en toegangsniveau worden niet naar de browser gestuurd. Alle meldingen-API's vereisen een sessie (8 uur). Rollen zijn opgeslagen maar hebben nog geen verschillende rechten. Er is nog geen gebruikersbeheer of wachtwoordwijzigingsscherm. Gebruik de standaardinlog uitsluitend in een vertrouwde testomgeving. HTTP versleutelt wachtwoorden niet onderweg; gebruik HTTPS voor productie en stel CAD_SECURE_COOKIE=1 in achter een HTTPS-proxy. Maak vóór de update een databaseback-up; behoud data/.

## 1.13 Gebruikersmanagement
Via de bovenste knop voor Superuser en Admin. ID wordt uitsluitend door SQLite bepaald; gebruikersnamen zijn uniek (SQLite NOCASE). Nieuwe wachtwoorden minimaal acht tekens; leeg bij bewerken behoudt het wachtwoord. Admin kan geen Superuser wijzigen of aanmaken. Niemand kan zichzelf verwijderen of de eigen rol wijzigen. Verwijderen beëindigt de sessies van die gebruiker. Geen databasemigratie nodig vanaf 1.12.

## Versie 1.14
- Gebruikersbeheer: labels naast invoer, aangepaste volgorde; niveau 0 kan niet worden verwijderd of verlaagd.
- Niveau 0–2 kan een gesloten zelfstandige melding heropenen via Status en Opslaan. Gekoppelde meldingen blijven gesloten.
- Classificatiemanagement voor niveau 0–1. Classificaties worden uit SQLite geladen. Omschrijving is nullable en verborgen. Hernoemen werkt bestaande meldingen bij (ook gesloten meldingen), met auditlog; verwijderen van een gebruikte classificatie of de laatste classificatie is geblokkeerd.
- Migratie verwijdert de oude vaste classificatie-CHECK, behoudt ID's en logverwijzingen. Maak vooraf een backup van data/ terwijl de service gestopt is.

## Versie 1.15
Gebruikersregistratie bij meldingen en logregels; historische namen blijven behouden. Oude records hebben onbekende auteur. Niveau 2/3 ziet alleen eigen account en kan uitsluitend wachtwoord wijzigen (minimaal 8 tekens). Automatische migratie; maak eerst een back-up.

## Versie 1.16
OpschalingMono en OpschalingMulti worden automatisch toegevoegd aan Melding, standaard leeg. Beide velden zijn pas na de eerste opslag bewerkbaar bij open meldingen. Wijzigingen worden gevalideerd en automatisch gelogd met gebruiker. Wachtwoordhint staat naast het invoerveld.

## Versie 1.17
Meldingenoverzicht: Prioriteit, Opschaling mono, Opschaling multi, Classificatie, Locatie (adres en plaats), Tijdstempel (datum en tijd). Geen databasemigratie; filters en rijselectie behouden. Zoeken omvat ook opschaling.

## 1.18 — Eenhedenmanagement
Alle gebruikers kunnen eenheden bekijken en statussen wijzigen; alleen niveau 0/1 kunnen eenheden toevoegen, verwijderen en overige velden wijzigen. Status 0 is standaard, uitsluitend 0,1,2,4,5 zijn kiesbaar. De nieuwe tabellen Eenheid, EenheidStatus en EenhedenLog worden automatisch gemaakt. Auditlog is niet via de UI/API beschikbaar en bewaart UTC-tijdstempel, gebruiker en oude/nieuwe waarden, ook na verwijdering. Behoud data/ bij installatie.

### 1.19
Eenheid.GekoppeldeMelding wordt automatisch toegevoegd. Koppel beschikbare, nog niet gekoppelde eenheden (status 4/5) aan een open melding. Status blijft ongewijzigd. Een expliciete statusopslag 4/5 ontkoppelt de eenheid. Koppelingen worden gelogd in EenhedenLog.


## Versie 1.20
- Een logregel per gekoppelde eenheid in het meldinglogboek, met gebruiker en tijd. Alle koppelingen en logs worden in dezelfde transactie opgeslagen.
- Beschikbare eenheden tonen de omschrijving tussen haakjes achter de tactische naam, indien ingevuld.
- Geen databasemigratie nodig.

## 1.21
Eenheden koppelen via twee klikbare kolommen. Opslaan verwerkt toevoegingen en verwijderingen atomair, met auditlog per wijziging en controle op gelijktijdige wijzigingen. Geen databasemigratie.

## 1.22
Gekoppelde eenheden tonen tactische naam, omschrijving, locatie en statusnaam. Beheer-dropdown met opties volgens bestaande rechten; Meldkamer-knop voor terugkeer. Geen databasemigratie.

### 1.23 Pagerinstellingen en alarmeren
`data/pager-config.json` wordt automatisch aangemaakt met lege instellingen (bestandstoegang 0600). Alleen niveau 0/1 kan instellingen lezen/wijzigen; het opgeslagen wachtwoord wordt niet teruggestuurd. Leeg wachtwoord behoudt het bestaande wachtwoord. Gebruik HTTPS voor beheer buiten een vertrouwd LAN. Het alarmeringsformulier is voorbereid, maar verzending is niet geïmplementeerd omdat het protocol/API van de pagerserver onbekend is. De server retourneert 501 en verzendt niets. Geen databasemigratie.

### 1.24 – Pager HTTP
POST naar URI:Poort/calls, HTTP Basic, JSON met text, callSignNames (array van Pager-waarden), transmitterGroupNames (array met één TXGroep) en emergency:false. URI is de basis-URL met http:// of https://. Gebruik bij voorkeur HTTPS. Alleen opgeslagen koppelingen van open meldingen zijn toegestaan. Een ontbrekende Pager blokkeert verzending. Geen automatische retry. HTTP 2xx betekent acceptatie door de server, geen bewijs van ontvangst door pagers. data/pager-http.log bevat UTC-tijdstempel, request-ID, gebruiker, melding, methode, URL, headers (auth geheim afgeschermd), volledige JSON en response-status of transportfout. Logbestand bevat mogelijk gevoelige meldtekst: bescherm toegang en beheer bewaartermijn. Geen migratie nodig.

### 1.25
Alarmeren is een afzonderlijk venster. Opslaan en alarmeren slaat eerst de koppelingen op (ook zonder wijzigingen) en opent daarna het alarmvenster met alle gekoppelde eenheden aangevinkt. Sluiten verzendt niets. Geen databasemigratie.

## Versie 1.26
Eenhedenbeheer reset na succesvolle opslag. Nieuw is alleen actief bij selectie of ingevulde/afwijkende waarden (status 0 is standaard). Ontbrekende pagercode bij een geselecteerde eenheid blokkeert de volledige pagerverzending en toont een melding met de betrokken eenheden. Geen databasemigratie.

## 1.27
Alarmeren slaat lege pagerwaarden over; geen request als alle codes ontbreken. Na succesvolle verzending sluit het venster. Meldingenoverzicht toont prioriteit met classificatie en gekoppelde eenheden met status. Geen databasemigratie.

## 1.28
Alarmeren vult automatisch prioriteit, classificatie, adres, plaats, eventuele opschalingen en aangevinkte tactische namen in. Bij wijzigen selectie wordt de standaardtekst vernieuwd zolang deze niet handmatig is aangepast. Geen databasemigratie.

### Versie 1.29
- Tijdelijke netwerkfout bij laden meldingen wordt eenmaal opnieuw geprobeerd; verbindingsfout wist na succesvolle synchronisatie.
- Ontkoppelen zet status 1, 2 en 4 op 4; status 5 en 0 blijven behouden. Statuswijzigingen worden in beide logs geregistreerd. Geen databasemigratie.

## 1.30
Klik op melding scrollt naar boven. Gekoppelde eenheden zijn aanklikbaar voor statuswijziging bij open meldingen (alle rollen). Statuswijziging en eventuele ontkoppeling bij 4/5 worden atomair gelogd. Geen migratie.

## 1.31
Beheer > Polygonen importeren (niveau 0/1). Selecteer een SQLite-bestand met tabel Polygoon; vervangt uitsluitend die tabelinhoud atomair. Maximaal 32 MB. IDs blijven behouden.

## 1.32
Polygonen importeren blijft uitsluitend toegankelijk voor niveau 0/1 (menu en API). Na succesvolle import keert de gebruiker automatisch terug naar de Meldkamer; bij fouten blijft het importscherm open. Geen databasemigratie.

## 1.33 PDOK
Bij aanmaken van een melding wordt een uniek passend adres opgezocht (timeout 4 seconden). RD_X, RD_Y, Latitude en Longitude worden opgeslagen, of NULL bij een fout; de melding wordt altijd opgeslagen bij een PDOK-fout. Adreswijzigingen wissen oude coördinaten; geen herlookup bij bestaande meldingen. Server heeft internettoegang nodig.

## 1.34 PDOK
Zoekterm tussen dubbele aanhalingstekens; alleen centroide_ll wordt opgevraagd voor coördinaten. Longitude en Latitude worden direct opgeslagen. Bestaande RD-kolommen blijven behouden voor compatibiliteit, maar nieuwe meldingen vullen deze niet.

### 1.35
GPS-coördinaten blijven opgeslagen in Melding.Latitude en Longitude. Polygonen worden server-side bepaald op basis van de huidige import (GeoJSON longitude/latitude), inclusief grenzen en meerdere treffers. Tijdelijke alleen-lezen weergave in Melding bewerken. Geen nieuwe databasevelden. Bij adreswijziging blijven de bestaande regels voor het wissen van oude coördinaten gelden.

## 1.36
Locatiegegevens tonen P1 (eerste passende polygoon in ID-volgorde) en P2 (andere polygoon met kleinste afstand tot de grens, lokale metrische benadering). Zonder P1 blijft P2 leeg. Bij gelijke afstand geldt de ID-volgorde. Dynamisch berekend, geen migratie.

### 1.37
P3 is de volgende dichtstbijzijnde andere polygoon volgens dezelfde grensafstand als P2. In de tijdelijke locatiegegevens verschijnt P3. In Eenheden koppelen wordt links maximaal één eenheid per P1/P2/P3 vooraan geplaatst (Locatie komt overeen met de polygoonnaam, hoofdletterongevoelig; bij meerdere kandidaten tactische naam alfabetisch). De overige eenheden staan alfabetisch. Geen wijziging van database of beschikbaarheidsregels.

### 1.39 (basis 1.37)
Beschikbare eenheden: maximaal één beschikbare TS/TST per P1, P2, P3 vooraan; overige TS/TST alfabetisch, daarna overige eenheden alfabetisch. Geen databasemigratie. Bij meerdere kandidaten per polygoon blijft de alfabetisch eerste voorrang krijgen.

### 1.40
Eenheden koppelen haalt P1/P2/P3 rechtstreeks op via de server. TS/TST herkenning via tactische naam of omschrijving (Tankautospuit, TS, TST). Versienummer in globale voetregel. HTML wordt opnieuw gevalideerd; bouw de frontend opnieuw en herstart de server.

### 1.41
Filters voor beschikbare eenheden en Eenhedenmanagement. Tijdelijke locatiegegevens en P-labels verborgen; polygonensortering behouden. Knop Koppel eenheid.

## Versie 1.42
- Na succesvol opslaan van een gesloten melding wordt het formulier gereset via dezelfde routine als Nieuw; filter en zoektekst blijven behouden.
- Beheer: Gebruikers, Classificaties, Eenheden.

### 1.43
- Databasebrowser voor niveau 0 en 1, alleen-lezen, alle tabellen, 100 records per pagina. Wachtwoord en sessietoken worden gemaskeerd.

### 1.44
- Persoonlijk kleurpalet Licht/Donker via zon-/maanicoon in de kop. Automatische SQLite-migratie; bestaande gebruikers behouden Donker. Alleen de ingelogde gebruiker kan zijn eigen voorkeur wijzigen.

### 1.45
- Bij handmatig wijzigen van Status, Opschaling mono of Opschaling multi krijgt Nieuwe logregel direct focus, indien beschikbaar. De cursor staat achter bestaande tekst.

### 1.46
PDOK eerste resultaat zonder huisnummer; persoonlijke audio-instelling (standaard aan) met ping bij nieuwe melding via bestaande synchronisatie. Browserinteractie vereist voor audio.

### 1.47
- Sluiten van een melding ontkoppelt alle eenheden zonder statuswijziging.
- Status 1/2 naar 4/5 ontkoppelt automatisch, met logregistratie vanuit beide schermen.

### 1.48
- Configureerbare opschalingsniveaus Mono en Multi, beheer voor niveau 0/1.
- Automatische migratie verwijdert vaste CHECK-lijsten uit Melding en bewaart bestaande waarden en verwijzingen. Lege optietabellen blijven leeg na herstart.
- Hernoemen/verwijderen van opties verandert historische meldingen niet. Maak een back-up van data/cad.sqlite vóór de update (server gestopt).

### 1.49
Locatiepicker (Leaflet/OpenStreetMap, PDOK zoeken en adresbepaling), centrale standaardkaart via Kaartinstelling voor niveau 0/1. Internettoegang voor kaarttegels (browser) en PDOK (server) vereist. Een klik bewaart de gekozen coördinaten en het dichtstbijzijnde gevonden adres; controleer dit adres voor inzet. Annuleren wijzigt de melding niet.

## 1.50
Kies locatie: standaardkaart links. Logboek eenheden: onveranderlijke rij per statusovergang, UTC-tijdstempel in alleen de nieuwe statuskolom, momentopname van de melding vóór ontkoppeling. Zichtbaar via Database zonder LogID. Geen historische reconstructie.

## 1.51
Configureerbare eenheidstatussen via Beheer > Status. Statusnummer bepaalt operationele regels; unieke interne ID blijft behouden. Dynamische logkolommen worden toegevoegd zonder historische kolommen te wissen.

### 1.52
Database leegmaken via Beheer (niveau 0/1), met expliciete bevestiging en transacties. Alle SQLite-logboeken worden gewist. Externe pagerbestanden blijven behouden. SQLite-tellers blijven behouden om ID-hergebruik te voorkomen. Beheermenu alfabetisch.

### 1.53
- Licht kleurpalet: zachte blauwgrijze achtergronden, gedempte accenten en contrastrijke tekst. Donker ongewijzigd.

### 1.54
- Locatiepicker: landkeuze NL/BE/DE, PDOK voor NL, Nominatim voor internationaal zoeken en reverse geocoding. Publieke dienst: expliciete zoekacties, maximaal één aanvraag per seconde, tijdelijke cache; voor operationeel gebruik configureer een eigen dienst via CAD_GEOCODER_URL (basis-URL met slash) en CAD_GEOCODER_AGENT. Kaartgegevens © OpenStreetMap contributors.
- Prioriteiten: beheer 0/1; historische waarden blijven behouden, nieuwe meldingen gebruiken de hoogste bestaande numerieke prioriteit indien niets gekozen is.
- Dagelijkse CSV-audit in log/ (Amsterdam-datum, UTC-timestamp); muterende API-aanvragen en expliciete kaart/database/detailacties, HTTP-resultaat en aanvraagdetails zonder wachtwoorden/tokens. Niet bedoeld als registratie van muisklikken of periodieke polling. Bescherm log/ wegens persoonsgegevens, neem op in back-up; CSV blijft behouden bij database-reset. Schrijffouten worden op stderr gemeld.
- Reset Meldingen en Gebruikers behouden: behoud eenheden en statustabel, ontkoppel en zet op statusnummer 5 (maak zo nodig aan); de laatste optie behoudt dus meer dan alleen gebruikers.

### 1.55
Nieuwe meldingen en de locatiepicker delen de centrale adreszoekdienst. Nieuwe handmatige adressen zoeken in NL, BE en DE via dezelfde internationale zoekfunctie; kaartcoördinaten blijven leidend. Bij geen passend resultaat wordt de melding met een waarschuwingslogregel opgeslagen. Geen migratie nodig.

### 1.56
- Dagelijks geocoding-TXT-log in log/, inclusief zoekresultaten en kaartselecties.
- Systeeminstelling Organisatie (niveau 0/1), zichtbaar in de hoofdheader.

### 1.57
- Geocoding gebruikt altijd het eerste zoekresultaat.
- Beheermenu: DAPNET; gebruikersselectie scrollt omhoog; kleurpalet en audio niet in gebruikerslijst.

### Versie 1.58
Kaart bij melding bewerken zoekt automatisch StraatHuisnummer en Plaats via de centrale adreszoekdienst (NL/BE/DE), centreert op het eerste resultaat (zoom 17) en markeert de locatie. Bij geen resultaat blijft de standaardkaart zichtbaar. Locatie gebruiken neemt adres, plaats, postcode en coördinaten over in het formulier; Opslaan bewaart de melding. Annuleren verandert niets.
