#ifndef GALLIUM_PROTOCOL_H
#define GALLIUM_PROTOCOL_H

#include <stdint.h>
#include <json-c/json.h>

typedef enum {
    GALLIUM_MSG_INIT = 1,
    GALLIUM_MSG_TASK_UPDATE = 2,
    GALLIUM_MSG_EVENT_LOG = 3,
    GALLIUM_MSG_USER_INPUT = 4,
    GALLIUM_MSG_HEARTBEAT = 5,
    GALLIUM_MSG_ERROR = 6,
    GALLIUM_MSG_NOTIFICATION = 7,
    GALLIUM_MSG_PANIC = 8,
    GALLIUM_MSG_GET_EVENTS = 9,
    GALLIUM_MSG_EVENT_LIST = 10
} GALLIUM_MSG_ID;

#pragma pack(push, 1)
typedef struct {
    uint16_t msg_id;
    uint32_t payload_len;
} gallium_msg_header;
#pragma pack(pop)

typedef struct {
    gallium_msg_header header;
    char* payload;
} gallium_msg;

/**
 * @brief Free a message and its payload.
 */
void gallium_msg_free(gallium_msg* msg);

/**
 * @brief Parse a JSON buffer into a json_object.
 * 
 * @param buffer The input buffer.
 * @param len The length of the buffer.
 * @return struct json_object* The parsed JSON object, or NULL on failure.
 */
struct json_object* gallium_json_parse(const char* buffer, size_t len);

/**
 * @brief Serialize a json_object into a string.
 * 
 * @param obj The JSON object to serialize.
 * @param out_len Pointer to store the length of the resulting string.
 * @return char* The serialized string (must be freed by caller), or NULL on failure.
 */
char* gallium_json_serialize(struct json_object* obj, size_t* out_len);

/**
 * @brief Convert header to network byte order.
 */
void gallium_header_hton(gallium_msg_header* header);

/**
 * @brief Convert header to host byte order.
 */
void gallium_header_ntoh(gallium_msg_header* header);

#endif // GALLIUM_PROTOCOL_H
