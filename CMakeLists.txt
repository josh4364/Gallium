cmake_minimum_required(VERSION 3.10)
project(Gallium C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

find_package(PkgConfig REQUIRED)

# Dependencies
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
pkg_check_modules(LWS REQUIRED libwebsockets)
pkg_check_modules(JSONC REQUIRED json-c)
pkg_check_modules(NOTCURSES REQUIRED notcurses)

include_directories(
    ${CMAKE_SOURCE_DIR}/source
    ${SQLITE3_INCLUDE_DIRS}
    ${LWS_INCLUDE_DIRS}
    ${JSONC_INCLUDE_DIRS}
    ${NOTCURSES_INCLUDE_DIRS}
)

link_directories(
    ${SQLITE3_LIBRARY_DIRS}
    ${LWS_LIBRARY_DIRS}
    ${JSONC_LIBRARY_DIRS}
    ${NOTCURSES_LIBRARY_DIRS}
)

add_subdirectory(source/common)
add_subdirectory(source/server)
add_subdirectory(source/client)
