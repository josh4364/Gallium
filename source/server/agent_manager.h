#ifndef GALLIUM_AGENT_MANAGER_H
#define GALLIUM_AGENT_MANAGER_H

#include "../common/queue.h"
#include <pthread.h>
#include <stdbool.h>

typedef enum {
    AGENT_ROLE_TOP_MANAGER,
    AGENT_ROLE_TASK_MANAGER,
    AGENT_ROLE_CODER,
    AGENT_ROLE_RESEARCHER,
    AGENT_ROLE_REVIEWER
} AgentRole;

#define HISTORY_SIZE 10

typedef struct {
    pthread_t thread;
    gallium_queue queue;
    AgentRole role;
    char* history[HISTORY_SIZE];
    int history_idx;
    bool running;
    int id;
} Agent;

/**
 * @brief Initialize the agent manager subsystem.
 */
void gallium_agent_manager_init();

/**
 * @brief Spawn a new agent with a specific role.
 * 
 * @param role The role of the agent.
 * @return Agent* Pointer to the spawned agent.
 */
Agent* gallium_agent_spawn(AgentRole role);

/**
 * @brief Send a message to an agent.
 */
void gallium_agent_send(Agent* agent, const char* message);

/**
 * @brief Check for loops in the agent's history (last 3 calls same).
 */
bool gallium_agent_check_loop(Agent* agent, const char* new_action);

/**
 * @brief Shutdown an agent.
 */
void gallium_agent_shutdown(Agent* agent);

#endif // GALLIUM_AGENT_MANAGER_H
