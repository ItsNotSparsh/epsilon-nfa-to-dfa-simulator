/* Page input, validation, rendering, and string-check controls. */
(() => {
  "use strict";

  const { formatSet, transitionKey, tokenizeInput, convertToDFA, acceptsNFA } = window.AutomataAlgorithms;
  const byId = id => document.getElementById(id);
  const svgNamespace = "http://www.w3.org/2000/svg";
  const graphView = new Map();
  let current = null;

  function parseAutomaton() {
    const splitList = value => value.split(",").map(item => item.trim()).filter(Boolean);
    const states = splitList(byId("states").value);
    const alphabet = splitList(byId("alphabet").value);
    const start = byId("start").value.trim();
    const finals = splitList(byId("finals").value);

    if (!states.length || new Set(states).size !== states.length) {
      throw new Error("States must be non-empty and unique.");
    }
    if (new Set(alphabet).size !== alphabet.length ||
        alphabet.some(symbol => /[\s,]/u.test(symbol) || symbol === "eps" || symbol === "ε")) {
      throw new Error("Use unique symbols without spaces or commas. eps and ε are reserved for epsilon transitions.");
    }
    if (!states.includes(start)) throw new Error("Start state must be declared in States.");
    for (const state of finals) {
      if (!states.includes(state)) throw new Error(`Final state “${state}” is not declared.`);
    }

    const transitions = new Map();
    const transitionList = [];
    const lines = byId("transitions").value.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const parts = line.split(",").map(item => item.trim());
      if (parts.length !== 3 || parts.some(item => !item)) {
        throw new Error(`Transition line ${index + 1} must be: source, symbol, destination.`);
      }
      const [from, symbol, to] = parts;
      if (!states.includes(from) || !states.includes(to)) {
        throw new Error(`Transition line ${index + 1} uses an undeclared state.`);
      }
      if (symbol !== "eps" && !alphabet.includes(symbol)) {
        throw new Error(`Transition line ${index + 1} uses undeclared symbol “${symbol}”.`);
      }
      const key = transitionKey(from, symbol);
      if (!transitions.has(key)) transitions.set(key, new Set());
      transitions.get(key).add(to);
      transitionList.push({ from, symbol, to });
    });

    return { states, alphabet, start, finals: new Set(finals), transitions, transitionList };
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(svgNamespace, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function layoutNodes(nodes, edges, startName) {
    const ranks = new Map([[startName, 0]]);
    const outgoing = new Map(nodes.map(name => [name, []]));
    for (const edge of edges) outgoing.get(edge.from)?.push(edge.to);
    const queue = [startName];
    for (let index = 0; index < queue.length; index += 1) {
      const state = queue[index];
      for (const target of outgoing.get(state) || []) {
        if (!ranks.has(target)) { ranks.set(target, ranks.get(state) + 1); queue.push(target); }
      }
    }
    const lastRank = Math.max(0, ...ranks.values());
    for (const name of nodes) if (!ranks.has(name)) ranks.set(name, lastRank + 1);
    const layers = new Map();
    for (const name of nodes) {
      const rank = ranks.get(name);
      if (!layers.has(rank)) layers.set(rank, []);
      layers.get(rank).push(name);
    }
    const rowGap = 116;
    const rankGap = 190;
    const maxRows = Math.max(1, ...[...layers.values()].map(layer => layer.length));
    const height = Math.max(300, 170 + maxRows * rowGap);
    const centerY = height / 2;
    const positions = new Map();
    for (const [rank, layer] of layers) {
      layer.forEach((name, index) => positions.set(name, {
        x: 104 + rank * rankGap,
        y: centerY + (index - (layer.length - 1) / 2) * rowGap
      }));
    }
    return { positions, width: Math.max(430, 220 + Math.max(...layers.keys()) * rankGap), height };
  }

  function renderDiagram(containerId, nodes, edges, startName, finalNames, trapNames = new Set()) {
    const container = byId(containerId);
    container.replaceChildren();
    container.classList.remove("empty-diagram");
    const { positions, width, height } = layoutNodes(nodes, edges, startName);
    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${containerId === "nfaDiagram" ? "Input epsilon-NFA" : "Generated DFA"} diagram` });
    svg.dataset.baseWidth = String(width);
    svg.dataset.baseHeight = String(height);
    const defs = svgElement("defs");
    const marker = svgElement("marker", { id: `arrow-${containerId}`, markerWidth: 12, markerHeight: 11, refX: 10, refY: 5.5, orient: "auto", markerUnits: "userSpaceOnUse" });
    marker.appendChild(svgElement("path", { d: "M0,0 L0,11 L12,5.5 z", fill: "#72849a" }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    const grouped = new Map();
    for (const edge of edges) {
      const key = `${edge.from}\u0000${edge.to}`;
      if (!grouped.has(key)) grouped.set(key, { from: edge.from, to: edge.to, labels: [] });
      grouped.get(key).labels.push(edge.symbol === "eps" ? "ε" : edge.symbol);
    }
    const outgoing = new Map();
    const loopDirections = new Map();
    for (const edge of grouped.values()) {
      const source = positions.get(edge.from);
      const target = positions.get(edge.to);
      if (!source || !target) continue;
      let pathData;
      let labelX = source.x;
      let labelY;
      if (edge.from === edge.to) {
        const verticalNeighbors = [...positions.values()].filter(point => point.x === source.x && point.y !== source.y);
        const aboveGap = Math.min(Infinity, ...verticalNeighbors.filter(point => point.y < source.y).map(point => source.y - point.y));
        const belowGap = Math.min(Infinity, ...verticalNeighbors.filter(point => point.y > source.y).map(point => point.y - source.y));
        const direction = aboveGap > belowGap ? -1 : 1;
        loopDirections.set(edge.from, direction);
        pathData = `M ${source.x - 15} ${source.y + direction * 20} C ${source.x - 66} ${source.y + direction * 108}, ${source.x + 66} ${source.y + direction * 108}, ${source.x + 15} ${source.y + direction * 20}`;
        labelY = source.y + direction * 98;
      } else {
        const order = outgoing.get(edge.from) || 0;
        outgoing.set(edge.from, order + 1);
        const side = order % 2 === 0 ? -1 : 1;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.hypot(dx, dy) || 1;
        const ux = dx / distance, uy = dy / distance;
        const px = -uy, py = ux;
        const lane = side * (26 + Math.floor(order / 2) * 24);
        const sx = source.x + ux * 24, sy = source.y + uy * 24;
        const ex = target.x - ux * 25, ey = target.y - uy * 25;
        const c1x = sx + ux * 44 + px * lane, c1y = sy + uy * 44 + py * lane;
        const c2x = ex - ux * 44 + px * lane, c2y = ey - uy * 44 + py * lane;
        pathData = `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`;
        labelX = (sx + 3 * c1x + 3 * c2x + ex) / 8 + px * Math.sign(lane) * 22;
        labelY = (sy + 3 * c1y + 3 * c2y + ey) / 8 + py * Math.sign(lane) * 22;
      }
      const path = svgElement("path", { d: pathData, class: "m1-edge", "marker-end": `url(#arrow-${containerId})` });
      const title = svgElement("title");
      title.textContent = `${edge.from} on ${edge.symbol} to ${edge.to}`;
      path.appendChild(title);
      svg.appendChild(path);
      const length = path.getTotalLength();
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      requestAnimationFrame(() => path.classList.add("m1-edge-visible"));
      const label = svgElement("text", { x: labelX, y: labelY, class: "m1-edge-label" });
      label.textContent = [...new Set(edge.labels)].join(", ");
      svg.appendChild(label);
    }

    const start = positions.get(startName);
    if (start) svg.appendChild(svgElement("path", { d: `M ${start.x - 48} ${start.y} L ${start.x - 26} ${start.y}`, class: "m1-start-arrow", "marker-end": `url(#arrow-${containerId})` }));
    for (const [index, name] of nodes.entries()) {
      const point = positions.get(name);
      const final = finalNames.has(name);
      const trap = trapNames.has(name);
      const circle = svgElement("circle", { cx: point.x, cy: point.y, r: 22, class: `m1-state ${name === startName ? "m1-start-state" : ""} ${final ? "m1-final-state" : ""} ${trap ? "m1-trap-state" : ""}` });
      circle.style.animationDelay = `${index * 80}ms`;
      svg.appendChild(circle);
      if (final) svg.appendChild(svgElement("circle", { cx: point.x, cy: point.y, r: 17, class: "m1-final-ring" }));
      const text = svgElement("text", { x: point.x, y: point.y, class: "m1-state-label" });
      text.textContent = name;
      text.style.animationDelay = `${index * 80}ms`;
      svg.appendChild(text);
      if (trap) {
        const trapY = loopDirections.get(name) === 1 ? point.y + 128 : point.y + 39;
        const trapText = svgElement("text", { x: point.x, y: trapY, class: "m1-trap-label" });
        trapText.textContent = "trap";
        svg.appendChild(trapText);
      }
    }
    container.appendChild(svg);
    graphView.set(containerId, { scale: 1, x: 0, y: 0 });
    applyZoom(containerId, 1);
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
    byId(`${graphId}Zoom`).textContent = `${Math.round(scale * 100)}%`;
  }

  function changeZoom(graphId, action) {
    const container = byId(graphId);
    const svg = container.querySelector("svg");
    if (!svg) return;
    const view = graphView.get(graphId) || { scale: 1, x: 0, y: 0 };
    let scale = view.scale;
    if (action === "fit") scale = Math.min(1, (container.clientWidth - 20) / Number(svg.dataset.baseWidth), (container.clientHeight - 20) / Number(svg.dataset.baseHeight));
    else scale = Math.max(.4, Math.min(2.5, scale + (action === "in" ? .05 : -.05)));
    if (action !== "fit") {
      const centerX = container.clientWidth / 2, centerY = container.clientHeight / 2;
      const ratio = scale / view.scale;
      view.x = centerX - (centerX - view.x) * ratio;
      view.y = centerY - (centerY - view.y) * ratio;
    } else { view.x = 0; view.y = 0; }
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

  function showError(message) {
    byId("error").innerHTML = `<div class="error">${message}</div>`;
  }

  function renderDFA() {
    try {
      byId("error").innerHTML = "";
      const automaton = parseAutomaton();
      const dfa = convertToDFA(automaton);
      current = { automaton, dfa };
      byId("test").disabled = false;
      const nfaEdges = automaton.transitionList;
      const dfaEdges = dfa.transitions.map(({ from, symbol, to }) => ({ from, symbol, to }));
      const dfaNames = dfa.subsets.map((_, index) => `D${index}`);
      const dfaFinals = new Set(dfaNames.filter((_, index) => dfa.accepting[index]));
      const dfaTraps = new Set(dfaNames.filter((_, index) => dfa.subsets[index].size === 0));
      renderDiagram("nfaDiagram", automaton.states, nfaEdges, automaton.start, automaton.finals);
      renderDiagram("dfaDiagram", dfaNames, dfaEdges, "D0", dfaFinals, dfaTraps);

      const acceptingCount = dfa.accepting.filter(Boolean).length;
      byId("summary").innerHTML = `
        <div class="stat"><b>${dfa.subsets.length}</b><span>reachable DFA states</span></div>
        <div class="stat"><b>${acceptingCount}</b><span>accepting subsets</span></div>
        <div class="stat"><b>${automaton.alphabet.length}</b><span>input symbols</span></div>`;

      byId("subsets").innerHTML = dfa.subsets.map((subset, index) => `
        <span class="subset ${index === 0 ? "start" : ""} ${dfa.accepting[index] ? "final" : ""} ${subset.size === 0 ? "trap" : ""}">
          <b>D${index}</b> = ${formatSet(subset)}${index === 0 ? " · start" : ""}${dfa.accepting[index] ? " · final" : ""}${subset.size === 0 ? " · trap" : ""}
        </span>`).join("");

      const headings = automaton.alphabet.map(symbol => `<th>${symbol}</th>`).join("");
      const rows = dfa.subsets.map((subset, index) => {
        const cells = automaton.alphabet.map(symbol => {
          const transition = dfa.transitions.find(row => row.from === `D${index}` && row.symbol === symbol);
          return `<td>${transition.to}</td>`;
        }).join("");
        const stateName = `<b>D${index}</b> = ${formatSet(subset)}`;
        const labels = `${index === 0 ? "↤ start" : ""} ${dfa.accepting[index] ? '<span class="badge">final</span>' : ""}${subset.size === 0 ? ' <span class="trap-badge">trap</span>' : ""}`;
        return `<tr><td>${stateName} ${labels}</td>${cells}</tr>`;
      }).join("");
      byId("table").innerHTML = `<table><thead><tr><th>DFA state</th>${headings}</tr></thead><tbody>${rows}</tbody></table>`;

      byId("trace").innerHTML = dfa.trace.map(event => {
        if (event.type === "state") {
          return `<div class="step"><b>${event.name} subset</b> = ${formatSet(event.subset)}</div>`;
        }
        return `<div class="step"><b>${event.from} = ${formatSet(event.subset)}</b> on <b>${event.symbol}</b>:
          Move = ${formatSet(event.move)}; E(Move) = ${formatSet(event.destination)} → <b>${event.to}</b></div>`;
      }).join("");
      return true;
    } catch (error) {
      current = null;
      byId("test").disabled = true;
      showError(error.message);
      return false;
    }
  }

  function checkString() {
    if (!current) {
      byId("testResult").textContent = "Convert the selected automaton first.";
      byId("testResult").className = "result no";
      return;
    }
    const { automaton, dfa } = current;
    const word = byId("testString").value.trim();
    let stateIndex = 0;
    const path = [`D0 = ${formatSet(dfa.subsets[0])}`];

    const tokens = tokenizeInput(word, automaton.alphabet);
    for (const symbol of tokens) {
      if (!automaton.alphabet.includes(symbol)) {
        byId("testResult").textContent = "Input contains a symbol outside the alphabet.";
        byId("testResult").className = "result no";
        return;
      }
      const transition = dfa.transitions.find(
        row => row.from === `D${stateIndex}` && row.symbol === symbol
      );
      stateIndex = Number(transition.to.slice(1));
      path.push(`D${stateIndex} = ${formatSet(dfa.subsets[stateIndex])}`);
    }

    const dfaAccepts = dfa.accepting[stateIndex];
    const nfaResult = acceptsNFA(tokens, automaton);
    const matches = dfaAccepts === nfaResult.accepted;
    byId("testResult").textContent = `${dfaAccepts ? "Accepted" : "Rejected"} · NFA and DFA ${matches ? "agree" : "DIFFER"}`;
    byId("testResult").className = `result ${matches ? "ok" : "no"}`;
    byId("path").textContent = `DFA path: ${path.join(" → ")}`;
  }

  const examples = {
    basic: { states: "q0, q1, q2", alphabet: "a, b", start: "q0", finals: "q2", transitions: "q0, eps, q1\nq1, a, q1\nq1, b, q2\nq2, b, q2", test: "ab", label: "Basic epsilon-closure case loaded." },
    branching: { states: "s, p, q, f", alphabet: "a, b", start: "s", finals: "f", transitions: "s, eps, p\ns, eps, q\np, a, f\nq, b, f", test: "a", label: "Epsilon-branching case loaded." },
    cycle: { states: "p, q, r, f", alphabet: "1, 0", start: "p", finals: "f", transitions: "p, eps, q\nq, eps, p\nq, 1, r\nr, 0, f", test: "10", label: "Epsilon-cycle case loaded." },
    trap: { states: "u, v, w", alphabet: "a, b", start: "u", finals: "w", transitions: "u, a, v\nv, b, w", test: "ab", label: "Trap-state case loaded." }
  };

  function loadExample(name) {
    const example = examples[name];
    if (!example) return;
    byId("states").value = example.states;
    byId("alphabet").value = example.alphabet;
    byId("start").value = example.start;
    byId("finals").value = example.finals;
    byId("transitions").value = example.transitions;
    byId("testString").value = example.test;
    current = null;
    byId("test").disabled = true;
    byId("error").innerHTML = `<div class="preset-info">${example.label} Click Convert to DFA when ready.</div>`;
    byId("summary").replaceChildren();
    byId("subsets").replaceChildren();
    byId("table").replaceChildren();
    byId("trace").replaceChildren();
    byId("testResult").textContent = "";
    byId("path").textContent = "";
    for (const id of ["nfaDiagram", "dfaDiagram"]) {
      byId(id).replaceChildren();
      byId(id).classList.add("empty-diagram");
      byId(id).textContent = "Convert this example to show its diagram.";
      byId(`${id}Zoom`).textContent = "100%";
    }
    document.querySelectorAll("[data-example]").forEach(button => button.classList.toggle("selected", button.dataset.example === name));
  }

  byId("convert").addEventListener("click", renderDFA);
  byId("test").addEventListener("click", checkString);
  document.querySelectorAll("[data-example]").forEach(button => {
    button.addEventListener("click", () => loadExample(button.dataset.example));
  });
  document.querySelectorAll("[data-graph][data-zoom]").forEach(button => {
    button.addEventListener("click", () => changeZoom(button.dataset.graph, button.dataset.zoom));
  });
  enablePan("nfaDiagram");
  enablePan("dfaDiagram");
})();
