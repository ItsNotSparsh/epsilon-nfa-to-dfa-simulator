# Test cases and expected behavior

Run the automated suite from the M2 folder:
~~~powershell
node --test tests/automata.test.js
~~~

| ID | Scenario | Expected result |
|---|---|---|
| T01 | Basic preset, input ab | NFA and DFA accept. |
| T02 | Basic preset, input ba | Both reject after reaching the empty subset. |
| T03 | Epsilon cycle p→q→p and q→r | Closure of {p} is {p,q,r}; traversal terminates. |
| T04 | Nondeterministic a edges to x and y | Both destinations are included in the DFA subset. |
| T05 | Start state is accepting, empty input | Both machines accept epsilon. |
| T06 | Undefined start state and alphabet symbol in a transition | Validation reports errors and conversion throws. |
| T07 | Multi-character symbols open, close | Tokenized input open, close is accepted; ambiguous openclose is invalid. |
| T08 | Empty alphabet, accepting start | One DFA state, no transitions; epsilon is accepted. |
| T09 | Unreachable NFA state | It does not appear in any reachable subset. |
| T10 | Conversion exceeds configured subset limit | Conversion throws a clear size-limit error. |
| T11 | Missing moves in the basic machine | Empty subset is generated and loops for each alphabet symbol. |

The expected results are asserted in tests/automata.test.js. A passing test prints a check mark. A failure reports the assertion and test name.
