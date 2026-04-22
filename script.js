(() => {
  "use strict";

  /* =======================
     STATO APPLICATIVO
  ======================== */
  const state = {
    activeWits: new Set(),
    activeFilters: new Set(["substantive", "orthographic", "note"]),
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

  function cacheDOM() {
    DOM.text = document.getElementById("text");
    DOM.translation = document.getElementById("translation");
    DOM.apparatus = document.getElementById("apparatus");
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

    const hasTranslation = xml.querySelector('div[type="translation"]');
    if (!hasTranslation) {
      const translationButton = document.getElementById('toggle-translation');
      if (translationButton) translationButton.style.display = 'none';
    }

    initTextAndApparatus(xml);
    setupUIEvents();
    setupScrollSync();
  }

  function initHeader(xml) {
    const title = xml.querySelector("titleStmt > title")?.textContent.trim() || "";
    const author = xml.querySelector("titleStmt > author")?.textContent.trim() || "";
    const headerTitle = document.querySelector(".edition-title");
    if (headerTitle && title) {
      headerTitle.innerHTML = author ? `${author}, <i>${title}</i>` : `<i>${title}</i>`;
    }
  }

  function initWitnesses(xml) {
    if (!DOM.cbContainer) return;
    const rdgWits = new Set();
    xml.querySelectorAll("rdg[wit]").forEach(rdg => {
      rdg.getAttribute("wit").replace(/#/g, "").split(/\s+/).filter(Boolean).forEach(w => rdgWits.add(w));
    });

    const witnessNodes = Array.from(xml.getElementsByTagName("witness"));
    witnessNodes.forEach(w => {
      const id = w.getAttribute("xml:id");
      if (!rdgWits.has(id)) return;
      state.activeWits.add(id);

      const label = document.createElement("label");
      label.className = "filter-option";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.dataset.witId = id;

      cb.addEventListener("change", e => {
        e.target.checked ? state.activeWits.add(id) : state.activeWits.delete(id);
        refreshApparatus();
      });

      label.appendChild(cb);
      label.append(` ${id}`);
      DOM.cbContainer.appendChild(label);
    });
  }

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

  function initDataMaps(xml) {
    xml.querySelectorAll("note").forEach(n => {
      const target = n.getAttribute("target")?.replace("#", "");
      if (target) state.noteMap[target] = n.innerHTML;
    });

    xml.querySelectorAll('div[type="translation"] l').forEach(l => {
      state.translationMap[l.getAttribute("n")] = l.innerHTML.trim();
    });

    xml.querySelectorAll("facsimile surface").forEach(s => {
      const wit = s.getAttribute("corresp")?.replace("#", "");
      const n = s.getAttribute("n");
      const graphic = s.querySelector("graphic");
      if (!wit || !graphic) return;
      if (!state.facsimileMap[wit]) state.facsimileMap[wit] = [];
      state.facsimileMap[wit].push({ n: n, url: graphic.getAttribute("url") });
    });
  }

  /* =======================
     TESTO + APPARATO
  ======================== */
  function initTextAndApparatus(xml) {
    const lines = xml.querySelectorAll('div[type="edition"] l');
    lines.forEach(line => buildLine(line));
    refreshApparatus();
  }

  function buildLine(line) {
    const ln = line.getAttribute("n");
    const div = document.createElement("div");
    div.className = "line-group";
    div.innerHTML = `<span class="line-num">${ln}</span>`;

    let lineBlock = DOM.apparatus.querySelector(`.line-block[data-ln="${ln}"]`);
    if (!lineBlock) {
      lineBlock = document.createElement("div");
      lineBlock.className = "line-block";
      lineBlock.dataset.ln = ln;
      // Modifica qui: aggiunta classe line-num per ereditare font sans-serif
      lineBlock.innerHTML = `<span class="app-line-ref line-num">${ln}</span> `;
      DOM.apparatus.appendChild(lineBlock);
    }

    Array.from(line.childNodes).forEach(node => {
      if (node.nodeType === 3) div.append(node.textContent);
      else if (node.nodeName === "app") handleAppNode(node, div, ln, lineBlock);
      else if (node.nodeName === "seg") handleSegNode(node, div);
    });

    DOM.text.appendChild(div);

    if (state.translationMap[ln] && DOM.translation) {
      const trDiv = document.createElement("div");
      trDiv.className = "line-group";
      trDiv.innerHTML = `<span class="line-num">${ln}</span>${state.translationMap[ln]}`;
      DOM.translation.appendChild(trDiv);
    }
  }

  function handleAppNode(node, container, ln, lineBlock) {
    const id = node.getAttribute("xml:id");
    const lem = node.querySelector("lem");
    const rdgs = node.querySelectorAll("rdg");
    const isOrtho = Array.from(rdgs).some(r => r.getAttribute("type") === "orthographic");

    const span = document.createElement("span");
    span.className = `lem ${lem.getAttribute("type") === "conjecture" ? "conjecture" : ""}`;
    span.dataset.ref = id;
    span.textContent = lem.textContent.trim();
    container.appendChild(span);

    addApparatusEntry(id, lem, rdgs, isOrtho, lineBlock);
    attachNoteIfPresent(id, span);
  }

  function handleSegNode(node, container) {
    const id = node.getAttribute("xml:id");
    const span = document.createElement("span");
    span.className = "comment-term";
    span.textContent = node.textContent;
    container.appendChild(span);
    attachNoteIfPresent(id, span);
  }

  function addApparatusEntry(id, lem, rdgs, isOrtho, lineBlock) {
    const entry = document.createElement("span");
    entry.className = "apparatus-entry";
    entry.dataset.ref = id; 
    entry.dataset.variantType = isOrtho ? "orthographic" : "substantive";

    if (lineBlock.querySelectorAll(".apparatus-entry").length > 0) {
      const sep = document.createElement("span");
      sep.className = "app-sep";
      sep.textContent = " ◊ ";
      lineBlock.appendChild(sep);
    }

    const isConjecture = lem.getAttribute("type") === "conjecture";
    const lemmaText = isConjecture ? `&lt;${lem.textContent}&gt;` : lem.textContent;

    entry.innerHTML = `<span class="app-lemma">${lemmaText}</span>] `;

    rdgs.forEach((r, i) => {
      const span = document.createElement("span");
      span.className = "rdg-item";
      span.dataset.ref = id;
      const wits = (r.getAttribute("wit") || "").replace(/#/g, "").split(/\s+/).filter(Boolean);
      span.dataset.allWits = wits.join(",");
      span.dataset.baseText = r.textContent || "<i>om</i>. ";
      span.dataset.type = r.getAttribute("type") || "substantive";
      entry.appendChild(span);
    });

    lineBlock.appendChild(entry);
  }

  /* =======================
     REFRESH APPARATO E NOTE
  ======================== */
  function refreshApparatus() {
    const showNotes = state.activeFilters.has("note");
    
    document.querySelectorAll(".note-marker").forEach(m => {
      m.style.display = showNotes ? "inline" : "none";
    });
    
    const notesSection = document.getElementById("notes-section");
    if (notesSection) {
      notesSection.style.display = showNotes ? "block" : "none";
    }
    if (DOM.notes) {
       DOM.notes.style.display = showNotes ? "block" : "none";
    }

    document.querySelectorAll(".rdg-item").forEach(rdg => {
      const type = rdg.dataset.type;
      const typeActive = state.activeFilters.has(type);
      const allWits = rdg.dataset.allWits.split(",");
      const activeInThisRdg = allWits.filter(w => state.activeWits.has(w));

      if (typeActive && activeInThisRdg.length > 0) {
        rdg.innerHTML = `${rdg.dataset.baseText} <em>${activeInThisRdg.join(", ")}</em>`;
        rdg.style.display = "inline";
      } else {
        rdg.style.display = "none";
      }
    });

    document.querySelectorAll(".apparatus-entry").forEach(entry => {
      // Pulizia più aggressiva per evitare accumulo di nodi di testo
      Array.from(entry.childNodes).forEach(n => {
        if (n.nodeType === 3 && (n.textContent.trim() === ";" || n.textContent.trim() === "")) n.remove();
      });

      const visibleRdgs = Array.from(entry.querySelectorAll(".rdg-item")).filter(r => r.style.display !== "none");
      visibleRdgs.forEach((rdg, idx) => {
        if (idx < visibleRdgs.length - 1) {
          rdg.after(document.createTextNode("; "));
        }
      });

      entry.style.display = visibleRdgs.length > 0 ? "inline" : "none";
    });

    document.querySelectorAll(".line-block").forEach(block => {
      const visibleEntries = Array.from(block.querySelectorAll(".apparatus-entry")).filter(e => e.style.display !== "none");
      
      const separators = block.querySelectorAll(".app-sep");
      separators.forEach(sep => sep.style.display = "none");
      
      visibleEntries.forEach((entry, idx) => {
        if (idx > 0) {
          const sep = entry.previousElementSibling;
          if (sep && sep.classList.contains("app-sep")) sep.style.display = "inline";
        }
      });

      block.style.display = visibleEntries.length > 0 ? "block" : "none";
    });
  }

  function attachNoteIfPresent(id, parent) {
    if (!state.noteMap[id]) return;
    state.noteCounter++;
    const marker = document.createElement("span");
    marker.className = "note-marker";
    marker.dataset.noteRef = id; 
    marker.textContent = state.noteCounter;
    parent.appendChild(marker);

    const note = document.createElement("div");
    note.className = "note-entry";
    note.dataset.noteRef = id;
    note.innerHTML = `<span class="note-num-label">${state.noteCounter}</span>${state.noteMap[id]}`;
    DOM.notes.appendChild(note);
  }

  /* =======================
     UI EVENTS
  ======================== */
  function setupUIEvents() {
    document.querySelectorAll("[data-panel]").forEach(b => {
      b.addEventListener("click", () => {
        const id = "panel-" + b.dataset.panel;
        document.querySelectorAll(".panel").forEach(p => p.id !== id && p.classList.add("hidden"));
        document.getElementById(id)?.classList.toggle("hidden");
      });
    });

    document.querySelectorAll(".close").forEach(c => {
      c.addEventListener("click", () => {
        const parent = c.parentElement;
        parent.classList.add("hidden");
        if (parent.id === "facsimile") state.facsimileActive = false;
        if (parent.id === "translation") state.translationActive = false;
        if (DOM.apparatusAside) DOM.apparatusAside.style.visibility = "visible";
      });
    });

    document.querySelectorAll("[data-filter-type]").forEach(cb => {
      cb.addEventListener("change", e => {
        const type = e.target.dataset.filterType;
        e.target.checked ? state.activeFilters.add(type) : state.activeFilters.delete(type);
        refreshApparatus();
      });
    });

    document.addEventListener("click", e => {
      const target = e.target;
      const noteTarget = target.closest(".note-marker, .note-entry");
      if (noteTarget && noteTarget.dataset.noteRef) {
        document.querySelectorAll(".highlight").forEach(el => el.classList.remove("highlight"));
        const noteRef = noteTarget.dataset.noteRef;
        document.querySelectorAll(`[data-note-ref="${noteRef}"]`).forEach(el => el.classList.add("highlight"));
        return;
      }
      const appTarget = target.closest(".lem, .rdg-item");
      if (appTarget && appTarget.dataset.ref) {
        document.querySelectorAll(".highlight").forEach(el => el.classList.remove("highlight"));
        const ref = appTarget.dataset.ref;
        document.querySelectorAll(`.lem[data-ref="${ref}"], .rdg-item[data-ref="${ref}"]`).forEach(el => {
          el.classList.add("highlight");
        });
        return;
      }
      document.querySelectorAll(".highlight").forEach(el => el.classList.remove("highlight"));
    });

    const toggleTr = document.getElementById("toggle-translation");
    if (toggleTr) toggleTr.addEventListener("click", () => {
      state.translationActive = !state.translationActive;
      DOM.translation.classList.toggle("hidden", !state.translationActive);
      DOM.apparatusAside.style.visibility = state.translationActive ? "hidden" : "visible";
    });

    const toggleFac = document.getElementById("toggle-facsimile");
    if (toggleFac) toggleFac.addEventListener("click", () => {
      state.facsimileActive = !state.facsimileActive;
      DOM.facsimile.classList.toggle("hidden", !state.facsimileActive);
      DOM.apparatusAside.style.visibility = state.facsimileActive ? "hidden" : "visible";
      if (state.facsimileActive) renderFacsimile(Object.keys(state.facsimileMap)[0]);
    });

    const facSel = document.getElementById("facsimile-selector");
    if (facSel) facSel.addEventListener("change", e => renderFacsimile(e.target.value));
  }

  function renderFacsimile(witId) {
    const container = document.getElementById("mirador-viewer");
    if (!container) return;
    container.innerHTML = "";
    const pages = state.facsimileMap[witId];
    if (!pages) return;
    pages.forEach(p => {
      const fig = document.createElement("figure");
      const cap = document.createElement("figcaption");
      cap.textContent = `Carta ${p.n}`;
      const img = document.createElement("img");
      img.src = p.url;
      img.style.width = "100%";
      enableZoomAndGrab(img);
      fig.appendChild(cap);
      fig.appendChild(img);
      container.appendChild(fig);
    });
  }

  function setupScrollSync() {
    if (DOM.text && DOM.apparatusAside) {
      syncScroll(DOM.text, DOM.apparatusAside);
      syncScroll(DOM.apparatusAside, DOM.text);
    }
  }

function enableZoomAndGrab(img) {

  // ✅ blocco totale del drag nativo
  img.draggable = false;
  img.addEventListener("dragstart", e => e.preventDefault());

  let scale = 1;
  const minScale = 1;
  const maxScale = 4;

  let translateX = 0;
  let translateY = 0;

  let isDragging = false;
  let startX = 0;
  let startY = 0;

  function updateTransform() {
    img.style.transform =
      `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }

  /* ======================
     WHEEL ZOOM
     ====================== */
  img.addEventListener("wheel", e => {
    e.preventDefault();

    const rect = img.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const zoomFactor = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(
      maxScale,
      Math.max(minScale, scale + direction * zoomFactor)
    );

    if (newScale === scale) return;

    const scaleRatio = newScale / scale;
    translateX -= (offsetX - translateX) * (scaleRatio - 1);
    translateY -= (offsetY - translateY) * (scaleRatio - 1);

    scale = newScale;
    img.classList.toggle("zoomed", scale > 1);
    updateTransform();
  }, { passive: false });

  /* ======================
     POINT + GRAB
     ====================== */
  img.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    if (scale === 1) return;

    e.preventDefault(); // ✅ FONDAMENTALE

    isDragging = true;
    img.classList.add("dragging");

    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
  });

  document.addEventListener("mousemove", e => {
    if (!isDragging) return;
    if (e.buttons !== 1) return;

    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    img.classList.remove("dragging");
  });

  img.addEventListener("mouseleave", () => {
    isDragging = false;
    img.classList.remove("dragging");
  });

  /* ======================
     RESET
     ====================== */
  img.addEventListener("dblclick", () => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    img.classList.remove("zoomed", "dragging");
    updateTransform();
  });
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