const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../src/automata.js");

function machine({ states, alphabet, start, finals, transitions }) {
  return {
    states,
    alphabet,
    start,
    finals: new Set(finals),
    transitions: transitions.map((entry, index) => ({ ...entry, line: index + 1 }))
  };
}

const sample = machine({
  states: ["q0", "q1", "q2"], alphabet: ["a", "b"], start: "q0", finals: ["q2"],
  transitions: [
    { from: "q0", symbol: "eps", to: "q1" },
    { from: "q1", symbol: "a", to: "q1" },
    { from: "q1", symbol: "b", to: "q2" },
    { from: "q2", symbol: "b", to: "q2" }
  ]
});

test("epsilon closure follows a chain and terminates on a cycle", () => {
  const cyclic = machine({
    states: ["p", "q", "r"], alphabet: ["a"], start: "p", finals: [],
    transitions: [
      { from: "p", symbol: "eps", to: "q" },
      { from: "q", symbol: "eps", to: "p" },
      { from: "q", symbol: "eps", to: "r" }
    ]
  });
  const map = A.makeTransitionMap(cyclic.transitions);
  assert.deepEqual([...A.epsilonClosure(new Set(["p"]), map)].sort(), ["p", "q", "r"]);
});

test("subset construction produces the manually checked four-state DFA", () => {
  const dfa = A.convertToDFA(sample);
  assert.equal(dfa.subsets.length, 4);
  assert.equal(A.formatSet(dfa.subsets[0]), "{q0, q1}");
  assert.equal(A.formatSet(dfa.subsets[1]), "{q1}");
  assert.equal(A.formatSet(dfa.subsets[2]), "{q2}");
  assert.equal(A.formatSet(dfa.subsets[3]), "∅");
  assert.deepEqual(dfa.accepting, [false, false, true, false]);
  assert.equal(dfa.transitions.length, 8);
});

test("DFA is total and the empty subset loops to itself", () => {
  const dfa = A.convertToDFA(sample);
  for (const symbol of sample.alphabet) {
    const loop = dfa.transitions.find(t => t.from === 3 && t.symbol === symbol);
    assert.equal(loop.to, 3);
  }
});

test("NFA and DFA agree on accepted, rejected, and empty strings", () => {
  const dfa = A.convertToDFA(sample);
  for (const [word, expected] of [["ab", true], ["b", true], ["a", false], ["ba", false], ["", false]]) {
    assert.equal(A.acceptsNFA(word, sample, dfa.nfaTransitions).accepted, expected, `NFA ${JSON.stringify(word)}`);
    assert.equal(A.acceptsDFA(word, dfa, sample.alphabet).accepted, expected, `DFA ${JSON.stringify(word)}`);
  }
});

test("nondeterministic transitions combine destinations", () => {
  const nfa = machine({
    states: ["s", "x", "y", "f"], alphabet: ["a", "b"], start: "s", finals: ["f"],
    transitions: [
      { from: "s", symbol: "a", to: "x" }, { from: "s", symbol: "a", to: "y" },
      { from: "x", symbol: "b", to: "f" }, { from: "y", symbol: "b", to: "f" }
    ]
  });
  const dfa = A.convertToDFA(nfa);
  assert.equal(A.acceptsDFA("ab", dfa, nfa.alphabet).accepted, true);
});

test("final start state accepts epsilon and DFA start subset is final", () => {
  const nfa = machine({ states: ["s"], alphabet: ["a"], start: "s", finals: ["s"], transitions: [] });
  const dfa = A.convertToDFA(nfa);
  assert.equal(dfa.accepting[0], true);
  assert.equal(A.acceptsNFA("", nfa).accepted, true);
});

test("invalid states and undeclared transition symbols are reported", () => {
  const invalid = machine({
    states: ["s"], alphabet: ["a"], start: "missing", finals: [],
    transitions: [{ from: "s", symbol: "b", to: "s" }]
  });
  assert.equal(A.validateAutomaton(invalid).length, 2);
  assert.throws(() => A.convertToDFA(invalid), /start state.*declared/i);
});

test("state limit stops an unexpectedly large conversion cleanly", () => {
  assert.throws(() => A.convertToDFA(sample, { maxDfaStates: 2 }), /stopped at 2 DFA states/i);
});

test("multi-character alphabet tokens work in conversion and string checks", () => {
  const nfa = machine({
    states: ["start", "middle", "accept"], alphabet: ["open", "close"], start: "start", finals: ["accept"],
    transitions: [
      { from: "start", symbol: "open", to: "middle" },
      { from: "middle", symbol: "close", to: "accept" }
    ]
  });
  const dfa = A.convertToDFA(nfa);
  assert.deepEqual(A.tokenizeInput("open, close", nfa.alphabet), ["open", "close"]);
  assert.equal(A.acceptsNFA("open, close", nfa, dfa.nfaTransitions).accepted, true);
  assert.equal(A.acceptsDFA("open, close", dfa, nfa.alphabet).accepted, true);
  assert.equal(A.acceptsDFA("openclose", dfa, nfa.alphabet).valid, false);
});

test("an empty alphabet is supported and tests only the empty string", () => {
  const nfa = machine({ states: ["s"], alphabet: [], start: "s", finals: ["s"], transitions: [] });
  const dfa = A.convertToDFA(nfa);
  assert.equal(dfa.subsets.length, 1);
  assert.equal(dfa.transitions.length, 0);
  assert.equal(A.acceptsNFA("", nfa).accepted, true);
  assert.equal(A.acceptsDFA("", dfa, nfa.alphabet).accepted, true);
});

test("unreachable NFA states do not create unreachable DFA subsets", () => {
  const nfa = machine({
    states: ["s", "f", "unused"], alphabet: ["a"], start: "s", finals: ["f"],
    transitions: [{ from: "s", symbol: "a", to: "f" }]
  });
  const dfa = A.convertToDFA(nfa);
  assert.equal(dfa.subsets.some(subset => subset.has("unused")), false);
});
