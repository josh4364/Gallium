#ifndef GALLIUM_QUEUE_H
#define GALLIUM_QUEUE_H

#include "protocol.h"
#include <pthread.h>
#include <stdbool.h>

#define GALLIUM_QUEUE_MAX_SIZE 1024

typedef struct {
    gallium_msg messages[GALLIUM_QUEUE_MAX_SIZE];
    int head;
    int tail;
    int count;
    pthread_mutex_t mutex;
    pthread_cond_t cond_not_empty;
    pthread_cond_t cond_not_full;
} gallium_queue;

/**
 * @brief Initialize the queue.
 */
void gallium_queue_init(gallium_queue* q);

/**
 * @brief Push a message into the queue (blocks if full).
 */
bool gallium_queue_push(gallium_queue* q, gallium_msg msg);

/**
 * @brief Pop a message from the queue (blocks if empty).
 */
gallium_msg gallium_queue_pop(gallium_queue* q);

/**
 * @brief Try to push a message without blocking.
 */
bool gallium_queue_try_push(gallium_queue* q, gallium_msg msg);

/**
 * @brief Try to pop a message without blocking.
 * 
 * @param out_msg Pointer to store the popped message.
 * @return true if a message was popped, false if the queue was empty.
 */
bool gallium_queue_try_pop(gallium_queue* q, gallium_msg* out_msg);

/**
 * @brief Clean up the queue resources.
 */
void gallium_queue_destroy(gallium_queue* q);

#endif // GALLIUM_QUEUE_H
