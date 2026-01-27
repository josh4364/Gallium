#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "protocol.h"
#include "queue.h"

void test_json_protocol() {
    printf("Testing JSON parsing and serialization...\n");
    
    struct json_object* obj = json_object_new_object();
    json_object_object_add(obj, "status", json_object_new_string("ready"));
    json_object_object_add(obj, "workspace", json_object_new_string("/path/to/project"));
    
    size_t len = 0;
    char* serialized = gallium_json_serialize(obj, &len);
    assert(serialized != NULL);
    assert(len > 0);
    printf("Serialized: %s\n", serialized);
    
    struct json_object* parsed = gallium_json_parse(serialized, len);
    assert(parsed != NULL);
    
    struct json_object* status_obj;
    assert(json_object_object_get_ex(parsed, "status", &status_obj));
    assert(strcmp(json_object_get_string(status_obj), "ready") == 0);
    
    free(serialized);
    json_object_put(obj);
    json_object_put(parsed);
    
    printf("JSON test passed!\n");
}

void test_header_byte_order() {
    printf("Testing header byte order conversion...\n");
    
    gallium_msg_header header;
    header.msg_id = 0x1234;
    header.payload_len = 0x12345678;
    
    gallium_header_hton(&header);
    // On little-endian systems, these should be swapped. 
    // On big-endian systems, they stay the same.
    // The point is that ntoh should reverse hton.
    
    gallium_header_ntoh(&header);
    assert(header.msg_id == 0x1234);
    assert(header.payload_len == 0x12345678);
    
    printf("Header byte order test passed!\n");
}

void test_queue() {
    printf("Testing message queue...\n");
    
    gallium_queue q;
    gallium_queue_init(&q);
    
    gallium_msg msg1;
    msg1.header.msg_id = GALLIUM_MSG_INIT;
    msg1.header.payload_len = 5;
    msg1.payload = strdup("hello");
    
    assert(gallium_queue_push(&q, msg1));
    
    gallium_msg popped;
    assert(gallium_queue_try_pop(&q, &popped));
    assert(popped.header.msg_id == GALLIUM_MSG_INIT);
    assert(strcmp(popped.payload, "hello") == 0);
    
    gallium_msg_free(&popped);
    gallium_queue_destroy(&q);
    
    printf("Queue test passed!\n");
}

int main() {
    test_json_protocol();
    test_header_byte_order();
    test_queue();
    printf("All protocol tests passed!\n");
    return 0;
}
