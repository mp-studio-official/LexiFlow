import { useParams } from 'react-router-dom';
import { PrintablePackView } from '../ui/PrintablePackView';

/**
 * Die Vokabelliste – dieselbe Ansicht in beiden Bereichen.
 *
 * Der Unterschied ist genau ein Weg zurück: Im Lehrkraftbereich zur
 * Paketseite, im Lernbereich zur Paketübersicht. Zwei Komponenten dafür zu
 * bauen hieße, dieselbe Tabelle zweimal zu pflegen – und irgendwann sähen die
 * beiden Ausdrucke verschieden aus.
 */
export default function PackListPage({ area }: { area: 'teacher' | 'student' }) {
  const { packId = '' } = useParams();

  return area === 'teacher' ? (
    <PrintablePackView backTo={`/material/${packId}`} backLabel="Zurück zum Paket" />
  ) : (
    <PrintablePackView backTo={`/lernen/${packId}`} backLabel="Zurück zum Paket" />
  );
}
