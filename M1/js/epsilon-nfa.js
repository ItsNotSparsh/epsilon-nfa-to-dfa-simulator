/* Core epsilon-NFA algorithms. This file has no dependency on the page UI. */
(function exposeAutomataAlgorithms(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.AutomataAlgorithms = api;
})(typeof window !== "undefined" ? window : globalThis, function createAlgorithms() {
  "use strict";

  function setKey(states) {
    return JSON.stringify([...states].sort());
  }

  function formatSet(states) {
    return states.size ? `{${[...states].sort().join(", ")}}` : "∅";
  }

  function transitionKey(state, symbol) {
    return JSON.stringify([state, symbol]);
  }

  function tokenizeInput(input, alphabet) {
    const text = String(input).trim();
    if (!text) return [];
    if (/[,\s]/u.test(text)) return text.split(/[\s,]+/u).filter(Boolean);
    if (alphabet.includes(text)) return [text];
    return [...text];
  }

  // Return all states reachable from the supplied states using zero or more eps edges.
  function epsilonClosure(states, automaton) {
    const closure = new Set(states);
    const worklist = [...states];

    while (worklist.length > 0) {
      const state = worklist.pop();
      const epsilonTargets = automaton.transitions.get(transitionKey(state, "eps")) || new Set();
      for (const target of epsilonTargets) {
        if (!closure.has(target)) {
          closure.add(target);
          worklist.push(target);
        }
      }
    }
    return closure;
  }

  function move(states, symbol, automaton) {
    const destinations = new Set();
    for (const state of states) {
      const targets = automaton.transitions.get(transitionKey(state, symbol)) || new Set();
      for (const target of targets) destinations.add(target);
    }
    return destinations;
  }

  // Breadth-first subset construction. Each row keeps Move and closure for teaching trace.
  function convertToDFA(automaton, options = {}) {
    const maximumStates = options.maxDfaStates ?? 2048;
    const startSubset = epsilonClosure(new Set([automaton.start]), automaton);
    const subsets = [startSubset];
    const discovered = new Set([setKey(startSubset)]);
    const transitions = [];
    const trace = [];

    for (let index = 0; index < subsets.length; index += 1) {
      const current = subsets[index];
      const currentName = `D${index}`;
      trace.push({ type: "state", name: currentName, subset: current });

      for (const symbol of automaton.alphabet) {
        const moved = move(current, symbol, automaton);
        const destination = epsilonClosure(moved, automaton);
        const destinationKey = setKey(destination);

        if (!discovered.has(destinationKey)) {
          if (subsets.length >= maximumStates) {
            throw new Error(`Conversion stopped at ${maximumStates} DFA states to protect the browser. Try a smaller NFA.`);
          }
          discovered.add(destinationKey);
          subsets.push(destination);
        }

        const destinationIndex = subsets.findIndex(
          subset => setKey(subset) === destinationKey
        );
        const row = {
          from: currentName,
          subset: current,
          symbol,
          move: moved,
          destination,
          to: `D${destinationIndex}`
        };
        transitions.push(row);
        trace.push({ type: "transition", ...row });
      }
    }

    const accepting = subsets.map(subset =>
      [...subset].some(state => automaton.finals.has(state))
    );
    return { subsets, transitions, accepting, startSubset, trace };
  }

  function acceptsNFA(input, automaton) {
    const word = Array.isArray(input) ? input : tokenizeInput(input, automaton.alphabet);
    let current = epsilonClosure(new Set([automaton.start]), automaton);
    for (const symbol of word) {
      if (!automaton.alphabet.includes(symbol)) return { valid: false, accepted: false };
      current = epsilonClosure(move(current, symbol, automaton), automaton);
    }
    return {
      valid: true,
      accepted: [...current].some(state => automaton.finals.has(state))
    };
  }

  function acceptsDFA(input, dfa, alphabet) {
    const word = Array.isArray(input) ? input : tokenizeInput(input, alphabet);
    let state = "D0";
    const path = [state];
    for (const symbol of word) {
      if (!alphabet.includes(symbol)) return { valid: false, accepted: false, path };
      const transition = dfa.transitions.find(row => row.from === state && row.symbol === symbol);
      if (!transition) throw new Error(`DFA has no transition from ${state} on ${symbol}.`);
      state = transition.to;
      path.push(state);
    }
    const index = Number(state.slice(1));
    return { valid: true, accepted: dfa.accepting[index], path };
  }

  return { setKey, formatSet, transitionKey, tokenizeInput, epsilonClosure, move, convertToDFA, acceptsNFA, acceptsDFA };
});
