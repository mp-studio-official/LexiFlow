/*
  Der Zustandsschalter der Entwürfe.

  ## Was er tut

  Er blendet um zwischen den vier Zuständen, die jeder Bildschirm haben kann —
  normal, ladend, leer, fehlerhaft — plus offline, wo es etwas bedeutet. Jeder
  Zustand steht im HTML als eigener Block mit `data-zustand`; hier wird nur
  gezeigt und versteckt.

  ## Warum kein Baukasten

  Weil diese Dateien per Doppelklick aufgehen sollen. Ein klassisches Skript,
  keine Module, kein Netz — sonst zeigte `file://` eine leere Seite, und die
  Entwürfe wären genau dann nicht zu begutachten, wenn jemand sie begutachten
  will.
*/
(function () {
  'use strict';

  function zeige(zustand) {
    var bloecke = document.querySelectorAll('[data-zustand]');
    for (var i = 0; i < bloecke.length; i += 1) {
      var block = bloecke[i];
      var gilt = block.getAttribute('data-zustand').split(' ').indexOf(zustand) >= 0;
      block.classList.toggle('ist-sichtbar', gilt);
    }

    var knoepfe = document.querySelectorAll('[data-schaltet]');
    for (var k = 0; k < knoepfe.length; k += 1) {
      var knopf = knoepfe[k];
      knopf.setAttribute('aria-pressed', String(knopf.getAttribute('data-schaltet') === zustand));
    }

    var ansage = document.getElementById('zustandsansage');
    if (ansage) ansage.textContent = 'Zustand: ' + zustand;
  }

  document.addEventListener('click', function (ereignis) {
    var knopf = ereignis.target.closest ? ereignis.target.closest('[data-schaltet]') : null;
    if (!knopf) return;
    zeige(knopf.getAttribute('data-schaltet'));
  });

  document.addEventListener('DOMContentLoaded', function () {
    var erster = document.querySelector('[data-schaltet]');
    zeige(erster ? erster.getAttribute('data-schaltet') : 'normal');
  });
})();
