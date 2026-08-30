/**
 * Englische Funktions- und Stoppwörter.
 *
 * Sie werden bei der Textanalyse standardmäßig ausgeblendet – als Vokabel
 * taugen sie selten, und sie würden jede Kandidatenliste dominieren. Die Liste
 * ist bewusst überschaubar und nachvollziehbar statt statistisch optimiert.
 */
export const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  // Artikel, Pronomen, Possessivbegleiter
  'a', 'an', 'the',
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their',
  'mine', 'yours', 'hers', 'ours', 'theirs',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves', 'themselves',
  'this', 'that', 'these', 'those',
  'who', 'whom', 'whose', 'which', 'what',
  // Hilfs- und Modalverben
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'done', 'doing',
  'have', 'has', 'had', 'having',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't",
  "won't", "wouldn't", "can't", "couldn't", "shouldn't", "haven't", "hasn't", "hadn't",
  "i'm", "you're", "he's", "she's", "it's", "we're", "they're",
  "i've", "you've", "we've", "they've", "i'll", "you'll", "we'll", "they'll",
  // Präpositionen und Konjunktionen
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around',
  'as', 'at', 'before', 'behind', 'below', 'beside', 'between', 'beyond',
  'but', 'by', 'down', 'during', 'except', 'for', 'from', 'in', 'inside',
  'into', 'like', 'near', 'of', 'off', 'on', 'onto', 'out', 'outside', 'over',
  'since', 'through', 'to', 'towards', 'toward', 'under', 'until', 'up', 'upon',
  'with', 'within', 'without',
  'and', 'or', 'nor', 'so', 'yet', 'because', 'if', 'than', 'then', 'though',
  'unless', 'when', 'where', 'while', 'whether',
  // Adverbien und Füllwörter
  'again', 'all', 'also', 'always', 'any', 'both', 'each', 'either', 'enough',
  'even', 'ever', 'every', 'few', 'here', 'how', 'just', 'many', 'more', 'most',
  'much', 'never', 'no', 'not', 'now', 'often', 'once', 'only', 'other', 'others',
  'own', 'quite', 'rather', 'really', 'same', 'some', 'such', 'still', 'there',
  'therefore', 'too', 'very', 'well', 'why', 'yes',
  // Zahlwörter und häufige Zeitangaben
  'one', 'two', 'three', 'first', 'second', 'next', 'last',
  'day', 'today', 'tomorrow', 'yesterday',
  // Sonstiges Hochfrequentes
  'get', 'got', 'go', 'goes', 'going', 'let', 'lets', 'make', 'made', 'say',
  'said', 'says', 'see', 'saw', 'take', 'took', 'thing', 'things', 'want',
  'way', 'ways',
]);
