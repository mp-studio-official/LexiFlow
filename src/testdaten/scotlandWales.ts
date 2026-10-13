/**
 * Der verbindliche Abnahmetext für die Textwerkstatt.
 *
 * Er steht als Datei und nicht als Zeichenkette in einem Test, weil mehrere
 * Prüfungen **denselben** Text brauchen: die Erkennung, die Analyse, die
 * Oberfläche und die Browserabnahme. Drei Kopien davon wären drei Texte,
 * die irgendwann auseinanderlaufen — und dann prüfte jede Stelle etwas
 * anderes als die, auf die sie sich beruft.
 *
 * Wortlaut unverändert. Wer ihn ändert, ändert die Abnahme.
 */
export const SCOTLAND_WALES = `Scotland is in the North of Britain. Just over five million people live there. It's been part of the UK since 1707. Edinburgh is the capital city and home to the Scottish Parliament. The Parliament building is a work of art in itself!

Scotland has some unique customs: wearing tartan kilts, playing the bagpipes, and tossing the caber – a very large post. For over sixty years, The Edinburgh Festival has celebrated art, theatre, and culture.

Wales is on the western edge of Britain. It also used to be a separate country but has been part of the UK for over four hundred years. Nearly three million people live in Wales.

One of its symbols is a red dragon, found on the national flag. The Welsh Assembly is in the capital city, Cardiff. The Welsh are proud of their language, and twenty per cent of the people speak Cymraeg. Most signs are in English and Welsh. Singing is an important tradition in Wales. People working in coal mines in Wales originally formed male-only choirs. They are still popular today.`;
