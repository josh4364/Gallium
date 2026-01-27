add_executable(gallium-server
    main.c
    db_manager.c
    network.c
    sandbox.c
    git_workflow.c
)

set_target_properties(gallium-server PROPERTIES 
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/server"
)

target_link_libraries(gallium-server
    gallium_common
    ${SQLITE3_LIBRARIES}
    ${LWS_LIBRARIES}
    ${JSONC_LIBRARIES}
)
