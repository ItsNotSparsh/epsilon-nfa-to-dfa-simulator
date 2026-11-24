# Epsilon-NFA to DFA Simulator

## Project title and group ID
**Topic 2:** epsilon-NFA to DFA conversion — epsilon-closures, subset construction, and step-by-step equivalent DFA generation.  
**Group ID:** [Enter your assigned group ID]

## Overview
M2 is a client-side educational simulator. Define an epsilon-NFA or load one of six examples, convert it to an equivalent DFA, inspect reachable subsets and transitions, step through move and epsilon-closure calculations, and compare string acceptance by both machines.

## Supported features
- Input validation for states, alphabet symbols, transitions, start and accepting states.
- Epsilon-closure, including cycles, and nondeterministic symbol moves.
- Reachable subset construction with an empty-subset trap state only when reached.
- DFA table and NFA/DFA SVG diagrams with pan, zoom, fit and animation.
- Step, previous, restart, play/pause and show-all conversion controls.
- NFA/DFA string checking, including epsilon input and multi-character tokens.
- Six presets: basic closure, epsilon branching, epsilon cycle, trap state, ends in ab, and even number of 1s.

## Technology stack and dependencies
- HTML5, CSS3, browser JavaScript and SVG. No browser framework or external runtime packages.
- Node.js v24.19.0 was used for the recorded test run. Tests use built-in node:test and node:assert. Node.js 18+ is recommended.
- Tested on Windows 11 with Microsoft Edge. Python 3 is optional and only serves the app locally.

## Installation
1. Keep index.html, simulator.html, the CSS files and src/ together.
2. Install Node.js 18+ only to run tests.
3. No npm install or network access is required.

## How to run
Open index.html in a modern browser and select **Open simulator**. Or run from the M2 folder:
~~~powershell
py -m http.server 8000 --bind 127.0.0.1
~~~
Open http://127.0.0.1:8000/. Stop with Ctrl+C.

## Example
States q0, q1, q2; alphabet a, b; start q0; accepting q2:
~~~text
q0, eps, q1
q1, a, q1
q1, b, q2
q2, b, q2
~~~
The start subset is {q0, q1}. Reachable subsets are {q0, q1}, {q1}, {q2}, and ∅. Input ab follows D0 → D1 → D2 and is accepted. Input ba reaches ∅ and is rejected.

Enter comma-separated state, alphabet, and accepting-state lists. Add one transition per line as source, symbol, destination. Use eps for epsilon. Alphabet symbols cannot contain spaces or commas. Separate multi-character input tokens with commas or spaces. Blank input means epsilon.

## Project structure
- index.html and landing.css — landing page and styling.
- simulator.html — simulator interface.
- styles.css — base and responsive styling.
- polish.css — M2 theme, graph controls and animations.
- src/automata.js — validation, closure, move, subset conversion and string simulation.
- src/app.js — parser, interface, diagrams and step playback.
- tests/automata.test.js — algorithm regression tests.
- TestCases/ — example definitions and expected outputs.
- Screenshots/ — optional demo screenshots.
- Report/ — reserved for the group report.

## Module and function documentation
In src/automata.js, validateAutomaton(machine) returns validation messages. makeTransitionMap(transitions) builds nested maps of destination sets. epsilonClosure(states, transitionMap) returns the seeds and every epsilon-reachable state. move(states, symbol, transitionMap) returns immediate destinations before closure. convertToDFA(machine, options) returns subsets, transitions, accepting flags, steps, and the transition map. It throws on invalid input or when maxDfaStates (default 2048) is exceeded. tokenizeInput(input, alphabet) splits the word into tokens. acceptsNFA(input, machine, map) and acceptsDFA(input, dfa, alphabet) return validity and acceptance with final-state or path details. Unknown symbols return valid=false. An incomplete supplied DFA makes acceptsDFA throw. Algorithms assume a finite machine with unique state names.

In src/app.js, parseInput() reads fields and throws on invalid definitions. convert() validates and renders the result. drawDiagram() creates directed SVG graphs. renderWalkthrough() and renderConstructionGraph() show move/closure steps and the growing DFA. runStringTest() compares machine acceptance. These interface functions update the page and return no algorithm result.

## Testing
From the M2 folder run:
~~~powershell
node --test tests/automata.test.js
~~~
The 11 tests cover closure and cycles, hand-checked conversion, trap completeness, NFA/DFA agreement, nondeterminism, epsilon acceptance, invalid input, state limit, multi-character tokens, empty alphabet, and unreachable states. A passing run reports 11 passes and 0 failures. Failures print the case and mismatch.

## Known limitations and troubleshooting
- Subset construction can grow exponentially. Conversion stops at 2,048 DFA states.
- Dense graphs can have crossing edges. Use the transition table, pan, and zoom.
- DFA minimization, file import/export, and direct graph editing are not implemented.
- If scripts fail to load from a direct file open, use the local Python server above.
- Unknown input symbols are rejected with a validation message. Missing NFA moves lead to the empty subset when needed.

## Team contributions and acknowledgements
Record actual contributions in M2-Contribution-Record.md. The app uses native browser APIs and Node.js built-in test modules. It has no third-party runtime libraries.
