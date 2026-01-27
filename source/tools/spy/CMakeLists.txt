add_executable(gallium-spy main.c)
target_link_libraries(gallium-spy gallium_common websockets)
install(TARGETS gallium-spy DESTINATION bin)
