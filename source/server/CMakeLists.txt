add_executable(gallium-server
    main.c
    db_manager.c
    network.c
    sandbox.c
    git_workflow.c
    agent_manager.c
    llm_client.c
    llm_gemini.c
    llm_local.c
    mcp_host.c
    project_init.c
)

set_target_properties(gallium-server PROPERTIES 
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/server"
)

find_package(CURL REQUIRED)

target_link_libraries(gallium-server
    gallium_common
    ${SQLITE3_LIBRARIES}
    ${LWS_LIBRARIES}
    ${JSONC_LIBRARIES}
    ${CURL_LIBRARIES}
    ${LIBNOTIFY_LIBRARIES}
    ${GLIB_LIBRARIES}
    m
)

add_executable(test_llm_integration
    test_llm_integration.c
    llm_gemini.c
)

target_link_libraries(test_llm_integration
    ${JSONC_LIBRARIES}
    ${CURL_LIBRARIES}
    m
)
