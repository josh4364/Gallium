import logging
from typing import Dict, Any, List, Callable
from enum import Enum
import random
from source.ai_system import AI_Eval

# Enum for Outcome Symbols
class DecisionOutcome(Enum):
    DEVELOP_FEATURE = "DEVELOP_FEATURE"
    REFACTOR_CLEANUP = "REFACTOR_CLEANUP"
    FIX_BUGS = "FIX_BUGS"
    IMPROVE_TOOLING = "IMPROVE_TOOLING"
    DOCUMENTATION = "DOCUMENTATION"
    WAIT_FOR_USER = "WAIT_FOR_USER"

logger = logging.getLogger("DecisionAgent")

# --- Context Data Structures ---
# In a data-driven approach, Context is just a generic dictionary.
# We define keys that we expect to be present.

CONTEXT_KEYS = [
    "backlog_items",      # List of pending tasks
    "file_metrics",       # Dict of file -> {token_count, complexity_score}
    "test_results",       # Summary of last test run
    "user_feedback",      # Last message from user or disputes
    "spec_delta",         # Difference between impl and docs
    "last_outcome",       # The previous decision made
]

# --- Scorers ---
# Utility functions that return a score 0.0 - 1.0 based on context

def score_develop_feature(context: Dict[str, Any]) -> float:
    """Score high if backlog has items and no blocking issues."""
    backlog = context.get("backlog_items", [])
    if not backlog:
        return 0.0
    
    # Check for blocking issues in feedback or tests
    if context.get("critical_bugs_present", False):
        return 0.1
        
    # Basic urgency score based on backlog size (clamped)
    return min(len(backlog) * 0.2, 0.9)

def score_refactor_cleanup(context: Dict[str, Any]) -> float:
    """Score high if files are too large or complexity is high."""
    metrics = context.get("file_metrics", {})
    if not metrics:
        return 0.0
    
    max_score = 0.0
    for f, m in metrics.items():
        # Example: Score based on token count (assuming ~2k limit preference mentioned in docs)
        tokens = m.get("token_count", 0)
        if tokens > 2000:
            score = min((tokens - 2000) / 1000.0, 1.0)
            max_score = max(max_score, score)
            
    return max_score

def score_fix_bugs(context: Dict[str, Any]) -> float:
    """Score high if tests are failing or user reported bugs."""
    if context.get("critical_bugs_present", False):
        return 1.0
    
    # Check test results
    tests = context.get("test_results", {})
    failed = tests.get("failed", 0)
    if failed > 0:
        return 0.8 + (min(failed, 5) * 0.04) # 0.8 to 1.0
        
    return 0.0

def score_monitoring_feedback(context: Dict[str, Any]) -> float:
    """Score for tooling improvements based on side-channel feedback."""
    # Placeholder for 'gallium improvement channel' feedback
    feedback = context.get("tooling_feedback_pending", False)
    return 0.4 if feedback else 0.0

def score_documentation(context: Dict[str, Any]) -> float:
    """Score high if spec delta is large."""
    delta = context.get("spec_missing", False)
    return 0.7 if delta else 0.1

# --- Curve / Weight Config ---
# We can apply curves or weights to these raw scores.
# For now, linear 1.0 weight.

SCORERS = {
    DecisionOutcome.DEVELOP_FEATURE: score_develop_feature,
    DecisionOutcome.REFACTOR_CLEANUP: score_refactor_cleanup,
    DecisionOutcome.FIX_BUGS: score_fix_bugs,
    DecisionOutcome.IMPROVE_TOOLING: score_monitoring_feedback,
    DecisionOutcome.DOCUMENTATION: score_documentation,
}

# --- Decision Core ---

def get_utility_scores(context: Dict[str, Any]) -> Dict[DecisionOutcome, float]:
    scores = {}
    for outcome, scorer_func in SCORERS.items():
        scores[outcome] = scorer_func(context)
        logger.info(f"Scorer {outcome.name}: {scores[outcome]:.2f}")
    return scores

def select_best_outcome(scores: Dict[DecisionOutcome, float]) -> DecisionOutcome:
    # Find max score
    if not scores:
        return DecisionOutcome.WAIT_FOR_USER
    
    best_outcome = max(scores, key=scores.get)
    best_score = scores[best_outcome]
    
    # Threshold check?
    if best_score < 0.1:
        return DecisionOutcome.WAIT_FOR_USER
        
    return best_outcome

def decide_next_step(context: Dict[str, Any]) -> DecisionOutcome:
    """
    Main entry point for the Utility AI decision.
    """
    logger.info("Evaluating decision state...")
    scores = get_utility_scores(context)
    outcome = select_best_outcome(scores)
    logger.info(f"Selected action: {outcome.name}")
    return outcome

# --- Prompt / Agent Integration ---

def analyze_context_with_llm(raw_text_context: str) -> Dict[str, Any]:
    """
    Uses AI_Eval to parse unstructured text into the structured context dict
    needed for the utility scorers.
    """
    system_prompt = """
    You are the Context Analyzer.
    Analyze the project state and return a JSON object with:
    - critical_bugs_present: bool
    - backlog_items: list of strings
    - spec_missing: bool
    - tooling_feedback_pending: bool
    """
    
    # This would call AI_Eval
    response = AI_Eval(system_prompt, f"Project Status:\n{raw_text_context}")
    
    # Parse JSON (naive implementation for skeleton)
    try:
        import json
        # Strip markdown code blocks if present
        cleaned = response.replace("```json", "").replace("```", "").strip()
        data = json.loads(cleaned)
        return data
    except Exception as e:
        logger.error(f"Failed to parse context analysis: {e}")
        return {}

# --- Execution ---

def execute_decision(outcome: DecisionOutcome, context: Dict[str, Any], use_fallback: bool = False):
    """
    Executes the next step based on the selected decision outcome.
    Typically involves generating a prompt for the 'Level 0' planner 
    or the next layer.
    """
    
    system_prompt = "You are the Level 1 Sequencer Agent." # Default fallback
    
    if outcome == DecisionOutcome.DEVELOP_FEATURE:
        task_directive = "Review the backlog and select the next high-priority feature to implement."
        # Could load specific prompt for feature dev
    
    elif outcome == DecisionOutcome.REFACTOR_CLEANUP:
        task_directive = "Identify code modules that are too large or complex and propose a refactoring plan."
        
    elif outcome == DecisionOutcome.FIX_BUGS:
        task_directive = "Analyze the test failures and critical bug reports. Create a plan to fix them."
        
    elif outcome == DecisionOutcome.IMPROVE_TOOLING:
        task_directive = "Review the tooling feedback channel and propose improvements to the agent tools."
        
    elif outcome == DecisionOutcome.DOCUMENTATION:
        task_directive = "Compare the implementation with the specifications and update the documentation to match."
        
    elif outcome == DecisionOutcome.WAIT_FOR_USER:
        return "Waiting for user input..."
        
    else:
        return f"Unknown outcome: {outcome}"
        
    # Construct the Level 0 / Level 1 Handoff Prompt
    full_user_prompt = f"""
    DECISION OUTCOME: {outcome.name}
    DIRECTIVE: {task_directive}
    
    Please generate a sequence of tasks (Level 1 Plan) to address this directive.
    """
    
    # Call AI_Eval for the planning phase
    response = AI_Eval(
        system_prompt=system_prompt,
        user_prompt=full_user_prompt,
        context_data=context,
        model_name="gemini-3-flash-preview",
        use_fallback=use_fallback
    )
    
    return response
