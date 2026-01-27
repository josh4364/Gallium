#include "project_init.h"
#include "network.h"
#include "common/protocol.h"
#include "common/net_utils.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>
#include "llm_gemini.h"
#include "db_manager.h"

typedef enum {
    INIT_STATE_NONE = 0,
    INIT_STATE_Q1_GOAL,
    INIT_STATE_Q2_OS,
    INIT_STATE_Q3_LANG,
    INIT_STATE_Q4_DEPS,
    INIT_STATE_Q5_INTEGRATION,
    INIT_STATE_Q6_VENDING,
    INIT_STATE_CONFIRM,
    INIT_STATE_SYNTHESIZE,
    INIT_STATE_DONE
} InitState;

static InitState current_state = INIT_STATE_NONE;
static char answers[6][1024];

static void send_question(struct lws* wsi, const char* q) {
    char json[2048];
    snprintf(json, sizeof(json), "{\"prompt\": \"%s\", \"input\": true}", q);
    gallium_net_send(wsi, GALLIUM_MSG_USER_INPUT, json);
}

static void transition_state(struct lws* wsi) {
    const char* q = "";
    switch(current_state) {
        case INIT_STATE_Q1_GOAL:
            q = "What is the primary goal of this project?";
            break;
        case INIT_STATE_Q2_OS:
            q = "What operating systems should be supported?";
            break;
        case INIT_STATE_Q3_LANG:
            q = "What programming languages will be used?";
            break;
        case INIT_STATE_Q4_DEPS:
            q = "What are the key dependencies (libraries/frameworks)?";
            break;
        case INIT_STATE_Q5_INTEGRATION:
            q = "What external integrations are required (APIs, DBs, etc)?";
            break;
        case INIT_STATE_Q6_VENDING:
            q = "How should the project be deployed/vended?";
            break;
        case INIT_STATE_CONFIRM:
            q = "Ready to generate project specs? (yes/no)";
            break;
        case INIT_STATE_DONE:
            gallium_net_send(wsi, GALLIUM_MSG_TASK_UPDATE, "{\"task\": \"Project Init\", \"status\": \"completed\"}");
            return;
        default:
            return;
    }
    send_question(wsi, q);
}

bool project_init_needs_start() {
    if (current_state != INIT_STATE_NONE) return false;
    if (access("project_init_complete.flag", F_OK) == 0) return false;
    return true;
}

void project_init_start(struct lws* wsi) {
    if (current_state == INIT_STATE_NONE) {
        current_state = INIT_STATE_Q1_GOAL;
        printf("[Project Init] Starting Interview Wizard...\n");
        transition_state(wsi);
    } else if (current_state != INIT_STATE_DONE) {
        transition_state(wsi);
    }
}

int project_init_handle_input(struct lws* wsi, const char* input) {
    printf("[Project Init] Received input: %s\n", input);
    
    if (current_state == INIT_STATE_DONE) return 0;

    if (current_state == INIT_STATE_CONFIRM) {
        if (strcasecmp(input, "yes") == 0 || strcasecmp(input, "y") == 0) {
            current_state = INIT_STATE_SYNTHESIZE;
            gallium_net_send(wsi, GALLIUM_MSG_TASK_UPDATE, "{\"task\": \"Project Init\", \"status\": \"synthesizing...\"}");
            
            printf("[Project Init] Synthesizing specs via LLM...\n");
            gallium_log("project_init", "{\"event\": \"synthesis_started\"}");
             
            char prompt[8192];
            snprintf(prompt, sizeof(prompt), 
                 "Generate a project.md file for a software project with these requirements:\n"
                 "Goal: %s\nOS: %s\nLang: %s\nDeps: %s\nIntegration: %s\nVending: %s\n"
                 "Output only the markdown content. Do not include ```markdown blocks.",
                 answers[0], answers[1], answers[2], answers[3], answers[4], answers[5]);

            char* result = llm_gemini_send(NULL, prompt);
            if (result) {
                 if (system("mkdir -p specs") != 0) perror("mkdir failed");
                 FILE* f = fopen("specs/project_generated.md", "w");
                 if (f) {
                     fprintf(f, "%s", result);
                     fclose(f);
                 }
                 free(result);
            }
             
            if (system("git checkout -b init-project || git checkout init-project") == -1) {
                perror("git checkout failed");
            }
            if (system("git add specs/project_generated.md") == -1) {
                perror("git add failed");
            }
            if (system("git commit -m 'Initial project specs' || echo 'Nothing to commit'") == -1) {
                perror("git commit failed");
            }
             
            if (system("touch project_init_complete.flag") == -1) {
                perror("touch failed");
            }

            current_state = INIT_STATE_DONE;
            gallium_net_send(wsi, GALLIUM_MSG_TASK_UPDATE, "{\"task\": \"Project Init\", \"status\": \"completed\"}");
        } else {
             // Restart
             current_state = INIT_STATE_Q1_GOAL;
             transition_state(wsi);
        }
        return 0;
    }
    
    int idx = (int)current_state - (int)INIT_STATE_Q1_GOAL;
    if (idx >= 0 && idx < 6) {
         strncpy(answers[idx], input, sizeof(answers[idx])-1);
         current_state = (InitState)((int)current_state + 1);
         transition_state(wsi);
    }
    return 0;
}
