add_library(gallium_common STATIC
    protocol.h
    common.c
    queue.h
    queue.c
)

target_include_directories(gallium_common PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(gallium_common PUBLIC ${JSONC_LIBRARIES} pthread)

add_executable(test_protocol test_protocol.c)
target_link_libraries(test_protocol gallium_common)
