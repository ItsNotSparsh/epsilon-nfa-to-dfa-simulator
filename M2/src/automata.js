/* Pure epsilon-NFA algorithms. Exports for both browser and Node test runner. */
(function exposeAutomataAlgorithms(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.AutomataAlgorithms = api;
})(typeof window !== "undefined" ? window : globalThis, function createAlgorithms() {
  "use strict";

  function keyOf(stateSet) {
    return JSON.stringify([...stateSet].sort());
  }

  function formatSet(stateSet) {
    return stateSet.size ? `{${[...stateSet].sort().join(", ")}}` : "∅";
  }

  function validateAutomaton(machine) {
    const errors = [];
    if (!machine.states.length) errors.push("Add at least one state.");
    if (new Set(machine.states).size !== machine.states.length) errors.push("State names must be unique.");
    if (new Set(machine.alphabet).size !== machine.alphabet.length) errors.push("Alphabet symbols must be unique.");
    if (machine.alphabet.some(symbol => !symbol || /[\s,]/u.test(symbol) || symbol === "ε" || symbol === "eps")) {
      errors.push("Alphabet symbols cannot be empty, contain spaces or commas, or use the reserved epsilon labels eps/ε.");
    }
    if (!machine.states.includes(machine.start)) errors.push("The start state must be one of the declared states.");
    for (const state of machine.finals) {
      if (!machine.states.includes(state)) errors.push(`Accepting state “${state}” is not declared.`);
    }
    for (const transition of machine.transitions) {
      if (!machine.states.includes(transition.from) || !machine.states.includes(transition.to)) {
        errors.push(`Transition ${transition.line} uses a state that is not declared.`);
      }
      if (transition.symbol !== "eps" && !machine.alphabet.includes(transition.symbol)) {
        errors.push(`Transition ${transition.line} uses undeclared input symbol “${transition.symbol}”.`);
      }
    }
    return errors;
  }

  function makeTransitionMap(transitions) {
    const map = new Map();
    for (const { from, symbol, to } of transitions) {
      if (!map.has(from)) map.set(from, new Map());
      const bySymbol = map.get(from);
      if (!bySymbol.has(symbol)) bySymbol.set(symbol, new Set());
      bySymbol.get(symbol).add(to);
    }
    return map;
  }

  function epsilonClosure(states, transitionMap) {
    const closure = new Set(states);
    const stack = [...states];
    while (stack.length) {
      const state = stack.pop();
      const targets = transitionMap.get(state)?.get("eps") || [];
      for (const target of targets) {
        if (!closure.has(target)) {
          closure.add(target);
          stack.push(target);
        }
      }
    }
    return closure;
  }

  function move(states, symbol, transitionMap) {
    const destinations = new Set();
    for (const state of states) {
      const targets = transitionMap.get(state)?.get(symbol) || [];
      for (const target of targets) destinations.add(target);
    }
    return destinations;
  }

  function convertToDFA(machine, options = {}) {
    const errors = validateAutomaton(machine);
    if (errors.length) throw new Error(errors.join("\n"));
    const maximumStates = options.maxDfaStates ?? 2048;

    const nfaTransitions = makeTransitionMap(machine.transitions);
    const startSubset = epsilonClosure(new Set([machine.start]), nfaTransitions);
    const subsets = [startSubset];
    const subsetIndices = new Map([[keyOf(startSubset), 0]]);
    const transitions = [];
    const steps = [];

    for (let currentIndex = 0; currentIndex < subsets.length; currentIndex += 1) {
      const current = subsets[currentIndex];
      steps.push({ type: "state", stateIndex: currentIndex, subset: current });
      for (const symbol of machine.alphabet) {
        const moved = move(current, symbol, nfaTransitions);
        const closed = epsilonClosure(moved, nfaTransitions);
        const key = keyOf(closed);
        let destinationIndex = subsetIndices.get(key);
        if (destinationIndex === undefined) {
          if (subsets.length >= maximumStates) {
            throw new Error(`Conversion stopped at ${maximumStates} DFA states to protect the browser. Try a smaller NFA.`);
          }
          destinationIndex = subsets.length;
          subsetIndices.set(key, destinationIndex);
          subsets.push(closed);
        }
        const transition = { from: currentIndex, symbol, move: moved, closure: closed, to: destinationIndex };
        transitions.push(transition);
        steps.push({ type: "transition", ...transition, sourceSubset: current });
      }
    }

    const accepting = subsets.map(subset => [...subset].some(state => machine.finals.has(state)));
    return { subsets, transitions, accepting, start: 0, steps, nfaTransitions };
  }

  function tokenizeInput(input, alphabet) {
    const text = String(input).trim();
    if (!text) return [];
    const hasSeparators = /[,\s]/u.test(text);
    if (hasSeparators) return text.split(/[\s,]+/u).filter(Boolean);
    if (alphabet.includes(text)) return [text];
    return [...text];
  }

  function acceptsNFA(input, machine, nfaTransitions = makeTransitionMap(machine.transitions)) {
    const word = Array.isArray(input) ? input : tokenizeInput(input, machine.alphabet);
    let current = epsilonClosure(new Set([machine.start]), nfaTransitions);
    for (const symbol of word) {
      if (!machine.alphabet.includes(symbol)) return { valid: false, accepted: false, finalStates: current };
      current = epsilonClosure(move(current, symbol, nfaTransitions), nfaTransitions);
    }
    return {
      valid: true,
      accepted: [...current].some(state => machine.finals.has(state)),
      finalStates: current
    };
  }

  function acceptsDFA(input, dfa, alphabet) {
    const word = Array.isArray(input) ? input : tokenizeInput(input, alphabet);
    let state = dfa.start;
    const path = [state];
    for (const symbol of word) {
      if (!alphabet.includes(symbol)) return { valid: false, accepted: false, path };
      const transition = dfa.transitions.find(item => item.from === state && item.symbol === symbol);
      if (!transition) throw new Error(`DFA is incomplete at state D${state} on ${symbol}.`);
      state = transition.to;
      path.push(state);
    }
    return { valid: true, accepted: dfa.accepting[state], path, finalState: state };
  }

  return { keyOf, formatSet, validateAutomaton, makeTransitionMap, epsilonClosure, move, convertToDFA, tokenizeInput, acceptsNFA, acceptsDFA };
});
