#include "db_manager.h"
#include "agent_manager.h"
#include "agent_profiles.h"
#include "llm_client.h"
#include "../common/protocol.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static int g_next_agent_id = 1;

void gallium_agent_manager_init() {
    // Initialization if needed (e.g. global agent registry)
}

static void* agent_thread_func(void* arg) {
    Agent* agent = (Agent*)arg;
    const char* system_prompt = NULL;
    char source[32];
    snprintf(source, sizeof(source), "Agent-%d", agent->id);

    switch (agent->role) {
        case AGENT_ROLE_TOP_MANAGER: system_prompt = AGENT_PROFILE_TOP_MANAGER; break;
        case AGENT_ROLE_TASK_MANAGER: system_prompt = AGENT_PROFILE_TASK_MANAGER; break;
        case AGENT_ROLE_CODER: system_prompt = AGENT_PROFILE_CODER; break;
        case AGENT_ROLE_RESEARCHER: system_prompt = AGENT_PROFILE_RESEARCHER; break;
        case AGENT_ROLE_REVIEWER: system_prompt = AGENT_PROFILE_REVIEWER; break;
    }

    gallium_log(source, "{\"event\": \"started\"}");

    while (agent->running) {
        gallium_msg msg;
        if (gallium_queue_try_pop(&agent->queue, &msg)) {
            
            // Log reception
            char log_msg[512];
            snprintf(log_msg, sizeof(log_msg), "{\"event\": \"received_msg\", \"content\": \"%s\"}", msg.payload);
            gallium_log(source, log_msg);

            if (gallium_agent_check_loop(agent, msg.payload)) {
                 gallium_log(source, "{\"event\": \"loop_detected\", \"action\": \"pivoting\"}");
                // Handle pivot logic
            }

            if (agent->role == AGENT_ROLE_TASK_MANAGER) {
                // Task Manager Logic
                struct json_object* subtasks = gallium_llm_generate_json(system_prompt, msg.payload);
                if (subtasks) {
                    const char* task_str = json_object_to_json_string(subtasks);
                    
                    char task_log[1024];
                    snprintf(task_log, sizeof(task_log), "{\"event\": \"generated_subtasks\", \"tasks\": %s}", task_str);
                    gallium_log(source, task_log);

                    json_object_put(subtasks);
                }
            } else {
                // General Agent Logic
                char* response = gallium_llm_generate(system_prompt, msg.payload);
                
                char thought_log[1024];
                snprintf(thought_log, sizeof(thought_log), "{\"event\": \"thought\", \"content\": \"%s\"}", response);
                gallium_log(source, thought_log);

                free(response);
            }

            gallium_msg_free(&msg);
        } else {
            usleep(100000); // Sleep 100ms
        }
    }
    
    return NULL;
}

Agent* gallium_agent_spawn(AgentRole role) {
    Agent* agent = malloc(sizeof(Agent));
    if (!agent) return NULL;

    agent->id = g_next_agent_id++;
    agent->role = role;
    agent->running = true;
    agent->history_idx = 0;
    for (int i = 0; i < HISTORY_SIZE; i++) agent->history[i] = NULL;
    
    gallium_queue_init(&agent->queue);

    if (pthread_create(&agent->thread, NULL, agent_thread_func, agent) != 0) {
        free(agent);
        return NULL;
    }

    return agent;
}

void gallium_agent_send(Agent* agent, const char* message) {
    gallium_msg msg;
    msg.header.msg_id = GALLIUM_MSG_TASK_UPDATE; // Generic ID for now
    msg.header.payload_len = strlen(message) + 1;
    msg.payload = strdup(message);
    gallium_queue_push(&agent->queue, msg);
}

bool gallium_agent_check_loop(Agent* agent, const char* new_action) {
    // Add to history
    if (agent->history[agent->history_idx]) {
        free(agent->history[agent->history_idx]);
    }
    agent->history[agent->history_idx] = strdup(new_action);
    
    int current = agent->history_idx;
    agent->history_idx = (agent->history_idx + 1) % HISTORY_SIZE;

    // Check last 3 actions
    // Indices: current, (current-1), (current-2) (handling wrap-around)
    
    int idx1 = current;
    int idx2 = (idx1 - 1 + HISTORY_SIZE) % HISTORY_SIZE;
    int idx3 = (idx1 - 2 + HISTORY_SIZE) % HISTORY_SIZE;

    if (agent->history[idx1] && agent->history[idx2] && agent->history[idx3]) {
        if (strcmp(agent->history[idx1], agent->history[idx2]) == 0 &&
            strcmp(agent->history[idx2], agent->history[idx3]) == 0) {
            return true;
        }
    }
    
    return false;
}

void gallium_agent_shutdown(Agent* agent) {
    agent->running = false;
    pthread_join(agent->thread, NULL);
    gallium_queue_destroy(&agent->queue);
    for (int i = 0; i < HISTORY_SIZE; i++) {
        if (agent->history[i]) free(agent->history[i]);
    }
    free(agent);
}
