const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./epsilon-nfa.js");

function makeMachine(states, alphabet, start, finals, edges) {
  const transitions = new Map();
  for (const [from, symbol, to] of edges) {
    const key = A.transitionKey(from, symbol);
    if (!transitions.has(key)) transitions.set(key, new Set());
    transitions.get(key).add(to);
  }
  return { states, alphabet, start, finals: new Set(finals), transitions };
}

test("epsilon cycles close without looping", () => {
  const nfa = makeMachine(["p", "q", "r"], ["a"], "p", [], [
    ["p", "eps", "q"], ["q", "eps", "p"], ["q", "eps", "r"]
  ]);
  assert.deepEqual([...A.epsilonClosure(new Set(["p"]), nfa)].sort(), ["p", "q", "r"]);
});

test("missing moves produce a visible empty trap subset with self-loops", () => {
  const nfa = makeMachine(["s", "f"], ["a", "b"], "s", ["f"], [["s", "a", "f"]]);
  const dfa = A.convertToDFA(nfa);
  const trap = dfa.subsets.findIndex(set => set.size === 0);
  assert.notEqual(trap, -1);
  for (const symbol of nfa.alphabet) {
    assert.equal(dfa.transitions.find(row => row.from === `D${trap}` && row.symbol === symbol).to, `D${trap}`);
  }
});

test("multi-character tokens and delimiter-containing labels convert safely", () => {
  const nfa = makeMachine(["start", "part|one", "accept"], ["open", "close|now"], "start", ["accept"], [
    ["start", "open", "part|one"], ["part|one", "close|now", "accept"]
  ]);
  const dfa = A.convertToDFA(nfa);
  const tokens = A.tokenizeInput("open, close|now", nfa.alphabet);
  assert.deepEqual(tokens, ["open", "close|now"]);
  assert.equal(A.acceptsNFA(tokens, nfa).accepted, true);
  assert.equal(A.acceptsDFA(tokens, dfa, nfa.alphabet).accepted, true);
});

test("empty alphabet yields only the start subset and can accept epsilon", () => {
  const nfa = makeMachine(["s"], [], "s", ["s"], []);
  const dfa = A.convertToDFA(nfa);
  assert.equal(dfa.subsets.length, 1);
  assert.equal(dfa.transitions.length, 0);
  assert.equal(A.acceptsNFA("", nfa).accepted, true);
});

test("large conversions stop at the safety limit", () => {
  const nfa = makeMachine(["s", "f"], ["a", "b"], "s", ["f"], [["s", "a", "f"]]);
  assert.throws(() => A.convertToDFA(nfa, { maxDfaStates: 1 }), /stopped at 1 DFA states/i);
});

test("nondeterministic destinations are combined in one DFA transition", () => {
  const nfa = makeMachine(["s", "x", "y", "f"], ["a", "b"], "s", ["f"], [
    ["s", "a", "x"], ["s", "a", "y"], ["x", "b", "f"], ["y", "b", "f"]
  ]);
  const dfa = A.convertToDFA(nfa);
  assert.equal(A.acceptsDFA("ab", dfa, nfa.alphabet).accepted, true);
});

test("accepting start states accept epsilon", () => {
  const nfa = makeMachine(["s"], ["a"], "s", ["s"], []);
  const dfa = A.convertToDFA(nfa);
  assert.equal(dfa.accepting[0], true);
  assert.equal(A.acceptsNFA("", nfa).accepted, true);
});

test("unreachable source states never appear in reachable DFA subsets", () => {
  const nfa = makeMachine(["s", "f", "unused"], ["a"], "s", ["f"], [["s", "a", "f"]]);
  const dfa = A.convertToDFA(nfa);
  assert.equal(dfa.subsets.some(subset => subset.has("unused")), false);
});
