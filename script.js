(() => {
  "use strict";

  /* =======================
     STATO APPLICATIVO
  ======================== */
  const state = {
  activeWits: new Set(),
  noteCounter: 0,
  translationActive: false,
  facsimileActive: false,
  translationMap: {},
  facsimileMap: {},
  noteMap: {}
};

  
  const DOM = {};

  /* =======================
     AVVIO
  ======================== */
  document.addEventListener("DOMContentLoaded", () => {
    cacheDOM();

    fetch("edizione.xml")
      .then(r => {
        if (!r.ok) throw new Error("Errore nel caricamento del file XML");
        return r.text();
      })
      .then(xmlString => {
        const xml = new DOMParser().parseFromString(xmlString, "text/xml");
        initApp(xml);
      })
      .catch(err => {
        console.error(err);
        if (DOM.text) {
          DOM.text.innerHTML = `Errore critico: ${err.message}`;
        }
      });
  });

  /* =======================
     CACHE DOM
  ======================== */
  function cacheDOM() {
    DOM.text = document.getElementById("text");
    DOM.translation = document.getElementById("translation");
    DOM.substApp = document.getElementById("apparatus-substantive");
    DOM.orthoApp = document.getElementById("apparatus-orthographic");
    DOM.notes = document.getElementById("notes");
    DOM.cbContainer = document.getElementById("witness-checkboxes");
    DOM.apparatusAside = document.getElementById("apparatus-aside");
    DOM.facsimile = document.getElementById("facsimile");
  }

  /* =======================
     INIT APP
  ======================== */
function initApp(xml) {
  initHeader(xml);
  initWitnesses(xml);
  initFrontMatter(xml);
  initWitnessPanel(xml);
  initDataMaps(xml);

  /* === PATCH: popolamento selettore facsimile === */
const facsimileSelector = document.getElementById("facsimile-selector");
if (facsimileSelector) {
  facsimileSelector.innerHTML = "";
  Object.keys(state.facsimileMap).forEach(wit => {
    const opt = document.createElement("option");
    opt.value = wit;
    opt.textContent = `Testimone ${wit}`;
    facsimileSelector.appendChild(opt);
  });
}
/* === FINE PATCH === */

  // Nasconde il pulsante Traduzione se il TEI non contiene <div type="translation">
  const hasTranslation = xml.querySelector('div[type="translation"]');
  if (!hasTranslation) {
    const translationButton = document.getElementById('toggle-translation');
    if (translationButton) {
      translationButton.style.display = 'none';
    }
  }

  initTextAndApparatus(xml);
  setupUIEvents();
  setupScrollSync();
}

  /* =======================
     HEADER
  ======================== */
  function initHeader(xml) {
    const title =
      xml.querySelector("titleStmt > title")?.textContent.trim() || "";
    const author =
      xml.querySelector("titleStmt > author")?.textContent.trim() || "";

    const headerTitle = document.querySelector(".edition-title");
    if (headerTitle && title) {
      headerTitle.innerHTML = author
        ? `${author}, <i>${title}</i>`
        : `<i>${title}</i>`;
    }
  }

  /* =======================
     TESTIMONI
  ======================== */
  function initWitnesses(xml) {
    if (!DOM.cbContainer) return;

    const witnessNodes = Array.from(xml.getElementsByTagName("witness"));
    witnessNodes.forEach(w => {
      const id = w.getAttribute("xml:id");
      state.activeWits.add(id);

      const label = document.createElement("label");
      label.className = "filter-option";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.dataset.witId = id;

      cb.addEventListener("change", e => {
        e.target.checked
          ? state.activeWits.add(id)
          : state.activeWits.delete(id);
        updateApparatusVisibility();
      });

      label.appendChild(cb);
      label.append(` ${id}`);
      DOM.cbContainer.appendChild(label);
    });
  }

  /* =======================
     FRONT MATTER
  ======================== */
  function initFrontMatter(xml) {
    const panelMapping = {
      introduction: "panel-intro",
      preface: "panel-intro",
      criteria: "panel-text-note",
      editorialNote: "panel-text-note"
    };

    Array.from(xml.getElementsByTagName("div")).forEach(div => {
      const type = div.getAttribute("type");
      const panelId = panelMapping[type];
      if (!panelId) return;

      const panel = document.getElementById(panelId);
      const p = panel?.querySelector("p");
      if (p) p.innerHTML = div.querySelector("p")?.innerHTML || "";
    });
  }

  function initWitnessPanel(xml) {
  const listWit = xml.querySelector("listWit");
  if (!listWit) return;

  const container = document.getElementById("witness-content");
  if (!container) return;

  container.innerHTML = "";

  listWit.querySelectorAll("witness").forEach(w => {
    const id = w.getAttribute("xml:id");
    const text = w.textContent.trim();

    const p = document.createElement("p");
    p.innerHTML = `<strong>${id}</strong>: ${text}`;

    container.appendChild(p);
  });
}

  /* =======================
     MAPPE DATI
  ======================== */
  function initDataMaps(xml) {
    xml.querySelectorAll("note").forEach(n => {
      const target = n.getAttribute("target")?.replace("#", "");
      if (target) state.noteMap[target] = n.innerHTML;
    });

    xml.querySelectorAll('div[type="translation"] l').forEach(l => {
      state.translationMap[l.getAttribute("n")] = l.innerHTML.trim();
      /* === PATCH FACSIMILE: carta singola, immagine diretta === */
xml.querySelectorAll("facsimile surface").forEach(s => {
  const wit = s.getAttribute("corresp")?.replace("#", "");
  const n = s.getAttribute("n");
  const graphic = s.querySelector("graphic");

  if (!wit || !graphic) return;

  if (!state.facsimileMap[wit]) {
    state.facsimileMap[wit] = [];
  }

  state.facsimileMap[wit].push({
    n: n,
    url: graphic.getAttribute("url")
  });
});
/* === FINE PATCH FACSIMILE === */
    });
    /* === PATCH FACSIMILE: carta singola, immagine diretta === */
xml.querySelectorAll("facsimile surface").forEach(s => {
  const wit = s.getAttribute("corresp")?.replace("#", "");
  const n = s.getAttribute("n");
  const graphic = s.querySelector("graphic");

  if (!wit || !graphic) return;

  if (!state.facsimileMap[wit]) {
    state.facsimileMap[wit] = [];
  }

  state.facsimileMap[wit].push({
    n: n,
    url: graphic.getAttribute("url")
  });
});
/* === FINE PATCH FACSIMILE === */
    }

  /* =======================
     TESTO + APPARATO
  ======================== */
  function initTextAndApparatus(xml) {
    const lines = xml.querySelectorAll('div[type="edition"] l');
    lines.forEach(line => buildLine(line));
    updateApparatusVisibility();
  }

  function buildLine(line) {
    const ln = line.getAttribute("n");
    const div = document.createElement("div");
    div.className = "line-group";
    div.innerHTML = `<span class="line-num">${ln}</span>`;

    Array.from(line.childNodes).forEach(node => {
      if (node.nodeType === 3) {
        div.append(node.textContent);
      } else if (node.nodeName === "app") {
        handleAppNode(node, div, ln);
      } else if (node.nodeName === "seg") {
        handleSegNode(node, div);
      }
    });

    DOM.text.appendChild(div);

    if (state.translationMap[ln] && DOM.translation) {
      const trDiv = document.createElement("div");
      trDiv.className = "line-group";
      trDiv.innerHTML = `<span class="line-num">${ln}</span>${state.translationMap[ln]}`;
      DOM.translation.appendChild(trDiv);
    }
  }

  function handleAppNode(node, container, ln) {
    const id = node.getAttribute("xml:id");
    const lem = node.querySelector("lem");
    const rdgs = node.querySelectorAll("rdg");

    const isOrtho = Array.from(rdgs).some(
      r => r.getAttribute("type") === "orthographic"
    );

    const span = document.createElement("span");
    span.className = `lem ${
      lem.getAttribute("type") === "conjecture" ? "conjecture" : ""
    }`;
    span.dataset.ref = id;
    span.textContent = lem.textContent.trim();
    container.appendChild(span);

    createApparatusEntry(id, ln, lem, rdgs, isOrtho);
    attachNoteIfPresent(id, span);
  }

  function handleSegNode(node, container) {
    const id = node.getAttribute("xml:id");
    const span = document.createElement("span");
    span.className = "comment-term";
    span.textContent = node.textContent;
    if (id) span.dataset.ref = id;
    container.appendChild(span);
    attachNoteIfPresent(id, span);
  }

  /* =======================
     APPARATO
  ======================== */
  function createApparatusEntry(id, ln, lem, rdgs, isOrtho) {
    const entry = document.createElement("div");
    entry.className = "apparatus-entry";
    entry.dataset.ref = id;

   const isConjecture = lem.getAttribute("type") === "conjecture";

const lemmaText = isConjecture
  ? `&lt;${lem.textContent}&gt;`
  : lem.textContent;

entry.innerHTML = `
  <span class="app-line-ref">${ln}</span>
  <span class="app-lemma">${lemmaText}</span>]
`;

    Array.from(rdgs).forEach((r, i) => {
      const span = document.createElement("span");
      span.className = "rdg-item";
      span.dataset.ref = id;

      const wits = (r.getAttribute("wit") || "")
        .replace(/#/g, "")
        .split(/\s+/)
        .filter(Boolean);

      span.dataset.allWits = wits.join(",");
      span.dataset.baseText = r.textContent || "<i>om</i>. ";
      span.innerHTML = `${span.dataset.baseText}<em>${wits.join(", ")}</em>`;

      entry.appendChild(span);

      // ✅ separatore corretto tra rdg distinti (anche ortografici)
      if (i < rdgs.length - 1) {
        entry.appendChild(document.createTextNode("; "));
      }
    });

    (isOrtho ? DOM.orthoApp : DOM.substApp)?.appendChild(entry);
  }

  function updateApparatusVisibility() {
    document.querySelectorAll(".apparatus-entry").forEach(entry => {
      let visible = false;

      entry.querySelectorAll(".rdg-item").forEach(rdg => {
        const allWits = rdg.dataset.allWits.split(",");
        const activeWits = allWits.filter(w => state.activeWits.has(w));

        if (activeWits.length === 0) {
          rdg.style.display = "none";
          return;
        }

        rdg.innerHTML = `${rdg.dataset.baseText}<em>${activeWits.join(", ")}</em>`;
        rdg.style.display = "inline";
        visible = true;
      });

      // ✅ ricostruzione corretta della punteggiatura (evita vedove e orfane)
const visibleRdgs = Array.from(
  entry.querySelectorAll(".rdg-item")
).filter(r => r.style.display !== "none");

Array.from(entry.childNodes).forEach(n => {
  if (n.nodeType === 3 && n.textContent.trim() === ";") {
    n.textContent = "";
  }
});

// reinserisce ; solo tra rdg visibili multipli
visibleRdgs.forEach((rdg, index) => {
  const next = visibleRdgs[index + 1];
  if (next) {
    const sep = document.createTextNode("; ");
    rdg.after(sep);
  }
});

      entry.style.display = visible ? "block" : "none";
    });
  }

  /* =======================
     NOTE
  ======================== */
  function attachNoteIfPresent(id, parent) {
    if (!state.noteMap[id]) return;

    state.noteCounter++;

    const marker = document.createElement("span");
    marker.className = "note-marker";
    marker.dataset.ref = id;
    marker.textContent = state.noteCounter;
    parent.appendChild(marker);

    const note = document.createElement("div");
    note.className = "note-entry";
    note.dataset.ref = id;
    note.innerHTML = `<span class="note-num-label">${state.noteCounter}</span>${state.noteMap[id]}`;
    DOM.notes.appendChild(note);
  }

  /* =======================
     UI (NAV + HIGHLIGHT + FILTRI)
  ======================== */
  function setupUIEvents() {
    // NAVBAR
    document.querySelectorAll("[data-panel]").forEach(b => {
      b.addEventListener("click", () => {
        const id = "panel-" + b.dataset.panel;
        document.querySelectorAll(".panel").forEach(p =>
          p.id !== id && p.classList.add("hidden")
        );
        document.getElementById(id)?.classList.toggle("hidden");
      });
    });

   document.querySelectorAll(".close").forEach(c => {
  c.addEventListener("click", () => {
    const parent = c.parentElement;
    parent.classList.add("hidden");

    // PATCH: ripristino stato per pannelli laterali
    if (parent.id === "facsimile") {
      state.facsimileActive = false;
      if (DOM.apparatusAside) {
        DOM.apparatusAside.style.visibility = "visible";
      }
    }

    if (parent.id === "translation") {
      state.translationActive = false;
      if (DOM.apparatusAside) {
        DOM.apparatusAside.style.visibility = "visible";
      }
    }
  });
});

    // ===== SISTEMA DI EVIDENZIAZIONE SEMANTICA =====

// reset globale: click su spazio vuoto
document.addEventListener("click", e => {
  if (
    !e.target.closest(
      ".lem, .rdg-item, .note-entry, .note-marker"
    )
  ) {
    document.querySelectorAll(".highlight").forEach(el =>
      el.classList.remove("highlight")
    );
  }
});

// clic su <lem> → SOLO <rdg> + scroll verso apparato
document.addEventListener("click", e => {
  const lem = e.target.closest(".lem");
  if (!lem) return;

  document.querySelectorAll(".highlight")
    .forEach(el => el.classList.remove("highlight"));

  const rdgs = document
    .querySelectorAll(`.rdg-item[data-ref="${lem.dataset.ref}"]`);

  rdgs.forEach(rdg => rdg.classList.add("highlight"));

  if (rdgs.length > 0) {
    rdgs[0].scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
});

// clic su <rdg> → SOLO <lem> + scroll verso testo
document.addEventListener("click", e => {
  const rdg = e.target.closest(".rdg-item");
  if (!rdg) return;

  document.querySelectorAll(".highlight")
    .forEach(el => el.classList.remove("highlight"));

  const lems = document
    .querySelectorAll(`.lem[data-ref="${rdg.dataset.ref}"]`);

  lems.forEach(lem => lem.classList.add("highlight"));

  if (lems.length > 0) {
    lems[0].scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
});

// clic su marker di nota → SOLO <note> + scroll verso note
document.addEventListener("click", e => {
  const marker = e.target.closest(".note-marker");
  if (!marker) return;

  document.querySelectorAll(".highlight")
    .forEach(el => el.classList.remove("highlight"));

  const notes = document
    .querySelectorAll(`.note-entry[data-ref="${marker.dataset.ref}"]`);

  notes.forEach(note => note.classList.add("highlight"));

  if (notes.length > 0) {
    notes[0].scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
});

// clic su <note> → SOLO marker + scroll verso testo
document.addEventListener("click", e => {
  const note = e.target.closest(".note-entry");
  if (!note) return;

  document.querySelectorAll(".highlight")
    .forEach(el => el.classList.remove("highlight"));

  const markers = document
    .querySelectorAll(`.note-marker[data-ref="${note.dataset.ref}"]`);

  markers.forEach(m => m.classList.add("highlight"));

  if (markers.length > 0) {
    markers[0].scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
});
    

    // FILTRO TIPOLOGIA VARIANTI
    document.querySelectorAll("[data-filter-type]").forEach(cb => {
      cb.addEventListener("change", e => {
        const type = e.target.dataset.filterType;

        let sectionId;
        if (type === "substantive") sectionId = "substantive-section";
        if (type === "orthographic") sectionId = "orthographic-section";
        if (type === "note") sectionId = "notes-section";

        const section = document.getElementById(sectionId);
        if (section) {
          section.style.display = e.target.checked ? "block" : "none";
        }

        if (type === "note") {
          document.querySelectorAll(".note-marker").forEach(m => {
            m.style.display = e.target.checked ? "inline" : "none";
          });
        }
      });
    });

    const toggle = document.getElementById("toggle-translation");
    if (toggle) toggle.addEventListener("click", toggleTranslationView);
    const facToggle = document.getElementById("toggle-facsimile");
if (facToggle) facToggle.addEventListener("click", toggleFacsimileView);

/* === PATCH: cambio testimone nel facsimile === */
const facsimileSelector = document.getElementById("facsimile-selector");
if (facsimileSelector) {
  facsimileSelector.addEventListener("change", e => {
    if (state.facsimileActive) {
      renderFacsimile(e.target.value);
    }
  });
}
/* === FINE PATCH === */
  }

  function toggleTranslationView() {
    state.translationActive = !state.translationActive;
    if (DOM.translation) {
      DOM.translation.classList.toggle("hidden", !state.translationActive);
    }
    if (DOM.apparatusAside) {
      DOM.apparatusAside.style.visibility =
        state.translationActive ? "hidden" : "visible";
    }
  }
  
  function toggleFacsimileView() {
  state.facsimileActive = !state.facsimileActive;

  if (DOM.facsimile) {
    DOM.facsimile.classList.toggle("hidden", !state.facsimileActive);
  }

  if (DOM.apparatusAside) {
    DOM.apparatusAside.style.visibility =
      state.facsimileActive ? "hidden" : "visible";
  }


if (state.facsimileActive) {
  const wits = Object.keys(state.facsimileMap);
  if (wits.length > 0) {
    renderFacsimile(wits[0]);
  }
}

}


function renderFacsimile(witId) {
  const container = document.getElementById("mirador-viewer");
  if (!container) return;

  container.innerHTML = "";

  const pages = state.facsimileMap[witId];
  if (!pages) {
    container.innerHTML = "<p>Nessun facsimile disponibile.</p>";
    return;
  }

  pages.forEach(p => {
    const figure = document.createElement("figure");
    figure.style.marginBottom = "2rem";

    const caption = document.createElement("figcaption");
    caption.textContent = `Carta ${p.n}`;
    caption.style.fontSize = "0.8rem";
    caption.style.color = "#666";

    const img = document.createElement("img");
   
    /*zoom immagine*/
    img.src = p.url;
    let scale = 1;

img.addEventListener("wheel", e => {
  e.preventDefault(); // evita lo scroll della pagina

  const delta = e.deltaY < 0 ? 0.1 : -0.1;
  scale = Math.min(3, Math.max(1, scale + delta));

  img.style.transform = `scale(${scale})`;
}, { passive: false });



    img.addEventListener("click", () => {
  img.classList.toggle("zoomed");
});
    img.style.width = "100%";
    img.style.border = "1px solid #ccc";

    figure.appendChild(caption);
    figure.appendChild(img);
    container.appendChild(figure);
  });

  /* fine zoom*/
}



  /* =======================
     SCROLL SYNC
  ======================== */
  function setupScrollSync() {
    if (DOM.text && DOM.apparatusAside) {
      syncScroll(DOM.text, DOM.apparatusAside);
      syncScroll(DOM.apparatusAside, DOM.text);
    }
  }

  function syncScroll(src, dest) {
    let busy = false;
    src.addEventListener("scroll", () => {
      if (busy || dest.classList.contains("hidden")) return;
      busy = true;
      dest.scrollTop = src.scrollTop;
      setTimeout(() => (busy = false), 50);
    });
  }

})();