# Nog op te pakken

## Tests en workflow

- [ ] Voeg een snelle smoketest toe voor de belangrijkste gebruikersflow.
- [ ] Pas GitHub Actions aan: smoketest → volledige e2e-suite → deployment. Start deployment pas als beide checks voor dezelfde `main`-commit zijn geslaagd.
- [ ] Test in e2e dat afspeellijsten afzonderlijk behouden kunnen blijven, inclusief download en controle van database en media.
- [ ] Controleer in e2e dat ongeldige, dubbele of ontbrekende koppelingen en media op de verwachte manier worden geblokkeerd.
- [ ] Breid de gevulde mergeproef uit en controleer alle relevante tabellen en relaties in het downloadbestand.

## Bestanden en gebruik

- [ ] Bouw en controleer een kandidaatbestand op basis van de gekozen backups. Vraag vooraf om bevestiging van plaats- en afspeellijstkoppelingen en om keuze A of B voor gewijzigde notities.
- [ ] Test aanvullende databaseschema's en grote bestanden; bepaal en controleer duidelijke grenzen voor bestandsgrootte en geheugengebruik.
- [ ] Controleer belangrijke workflows handmatig in Safari en met een screenreader.
- [ ] Test herstel in JW Library pas na afzonderlijke toestemming en maak vooraf een verse backup van de actuele bibliotheek.
