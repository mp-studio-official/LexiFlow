Die leere Datei `.nojekyll` daneben schaltet Jekyll auf GitHub Pages ab.

Ohne sie lässt Pages jede Datei und jeden Ordner weg, deren Name mit einem
Unterstrich beginnt. Vite vergibt solche Namen nicht von sich aus, aber eine
Abhängigkeit kann es – und der Fehler sähe dann aus wie ein kaputter Build,
nicht wie eine weggelassene Datei.

`scripts/verify-deploy.mjs` prüft vor jedem Deployment, dass sie da ist.
