cmake_minimum_required(VERSION 3.15)
project(ShareShim LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Enable Unicode support
add_compile_definitions(UNICODE _UNICODE)

# C++/WinRT requires /EHsc and /permissive-
if(MSVC)
    add_compile_options(/EHsc /permissive-)
endif()

# Find and enable C++/WinRT if possible, or use standard linkage
find_package(CppWinRT QUIET)

add_executable(ShareShim WIN32 ShareShim.cpp)

target_link_libraries(ShareShim 
    PRIVATE 
    windowsapp.lib
    user32.lib
    advapi32.lib
    shlwapi.lib
)

# Use standard binary directory
set_target_properties(ShareShim PROPERTIES 
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
    LINK_FLAGS "/SUBSYSTEM:WINDOWS"
)
