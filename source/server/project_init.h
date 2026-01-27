#ifndef PROJECT_INIT_H
#define PROJECT_INIT_H

#include <stdbool.h>
#include <libwebsockets.h>

bool project_init_needs_start();
void project_init_start(struct lws* wsi);
int project_init_handle_input(struct lws* wsi, const char* input);

#endif
