#include "queue.h"
#include <string.h>

void gallium_queue_init(gallium_queue* q) {
    q->head = 0;
    q->tail = 0;
    q->count = 0;
    pthread_mutex_init(&q->mutex, NULL);
    pthread_cond_init(&q->cond_not_empty, NULL);
    pthread_cond_init(&q->cond_not_full, NULL);
}

bool gallium_queue_push(gallium_queue* q, gallium_msg msg) {
    pthread_mutex_lock(&q->mutex);
    while (q->count == GALLIUM_QUEUE_MAX_SIZE) {
        pthread_cond_wait(&q->cond_not_full, &q->mutex);
    }
    
    q->messages[q->tail] = msg;
    q->tail = (q->tail + 1) % GALLIUM_QUEUE_MAX_SIZE;
    q->count++;
    
    pthread_cond_signal(&q->cond_not_empty);
    pthread_mutex_unlock(&q->mutex);
    return true;
}

gallium_msg gallium_queue_pop(gallium_queue* q) {
    pthread_mutex_lock(&q->mutex);
    while (q->count == 0) {
        pthread_cond_wait(&q->cond_not_empty, &q->mutex);
    }
    
    gallium_msg msg = q->messages[q->head];
    q->head = (q->head + 1) % GALLIUM_QUEUE_MAX_SIZE;
    q->count--;
    
    pthread_cond_signal(&q->cond_not_full);
    pthread_mutex_unlock(&q->mutex);
    return msg;
}

bool gallium_queue_try_push(gallium_queue* q, gallium_msg msg) {
    pthread_mutex_lock(&q->mutex);
    if (q->count == GALLIUM_QUEUE_MAX_SIZE) {
        pthread_mutex_unlock(&q->mutex);
        return false;
    }
    
    q->messages[q->tail] = msg;
    q->tail = (q->tail + 1) % GALLIUM_QUEUE_MAX_SIZE;
    q->count++;
    
    pthread_cond_signal(&q->cond_not_empty);
    pthread_mutex_unlock(&q->mutex);
    return true;
}

bool gallium_queue_try_pop(gallium_queue* q, gallium_msg* out_msg) {
    pthread_mutex_lock(&q->mutex);
    if (q->count == 0) {
        pthread_mutex_unlock(&q->mutex);
        return false;
    }
    
    *out_msg = q->messages[q->head];
    q->head = (q->head + 1) % GALLIUM_QUEUE_MAX_SIZE;
    q->count--;
    
    pthread_cond_signal(&q->cond_not_full);
    pthread_mutex_unlock(&q->mutex);
    return true;
}

void gallium_queue_destroy(gallium_queue* q) {
    pthread_mutex_lock(&q->mutex);
    // Free any remaining messages in the queue
    while (q->count > 0) {
        gallium_msg_free(&q->messages[q->head]);
        q->head = (q->head + 1) % GALLIUM_QUEUE_MAX_SIZE;
        q->count--;
    }
    pthread_mutex_unlock(&q->mutex);
    
    pthread_mutex_destroy(&q->mutex);
    pthread_cond_destroy(&q->cond_not_empty);
    pthread_cond_destroy(&q->cond_not_full);
}
