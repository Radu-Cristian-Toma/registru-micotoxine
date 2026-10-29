# Versiunea 1.55.1 — corecții ale traducerii, demo-ului și ghidului

**Stare:** pilot, nevalidat și neacreditat. **DOI:** https://doi.org/10.5281/zenodo.23781945. Nicio modificare a regulii de decizie, a valorilor limitelor, a parolelor sau a politicii de parole.

## Traducerea în engleză
- **Sens:** „Așteaptă analizare” = „Awaiting analysis” (era „Awaiting review”); „Within uncertainty” în loc de „In uncertainty”.
- **Afirmații prea tari, în română și engleză:** semnătura validatorului este descrisă ca semnătură electronică simplă (nu „certifică legal”); tipărirea buletinului cere validarea de către **validator**, nu de către operator.
- **Terminologie unitară în engleză:** „customer” (nu client / owner / beneficiary), „test report” (nu „bulletin”), „compliant / non-compliant” pentru verdictul față de limită, „Mycotoxin Register”, „Fusarium”, ortografie britanică.
- **Texte din server tradise în interfață:** sursele limitelor (inclusiv versiunea consolidată a regulamentului) și matricea de validare VAL-01…15 apar în engleză când interfața este în engleză; pe buletin rămân bilingve.
- **Test automat** (`test/unit/i18n-en.test.js`): acoperire EN, fără diacritice românești în valorile EN, terminologie unitară, sursele limitelor traduse.
- **Mesajele de eroare ale serverului** (143 de texte din `routes/` și `middleware/`) se traduc în interfața EN prin `public/server-errors-en.js` (potrivire exactă sau pe șablon, pentru mesajele cu valori); textele necunoscute rămân neschimbate. Un test automat cere traducere pentru fiecare mesaj nou.
- **Neschimbat:** Parolele, limitele și regula de decizie nu s-au modificat. 188 de teste trecute; 45/45 verificări în browser.

## Alte corecții
- **Demo-ul animat** (`docs/prezentari/Demo_animat_v1.55.1.html`): document HTML complet, cu `<meta charset="utf-8">`; diacriticele și săgețile se afișează corect la deschiderea locală.
- **Prezentarea:** „110 pachete de execuție instalate, din care 7 dependențe directe” (nu „110 dependențe”); `scripts/license-check.js` folosește aceeași formulare.
- **Ghidul RO/EN** regenerat cu terminologia unitară din engleză („test report”).
- **Verificare:** 190 de teste trecute; 45/45 de verificări în browser, pe date inventate.
