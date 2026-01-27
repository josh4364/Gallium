#ifndef GALLIUM_PROTOCOL_H
#define GALLIUM_PROTOCOL_H

#include <stdint.h>

typedef enum {
    GALLIUM_MSG_INIT = 1,
    GALLIUM_MSG_TASK_UPDATE = 2,
    GALLIUM_MSG_HEARTBEAT = 3,
    GALLIUM_MSG_ERROR = 4
} GALLIUM_MSG_ID;

#pragma pack(push, 1)
typedef struct {
    uint16_t msg_id;
    uint32_t length;
} gallium_msg_header;
#pragma pack(pop)

#endif // GALLIUM_PROTOCOL_H
