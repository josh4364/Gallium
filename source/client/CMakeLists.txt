add_executable(gallium-tui
    main.c
    network.c
    ui.c
    ui.h
)

set_target_properties(gallium-tui PROPERTIES 
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin/client"
)

target_link_libraries(gallium-tui
    gallium_common
    ${NOTCURSES_LIBRARIES}
    ${LWS_LIBRARIES}
    ${JSONC_LIBRARIES}
    ${LIBNOTIFY_LIBRARIES}
    ${GLIB_LIBRARIES}
)
