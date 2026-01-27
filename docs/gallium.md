# Gallium

better ai development of a project
this is the inital brain dump of the idea, starts out vague and gets more accurate towards the end.

## ideas
* agressively annoy the user with long interview processes to build out a spec document for each task that then together act as documentation
* which is continously crawled to turn into a embeding model local store file in the same repo to save on token costs
the embeding model is tool link to the local gemini-cli
* gemini-cli is used as the backing model
* exponentional alternative takes on every stage, with a scale up. since tokens are expensive use very low defaults for the scaling up
    * one prompt agent -> two sub thinking agents to give two alternative ideas -> 4 sub-sub agents to give those agents ideas
    * user tweakable recursion depth limit
    * after each sub agent finishes we use a new agent to perform concensius and pick the winner

* ability to give a instruction for how to structure projects and codebases
    * sane defaults from game dev:
    * default example with a game engine:
        * Use layers, place in core, platform, layers can use whats below them but not above
        * place external resources in `extern/` source in `source/`

## Things to avoid
* anti gravity model colapse when working on a task too long
* inconsistent tool calling, sometimes it knows the exact right way to call and build the game but other times it forgets and gets stuck in a debugging loop

## Things I would like to have
* have the ability to choose between one, two or more fully finished implementations of what you want
    * as in the bot takes two approaches to the finish line and you can select which one to keep.
    * this would work better with small as possible tasks
* local commits in a local branch per run of the bot, all managed by the UI
* queued messages and interupting is useful, lets have the ability to reach into any sub task and interupt

* automatic code fixing in the code generator stage:
    * after bot makes a code edit tool call:
    * make checkpoint in context window
    * grab lsp error, linting, syntax errors and place into the context window and have bot fix them
    * after they are fixed rewind the context window to before the error fixing pass and condence all of the edits into one "fixed errors" changes block to compress error fixing.

* bootstrap phase
    * describe the tools, the language, the build scripts, build system, the nix flakes etc.
        * cicd setup
        * focus on github for now
    * end result is a fully setup but empty project that hello worlds.

* interview project scoping phase
* after project is built, refactor and development interview phase
    * similar to inital but instead we focus on this project already exists and we should mould it into the new requirements with minimal changes, but allow big changes.


## key finding from experience
* developing with ai is so fast you need to force yourself to slow down to one task at a time, that way you dont slack on the code review.
* towards the end of a long context window the behaviour of gemini 3 becomes more willing to do the following:
    * cut corners to finish at all costs
    * declare something done without testing with a tool to make sure their change actually fixed it
    * in general forget their higher level list of tasks and just solve the minior bug you asked them to fixed, forgeting that they were working on a large feature development task
* when anti gravity fails to tool call a build, or the mcp tool errors out, it continues to try and debug the tool when it should signal to the user instead

## benchmarking this tool for validation
Lets create a mode / tool for benchmarking the output of this tool
Use our existing game engine or other projects as a reference and have the ai create a list of differences then score how closer in quality or similar the new result is

## frontend
* web ui to manage tasks, chats, profiles for the chat
* we're building a better antigravity that doesn't choke on single tasks
    * antigravitys workflow for code + chat is unneeded now, users have their own code editors to view and edit code.
    * keep the ai and chat in one spot with a good interface.
* we want to eventually turn it into a jules like setup.
* both of those tools have shortcomings and really need some dialing in to get better results in my opnion.
* ability to backtrace / history browse through the development of a task, see all of its sub tasks, and all of the sub agent calls of the subtasks to view the consensus and what other approaches were tested.
* at the task level we display both the tasks and a event log of what tasks were started and stopped
    * at each task, we display the sub tasks and their individual event log
    * at the sub task level we display their llm messages and actual event logging. we display events like context window >50% filled compressing, developed and dispatched 4 approaches, consensus reached, chose 2 (click here to view the all 4, click to rewind time and start over with this user selected change).
* ability to rewind time to where a decision was made and override the bots decision.
* global pause when getting off rails
    * can be triggered by the high level orcistrator when a task is stuck or more context needed.
        * will need a way to spot prompt to update all levels of the project specs/goals to corse correct

* each level will be a differnt agent that can be talked to
* (depth-0) top level orcastror
    * holds onto the top level goal and where we are in the process
    * backed by state machine logic in the server
    * mostly code and only uses llms where needed
