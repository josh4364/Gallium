concept:
key critical points of decision
bottom to top:
implementation plan a vs b
auto decide unless ambigious which would be the better of the two
if not, goes up

higher level decision in overal plan propagates up towards top

top of the pyrmid is the user who can dispute any discision

reports on what lead up to the decision and what the conflict vs specs is bubbles up to the user to decide
the whole process document is stored including the user decision

higher level conflicts with the overall project spec are corrected in the documentation as the user updates and responds to decision changes

specs are used as ground truth, but are not directly edited by the user, we need this in a llm loop so we can broadcast tasks and changes out from this into the backlog so that nothing is missed

a stronger backlog is needed so the ai can see where their work is in the grand scheme of things and bubble up "I need this backlog task done before I continue"
user approves movement

lets make every single deicsion the llm makes first be totally manual from a user response
then allow a auto reply option to see what the llm would take (side by side)
then allow a full hands off mode for x categories of decisions (user adjustable)
this would allow the user to only get pulled in for critical ambigiouties in the codebase

we need strong backpressure testing and validation
I believe the backpressure and testing should be setup first before the project begins and validated
example would be test cases, ability to mcp a browser, mcp a TUI terminal window etc.
if the bot is missing a critical peice of backpressure it thinks it needs, bubble up before continuing

reuse this as a pattern, critical decisions from sub agents pause and broadcast up 
high level decision tree flow is done through llms instead of just straight linear, but reinforced with more than one LLM evaluation pass for higher statstical chance of not going down a dead end.



planning agent for a task:
Lets sequence this into 5 minutes worth of work so each task is easy to finish and verify
then spawns a subagent for each




Ask the bot two feed back passes
the previous bottleneck one we had
for forwarding ideas for better tasks upwards based on local issues during development

but lets follow that up with a gallium improvement one. have it output a response to the question of, thinking of all of the tools you have and how you used them during this context window, what improvements to them or new tools added that would help? and extract out that response text to a isolated side channel for gallium improvement while we develop.


## Loops
Layered approach

layer 0 is the top, and layers below it have less and less scope
layers control the layer above them
layer can talk to the layer above through messages, but directly manipulate the layer below

layer 0 : Archetcture and high level goal to conceptual parts
layer 1 : Given one conceptual part and turns it into equal sized tasks
layer 2 : Take one task and turn it into "5 minute" work tasks that can be completed in order
layer 3 : worker loop that is given one task and perform the work - lots of loops and restarting at this level

When a conflict is found in a layer (doing x would be difficult or there is no y to do this thing)
that is broadcasted up one layer for the "manager" to decide on how to procede.


## Lets borrow ideas from video game ai: Utility, GOAL, Behaviour trees

layer 0: utiltiy - decides whats next to trigger in overall state change
things like develop-feature, refactor-cleanup, fix-bugs, improve-tooling, cleanup-documentation
scores are managed externally before deciding which action to take, taking an action means loading up the level 0 prompt with the desired action type as its prompt, develop-feature might simply append "develop the next major feature (module name here)"

for one of the scores fed into the level 0 utility ai part, lets run the local tokenizer count on all files periodically and score each one on how much of a 128k context it would use up. from experience c files roughly 2k long become a massive struggle for the bots to do edits in, we can almost always split files to make it easier to work on.

level 0 llm pass output is parsed by a different llm pass which is given tools like `create-module` `create-feature` and `finish-planing` that are unique to it so it can actually create concrete task items, that can be filtered 

level 1 llms passes are asked first in a research pass is the codebase ready to implement feature x?
yes -> go to task development stage to start slicing the work up
no -> the reasoning for why the task cant be done yet in plain english is given upwards to the level 0 and ran with a prompt of:
```
When delegating the work for feature x, we got this feedback: (output from level 1) which is preventing the work from being done. please update the plan.
```
this same sort of feedback loop will exist between level 1 and 2 which will allow for subdivision of the work, up to a certain number of times until it has to try anyways even if the work is too large for its "5 minute" goal.
Also if the level 3 ralph loop fails too many times, that will broadcast upwards to level 1 which will decide on if the archetecture decision was correct. 
that would be a prompt something along the lines of:
```
During implementation of (task) when trying to do the (sub-task) we attempted n times struggling to get it. the summary of the task attempts is (summary)
How can we adjust our plan for this feature that would make this task and sub task easier to implement, or should we `question-upwards`
```

if the level 1 then needs to question upwards, this would be evaluated in the whole current utility chosen mode to decide on how to continue.
prompt:
```
While implementing (high level feature) we struggled to implement (task) during our work on (sub-task). We cannot continue unless we come up with a new plan better aligned with our (high level user goal) but also easier to implement. If there isn't a way to continue without user intervention you can ask the user with `ask-user`
```

in level 3 when the llm makes a tool change, we run a linter, check for simple syntax errors with LSP intergraction, and inject them into the context window of the next tick we can, that or we include it in the output of the `edit-file` tool if the file was a source code file. lets also try to be smart and filter for stuff local to that file, if we add too much noise the bot will focus on fixing errors that would be fixed by continuing so we need to be careful about getting it stuck in a loop.


