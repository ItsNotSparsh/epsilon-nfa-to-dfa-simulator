/* Browser interface: parse input, render automata, drive the walkthrough and tester. */
(function startSimulator() {
  "use strict";
  const Algorithms = window.AutomataAlgorithms;
  const byId = id => document.getElementById(id);
  const SVG_NS = "http://www.w3.org/2000/svg";
  const graphView = new Map();
  let machine = null;
  let dfa = null;
  let currentStep = 0;
  let playback = null;

  function parseInput() {
    const list = value => value.split(",").map(item => item.trim()).filter(Boolean);
    const states = list(byId("statesInput").value);
    const alphabet = list(byId("alphabetInput").value);
    const start = byId("startInput").value.trim();
    const finals = new Set(list(byId("finalsInput").value));
    const transitions = [];
    const lines = byId("transitionsInput").value.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const parts = line.split(",").map(item => item.trim());
      if (parts.length !== 3 || parts.some(part => !part)) {
        throw new Error(`Line ${index + 1}: enter exactly “from, symbol, to”.`);
      }
      const [from, symbol, to] = parts;
      transitions.push({ from, symbol, to, line: index + 1 });
    });
    const result = { states, alphabet, start, finals, transitions };
    const errors = Algorithms.validateAutomaton(result);
    if (errors.length) throw new Error(errors.join("\n"));
    return result;
  }

  function setNotice(message, isError = false) {
    const notice = byId("notice");
    notice.textContent = message;
    notice.classList.toggle("error-notice", isError);
  }

  function clearValidation() {
    byId("validation").hidden = true;
    byId("validation").textContent = "";
  }

  function reportError(error) {
    const validation = byId("validation");
    validation.textContent = error.message;
    validation.hidden = false;
    setNotice("Please correct the highlighted input issue and convert again.", true);
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function groupEdges(transitions) {
    const groups = new Map();
    for (const item of transitions) {
      const from = item.from;
      const to = item.to;
      const key = JSON.stringify([from, to]);
      if (!groups.has(key)) groups.set(key, { from, to, labels: [] });
      groups.get(key).labels.push(item.symbol);
    }
    return [...groups.values()].map(edge => ({ ...edge, labels: [...new Set(edge.labels)] }));
  }

  function layoutNodes(nodeNames, edges, startName) {
    const ranks = new Map([[startName, 0]]);
    const adjacency = new Map(nodeNames.map(name => [name, []]));
    for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);
    const queue = [startName];
    for (let index = 0; index < queue.length; index += 1) {
      const state = queue[index];
      for (const target of adjacency.get(state) || []) {
        if (!ranks.has(target)) {
          ranks.set(target, ranks.get(state) + 1);
          queue.push(target);
        }
      }
    }
    const maxReachable = Math.max(0, ...ranks.values());
    for (const name of nodeNames) if (!ranks.has(name)) ranks.set(name, maxReachable + 1);
    const layers = new Map();
    for (const name of nodeNames) {
      const rank = ranks.get(name);
      if (!layers.has(rank)) layers.set(rank, []);
      layers.get(rank).push(name);
    }
    const positions = new Map();
    const rankGap = 190;
    const rowGap = 116;
    const maxRows = Math.max(1, ...[...layers.values()].map(layer => layer.length));
    const height = Math.max(300, 170 + maxRows * rowGap);
    const centerY = height / 2;
    const maxRank = Math.max(...layers.keys());
    for (const [rank, layer] of layers) {
      layer.forEach((name, index) => positions.set(name, {
        x: 104 + rank * rankGap,
        y: centerY + (index - (layer.length - 1) / 2) * rowGap
      }));
    }
    return { positions, width: Math.max(430, 220 + maxRank * rankGap), height };
  }

  function drawDiagram(container, nodeNames, edges, startName, acceptingNames, trapNames = new Set()) {
    container.replaceChildren();
    container.classList.remove("empty-diagram");
    const layout = layoutNodes(nodeNames, edges, startName);
    const { positions, width, height } = layout;
    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Automaton state diagram" });
    svg.dataset.baseWidth = String(width);
    svg.dataset.baseHeight = String(height);
    const defs = svgElement("defs");
    const marker = svgElement("marker", { id: `arrow-${container.id}`, markerWidth: 12, markerHeight: 11, refX: 10, refY: 5.5, orient: "auto", markerUnits: "userSpaceOnUse" });
    marker.appendChild(svgElement("path", { d: "M0,0 L0,11 L12,5.5 z", fill: "#c4d6d6" }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    const grouped = groupEdges(edges);
    const outgoingOrder = new Map();
    const loopDirections = new Map();
    for (const edge of grouped) {
      const source = positions.get(edge.from);
      const target = positions.get(edge.to);
      if (!source || !target) continue;
      let path;
      let labelX;
      let labelY;
      const fromX = source.x;
      const fromY = source.y;
      if (edge.from === edge.to) {
        const verticalNeighbors = [...positions.values()].filter(point => point.x === source.x && point.y !== source.y);
        const aboveGap = Math.min(Infinity, ...verticalNeighbors.filter(point => point.y < source.y).map(point => source.y - point.y));
        const belowGap = Math.min(Infinity, ...verticalNeighbors.filter(point => point.y > source.y).map(point => point.y - source.y));
        const direction = aboveGap > belowGap ? -1 : 1;
        loopDirections.set(edge.from, direction);
        path = `M ${source.x - 14} ${fromY + direction * 20} C ${source.x - 66} ${fromY + direction * 108}, ${source.x + 66} ${fromY + direction * 108}, ${source.x + 14} ${fromY + direction * 20}`;
        labelX = source.x;
        labelY = fromY + direction * 98;
      } else {
        const order = outgoingOrder.get(edge.from) || 0;
        outgoingOrder.set(edge.from, order + 1);
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.hypot(dx, dy) || 1;
        const ux = dx / distance;
        const uy = dy / distance;
        const px = -uy;
        const py = ux;
        const side = order % 2 === 0 ? -1 : 1;
        const lane = side * (26 + Math.floor(order / 2) * 24);
        const startX = source.x + ux * 24;
        const startY = source.y + uy * 24;
        const endX = target.x - ux * 25;
        const endY = target.y - uy * 25;
        const c1x = startX + ux * 44 + px * lane;
        const c1y = startY + uy * 44 + py * lane;
        const c2x = endX - ux * 44 + px * lane;
        const c2y = endY - uy * 44 + py * lane;
        path = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
        // Anchor the label on its own curve, closer to the destination where
        // outgoing paths have separated. The text halo clears the line behind it.
        const t = 0.62;
        const u = 1 - t;
        labelX = u ** 3 * startX + 3 * u ** 2 * t * c1x + 3 * u * t ** 2 * c2x + t ** 3 * endX;
        labelY = u ** 3 * startY + 3 * u ** 2 * t * c1y + 3 * u * t ** 2 * c2y + t ** 3 * endY + 4;
      }
      const edgePath = svgElement("path", { d: path, class: "edge-path", "marker-end": `url(#arrow-${container.id})` });
      edgePath.dataset.from = edge.from;
      edgePath.dataset.symbols = JSON.stringify(edge.labels);
      edgePath.dataset.to = edge.to;
      const title = svgElement("title");
      title.textContent = `${edge.from} on ${edge.labels.join(", ")} to ${edge.to}`;
      edgePath.appendChild(title);
      svg.appendChild(edgePath);
      if (container.id !== "constructionDiagram") {
        const length = edgePath.getTotalLength();
      edgePath.style.strokeDasharray = String(length);
      edgePath.style.strokeDashoffset = String(length);
        requestAnimationFrame(() => edgePath.classList.add("edge-visible"));
      }
      const label = svgElement("text", { x: labelX, y: labelY, class: "edge-label" });
      label.textContent = edge.labels.join(", ");
      svg.appendChild(label);
    }

    const start = positions.get(startName);
    if (start) svg.appendChild(svgElement("path", { d: `M ${start.x - 48} ${start.y} L ${start.x - 25} ${start.y}`, class: "start-arrow", "marker-end": `url(#arrow-${container.id})` }));
    for (const [nodeIndex, name] of nodeNames.entries()) {
      const point = positions.get(name);
      const accepted = acceptingNames.has(name);
      const isTrap = trapNames.has(name);
      const circle = svgElement("circle", { cx: point.x, cy: point.y, r: 22, class: `state-circle ${name === startName ? "state-start" : ""} ${accepted ? "state-accepted" : ""} ${isTrap ? "state-trap" : ""}` });
      circle.dataset.name = name;
      circle.style.animationDelay = `${nodeIndex * 90}ms`;
      svg.appendChild(circle);

      if (accepted) svg.appendChild(svgElement("circle", { cx: point.x, cy: point.y, r: 17, class: "state-final-inner" }));
      const text = svgElement("text", { x: point.x, y: point.y, class: "state-label" });
      text.textContent = name;
      text.style.animationDelay = `${nodeIndex * 90}ms`;
      svg.appendChild(text);
      if (isTrap) {
        const trapY = loopDirections.get(name) === 1 ? point.y + 128 : point.y + 39;
        const trapText = svgElement("text", { x: point.x, y: trapY, class: "trap-label" });
        trapText.textContent = "trap";
        svg.appendChild(trapText);
      }
      for (let part = circle; part; part = part.nextElementSibling) part.dataset.state = name;
    }
    container.appendChild(svg);
    graphView.set(container.id, { scale: 1, x: 0, y: 0 });
    applyZoom(container.id, 1);
  }

  function applyZoom(graphId, scale) {
    const container = byId(graphId);
    const svg = container.querySelector("svg");
    if (!svg) return;
    const width = Number(svg.dataset.baseWidth);
    const height = Number(svg.dataset.baseHeight);
    const view = graphView.get(graphId) || { scale, x: 0, y: 0 };
    view.scale = scale;
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const maxX = Math.min(0, container.clientWidth - scaledWidth);
    const maxY = Math.min(0, container.clientHeight - scaledHeight);
    view.x = scaledWidth <= container.clientWidth ? (container.clientWidth - scaledWidth) / 2 : Math.max(maxX, Math.min(0, view.x));
    view.y = scaledHeight <= container.clientHeight ? (container.clientHeight - scaledHeight) / 2 : Math.max(maxY, Math.min(0, view.y));
    graphView.set(graphId, view);
    svg.style.width = `${scaledWidth}px`;
    svg.style.height = `${scaledHeight}px`;
    svg.style.left = `${view.x}px`;
    svg.style.top = `${view.y}px`;
    const percent = byId(`${graphId}Zoom`);
    if (percent) percent.textContent = `${Math.round(scale * 100)}%`;
  }

  function changeZoom(graphId, action) {
    const container = byId(graphId);
    const svg = container.querySelector("svg");
    if (!svg) return;
    const view = graphView.get(graphId) || { scale: 1, x: 0, y: 0 };
    let scale = view.scale;
    if (action === "fit") {
      scale = Math.min(1, (container.clientWidth - 20) / Number(svg.dataset.baseWidth), (container.clientHeight - 20) / Number(svg.dataset.baseHeight));
    } else {
      scale = Math.max(.4, Math.min(2.5, scale + (action === "in" ? .05 : -.05)));
    }
    if (action !== "fit") {
      const centerX = container.clientWidth / 2;
      const centerY = container.clientHeight / 2;
      const ratio = scale / view.scale;
      view.x = centerX - (centerX - view.x) * ratio;
      view.y = centerY - (centerY - view.y) * ratio;
    } else {
      view.x = 0;
      view.y = 0;
    }
    graphView.set(graphId, view);
    applyZoom(graphId, scale);
  }

  function enablePan(graphId) {
    const container = byId(graphId);
    let drag = null;
    container.addEventListener("pointerdown", event => {
      if (!container.querySelector("svg") || event.button !== 0) return;
      const view = graphView.get(graphId);
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: view.x, originY: view.y };
      container.classList.add("is-dragging");
      container.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    container.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const view = graphView.get(graphId);
      view.x = drag.originX + event.clientX - drag.x;
      view.y = drag.originY + event.clientY - drag.y;
      graphView.set(graphId, view);
      applyZoom(graphId, view.scale);
    });
    const endDrag = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      container.classList.remove("is-dragging");
      if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
    };
    container.addEventListener("pointerup", endDrag);
    container.addEventListener("pointercancel", endDrag);
  }

  function renderNfaDiagram(container = byId("nfaDiagram")) {
    const edges = machine.transitions.map(({ from, symbol, to }) => ({ from, symbol: symbol === "eps" ? "ε" : symbol, to }));
    drawDiagram(container, machine.states, edges, machine.start, machine.finals);
  }

  function renderDfaDiagram(container = byId("dfaDiagram")) {
    const names = dfa.subsets.map((_, index) => `D${index}`);
    const edges = dfa.transitions.map(({ from, symbol, to }) => ({ from: `D${from}`, symbol, to: `D${to}` }));
    const accepting = new Set(names.filter((_, index) => dfa.accepting[index]));
    const traps = new Set(names.filter((_, index) => dfa.subsets[index].size === 0));
    drawDiagram(container, names, edges, "D0", accepting, traps);
  }

  function renderSummary() {
    const accepts = dfa.accepting.filter(Boolean).length;
    const metrics = [
      [machine.states.length, "NFA states"],
      [dfa.subsets.length, "DFA states generated"],
      [accepts, "accepting DFA states"]
    ];
    byId("summary").className = "summary";
    byId("summary").innerHTML = metrics.map(([value, label]) => `<span class="metric"><b>${value}</b>${label}</span>`).join("");
    byId("dfaSubsets").className = "subset-cards";
    byId("dfaSubsets").innerHTML = dfa.subsets.map((subset, index) => {
      const isTrap = subset.size === 0;
      const tags = [index === 0 ? "start" : "", dfa.accepting[index] ? "accept" : "", isTrap ? "trap" : ""].filter(Boolean);
      return `<div class="subset-card ${index === 0 ? "subset-start" : ""} ${dfa.accepting[index] ? "subset-accept" : ""} ${isTrap ? "subset-trap" : ""}"><b>D${index}</b><span>${escapeHtml(Algorithms.formatSet(subset))}</span><small>${tags.join(" · ") || "reachable"}</small></div>`;
    }).join("");
  }

  function renderTable() {
    const table = byId("dfaTable");
    table.querySelector("thead").innerHTML = `<tr><th>DFA state (NFA subset)</th>${machine.alphabet.map(symbol => `<th>${escapeHtml(symbol)}</th>`).join("")}</tr>`;
    table.querySelector("tbody").innerHTML = dfa.subsets.map((subset, index) => {
      const trap = dfa.subsets[index].size === 0;
      const flags = `${index === 0 ? " <small>start</small>" : ""}${dfa.accepting[index] ? ' <span class="accept-badge">accept</span>' : ""}${trap ? ' <span class="trap-badge">trap</span>' : ""}`;
      const cells = machine.alphabet.map(symbol => {
        const transition = dfa.transitions.find(item => item.from === index && item.symbol === symbol);
        return `<td>D${transition.to}</td>`;
      }).join("");
      return `<tr><td><b>D${index}</b> = ${escapeHtml(Algorithms.formatSet(subset))}${flags}</td>${cells}</tr>`;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  // Frame zero creates D0. Each following pair shows a move, then commits its closure.
  function lastFrame() {
    return 2 * dfa.transitions.length;
  }

  let constructionMachine;
  let previousFrame = -1;

  function renderConstructionGraph(completed, activeState, latest) {
    const graph = byId("constructionDiagram");
    if (constructionMachine !== dfa || !graph.querySelector("svg")) {
      const names = dfa.subsets.map((_, i) => `D${i}`);
      const edges = dfa.transitions.map(t => ({ from: names[t.from], to: names[t.to], symbol: t.symbol }));
      drawDiagram(graph, names, edges, "D0",
        new Set(names.filter((_, i) => dfa.accepting[i])),
        new Set(names.filter((_, i) => !dfa.subsets[i].size)));
      changeZoom(graph.id, "fit");
      constructionMachine = dfa;
      previousFrame = -1;
    }

    const visible = new Set(["D0"]);
    const symbols = new Map();
    for (let i = 0; i < completed; i++) {
      const { from, to, symbol } = dfa.transitions[i];
      visible.add(`D${to}`);
      const key = `D${from}:D${to}`;
      if (!symbols.has(key)) symbols.set(key, []);
      symbols.get(key).push(symbol);
    }
    const animate = currentStep > previousFrame && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const part of graph.querySelectorAll("[data-state]")) {
      const show = visible.has(part.dataset.state);
      if (animate && show && part.style.display === "none") {
        part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450 });
      }
      part.style.display = show ? "" : "none";
      if (part.classList.contains("state-circle")) part.classList.toggle("sim-current", part.dataset.state === `D${activeState}`);
    }
    for (const edge of graph.querySelectorAll(".edge-path")) {
      const labels = symbols.get(`${edge.dataset.from}:${edge.dataset.to}`);
      const label = edge.nextElementSibling;
      const active = latest && edge.dataset.from === `D${latest.from}` && edge.dataset.to === `D${latest.to}`;
      const appearing = edge.style.display === "none";
      edge.style.display = label.style.display = labels ? "" : "none";
      edge.classList.toggle("sim-edge", Boolean(active));
      if (!labels) continue;
      label.textContent = labels.join(", ");
      edge.querySelector("title").textContent = `${edge.dataset.from} on ${label.textContent} to ${edge.dataset.to}`;
      if (animate && active) {
        if (appearing) {
          const length = edge.getTotalLength();
          edge.style.strokeDasharray = String(length);
          edge.animate([{ strokeDashoffset: String(length) }, { strokeDashoffset: "0" }], { duration: 560, easing: "ease-out" });
        }
        label.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 550 });
      }
    }
    previousFrame = currentStep;
    byId("builtCount").textContent = `${visible.size} states · ${completed}/${dfa.transitions.length} transitions`;
  }

  function renderWalkthrough() {
    const completed = Math.floor(currentStep / 2);
    const moving = currentStep % 2 === 1;
    const set = states => escapeHtml(Algorithms.formatSet(states));
    const step = dfa.transitions[Math.ceil(currentStep / 2) - 1];
    let title, detail, activeState;
    if (!step) {
      activeState = 0;
      title = "Create the start state D0";
      detail = `ε-closure(${set(new Set([machine.start]))}) = ${set(dfa.subsets[0])}`;
    } else if (moving) {
      activeState = step.from;
      title = `Move from D${step.from} on “${escapeHtml(step.symbol)}”`;
      detail = `move(${set(dfa.subsets[step.from])}, ${escapeHtml(step.symbol)}) = ${set(step.move)}`;
    } else {
      activeState = step.to;
      title = `Take the ε-closure and connect D${step.from} → D${step.to}`;
      detail = `ε-closure(${set(step.move)}) = ${set(step.closure)} · D${step.from} on “${escapeHtml(step.symbol)}” → D${step.to}`;
    }
    const attributes = [];
    if (!dfa.subsets[activeState].size) attributes.push("trap");
    if (dfa.accepting[activeState]) attributes.push("accepting");
    if (activeState === 0) attributes.push("start");
    const status = attributes.length ? ` · ${attributes.join(", ")}` : "";
    const done = currentStep === lastFrame();
    byId("walkthrough").innerHTML = `<article class="step-card"><h3>${title}</h3><div class="formula"><span>${detail}</span><span class="destination">D${activeState} = ${set(dfa.subsets[activeState])}${status}</span></div>${done ? "<p>Construction complete. Every reachable subset has a transition for each alphabet symbol.</p>" : ""}</article>`;
    renderConstructionGraph(completed, activeState, moving ? null : step);
    byId("stepPosition").textContent = `Step ${currentStep + 1} of ${lastFrame() + 1}`;
    byId("previousStep").disabled = currentStep === 0;
    byId("restartSteps").disabled = currentStep === 0;
    byId("nextStep").disabled = done;
    byId("playSteps").disabled = lastFrame() === 0;
  }

  function clearSimulation() {
    clearWordRun();
    stopPlayback();
    byId("restartSteps").disabled = true;
    byId("builtCount").textContent = "";
    byId("stepPosition").textContent = "Step 0 of 0";
    byId("constructionDiagramZoom").textContent = "100%";
    byId("constructionDiagram").classList.add("empty-diagram");
    byId("constructionDiagram").textContent = "Convert an automaton to build its DFA.";
    byId("allSteps").hidden = true;
    byId("showAllSteps").textContent = "Show all";
  }

  function renderAllSteps() {
    byId("allSteps").innerHTML = dfa.steps.map((step, index) => {
      if (step.type === "state") return `<article class="step-card"><b>D${step.stateIndex}</b> = ${escapeHtml(Algorithms.formatSet(step.subset))}${step.stateIndex === 0 ? " (start subset)" : ""}</article>`;
      return `<article class="step-card"><b>${index + 1}. D${step.from}</b> on <b>${escapeHtml(step.symbol)}</b>: Move ${escapeHtml(Algorithms.formatSet(step.move))} → ε-closure ${escapeHtml(Algorithms.formatSet(step.closure))} → <b>D${step.to}</b></article>`;
    }).join("");
  }

  function convert() {
    clearSimulation();
    clearValidation();
    try {
      machine = parseInput();
      dfa = Algorithms.convertToDFA(machine);
      currentStep = 0;
      renderSummary();
      renderNfaDiagram();
      renderDfaDiagram();
      renderTable();
      renderWalkthrough();
      renderAllSteps();
      byId("allSteps").hidden = true;
      byId("testStringButton").disabled = false;
      byId("showAllSteps").disabled = false;
      setNotice(`Conversion complete: generated ${dfa.subsets.length} reachable DFA states.`);
    } catch (error) {
      machine = null;
      dfa = null;
      byId("testStringButton").disabled = true;
      byId("previousStep").disabled = true;
      byId("nextStep").disabled = true;
      byId("showAllSteps").disabled = true;
      byId("playSteps").disabled = true;
      byId("summary").textContent = "Correct the input and convert again.";
      byId("walkthrough").textContent = "No conversion is available until the input is valid.";
      byId("testResult").replaceChildren();
      reportError(error);
    }
  }

  function stepBy(amount) {
    if (!dfa) return;
    currentStep = Math.max(0, Math.min(lastFrame(), currentStep + amount));
    renderWalkthrough();
  }

  function stopPlayback() {
    if (playback !== null) {
      clearInterval(playback);
      playback = null;
    }
    if (byId("playSteps")) byId("playSteps").textContent = "▶ Play steps";
  }

  function togglePlayback() {
    if (playback !== null) {
      stopPlayback();
      return;
    }
    if (!dfa) return;
    if (currentStep >= lastFrame()) {
      currentStep = 0;
      renderWalkthrough();
    }
    byId("playSteps").textContent = "Ⅱ Pause";
    playback = setInterval(() => {
      if (currentStep >= lastFrame()) {
        stopPlayback();
        return;
      }
      stepBy(1);
      if (currentStep === lastFrame()) stopPlayback();
    }, 1100);
  }

  let wordRun = null;
  let symbolsRead = 0;
  let wordTimer;
  let drawnMachine;
  let drawnMode;
  let arrivalTimer;

  function clearTravel() {
    clearTimeout(arrivalTimer);
    for (const pulse of byId("wordDiagram").querySelectorAll(".word-pulse")) pulse.remove();
    byId("wordTape").classList.remove("in-motion");
  }

  function advanceWord() {
    if (!wordRun || symbolsRead >= wordRun.tokens.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      showWordFrame(symbolsRead + 1);
      return;
    }
    const graph = byId("wordDiagram");
    const source = wordRun.path[symbolsRead];
    const symbol = wordRun.tokens[symbolsRead];
    const dfaView = byId("wordMachine").value === "dfa";
    const duration = 460;
    byId("wordTape").classList.add("in-motion");
    for (const edge of graph.querySelectorAll(".edge-path")) {
      const { from, symbols } = edge.dataset;
      const fromActive = dfaView ? from === `D${source}` : dfa.subsets[source].has(from);
      if (!fromActive || !JSON.parse(symbols).includes(symbol)) continue;
      const pulse = svgElement("circle", { r: 4.5, class: "word-pulse" });
      const travel = svgElement("animateMotion", {
        path: edge.getAttribute("d"), dur: duration + "ms", begin: "indefinite", fill: "freeze"
      });
      pulse.appendChild(travel);
      graph.querySelector("svg").appendChild(pulse);
      travel.beginElement();
    }
    byId("wordNext").disabled = true;
    arrivalTimer = setTimeout(() => showWordFrame(symbolsRead + 1), duration);
  }

  function pauseWord() {
    clearTravel();
    if (wordRun) byId("wordNext").disabled = symbolsRead >= wordRun.tokens.length;
    clearInterval(wordTimer);
    wordTimer = null;
    byId("wordPlay").textContent = "Play";
  }

  function playWord() {
    pauseWord();
    if (!wordRun || !wordRun.tokens.length) return;
    if (symbolsRead === wordRun.tokens.length) showWordFrame(0);
    byId("wordPlay").textContent = "Pause";
    wordTimer = setInterval(advanceWord, 1100);
    advanceWord();
  }

  function paintWordDiagram(state, subset) {
    const graph = byId("wordDiagram");
    const mode = byId("wordMachine").value;
    if (machine !== drawnMachine || mode !== drawnMode) {
      if (mode === "dfa") renderDfaDiagram(graph);
      else renderNfaDiagram(graph);
      changeZoom(graph.id, "fit");
      drawnMachine = machine;
      drawnMode = mode;
    }
    const previous = wordRun.path[symbolsRead - 1];
    const symbol = wordRun.tokens[symbolsRead - 1];
    for (const node of graph.querySelectorAll(".state-circle")) {
      const active = mode === "dfa" ? node.dataset.name === `D${state}` : subset.has(node.dataset.name);
      node.classList.toggle("word-active", active);
    }
    for (const edge of graph.querySelectorAll(".edge-path")) {
      const { from, to, symbols } = edge.dataset;
      const labels = JSON.parse(symbols);
      const consumed = symbolsRead > 0 && labels.includes(symbol);
      const active = mode === "dfa"
        ? consumed && from === `D${previous}` && to === `D${state}`
        : (consumed && dfa.subsets[previous].has(from)) || (labels.includes("ε") && subset.has(from));
      edge.classList.toggle("word-edge", active);
    }
  }

  function clearWordRun() {
    pauseWord();
    wordRun = null;
    symbolsRead = 0;
    byId("wordRun").hidden = true;
    byId("testResult").replaceChildren();
  }

  function showWordFrame(position) {
    if (!wordRun) return;
    clearTravel();
    const { tokens, path } = wordRun;
    symbolsRead = Math.max(0, Math.min(position, tokens.length));
    const state = path[symbolsRead];
    const subset = dfa.subsets[state];
    const done = symbolsRead === tokens.length;
    paintWordDiagram(state, subset);
    byId("wordPlay").disabled = !tokens.length;
    if (done) pauseWord();
    const tape = byId("wordTape");
    for (let i = 0; i < tokens.length; i++) {
      tape.children[i].classList.toggle("read", i < symbolsRead);
      tape.children[i].classList.toggle("next", i === symbolsRead);
    }
    let heading = "Start at D0";
    let detail = "Follow ε transitions from the start state before reading any symbols.";
    if (symbolsRead > 0) {
      const previous = path[symbolsRead - 1];
      const symbol = tokens[symbolsRead - 1];
      const moved = Algorithms.move(dfa.subsets[previous], symbol, dfa.nfaTransitions);
      heading = `D${previous} → D${state} on “${symbol}”`;
      detail = `Move on “${symbol}” gives ${Algorithms.formatSet(moved)}. Its ε-closure is ${Algorithms.formatSet(subset)}.`;
      if (!subset.size) detail += " No NFA path remains. The DFA is in its trap state.";
    }
    const finals = new Set([...subset].filter(name => machine.finals.has(name)));
    const reason = done
      ? (finals.size ? `Accepted. All input has been read and the active subset contains accepting state(s) ${Algorithms.formatSet(finals)}.` : "Rejected. All input has been read and the active subset contains no accepting state.")
      : `Next symbol: “${tokens[symbolsRead]}”.`;
    if (byId("wordMachine").value === "nfa") heading = symbolsRead ? `Read “${tokens[symbolsRead - 1]}”` : "Start with the ε-closure";
    byId("wordFrame").innerHTML = `<small>${symbolsRead} of ${tokens.length} symbols read</small><h3>${escapeHtml(heading)}</h3><p>${escapeHtml(detail)}</p><p>Active states: D${state} = ${escapeHtml(Algorithms.formatSet(subset))}</p><strong>${escapeHtml(reason)}</strong>`;
    byId("testResult").innerHTML = done ? wordRun.summary : "";
    byId("wordBack").disabled = byId("wordRestart").disabled = symbolsRead === 0;
    byId("wordNext").disabled = done;
  }

  function runStringTest() {
    clearWordRun();
    if (!machine || !dfa) return;
    const word = byId("stringInput").value.trim();
    const nfaResult = Algorithms.acceptsNFA(word, machine, dfa.nfaTransitions);
    if (!nfaResult.valid) {
      byId("testResult").innerHTML = '<div class="result-banner failure">Input contains a symbol outside the declared alphabet.</div>';
      return;
    }
    const dfaResult = Algorithms.acceptsDFA(word, dfa, machine.alphabet);
    const agrees = nfaResult.accepted === dfaResult.accepted;
    const verdict = dfaResult.accepted ? "Accepted" : "Rejected";
    const tokens = Algorithms.tokenizeInput(word, machine.alphabet);
    wordRun = { tokens, path: dfaResult.path };
    byId("wordTape").innerHTML = tokens.length
      ? tokens.map(token => `<span>${escapeHtml(token)}</span>`).join("")
      : "<span>ε · empty input</span>";
    byId("wordRun").hidden = false;
    wordRun.summary = `<div class="result-banner ${agrees && dfaResult.accepted ? "success" : "failure"}"><strong>${verdict}</strong> · ε-NFA ${nfaResult.accepted ? "accepts" : "rejects"} · DFA ${dfaResult.accepted ? "accepts" : "rejects"}</div>`;
    showWordFrame(0);
    playWord();
  }

  const examples = {
    basic: { states: "q0, q1, q2", alphabet: "a, b", start: "q0", finals: "q2", transitions: "q0, eps, q1\nq1, a, q1\nq1, b, q2\nq2, b, q2", test: "ab", label: "Basic epsilon-closure case loaded." },
    branching: { states: "s, p, q, f", alphabet: "a, b", start: "s", finals: "f", transitions: "s, eps, p\ns, eps, q\np, a, f\nq, b, f", test: "a", label: "Epsilon-branching case loaded." },
    cycle: { states: "p, q, r, f", alphabet: "1, 0", start: "p", finals: "f", transitions: "p, eps, q\nq, eps, p\nq, 1, r\nr, 0, f", test: "10", label: "Epsilon-cycle case loaded." },
    trap: { states: "u, v, w", alphabet: "a, b", start: "u", finals: "w", transitions: "u, a, v\nv, b, w", test: "ab", label: "Trap-state case loaded." },
    suffix: {
      states: "s, scan, lastA, end", alphabet: "a, b", start: "s", finals: "end",
      transitions: "s, eps, scan\nscan, a, scan\nscan, b, scan\nscan, a, lastA\nlastA, b, end",
      test: "babaab", label: "Ends in ab accepts ab, bab and babaab. Try aba or abb for rejection."
    },
    parity: {
      states: "s, even, odd", alphabet: "0, 1", start: "s", finals: "even",
      transitions: "s, eps, even\neven, 0, even\neven, 1, odd\nodd, 0, odd\nodd, 1, even",
      test: "10100101", label: "Even number of 1s accepts 000, 101 and 10100101. Try 10 or 111 for rejection."
    }
  };

  function loadExample(name) {
    const example = examples[name];
    if (!example) return;
    clearSimulation();
    byId("statesInput").value = example.states;
    byId("alphabetInput").value = example.alphabet;
    byId("startInput").value = example.start;
    byId("finalsInput").value = example.finals;
    byId("transitionsInput").value = example.transitions;
    byId("stringInput").value = example.test;
    machine = null;
    dfa = null;
    byId("validation").hidden = true;
    byId("testStringButton").disabled = true;
    byId("previousStep").disabled = true;
    byId("nextStep").disabled = true;
    byId("showAllSteps").disabled = true;
    byId("playSteps").disabled = true;
    byId("summary").textContent = "Example loaded. Convert it to view the DFA.";
    byId("summary").className = "summary empty-state";
    byId("dfaSubsets").textContent = "Subsets appear after conversion.";
    byId("dfaSubsets").className = "subset-cards empty-state";
    byId("dfaTable").querySelector("thead").replaceChildren();
    byId("dfaTable").querySelector("tbody").replaceChildren();
    byId("walkthrough").textContent = "Convert this example to explore its construction steps.";
    byId("allSteps").replaceChildren();
    byId("allSteps").hidden = true;
    byId("testResult").replaceChildren();
    for (const id of ["nfaDiagram", "dfaDiagram"]) {
      byId(id).replaceChildren();
      byId(id).classList.add("empty-diagram");
      byId(id).textContent = "Convert this example to show its diagram.";
      byId(`${id}Zoom`).textContent = "100%";
    }
    setNotice(`${example.label} Click Convert automaton when ready.`);
    document.querySelectorAll("[data-example]").forEach(button => button.classList.toggle("selected", button.dataset.example === name));
  }

  byId("convertButton").addEventListener("click", convert);
  byId("openHandbook").addEventListener("click", () => {
    stopPlayback();
    byId("handbook").showModal();
  });
  byId("loadSample").addEventListener("click", () => loadExample("basic"));
  document.querySelectorAll("[data-example]").forEach(button => {
    button.addEventListener("click", () => loadExample(button.dataset.example));
  });
  document.querySelectorAll("[data-graph][data-zoom]").forEach(button => {
    button.addEventListener("click", () => changeZoom(button.dataset.graph, button.dataset.zoom));
  });
  enablePan("nfaDiagram");
  enablePan("dfaDiagram");
  enablePan("constructionDiagram");
  byId("restartSteps").addEventListener("click", () => { stopPlayback(); currentStep = 0; renderWalkthrough(); });
  byId("previousStep").addEventListener("click", () => { stopPlayback(); stepBy(-1); });
  byId("nextStep").addEventListener("click", () => { stopPlayback(); stepBy(1); });
  byId("showAllSteps").addEventListener("click", () => {
    byId("allSteps").hidden = !byId("allSteps").hidden;
    byId("showAllSteps").textContent = byId("allSteps").hidden ? "Show all" : "Hide all";
  });
  byId("playSteps").addEventListener("click", togglePlayback);
  byId("testStringButton").addEventListener("click", runStringTest);
  enablePan("wordDiagram");
  byId("wordMachine").addEventListener("change", () => showWordFrame(symbolsRead));
  byId("wordPlay").addEventListener("click", () => wordTimer ? pauseWord() : playWord());
  byId("wordNext").addEventListener("click", () => { pauseWord(); advanceWord(); });
  byId("wordBack").addEventListener("click", () => { pauseWord(); showWordFrame(symbolsRead - 1); });
  byId("wordRestart").addEventListener("click", () => { pauseWord(); showWordFrame(0); });
  byId("stringInput").addEventListener("input", clearWordRun);
  byId("convertButton").addEventListener("keydown", event => {
    if (event.key === "Enter") convert();
  });

})();
