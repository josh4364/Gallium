#include "net_utils.h"
#include "network_internal.h"
#include <stdlib.h>
#include <string.h>

int gallium_net_send(struct lws* wsi, GALLIUM_MSG_ID msg_id, const char* json_payload) {
    if (!wsi) return -1;

    size_t total_len = 0;
    unsigned char* buf = gallium_net_pack(msg_id, json_payload, &total_len);
    if (!buf) return -1;

    int n = lws_write(wsi, buf + LWS_PRE, total_len, LWS_WRITE_BINARY);
    
    // Log error if needed
    if (n < (int)total_len) {
        lwsl_err("[Network] Error: Failed to write complete message (id=%d, sent=%d/%zu)\n", msg_id, n, total_len);
    }

    free(buf);
    return n;
}
