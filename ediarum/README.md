# Humboldt's Hand in ediarum

Two Author-mode actions for oXygen XML Author with ediarum. Each opens the lookup in the browser for the text selected in
the TEI document.

| action | shortcut | opens |
|---|---|---|
| How Humboldt wrote it | Ctrl+Alt+H | the selected word, five years either side of the document's date |
| How Humboldt wrote these letters | Ctrl+Alt+L | the selected letters inside words, case kept, same years |

The date comes from the sent `correspAction` of a letter or the `creation` date of a journal (`@when`,
`@notBefore`/`@notAfter`, `@from`/`@to`). A document without a date opens without a year range.

## Files

- `humboldt-hand/humboldt-hand.exf`: a framework extension script. It takes `ediarum.BASE.edit` as base and adds the
  two actions to a toolbar row of their own and to the context menu. It also claims every TEI document, because the
  public EHD files carry no `telota:doctype`.
- `humboldt-hand/humboldt-hand_externalAuthorActions/`: the actions, one XML file each. Each is a short script run by
  oXygen's `JSOperation`.
  - The script reads the selection and the document's date, builds the link with `encodeURIComponent`, and hands it
    to the default browser.
  - The lookup's address is the first line of each script: `https://maelkolb.github.io/humboldt-hand-lookup/`.
- `humboldt-hand/icons/`: toolbar icons.

## Install and try (oXygen XML Author 28)

1. **Add the frameworks.** Put `ediarum.BASE.edit` (github.com/ediarum/ediarum.BASE.edit) and the folder
   `humboldt-hand` into oXygen's `frameworks` folder. An extra frameworks folder under Options > Preferences >
   Document Type Association > Locations works too.
2. **Compile the script once.** Open `humboldt-hand.exf` in oXygen, right-click in the editor and choose *Compile
   Framework Extension script*. This writes `humboldt-hand.framework` beside it. Then restart oXygen.
3. **Open an EHD document** (github.com/telota/edition-humboldt-digital) in Author mode. For example:
   - `data/letter/H0000003.xml` (a letter of 1848);
   - `data/travel-journal/H0016412.xml` (the journal of 1799–1800).
4. **Look up a word.** Select a word and press the *h* button on the toolbar (or Ctrl+Alt+H, or right-click). The
   browser shows Humboldt's instances of the word from the document's years.
5. **Look up letters.** Select a few letters, e.g. `st` or a capital `V`, and press the *st* button. You get the
   letters inside Humboldt's words, with the case kept.

## For a project framework (ediarum.AVHR.edit)
- **Easiest:** copy the two files in `humboldt-hand_externalAuthorActions/` into the project framework's
  `externalAuthorActions` folder. Then add the action IDs `humboldt.hand.word` and `humboldt.hand.letters` to the
  toolbar or menu in the framework configuration.
- **Alternatively:** set `base` in `humboldt-hand.exf` to the project framework's name and compile.
- **Moving the lookup:** if it moves (e.g. to a BBAW server), change the one URL at the start of each action file.

## Limits
- The lookup opens in the browser, not inside oXygen. A panel beside the document would need a Java plugin with an
  embedded browser.
- oXygen reads the action files at startup; restart it after changing them.
- Tested in oXygen XML Author 28.1 with ediarum.BASE.edit 3.0.0 on EHD letters and journals: toolbar buttons and
  context menu. The scripts were also run against a stand-in editor for umlauts, spaces, apostrophes and an empty
  selection.