level 0 will have two documentation score UIs, first one is overall project documentation, and is high when there are no structured spec documents in the designated documentation folder. the second one will be a recently documented work and it will build up for every sub task (level 2) completed, and be high when a task is completed at level 1. that documentation pass should strictly be ran against what was made instead of what the task given to level 1 was. then a review process will look for any delta here, and if so, this task isn't complete and it spawns more work for level 1 to distribute and feed to level 2, 3.

I'd like for a spec or document of some sort to describe a contract of what should be there.
but still allow for the AI to develop something new and update the spec before reworking to match it.

thinking about longer term projects where the level 0 declares the goal met and it is woken up later to begin work on adjusting the project to a new goal, such as adding features.


Had gemini eat the above and turn it into this with some added chatting, missing a few things but somewhat what I'm going to build.

---

# Multi-Level Autonomous Agent Architecture

## I. Hierarchy & Conceptual Units

| Layer | Architecture | Conceptual Unit | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **0: Decision** | **Utility AI** | Strategic Directives | High-level prioritization (Feature vs. Refactor vs. Tooling). |
| **1: Sequencer**| **GOAP / Goal** | Functional Milestones| Researching codebase; slicing features into equal tasks. |
| **2: Decoder** | **Behavior Trees**| Operational Recipes | Decomposing tasks into "5-minute" atomic work chunks. |
| **3: Action** | **RALPH Loop** | Syntax & Execution | Tool use (LSP, Terminal, Browser) and file manipulation. |
| **Observer** | **State Vectors**| Metrics & Vitals  | Tracking technical debt, context/token saturation, and velocity. |

---

## II. The Backpressure & Feedback Protocol

* **Upward Signaling:** Layers control those above through messaging. When a layer finds a conflict (e.g., "Feature X requires Library Y which is missing"), it broadcasts upward for a "Manager" decision.
* **The Overcapacity Loop:** * If **Layer 2 (Decoder)** finds a task too broad for a "5-minute" window, it signals **Layer 1 (Sequencer)** to subdivide further.
    * The updated partial tasks are sent back down as the new state of the world.
    * **Breaker:** A recursion limit forces the system to attempt implementation if the task cannot be subdivided further without losing meaning.
* **Failure Escalation:** If the **Layer 3 (Action)** loop fails (e.g., unit tests fail $N$ times), it signals **Layer 1** to re-evaluate the architecture or **Layer 0** to pivot the goal.

---

## III. Layer 0: Decision (Utility Engine)

**Layer 0** selects the active "Mission Directive" by evaluating externally managed scores:
* **Develop-Feature:** High when backlog items are unblocked and urgency is high.
* **Refactor-Cleanup:** Driven by **Observer** metrics. If a file exceeds 2k tokens or context hits >80%, the "Split File" utility spikes.
* **Fix-Bugs / Improve-Tooling:** Driven by failure rates and side-channel "Gallium" feedback.
* **Documentation:** Driven by a delta check between implemented code and existing spec docs.

---

## IV. Execution & User Oversight

* **Ground Truth Specs:** Specs are the anchor. The AI proposes updates to specs; once the user approves, changes are broadcasted to the **Backlog**.
* **User Dispute:** The user sits at the top of the pyramid and can dispute any decision.
* **Autonomy Modes:**
    1.  **Manual:** Every decision requires a user response.
    2.  **Side-by-Side:** AI proposes an "Auto-Reply"; User confirms.
    3.  **Hands-Off:** Full autonomy for specific categories (e.g., "Refactoring").
* **Backlog Visibility:** A strong, queryable backlog allows agents to signal: *"I need this backlog task done before I can continue."*

---

## V. Validation & Meta-Cognition

* **Backpressure Testing:** No project begins until the environment (Test cases, MCP Browser, Terminal) is validated. If a piece is missing, the agent bubbles up a request immediately.
* **LSP/Linter Integration:** **Layer 3** edits are checked against LSP/Linter. Errors are injected into the next tick’s context to prevent "hallucinated syntax" loops.
* **Gallium Improvement Channel:** * At the end of a context window, the agent evaluates: *"Thinking of the tools used, what new tools or improvements would help?"*
    * This feedback is extracted to an isolated side-channel to improve the agent's capabilities over time.

---

## VI. Workflow Loop Example: Auto-Refactor
1.  **Observer** reports `context_saturation > 0.8` on `auth.c`.
2.  **Layer 0 (Decision)** utility for `Refactor-Cleanup` becomes the highest score.
3.  **Layer 1 (Sequencer)** takes the directive and identifies how to split `auth.c` into smaller modules.
4.  **Layer 2 (Decoder)** sequences the split into 5-minute atomic file moves/edits.
5.  **Layer 3 (Action)** performs the edits, verified by LSP and unit tests.
6.  **Observer** updates metrics; **Layer 0** returns to `Develop-Feature`.






Layer 0 prompt

```
goal: "create a simple tetris in c using raylib"
convert that into high level conceptual chunks for the development, not the step by step but the bigger picture.
outputs:
[{ "name" : "setup build environemnt for C development" },
 { "name" : "gather dependices such as raylib to make building the game easy and validate that they can build" },
 { "name" : "build the game skeleton" },
 { "name" : "build the peice shuffling logic" },
 { "name" : "build the core gameplay loop dropping peices and ticking them slowly downwards" },
 { "name" : "build the scoring logic and row filling completion" },
 { "name" : "polish the visuals" }]
```