* (depth-1) task manager
    * knows about its list of sub tasks and what the high level goal is
    * dispatches sub tasks to achieve the task given
    * UI displays multiple tasks at once, but only one task is being worked on at a time. 
    * if it notices a sub task has been running for a long time and is stalling out, it kills the task, backs up the checkpoint, then splits the subtask into smaller units of work, then resumes.

* (depth-2) sub task manager
    * context manager
    * code generator
    * debugger / fixer
    * validator
    * consenus
    * researcher

* (depth-3) sub task spawned alternative paths
    * during code generation we will want to spawn more than one way of doing the code generation task requested before the consensus pass decides what to continue on.
    * first of the two paths will be directly prompted, second path will have a summary of the first ones approach and be told to generate a totally different approach within reason to the first, then reran with that approach only in its context window giving an alterative approach.



* spec driven backing structure and workflow
    * similar to openspec, ralph, etc
* user can browse and view the editable spec documents
* system manages these documents and improves them for ground truth
* as tasks are completed a spec update pass is always ran to update or create spec documents.
* during the process leading up to a top level task and sub tasks, a spec document is created to describe the feature that is being added. this is used to validate that the top level task is actually complete. the feature spec comes from the interview process and is agreed on by the user, or auto approved in auto mode.
    * workflow in manual approval mode would display the feature spec, allow the user to comment on it or manually edit it.
    * then the bot would begin turning it into tracked tasks, that then become sub tasks until the task is done.

* for each depth stage of the task system the context window % of of the last run of that manager is displayed to identify when the stage isn't being efficent enough.
    * example is the task manager stage, was its last time checking in on sub tasks bloated up from way too many sub tasks? do we need to have auto compression of sub tasks.

## debugging 
* would be nice to have an optional pass with things to improve
    * bottlenecks
        * "got stuck in a loop due to a mcp connection error"
        * "spent lots of sub task time on developing x"
        * "spent lots of time fixing vulkan validation errors related to resource transition"
    * later on these could be fed back into the system to have it self improve after each major task, or create improvement tasks to interject before next main task (like adding an resource tracking system to make transitions automatic)

* pre pass to speculate how we could test this feature and generate that test as a task
* validation automation, if a project like vulkan allows for using validation and other useful tools that could help debug in plain text, add them to the project as a task to increase debugablity automatically
    * bot will need to research if that approach is already being done in the project and skip trying to do it again

## logging
* everything this tool does will be logged to a local database like sqllite3
    * this will allow tracking the histroy of work and the actual converstaions and logs of everything that was generated.
    * this is the backing data the web front end browses
* could start out with plain text as well, or a simpler document storage, not imporant.
* local git commits and local branches are where work is stored.
* user can optionally choose to have all commits pushed so they show up on github as the project works
* user will also be able to at the very end of the task or project be able to click a `git push` to deploy it to the remote (github) to view on github whenever
* user can browse the codebase through a web code editor, read only.
    * when browsing the code the user can inject a chat to pause the bot _after_ the current subtask, inject their chat changes if any after talking to the bot, as a new major task or sub task.

## archetecture
* webserver sitting on local machine, talks to gemini api
* webserver serves to local host the web ui for interacting with a singular workspace root
* web ui allows interacting with the ai agents in this workspace
* overall waterfall event log is displayed but not the raw llm messages as they are noisy, allowing user to take a peek at a glance.
* big panic pause button is at the top to stop anything going on, which also backs up the bots to their last checkpoint, and shuts down any built project testing.
* at first everything will be ran serially for free tier limits
    * in the future when I can afford to we will run multiple independent tasks in paralell
* for fun lets develop the first UI as a TUI client talking to the server
    * still use websockets but now we can build it in C as well and use notcurses for the frontend TUI


## First project ideas for gallium testing
* obviouslly a vulkan game engine for validation against current one and for a super large project
* TUI text editor to replace emacs and vscode for me



## Ideas
For memory instead of embedding models lets do this:
Each time the model uses file/directory scans, have a bit of llm guessing "you searched for debug view, did you mean assets/shaders/debug_view.comp" based on frequency of accessing that file after that query. 
Basically catalog what the inital search was, and what the likely point where it found what it wanted, giving a improving over time chance to find the thing it wanted much faster.

