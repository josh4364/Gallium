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




