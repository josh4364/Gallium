add_library(gallium_common STATIC
    protocol.h
    common.c
)

target_include_directories(gallium_common PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
